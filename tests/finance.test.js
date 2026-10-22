import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import {
  budgetLevel,
  budgetReport,
  dailyAllowance,
  filterTransactions,
  groupByDate,
  monthlySeries,
  monthProgress,
  monthsWithData,
  monthSummary,
  percentChange,
  spendingByCategory,
  suggestBudgets,
} from '../src/finance.js';

let counter = 0;
const tx = (type, category, date, kroner, note = '') => ({
  id: `t${++counter}`,
  type,
  category,
  date,
  amount: kroner * 100,
  note,
  createdAt: `${date}T10:00:${String(counter).padStart(2, '0')}.000Z`,
});

const TRANSACTIONS = [
  tx('income', 'salary', '2026-10-01', 20000, 'October salary'),
  tx('expense', 'housing', '2026-10-01', 6200, 'Rent'),
  tx('expense', 'groceries', '2026-10-03', 450, 'Weekly shop'),
  tx('expense', 'groceries', '2026-10-10', 550, 'Big shop'),
  tx('expense', 'dining', '2026-10-12', 1200, 'Sushi'),
  tx('income', 'salary', '2026-09-01', 18000),
  tx('expense', 'groceries', '2026-09-15', 800),
  tx('expense', 'dining', '2026-08-20', 300, 'Pizza'),
];

test('monthSummary adds up income, expenses, net and savings rate', () => {
  const summary = monthSummary(TRANSACTIONS, '2026-10');
  assertEqual(summary.income, 2_000_000);
  assertEqual(summary.expense, 840_000);
  assertEqual(summary.net, 1_160_000);
  assertEqual(summary.savingsRate, 0.58);
  assertEqual(summary.count, 5);
});

test('savings rate is null when there is no income', () => {
  assertEqual(monthSummary(TRANSACTIONS, '2026-08').savingsRate, null);
  assertEqual(monthSummary([], '2026-08').net, 0);
});

test('percentChange compares with last month and handles missing data', () => {
  assertEqual(percentChange(120, 100), 0.2);
  assertEqual(percentChange(80, 100), -0.2);
  assertEqual(percentChange(50, 0), null);
});

test('spendingByCategory groups expenses, biggest first, shares adding up to 100 %', () => {
  const rows = spendingByCategory(TRANSACTIONS, '2026-10');
  assertDeepEqual(rows.map((r) => r.category), ['housing', 'dining', 'groceries']);
  assertEqual(rows[2].amount, 100_000);
  const totalShare = rows.reduce((sum, r) => sum + r.share, 0);
  assert(Math.abs(totalShare - 1) < 1e-9, `shares add up to ${totalShare}`);
});

