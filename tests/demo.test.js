import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import { generateDemoData } from '../src/demo.js';
import { isValidBudget, validateTransaction } from '../src/store.js';
import { monthsWithData } from '../src/finance.js';

const today = new Date(2026, 9, 22); // 22 October 2026

test('demo data is the same every time for the same date', () => {
  assertDeepEqual(generateDemoData({ today }), generateDemoData({ today }));
});

test('every demo transaction is valid and none are in the future', () => {
  const { transactions } = generateDemoData({ today });
  assert(transactions.length > 100, `only ${transactions.length} transactions`);
  for (const t of transactions) {
    assertDeepEqual(validateTransaction(t), {}, `transaction ${t.id}`);
    assert(t.date <= '2026-10-22', `${t.id} is dated ${t.date}`);
  }
  assertEqual(new Set(transactions.map((t) => t.id)).size, transactions.length, 'ids are unique');
});

test('demo data covers the last six months with both income and expenses', () => {
  const { transactions } = generateDemoData({ today });
  assertDeepEqual(monthsWithData(transactions), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  assert(transactions.some((t) => t.type === 'income'));
  assert(transactions.some((t) => t.type === 'expense'));
});

test('demo budgets are valid', () => {
  const { budgets } = generateDemoData({ today });
  for (const [category, limit] of Object.entries(budgets)) assert(isValidBudget(category, limit), category);
});
