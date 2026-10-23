import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import {
  dayChange,
  heldAssets,
  holdingsCost,
  holdingsOverview,
  holdingsValue,
  movementsFor,
  netWorthSeries,
  rangeStart,
  replayAccount,
  seriesChange,
  summarizeNetWorth,
} from '../src/networth.js';

let counter = 0;
const move = (accountId, kind, date, fields = {}) => ({
  id: `m${++counter}`,
  accountId,
  kind,
  date,
  amount: 0,
  note: '',
  createdAt: `${date}T10:00:${String(counter).padStart(2, '0')}.000Z`,
  ...fields,
});
const kr = (value) => value * 100;

const ACCOUNTS = [
  { id: 'bank', name: 'Brukskonto', type: 'bank', institution: 'DNB' },
  { id: 'fund', name: 'Indeksfond', type: 'fund', institution: 'Nordnet' },
  { id: 'firi', name: 'Firi', type: 'crypto', institution: 'Firi' },
  { id: 'loan', name: 'Studielån', type: 'loan', institution: 'Lånekassen' },
];

const MOVEMENTS = [
  move('bank', 'opening', '2026-09-01', { amount: kr(10_000) }),
  move('bank', 'withdrawal', '2026-09-10', { amount: kr(2_000) }),
  move('bank', 'value', '2026-10-01', { amount: kr(12_500) }),
  move('fund', 'opening', '2026-09-01', { amount: kr(20_000), invested: kr(18_000) }),
  move('fund', 'deposit', '2026-09-10', { amount: kr(2_000) }),
  move('fund', 'value', '2026-10-01', { amount: kr(23_000) }),
  move('firi', 'buy', '2026-09-05', { asset: 'BTC', quantity: 0.01, amount: kr(7_000) }),
  move('firi', 'buy', '2026-09-20', { asset: 'ETH', quantity: 0.5, amount: kr(10_000) }),
  move('firi', 'sell', '2026-10-02', { asset: 'ETH', quantity: 0.2, amount: kr(4_500) }),
  move('loan', 'opening', '2026-09-01', { amount: kr(50_000) }),
];

const PRICES = { BTC: { price: 800_000 }, ETH: { price: 25_000 } };

test('replayAccount: opening, deposits, withdrawals and new values give the balance', () => {
  const bank = replayAccount(movementsFor('bank', MOVEMENTS));
  assertEqual(bank.value, kr(12_500), 'the latest "new value" wins');
  const before = replayAccount(movementsFor('bank', MOVEMENTS), '2026-09-15');
  assertEqual(before.value, kr(8_000), 'until a date');
});

test('replayAccount: a new value changes the value but not how much was invested', () => {
  const fund = replayAccount(movementsFor('fund', MOVEMENTS));
  assertEqual(fund.value, kr(23_000));
  assertEqual(fund.invested, kr(20_000), '18 000 at the start + 2 000 deposited');
});

test('replayAccount: crypto buys and sells add up per coin, sold-out coins disappear', () => {
  const firi = replayAccount(movementsFor('firi', MOVEMENTS));
  assertDeepEqual(firi.holdings, { BTC: 0.01, ETH: 0.3 });
  assertEqual(firi.invested, kr(7_000 + 10_000 - 4_500));
  const soldOut = replayAccount([
    move('x', 'buy', '2026-01-01', { asset: 'SOL', quantity: 0.1, amount: 1 }),
    move('x', 'buy', '2026-01-02', { asset: 'SOL', quantity: 0.2, amount: 1 }),
    move('x', 'sell', '2026-01-03', { asset: 'SOL', quantity: 0.3, amount: 1 }),
  ]);
  assertDeepEqual(soldOut.holdings, {}, '0.1 + 0.2 - 0.3 is exactly 0 after rounding');
});

test('movements on the same day are applied in the order they were registered', () => {
  const list = [
    move('a', 'value', '2026-10-01', { amount: 500, createdAt: '2026-10-01T12:00:00.000Z' }),
    move('a', 'deposit', '2026-10-01', { amount: 100, createdAt: '2026-10-01T08:00:00.000Z' }),
  ];
  assertEqual(replayAccount(movementsFor('a', list)).value, 500, 'deposit first, then the new value');
});

test('holdingsValue multiplies by the price and reports coins without a price', () => {
  const result = holdingsValue({ BTC: 0.01, DOGE: 100 }, (symbol) => PRICES[symbol]?.price);
  assertEqual(result.value, kr(8_000));
  assertDeepEqual(result.missing, ['DOGE']);
});

