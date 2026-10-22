// Formueberegninger. Verdien til hver konto regnes ut fra bevegelsene på kontoen
// (innskudd, uttak, ny verdi, kjøp og salg), så alt stemmer også etter sletting og angring.
// Rene funksjoner uten nettleser eller lagring – testes i tests/networth.test.js.
//
// En bevegelse: { id, accountId, kind, date, amount (øre), asset, quantity, invested, note, link, createdAt }
import { ACCOUNT_TYPES, accountKind } from './accounts.js';
import { addDays } from './dates.js';

/** Hvilke bevegelser hver kontotype kan ha (i tillegg til "opening", startsaldoen). */
export const MOVEMENT_KINDS = {
  balance: ['deposit', 'withdrawal', 'value'],
  investment: ['deposit', 'withdrawal', 'value'],
  crypto: ['buy', 'sell'],
  debt: ['withdrawal', 'deposit', 'value'],
};

export const HISTORY_RANGES = { '1m': 30, '3m': 91, '6m': 182, '1y': 365, all: null };

const round8 = (value) => Math.round(value * 1e8) / 1e8;

export function byDate(a, b) {
  return a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt));
}

/** Bevegelsene til én konto, eldste først. */
export function movementsFor(accountId, movements) {
  return movements.filter((m) => m.accountId === accountId).sort(byDate);
}

/**
 * Spiller av bevegelsene til én konto (sortert eldste først) til og med datoen `until`.
 * Gir { value, invested, holdings }:
 *  - value: saldo/verdi i øre (for gjeld: hvor mye du skylder)
 *  - invested: hvor mye du selv har satt inn – brukes til å regne ut avkastning
 *  - holdings: antall mynter per kryptovaluta
 */
export function replayAccount(sortedMovements, until = null) {
  let value = 0;
  let invested = 0;
  const holdings = {};
  for (const m of sortedMovements) {
    if (until && m.date > until) break;
    switch (m.kind) {
      case 'opening':
        value = m.amount;
        invested = m.invested ?? m.amount;
        break;
      case 'deposit':
        value += m.amount;
        invested += m.amount;
        break;
      case 'withdrawal':
        value -= m.amount;
        invested -= m.amount;
        break;
      case 'value':
        value = m.amount; // ny verdi fra banken/megleren: endrer ikke hvor mye du har satt inn
        break;
      case 'buy':
        holdings[m.asset] = round8((holdings[m.asset] ?? 0) + m.quantity);
        invested += m.amount;
        break;
      case 'sell':
        holdings[m.asset] = round8((holdings[m.asset] ?? 0) - m.quantity);
        invested -= m.amount;
        break;
    }
  }
  for (const [asset, quantity] of Object.entries(holdings)) {
    if (quantity <= 0) delete holdings[asset];
  }
  return { value, invested, holdings };
}

/** Verdien av en kryptobeholdning i øre. priceOf(symbol) gir kurs per mynt, eller undefined. */
export function holdingsValue(holdings, priceOf) {
  let value = 0;
  const missing = [];
  for (const [asset, quantity] of Object.entries(holdings)) {
    const price = priceOf(asset);
    if (typeof price === 'number' && Number.isFinite(price)) value += Math.round(quantity * price * 100);
    else missing.push(asset);
  }
  return { value, missing };
}

function accountStatus(account, sortedMovements, priceOf, until = null) {
  const replay = replayAccount(sortedMovements, until);
  if (accountKind(account) !== 'crypto') return { ...replay, missing: [] };
  const { value, missing } = holdingsValue(replay.holdings, priceOf);
  return { ...replay, value, missing };
}

const typeOrder = (type) => ACCOUNT_TYPES.findIndex((t) => t.id === type);

/**
 * Hele formuen med dagens kurser. prices: { BTC: { price, change24h }, … }.
 * Gir verdien til hver konto, sum eiendeler og gjeld, fordeling per type og samlet avkastning.
 */
export function summarizeNetWorth(accounts, movements, prices = {}) {
  const priceOf = (symbol) => prices[symbol]?.price;
  const rows = accounts.map((account) => {
    const kind = accountKind(account);
    const status = accountStatus(account, movementsFor(account.id, movements), priceOf);
    const tracksGain = kind === 'investment' || kind === 'crypto';
    const gain = tracksGain ? status.value - status.invested : null;
    return {
      account,
      kind,
      value: status.value,
      invested: status.invested,
      holdings: status.holdings,
      missing: status.missing,
      gain,
      gainRatio: tracksGain && status.invested > 0 ? gain / status.invested : null,
    };
  });

  const assets = rows.filter((row) => row.kind !== 'debt').reduce((sum, row) => sum + row.value, 0);
  const debts = rows.filter((row) => row.kind === 'debt').reduce((sum, row) => sum + row.value, 0);

  const totals = new Map();
  for (const row of rows) totals.set(row.account.type, (totals.get(row.account.type) ?? 0) + row.value);
  const byType = [...totals]
    .map(([type, value]) => ({ type, value, share: type !== 'loan' && assets > 0 ? value / assets : null }))
    .sort((a, b) => typeOrder(a.type) - typeOrder(b.type));

  const tracked = rows.filter((row) => row.gain !== null);
  const invested = tracked.reduce((sum, row) => sum + row.invested, 0);
  const trackedValue = tracked.reduce((sum, row) => sum + row.value, 0);
  const gain = tracked.length
    ? { invested, value: trackedValue, amount: trackedValue - invested, ratio: invested > 0 ? (trackedValue - invested) / invested : null }
    : null;

  return { rows, assets, debts, total: assets - debts, byType, gain };
}

/** Alle mynter som finnes på minst én kryptokonto i dag. */
export function heldCoins(accounts, movements) {
  const coins = new Set();
  for (const account of accounts) {
    if (accountKind(account) !== 'crypto') continue;
    const { holdings } = replayAccount(movementsFor(account.id, movements));
    Object.keys(holdings).forEach((coin) => coins.add(coin));
  }
  return [...coins].sort();
}

/**
 * Formuen dag for dag fra `from` til `to` (gjeld trukket fra).
 * priceOn(symbol, date) gir kursen på en dato. Gir [{ date, value }] med verdier i øre.
 */
export function netWorthSeries(accounts, movements, { from, to, priceOn }) {
  const sorted = new Map(accounts.map((account) => [account.id, movementsFor(account.id, movements)]));
  const points = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    let value = 0;
    for (const account of accounts) {
      const status = accountStatus(account, sorted.get(account.id), (symbol) => priceOn(symbol, date), date);
      value += accountKind(account) === 'debt' ? -status.value : status.value;
    }
    points.push({ date, value });
  }
  return points;
}

/** Første dato med en bevegelse, eller null. */
export function firstMovementDate(movements) {
  return movements.reduce((first, m) => (first === null || m.date < first ? m.date : first), null);
}

/** Første dato i grafen for en periode ("1m", "1y", "all" …), aldri før den første bevegelsen. */
export function rangeStart(range, today, firstDate) {
  const days = HISTORY_RANGES[range] ?? null;
  const start = days === null ? firstDate ?? today : addDays(today, -days);
  return firstDate && start < firstDate ? firstDate : start;
}

/** Endring fra første til siste punkt i en serie. */
export function seriesChange(series) {
  if (series.length < 2) return null;
  return { amount: series.at(-1).value - series[0].value, from: series[0].date };
}
