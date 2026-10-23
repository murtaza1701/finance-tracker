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

// ---------- Kontoer og bevegelser ----------

const today = '2026-10-22';

function storeWithAccounts() {
  const store = createStore(memoryStorage());
  const bank = store.addAccount({ name: 'Brukskonto', type: 'bank', institution: 'DNB' }, { amount: 1_000_000, date: '2026-10-01' }).account;
  const fund = store.addAccount({ name: 'Indeksfond', type: 'fund', institution: 'Nordnet' }, { amount: 2_000_000, invested: 1_800_000, date: '2026-10-01' }).account;
  const firi = store.addAccount({ name: 'Firi', type: 'crypto', institution: 'Firi' }, { asset: 'BTC', quantity: 0.01, amount: 700_000, date: '2026-10-01' }).account;
  const loan = store.addAccount({ name: 'Studielån', type: 'loan', institution: 'Lånekassen' }, { amount: 5_000_000, date: '2026-10-01' }).account;
  return { store, bank, fund, firi, loan };
}

test('addAccount saves the account with its starting value as the first movement', () => {
  const { store, fund, firi } = storeWithAccounts();
  const { accounts, movements } = store.getState();
  assertEqual(accounts.length, 4);
  const opening = movements.find((m) => m.accountId === fund.id);
  assertEqual(opening.kind, 'opening');
  assertEqual(opening.invested, 1_800_000);
  const firstBuy = movements.find((m) => m.accountId === firi.id);
  assertEqual(firstBuy.kind, 'buy', 'crypto accounts start with a purchase');
  assertEqual(firstBuy.note, 'Startbeholdning');
});

test('addAccount rejects missing names and unknown types', () => {
  const store = createStore(memoryStorage());
  const result = store.addAccount({ name: '  ', type: 'castle', institution: '' });
  assert(!result.ok);
  assertDeepEqual(Object.keys(result.errors).sort(), ['name', 'type']);
  assertEqual(store.getState().accounts.length, 0);
});

test('addMovement checks that the kind of movement fits the account', () => {
  const { store, bank, firi } = storeWithAccounts();
  assert(!store.addMovement({ accountId: bank.id, kind: 'buy', asset: 'BTC', quantity: 1, amount: 1, date: today, note: '' }).ok, 'no coins on a bank account');
  assert(!store.addMovement({ accountId: firi.id, kind: 'deposit', amount: 100, date: today, note: '' }).ok, 'crypto accounts use buy/sell');
  const result = store.addMovement({ accountId: bank.id, kind: 'deposit', amount: 0, date: '2026-02-30', note: '' });
  assertDeepEqual(Object.keys(result.errors).sort(), ['amount', 'date']);
});

test('you cannot sell more coins than the account holds', () => {
  const { store, firi } = storeWithAccounts();
  const tooMuch = store.addMovement({ accountId: firi.id, kind: 'sell', asset: 'BTC', quantity: 0.02, amount: 1_000_000, date: today, note: '' });
  assert(!tooMuch.ok);
  assert(tooMuch.errors.quantity.includes('0,01'), tooMuch.errors.quantity);
  const noEth = store.addMovement({ accountId: firi.id, kind: 'sell', asset: 'ETH', quantity: 1, amount: 1, date: today, note: '' });
  assert(noEth.errors.quantity.includes('ingen'), noEth.errors.quantity);
  assert(store.addMovement({ accountId: firi.id, kind: 'sell', asset: 'BTC', quantity: 0.01, amount: 800_000, date: today, note: '' }).ok);
});

test('a sale cannot be dated before the coins were bought', () => {
  const { store, firi } = storeWithAccounts(); // 0.01 BTC bought on 2026-10-01
  const early = store.addMovement({ accountId: firi.id, kind: 'sell', asset: 'BTC', quantity: 0.01, amount: 700_000, date: '2026-09-15', note: '' });
  assert(!early.ok, 'a sale before the purchase is rejected');
  assert(early.errors.quantity.includes('ingen'), early.errors.quantity);
});

test('a transfer moves money from one account to another, so the net worth is not counted twice', () => {
  const { store, bank, fund } = storeWithAccounts();
  const result = store.addMovement({ accountId: fund.id, kind: 'deposit', amount: 200_000, date: today, note: 'Fondssparing' }, { counterAccountId: bank.id });
  assert(result.ok);
  assertEqual(result.counter.accountId, bank.id);
  assertEqual(result.counter.kind, 'withdrawal');
  assertEqual(result.counter.note, 'Overført til Indeksfond');
  assertEqual(result.counter.link, result.movement.link);
});

test('paying down debt from a bank account is a withdrawal on both', () => {
  const { store, bank, loan } = storeWithAccounts();
  const result = store.addMovement({ accountId: loan.id, kind: 'withdrawal', amount: 50_000, date: today, note: '' }, { counterAccountId: bank.id });
  assertEqual(result.counter.kind, 'withdrawal');
  const borrowMore = store.addMovement({ accountId: loan.id, kind: 'deposit', amount: 50_000, date: today, note: '' }, { counterAccountId: bank.id });
  assertEqual(borrowMore.counter.kind, 'deposit', 'borrowing more puts the money into the bank account');
});

