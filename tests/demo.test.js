import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import { generateDemoData } from '../src/demo.js';
import { isValidBudget, sanitizeState, validateTransaction } from '../src/store.js';
import { monthsWithData } from '../src/finance.js';
import { heldAssets, summarizeNetWorth } from '../src/networth.js';

const today = new Date(2026, 9, 22); // 22. oktober 2026
const priceOn = (symbol) => ({ BTC: 800_000, ETH: 25_000, SOL: 1_500, USDT: 9.5 })[symbol];

test('demo data is the same every time for the same date', () => {
  assertDeepEqual(generateDemoData({ today, priceOn }), generateDemoData({ today, priceOn }));
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

test('demo spending covers the last six months with both income and expenses', () => {
  const { transactions } = generateDemoData({ today });
  assertDeepEqual(monthsWithData(transactions), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  assert(transactions.some((t) => t.type === 'income'));
  assert(transactions.some((t) => t.type === 'expense'));
});

test('demo budgets are valid', () => {
  const { budgets } = generateDemoData({ today });
  for (const [category, limit] of Object.entries(budgets)) assert(isValidBudget(category, limit), category);
});

test('demo accounts and movements are all valid and none are in the future', () => {
  const demo = generateDemoData({ today, priceOn });
  const { state, skipped } = sanitizeState(demo);
  assertEqual(skipped, 0, 'nothing was rejected');
  assertEqual(state.accounts.length, 7);
  assert(state.movements.length > 50, `only ${state.movements.length} movements`);
  assert(state.movements.every((m) => m.date <= '2026-10-22'));
});

test('demo net worth has every account type and a positive total', () => {
  const { accounts, movements } = generateDemoData({ today, priceOn });
  const summary = summarizeNetWorth(accounts, movements, {
    BTC: { price: 800_000 }, ETH: { price: 25_000 }, SOL: { price: 1_500 }, USDT: { price: 9.5 },
    'aksje:EQNR.OL': { price: 440 }, 'aksje:DNB.OL': { price: 310 },
  });
  assertDeepEqual(summary.byType.map((t) => t.type), ['bank', 'savings', 'fund', 'stocks', 'crypto', 'loan']);
  assert(summary.total > 0, `total ${summary.total}`);
  assert(summary.debts > 0, 'the student loan counts as debt');
  assertDeepEqual(heldAssets(accounts, movements), ['BTC', 'ETH', 'SOL', 'USDT', 'aksje:DNB.OL', 'aksje:EQNR.OL']);
});

test('demo crypto purchases use the price of the day they were bought', () => {
  const { movements } = generateDemoData({ today, priceOn });
  const btc = movements.find((m) => m.kind === 'buy' && m.asset === 'BTC');
  assertEqual(btc.amount, 50_000, '500 kr');
  assertEqual(btc.quantity, 0.000625, '500 kr / 800 000 kr per BTC');
});

test('demo stock purchases are whole shares at the price of that day', () => {
  const { movements } = generateDemoData({ today, priceOn: (key) => ({ 'aksje:EQNR.OL': 400 })[key] });
  const equinor = movements.find((m) => m.asset === 'EQNR.OL');
  assertEqual(equinor.quantity, 10);
  assertEqual(equinor.amount, 400_000, '10 shares × 400 kr');
});