test('summarizeNetWorth adds up assets, subtracts debt and splits by type', () => {
  const summary = summarizeNetWorth(ACCOUNTS, MOVEMENTS, PRICES);
  const crypto = kr(8_000) + kr(7_500); // 0.01 BTC + 0.3 ETH
  assertEqual(summary.assets, kr(12_500) + kr(23_000) + crypto);
  assertEqual(summary.debts, kr(50_000));
  assertEqual(summary.total, summary.assets - summary.debts);
  assertDeepEqual(summary.byType.map((t) => t.type), ['bank', 'fund', 'crypto', 'loan'], 'in the order of the account types');
  assertEqual(summary.byType.find((t) => t.type === 'loan').share, null, 'debt is not a share of the assets');
  const shares = summary.byType.filter((t) => t.share !== null).reduce((sum, t) => sum + t.share, 0);
  assert(Math.abs(shares - 1) < 1e-9, `shares add up to ${shares}`);
});

test('summarizeNetWorth calculates the gain for funds and crypto, not for bank accounts', () => {
  const summary = summarizeNetWorth(ACCOUNTS, MOVEMENTS, PRICES);
  const row = (id) => summary.rows.find((r) => r.account.id === id);
  assertEqual(row('bank').gain, null);
  assertEqual(row('fund').gain, kr(3_000));
  assertEqual(row('fund').gainRatio, 0.15);
  assertEqual(row('firi').gain, kr(15_500) - kr(12_500));
  assertEqual(summary.gain.amount, kr(3_000) + kr(3_000));
});

test('summarizeNetWorth still works before any prices have been loaded', () => {
  const summary = summarizeNetWorth(ACCOUNTS, MOVEMENTS, {});
  const firi = summary.rows.find((r) => r.account.id === 'firi');
  assertEqual(firi.value, 0);
  assertDeepEqual(firi.missing.sort(), ['BTC', 'ETH']);
});

test('heldAssets lists the price keys of everything on crypto and stock accounts', () => {
  assertDeepEqual(heldAssets(ACCOUNTS, MOVEMENTS), ['BTC', 'ETH']);
  const accounts = [...ACCOUNTS, { id: 'ask', name: 'ASK', type: 'stocks', institution: 'Nordnet' }];
  const movements = [...MOVEMENTS, move('ask', 'buy', '2026-10-01', { asset: 'EQNR.OL', quantity: 10, amount: kr(4_000) })];
  assertDeepEqual(heldAssets(accounts, movements), ['BTC', 'ETH', 'aksje:EQNR.OL']);
});

test('stock accounts are valued as shares × price, looked up under the "aksje:" key', () => {
  const accounts = [
    { id: 'ask', name: 'ASK', type: 'stocks', institution: 'Nordnet' },
    { id: 'coin', name: 'Kryptokonto', type: 'crypto', institution: '' },
  ];
  const movements = [
    move('ask', 'buy', '2026-10-01', { asset: 'EQNR.OL', quantity: 10, amount: kr(4_000) }),
    move('ask', 'buy', '2026-10-02', { asset: 'LINK', quantity: 2, amount: kr(100) }),
    move('coin', 'buy', '2026-10-02', { asset: 'LINK', quantity: 1, amount: kr(150) }),
  ];
  // LINK er både en aksje (Interlink) og en kryptomynt (Chainlink) – kursene må ikke blandes.
  const prices = { 'aksje:EQNR.OL': { price: 437.8 }, 'aksje:LINK': { price: 60 }, LINK: { price: 160 } };
  const summary = summarizeNetWorth(accounts, movements, prices);
  const ask = summary.rows.find((row) => row.account.id === 'ask');
  assertEqual(ask.value, kr(4_378) + kr(120));
  assertEqual(ask.gain, kr(4_378) + kr(120) - kr(4_100));
  assertEqual(summary.rows.find((row) => row.account.id === 'coin').value, kr(160));
});

test('netWorthSeries rebuilds the net worth day by day with the price of each day', () => {
  const priceOn = (symbol, date) => (date < '2026-10-01' ? { BTC: 700_000, ETH: 20_000 } : { BTC: 800_000, ETH: 25_000 })[symbol];
  const series = netWorthSeries(ACCOUNTS, MOVEMENTS, { from: '2026-08-31', to: '2026-10-02', priceOn });
  assertEqual(series.length, 33, 'one point per day, both ends included');
  assertEqual(series[0].value, 0, 'nothing before the first movement');
  assertEqual(series[1].value, kr(10_000) + kr(20_000) - kr(50_000), '1 September: openings, debt subtracted');
  const last = series.at(-1);
  assertEqual(last.date, '2026-10-02');
  assertEqual(last.value, summarizeNetWorth(ACCOUNTS, MOVEMENTS, PRICES).total, 'the last day equals today\'s total');
});