test('monthlySeries returns every month in the window, also empty ones', () => {
  const series = monthlySeries(TRANSACTIONS, '2026-11', 4);
  assertDeepEqual(series.map((p) => p.month), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assertDeepEqual(series[1], { month: '2026-09', income: 1_800_000, expense: 80_000, net: 1_720_000 });
  assertDeepEqual(series[3], { month: '2026-11', income: 0, expense: 0, net: 0 });
});

test('monthlySeries crosses the new year', () => {
  assertDeepEqual(monthlySeries([], '2027-02', 3).map((p) => p.month), ['2026-12', '2027-01', '2027-02']);
});

test('budgetLevel: ok below 80 %, warning from 80 % to 100 %, over above 100 %', () => {
  assertEqual(budgetLevel(79, 100), 'ok');
  assertEqual(budgetLevel(80, 100), 'warning');
  assertEqual(budgetLevel(100, 100), 'warning');
  assertEqual(budgetLevel(101, 100), 'over');
});

test('budgetReport compares spending with budgets and lists unbudgeted spending', () => {
  const budgets = { groceries: 120_000, dining: 100_000, transport: 60_000 };
  const report = budgetReport(TRANSACTIONS, budgets, '2026-10');
  assertDeepEqual(report.rows.map((r) => [r.category, r.level]), [
    ['dining', 'over'],
    ['groceries', 'warning'],
    ['transport', 'ok'],
  ]);
  assertEqual(report.rows[0].remaining, -20_000);
  assertDeepEqual(report.total, { limit: 280_000, spent: 220_000, remaining: 60_000, ratio: 220_000 / 280_000, level: 'ok' });
  assertDeepEqual(report.unbudgeted, [{ category: 'housing', spent: 620_000 }]);
});

test('budgetReport with no budgets has an empty total', () => {
  const report = budgetReport(TRANSACTIONS, {}, '2026-10');
  assertEqual(report.rows.length, 0);
  assertEqual(report.total.ratio, 0);
  assertEqual(report.unbudgeted.length, 3);
});

test('monthProgress is 1 for past months, 0 for future months and partial today', () => {
  assertEqual(monthProgress('2026-09', '2026-10-22'), 1);
  assertEqual(monthProgress('2026-11', '2026-10-22'), 0);
  assertEqual(monthProgress('2026-10', '2026-10-22'), 22 / 31);
});

test('dailyAllowance spreads what is left over the remaining days, rounded down to whole kroner', () => {
  assertEqual(dailyAllowance(250_000, '2026-10', '2026-10-22'), 25_000); // 2 500 kr over 10 days
  assertEqual(dailyAllowance(100_050, '2026-10', '2026-10-31'), 100_000); // last day: everything left
  assertEqual(dailyAllowance(-5_000, '2026-10', '2026-10-22'), 0);
  assertEqual(dailyAllowance(250_000, '2026-09', '2026-10-22'), 0);
});

test('suggestBudgets averages the previous months and rounds up to a tidy number', () => {
  const suggestions = suggestBudgets(TRANSACTIONS, '2026-11');
  // Aug–Oct all have data. Groceries: (800 + 1 000) / 3 = 600 → 600; dining: 1 500 / 3 = 500 → 500
  assertEqual(suggestions.groceries, 60_000);
  assertEqual(suggestions.dining, 50_000);
  // Housing: 6 200 / 3 = 2 066.67 → rounded up to the next 100
  assertEqual(suggestions.housing, 210_000);
});

test('suggestBudgets only divides by months that have data', () => {
  const suggestions = suggestBudgets([tx('expense', 'fun', '2026-10-05', 333)], '2026-11');
  assertEqual(suggestions.fun, 35_000); // one month of data: 333 → next 50 = 350
  assertDeepEqual(suggestBudgets([], '2026-11'), {});
});

test('filterTransactions filters by month, type, category and search text', () => {
  const nameOf = (id) => ({ groceries: 'Groceries', dining: 'Eating out' })[id] ?? id;
  assertEqual(filterTransactions(TRANSACTIONS, { month: '2026-10' }).length, 5);
  assertEqual(filterTransactions(TRANSACTIONS, { type: 'income' }).length, 2);
  assertEqual(filterTransactions(TRANSACTIONS, { category: 'groceries' }).length, 3);
  assertEqual(filterTransactions(TRANSACTIONS, { query: 'SHOP' }).length, 2, 'search is case-insensitive');
  assertEqual(filterTransactions(TRANSACTIONS, { query: 'eating' }, nameOf).length, 2, 'search matches category names');
  assertEqual(filterTransactions(TRANSACTIONS, { month: '2026-10', type: 'expense', category: 'groceries', query: 'big' }).length, 1);
});

test('filterTransactions sorts newest first', () => {
  const dates = filterTransactions(TRANSACTIONS).map((t) => t.date);
  assertDeepEqual(dates, [...dates].sort().reverse());
});

test('groupByDate groups a sorted list per day with the day total', () => {
  const groups = groupByDate(filterTransactions(TRANSACTIONS, { month: '2026-10' }));
  assertDeepEqual(groups.map((g) => g.date), ['2026-10-12', '2026-10-10', '2026-10-03', '2026-10-01']);
  assertEqual(groups[3].items.length, 2);
  assertEqual(groups[3].net, 2_000_000 - 620_000);
});

test('monthsWithData lists months newest first without duplicates', () => {
  assertDeepEqual(monthsWithData(TRANSACTIONS), ['2026-10', '2026-09', '2026-08']);
});
