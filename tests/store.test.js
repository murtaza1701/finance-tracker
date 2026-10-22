import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import { createStore, sanitizeState, STORAGE_KEY, validateTransaction } from '../src/store.js';

/** A stand-in for localStorage that keeps everything in a Map. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const groceries = { type: 'expense', amount: 45_000, category: 'groceries', date: '2026-10-22', note: 'Weekly shop' };

test('a new store starts empty', () => {
  const store = createStore(memoryStorage());
  assertEqual(store.getState().transactions.length, 0);
  assertEqual(store.getState().settings.currency, 'NOK');
});

test('addTransaction saves to storage and a new store loads it again', () => {
  const storage = memoryStorage();
  const result = createStore(storage).addTransaction(groceries);
  assert(result.ok, 'should be ok');
  assert(typeof result.transaction.id === 'string' && result.transaction.id.length > 0, 'gets an id');
  const reloaded = createStore(storage).getState();
  assertEqual(reloaded.transactions.length, 1);
  assertEqual(reloaded.transactions[0].note, 'Weekly shop');
});

test('invalid transactions are rejected with a message per field', () => {
  const store = createStore(memoryStorage());
  const result = store.addTransaction({ type: 'expense', amount: 0, category: 'salary', date: '2026-02-30', note: '' });
  assert(!result.ok, 'should fail');
  assertDeepEqual(Object.keys(result.errors).sort(), ['amount', 'category', 'date']);
  assertEqual(store.getState().transactions.length, 0, 'nothing was saved');
});

test('validateTransaction catches NaN, fractions of øre and too long notes', () => {
  assert('amount' in validateTransaction({ ...groceries, amount: NaN }));
  assert('amount' in validateTransaction({ ...groceries, amount: 12.5 }));
  assert('note' in validateTransaction({ ...groceries, note: 'x'.repeat(121) }));
  assertDeepEqual(validateTransaction(groceries), {});
});

test('updateTransaction changes the fields but keeps id and creation time', () => {
  const store = createStore(memoryStorage());
  const { transaction } = store.addTransaction(groceries);
  const result = store.updateTransaction(transaction.id, { amount: 50_000, note: '  Big shop  ' });
  assert(result.ok, 'should be ok');
  const saved = store.getState().transactions[0];
  assertEqual(saved.id, transaction.id);
  assertEqual(saved.createdAt, transaction.createdAt);
  assertEqual(saved.amount, 50_000);
  assertEqual(saved.note, 'Big shop', 'note is trimmed');
});

test('changing a transaction to income requires an income category', () => {
  const store = createStore(memoryStorage());
  const { transaction } = store.addTransaction(groceries);
  assert(!store.updateTransaction(transaction.id, { type: 'income' }).ok, 'groceries is not an income category');
  assert(store.updateTransaction(transaction.id, { type: 'income', category: 'salary' }).ok);
});

test('removeTransaction returns the transaction so "Undo" can restore it', () => {
  const store = createStore(memoryStorage());
  const { transaction } = store.addTransaction(groceries);
  const removed = store.removeTransaction(transaction.id);
  assertEqual(store.getState().transactions.length, 0);
  store.restoreTransaction(removed);
  store.restoreTransaction(removed); // restoring twice must not duplicate it
  assertDeepEqual(store.getState().transactions, [transaction]);
});

test('budgets can be set, rejected when invalid, and removed', () => {
  const store = createStore(memoryStorage());
  assert(store.setBudget('groceries', 320_000));
  assert(!store.setBudget('salary', 100_000), 'income categories cannot have budgets');
  assert(!store.setBudget('dining', -5), 'negative budgets are rejected');
  assert(!store.setBudget('dining', NaN), 'NaN is rejected');
  assertDeepEqual(store.getState().budgets, { groceries: 320_000 });
  store.removeBudget('groceries');
  assertDeepEqual(store.getState().budgets, {});
});

test('subscribers are told about every change', () => {
  const store = createStore(memoryStorage());
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.addTransaction(groceries);
  store.updateSettings({ currency: 'EUR' });
  unsubscribe();
  store.updateSettings({ currency: 'SEK' });
  assertEqual(calls, 2);
});

test('settings only accept known values', () => {
  const store = createStore(memoryStorage());
  store.updateSettings({ currency: 'XYZ', theme: 'neon' });
  assertDeepEqual(store.getState().settings, { currency: 'NOK', theme: 'system' });
  store.updateSettings({ theme: 'dark' });
  assertEqual(store.getState().settings.theme, 'dark');
});

test('unreadable saved data is backed up instead of being thrown away', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
  const store = createStore(storage);
  assertEqual(store.getState().transactions.length, 0);
  const backupKey = [...storage.data.keys()].find((key) => key.startsWith(`${STORAGE_KEY}:corrupt:`));
  assert(backupKey, 'a backup key was written');
  assertEqual(storage.data.get(backupKey), '{not json');
});

test('a failing save (e.g. full storage) is reported but the app keeps working', () => {
  let reported = 0;
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const store = createStore(storage, { onSaveError: () => reported++ });
  assert(store.addTransaction(groceries).ok);
  assertEqual(reported, 1);
  assertEqual(store.getState().transactions.length, 1, 'still kept in memory');
});

test('the store also works without any storage', () => {
  const store = createStore(null);
  assert(store.addTransaction(groceries).ok);
});

test('sanitizeState drops invalid transactions, fixes duplicate ids and keeps valid budgets', () => {
  const { state, skipped } = sanitizeState({
    transactions: [
      { ...groceries, id: 'a' },
      { ...groceries, id: 'a', note: 'same id' },
      { ...groceries, id: 'b', amount: -1 },
      'not an object',
      { ...groceries, id: 'c', note: 'y'.repeat(500) },
    ],
    budgets: { groceries: 320_000, salary: 100, dining: 'lots' },
    settings: { currency: 'EUR', theme: 'dark' },
  });
  assertEqual(skipped, 2);
  assertEqual(state.transactions.length, 3);
  assert(state.transactions[1].id !== 'a', 'duplicate id was replaced');
  assertEqual(state.transactions[2].note.length, 120, 'long notes are shortened');
  assertDeepEqual(state.budgets, { groceries: 320_000 });
  assertDeepEqual(state.settings, { currency: 'EUR', theme: 'dark' });
});

test('sanitizeState survives garbage input', () => {
  for (const input of [null, 42, 'text', [], { transactions: 'nope', budgets: null }]) {
    assertEqual(sanitizeState(input).state.transactions.length, 0);
  }
});

test('replaceAll and clearAll (clearAll keeps the settings)', () => {
  const store = createStore(memoryStorage());
  const { skipped, count } = store.replaceAll({ transactions: [groceries, { nope: true }], budgets: { fun: 50_000 }, settings: { currency: 'SEK' } });
  assertEqual(count, 1);
  assertEqual(skipped, 1);
  store.clearAll();
  const state = store.getState();
  assertEqual(state.transactions.length, 0);
  assertDeepEqual(state.budgets, {});
  assertEqual(state.settings.currency, 'SEK');
});