test('rangeStart never starts before the first movement', () => {
  assertEqual(rangeStart('1m', '2026-10-22', '2026-01-01'), '2026-09-22');
  assertEqual(rangeStart('1y', '2026-10-22', '2026-06-01'), '2026-06-01');
  assertEqual(rangeStart('all', '2026-10-22', '2026-06-01'), '2026-06-01');
  assertEqual(rangeStart('all', '2026-10-22', null), '2026-10-22');
});

test('seriesChange compares the last point with the first', () => {
  assertDeepEqual(seriesChange([{ date: 'a', value: 100 }, { date: 'b', value: 250 }]), { amount: 150, ratio: 1.5, from: 'a' });
  assertEqual(seriesChange([{ date: 'a', value: -100 }, { date: 'b', value: 50 }]).ratio, null, 'no percentage from a negative start');
  assertEqual(seriesChange([{ date: 'a', value: 100 }]), null);
});

test('holdingsCost uses the average cost method: a sale takes its share of the cost', () => {
  const positions = holdingsCost([
    move('a', 'buy', '2026-01-01', { asset: 'EQNR.OL', quantity: 10, amount: kr(2_500) }),
    move('a', 'buy', '2026-02-01', { asset: 'EQNR.OL', quantity: 10, amount: kr(3_500) }),
    move('a', 'sell', '2026-03-01', { asset: 'EQNR.OL', quantity: 5, amount: kr(2_000) }),
  ]);
  assertEqual(positions['EQNR.OL'].quantity, 15);
  assertEqual(positions['EQNR.OL'].cost, kr(4_500), '6 000 kr for 20 shares; selling a quarter leaves three quarters of the cost');
  assertDeepEqual(holdingsCost([move('a', 'buy', '2026-01-01', { asset: 'BTC', quantity: 0.1, amount: 1 }), move('a', 'sell', '2026-01-02', { asset: 'BTC', quantity: 0.1, amount: 2 })]), {}, 'sold out');
});

test('holdingsOverview adds up the same coin across accounts, with average price and gain', () => {
  const accounts = [
    { id: 'firi', name: 'Firi', type: 'crypto', institution: 'Firi' },
    { id: 'binance', name: 'Binance', type: 'crypto', institution: 'Binance' },
  ];
  const movements = [
    move('firi', 'buy', '2026-01-01', { asset: 'BTC', quantity: 0.01, amount: kr(6_000) }),
    move('binance', 'buy', '2026-02-01', { asset: 'BTC', quantity: 0.01, amount: kr(8_000) }),
    move('binance', 'buy', '2026-02-01', { asset: 'ETH', quantity: 1, amount: kr(20_000) }),
  ];
  const rows = holdingsOverview(accounts, movements, { BTC: { price: 800_000, change24h: 2 }, ETH: { price: 22_000, change24h: -1 } });
  assertDeepEqual(rows.map((row) => row.key), ['ETH', 'BTC'], 'biggest value first');
  const btc = rows[1];
  assertEqual(btc.quantity, 0.02);
  assertEqual(btc.averagePrice, 700_000);
  assertEqual(btc.value, kr(16_000));
  assertEqual(btc.gain, kr(2_000));
  assertDeepEqual(btc.accountIds, ['firi', 'binance']);
  assertEqual(holdingsOverview(accounts, movements, {})[0].value, null, 'no price yet: no value');
});

test('dayChange works out the change since yesterday from the price changes', () => {
  // 10 200 kr after +2 % means 10 000 kr yesterday; 9 900 kr after -1 % means 10 000 kr yesterday
  const change = dayChange([{ value: kr(10_200), change24h: 2 }, { value: kr(9_900), change24h: -1 }, { value: null, change24h: 5 }]);
  assertEqual(change.amount, kr(100));
  assertEqual(Math.round(change.ratio * 10_000) / 10_000, 0.005);
  assertDeepEqual(dayChange([]), { amount: 0, ratio: null });
  // With the whole portfolio (here 30 100 kr incl. a fund without a daily price) the ratio is of all of it
  const withFund = dayChange([{ value: kr(10_200), change24h: 2 }], kr(30_100));
  assertEqual(withFund.amount, kr(200));
  assertEqual(Math.round(withFund.ratio * 10_000) / 10_000, 0.0067);
});
