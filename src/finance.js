// Calculations on transactions. Nothing in here touches the page or storage,
// which keeps these functions easy to unit test (see tests/finance.test.js).
// A transaction looks like { id, type: 'income' | 'expense', amount (øre), category, date, note }.
import { dayOfMonth, daysInMonth, monthOf, shiftMonth } from './dates.js';

export const WARNING_RATIO = 0.8; // a budget is "near the limit" from 80 % used

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

/** Change from `previous` to `current` as a fraction (0.25 = +25 %), or null when there is nothing to compare with. */
export function percentChange(current, previous) {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

/** Expenses per category in a month, biggest first, with each category's share of the total. */
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

/** Income, expenses and net for `count` months ending with `endMonth` (months without data included). */
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
 * Spending against the monthly budget of every budgeted category (most used first),
 * the totals for all budgets, and spending in categories that have no budget.
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

/** How far through `month` we are on `today`: 0 before it starts, 1 once it is over. */
export function monthProgress(month, today) {
  const current = monthOf(today);
  if (month < current) return 1;
  if (month > current) return 0;
  return dayOfMonth(today) / daysInMonth(month);
}

/** How much can be spent per day for the rest of the month (today included), in whole kroner. */
export function dailyAllowance(remaining, month, today) {
  if (monthOf(today) !== month || remaining <= 0) return 0;
  const daysLeft = daysInMonth(month) - dayOfMonth(today) + 1;
  return Math.floor(remaining / daysLeft / 100) * 100;
}

/**
 * Suggests a monthly budget per category: the average spending in the `lookback`
 * months before `month` (only counting months with any data), rounded up to a
 * tidy number – the nearest 50 below 1 000, otherwise the nearest 100.
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

/** Applies the transaction list filters and sorts the result newest first. */
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

/** Groups an already sorted list by date, with each day's net total. */
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

/** Every month that has transactions, newest first. */
export function monthsWithData(transactions) {
  return [...new Set(transactions.map((t) => monthOf(t.date)))].sort().reverse();
}
