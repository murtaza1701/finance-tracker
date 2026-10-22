// Beregninger på transaksjoner (forbruk). Ingenting her rører siden eller lagringen,
// så funksjonene er enkle å teste (se tests/finance.test.js).
// En transaksjon: { id, type: 'income' | 'expense', amount (øre), category, date, note }.
import { dayOfMonth, daysInMonth, monthOf, shiftMonth } from './dates.js';

export const WARNING_RATIO = 0.8; // et budsjett er "nær grensen" fra 80 % brukt

export function inMonth(transactions, month) {
  return transactions.filter((t) => monthOf(t.date) === month);
}

export function summarize(transactions) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  const net = income - expense;
  return { income, expense, net, savingsRate: income > 0 ? net / income : null, count: transactions.length };
}

export function monthSummary(transactions, month) {
  return summarize(inMonth(transactions, month));
}

/** Endring fra `previous` til `current` som brøk (0,25 = +25 %), eller null når det ikke er noe å sammenligne med. */
export function percentChange(current, previous) {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

/** Utgifter per kategori i en måned, størst først, med hver kategoris andel av totalen. */
export function spendingByCategory(transactions, month) {
  const totals = new Map();
  for (const t of inMonth(transactions, month)) {
    if (t.type === 'expense') totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals]
    .map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Inntekter, utgifter og netto for `count` måneder til og med `endMonth` (også måneder uten data). */
export function monthlySeries(transactions, endMonth, count = 6) {
  const series = [];
  for (let i = count - 1; i >= 0; i--) {
    series.push({ month: shiftMonth(endMonth, -i), income: 0, expense: 0, net: 0 });
  }
  const byMonth = new Map(series.map((point) => [point.month, point]));
  for (const t of transactions) {
    const point = byMonth.get(monthOf(t.date));
    if (!point) continue;
    point[t.type] += t.amount;
    point.net += t.type === 'income' ? t.amount : -t.amount;
  }
  return series;
}

export function budgetLevel(spent, limit) {
  if (spent > limit) return 'over';
  if (spent >= limit * WARNING_RATIO) return 'warning';
  return 'ok';
}

/**
 * Forbruk mot månedsbudsjettet for hver kategori med budsjett (mest brukt først),
 * summen for alle budsjettene og forbruk i kategorier uten budsjett.
 */
export function budgetReport(transactions, budgets, month) {
  const spent = new Map(spendingByCategory(transactions, month).map((row) => [row.category, row.amount]));
  const rows = Object.entries(budgets)
    .map(([category, limit]) => {
      const amount = spent.get(category) ?? 0;
      return { category, limit, spent: amount, remaining: limit - amount, ratio: amount / limit, level: budgetLevel(amount, limit) };
    })
    .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));

  const limit = rows.reduce((sum, row) => sum + row.limit, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);
  const total = {
    limit,
    spent: totalSpent,
    remaining: limit - totalSpent,
    ratio: limit ? totalSpent / limit : 0,
    level: limit ? budgetLevel(totalSpent, limit) : 'ok',
  };
  const unbudgeted = [...spent]
    .filter(([category]) => !Object.hasOwn(budgets, category))
    .map(([category, amount]) => ({ category, spent: amount }));
  return { rows, total, unbudgeted };
}

/** Hvor langt ut i `month` vi er på `today`: 0 før den starter, 1 når den er over. */
export function monthProgress(month, today) {
  const current = monthOf(today);
  if (month < current) return 1;
  if (month > current) return 0;
  return dayOfMonth(today) / daysInMonth(month);
}

/** Hvor mye som kan brukes per dag resten av måneden (i dag medregnet), i hele kroner. */
export function dailyAllowance(remaining, month, today) {
  if (monthOf(today) !== month || remaining <= 0) return 0;
  const daysLeft = daysInMonth(month) - dayOfMonth(today) + 1;
  return Math.floor(remaining / daysLeft / 100) * 100;
}

/**
 * Foreslår et månedsbudsjett per kategori: snittforbruket de `lookback` månedene før
 * `month` (bare måneder med data teller), rundet opp til et pent tall –
 * nærmeste 50 under 1 000, ellers nærmeste 100.
 */
export function suggestBudgets(transactions, month, lookback = 3) {
  const months = new Set(Array.from({ length: lookback }, (_, i) => shiftMonth(month, -(i + 1))));
  const activeMonths = new Set();
  const totals = new Map();
  for (const t of transactions) {
    const m = monthOf(t.date);
    if (!months.has(m)) continue;
    activeMonths.add(m);
    if (t.type === 'expense') totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  const suggestions = {};
  for (const [category, total] of totals) {
    const average = total / activeMonths.size;
    const step = average < 100_000 ? 5_000 : 10_000;
    suggestions[category] = Math.ceil(average / step) * step;
  }
  return suggestions;
}

export function byNewest(a, b) {
  return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
}

/** Bruker filtrene i transaksjonslisten og sorterer nyeste først. */
export function filterTransactions(transactions, { month = 'all', type = 'all', category = 'all', query = '' } = {}, nameOf = (id) => id) {
  const needle = query.trim().toLowerCase();
  return transactions
    .filter(
      (t) =>
        (month === 'all' || monthOf(t.date) === month) &&
        (type === 'all' || t.type === type) &&
        (category === 'all' || t.category === category) &&
        (!needle || t.note.toLowerCase().includes(needle) || nameOf(t.category).toLowerCase().includes(needle)),
    )
    .sort(byNewest);
}

/** Grupperer en allerede sortert liste per dato, med netto for hver dag. */
export function groupByDate(transactions) {
  const groups = [];
  for (const t of transactions) {
    let group = groups.at(-1);
    if (!group || group.date !== t.date) {
      group = { date: t.date, items: [], net: 0 };
      groups.push(group);
    }
    group.items.push(t);
    group.net += t.type === 'income' ? t.amount : -t.amount;
  }
  return groups;
}

/** Alle måneder som har transaksjoner, nyeste først. */
export function monthsWithData(transactions) {
  return [...new Set(transactions.map((t) => monthOf(t.date)))].sort().reverse();
}