test('transfers are rejected to the same account, to crypto accounts and for new values', () => {
  const { store, bank, fund, firi } = storeWithAccounts();
  assert(!store.addMovement({ accountId: fund.id, kind: 'deposit', amount: 100, date: today, note: '' }, { counterAccountId: fund.id }).ok);
  assert(!store.addMovement({ accountId: fund.id, kind: 'deposit', amount: 100, date: today, note: '' }, { counterAccountId: firi.id }).ok);
  assert(!store.addMovement({ accountId: fund.id, kind: 'value', amount: 100, date: today, note: '' }, { counterAccountId: bank.id }).ok);
});

test('deleting one side of a transfer deletes both, and undo restores both', () => {
  const { store, bank, fund } = storeWithAccounts();
  const before = store.getState().movements.length;
  const { movement } = store.addMovement({ accountId: fund.id, kind: 'deposit', amount: 200_000, date: today, note: '' }, { counterAccountId: bank.id });
  const removed = store.removeMovement(movement.id);
  assertEqual(removed.length, 2);
  assertEqual(store.getState().movements.length, before);
  store.restoreMovements(removed);
  assertEqual(store.getState().movements.length, before + 2);
});

test('removeAccount takes its movements (and the other side of transfers) with it; undo brings them back', () => {
  const { store, bank, fund } = storeWithAccounts();
  store.addMovement({ accountId: fund.id, kind: 'deposit', amount: 200_000, date: today, note: '' }, { counterAccountId: bank.id });
  const countBefore = store.getState().movements.length;
  const removed = store.removeAccount(fund.id);
  assert(!store.getState().movements.some((m) => m.accountId === fund.id || m.link), 'no fund movements and no half transfers left');
  store.restoreAccount(removed);
  assertEqual(store.getState().movements.length, countBefore);
  assertEqual(store.getState().accounts.length, 4);
});

test('an account with movements can only change to a similar type', () => {
  const { store, bank } = storeWithAccounts();
  assert(store.updateAccount(bank.id, { type: 'savings', name: 'Sparekonto' }).ok, 'bank → savings is fine');
  assert(!store.updateAccount(bank.id, { type: 'crypto' }).ok, 'bank → crypto would break the movements');
});

test('sanitizeState drops movements whose account no longer exists', () => {
  const { state, skipped } = sanitizeState({
    accounts: [{ id: 'a', name: 'Konto', type: 'bank', institution: '' }],
    movements: [
      { id: 'm1', accountId: 'a', kind: 'opening', amount: 100, date: '2026-10-01', note: '' },
      { id: 'm2', accountId: 'gone', kind: 'deposit', amount: 100, date: '2026-10-01', note: '' },
      { id: 'm3', accountId: 'a', kind: 'buy', asset: 'BTC', quantity: 1, amount: 1, date: '2026-10-01', note: '' },
    ],
  });
  assertEqual(state.movements.length, 1);
  assertEqual(skipped, 2);
});

// ---------- Aksjer ----------

test('a stock account starts with a purchase of shares and only accepts valid tickers', () => {
  const store = createStore(memoryStorage());
  const { account } = store.addAccount({ name: 'ASK', type: 'stocks', institution: 'Nordnet' }, { asset: 'EQNR.OL', quantity: 10, amount: 437_800, date: '2026-10-22' });
  const first = store.getState().movements[0];
  assertEqual(first.kind, 'buy');
  assertEqual(first.note, 'Startbeholdning');
  const bad = store.addMovement({ accountId: account.id, kind: 'buy', asset: 'not a ticker', quantity: 1, amount: 1, date: '2026-10-22', note: '' });
  assert(bad.errors.asset.includes('ticker'), bad.errors.asset);
  assert(!store.addMovement({ accountId: account.id, kind: 'value', amount: 100, date: '2026-10-22', note: '' }).ok, 'no manual values on stock accounts');
  assert(store.addMovement({ accountId: account.id, kind: 'sell', asset: 'EQNR.OL', quantity: 4, amount: 180_000, date: '2026-10-22', note: '' }).ok);
});

test('old stock accounts with a value typed in by hand are moved to "Fond" so nothing is lost', () => {
  const { state, skipped } = sanitizeState({
    accounts: [
      { id: 'old', name: 'Aksjesparekonto', type: 'stocks', institution: 'Nordnet' },
      { id: 'new', name: 'ASK', type: 'stocks', institution: 'Nordnet' },
    ],
    movements: [
      { id: 'm1', accountId: 'old', kind: 'opening', amount: 700_000, date: '2026-01-08', note: '' },
      { id: 'm2', accountId: 'old', kind: 'value', amount: 760_000, date: '2026-03-26', note: '' },
      { id: 'm3', accountId: 'new', kind: 'buy', asset: 'DNB.OL', quantity: 15, amount: 450_000, date: '2026-04-12', note: '' },
    ],
  });
  assertEqual(skipped, 0);
  assertEqual(state.accounts.find((a) => a.id === 'old').type, 'fund');
  assertEqual(state.accounts.find((a) => a.id === 'new').type, 'stocks');
  assertEqual(state.movements.length, 3);
});
