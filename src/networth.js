// Formueberegninger. Verdien til hver konto regnes ut fra bevegelsene på kontoen
// (innskudd, uttak, ny verdi, kjøp og salg), så alt stemmer også etter sletting og angring.
// Rene funksjoner uten nettleser eller lagring – testes i tests/networth.test.js.
//
// En bevegelse: { id, accountId, kind, date, amount (øre), asset, quantity, invested, note, link, createdAt }
import { ACCOUNT_TYPES, accountKind, isMarketKind, priceKey } from './accounts.js';
import { addDays } from './dates.js';

/** Hvilke bevegelser hver kontotype kan ha (i tillegg til "opening", startsaldoen). */
export const MOVEMENT_KINDS = {
  balance: ['deposit', 'withdrawal', 'value'],
  investment: ['deposit', 'withdrawal', 'value'],
  stocks: ['buy', 'sell'],
  crypto: ['buy', 'sell'],
  debt: ['withdrawal', 'deposit', 'value'],
};

export const HISTORY_RANGES = { '1w': 7, '1m': 30, '3m': 91, '6m': 182, '1y': 365, all: null };

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

/** priceOf får kursnøkkelen (se priceKey i accounts.js): "BTC" eller "aksje:EQNR.OL". */
function accountStatus(account, sortedMovements, priceOf, until = null) {
  const kind = accountKind(account);
  const replay = replayAccount(sortedMovements, until);
  if (!isMarketKind(kind)) return { ...replay, missing: [] };
  const { value, missing } = holdingsValue(replay.holdings, (asset) => priceOf(priceKey(kind, asset)));
  return { ...replay, value: replay.value + value, missing };
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
    // Mangler kursen for noe (f.eks. mens den hentes), er avkastningen ukjent – ikke −100 %.
    const tracksGain = (kind === 'investment' || isMarketKind(kind)) && status.missing.length === 0;
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

/** Kursnøklene til alle mynter og aksjer du eier i dag, f.eks. ["BTC", "aksje:EQNR.OL"]. */
export function heldAssets(accounts, movements) {
  const keys = new Set();
  for (const account of accounts) {
    const kind = accountKind(account);
    if (!isMarketKind(kind)) continue;
    const { holdings } = replayAccount(movementsFor(account.id, movements));
    Object.keys(holdings).forEach((asset) => keys.add(priceKey(kind, asset)));
  }
  return [...keys].sort();
}

/**
 * Kostpris per mynt/aksje med gjennomsnittsmetoden (GAV, som hos Nordnet): et salg tar med seg
 * en forholdsmessig del av kostprisen. Gir { asset: { quantity, cost } } med cost i øre.
 */
export function holdingsCost(sortedMovements) {
  const positions = {};
  for (const m of sortedMovements) {
    if (m.kind !== 'buy' && m.kind !== 'sell') continue;
    const position = (positions[m.asset] ??= { quantity: 0, cost: 0 });
    if (m.kind === 'buy') {
      position.quantity = round8(position.quantity + m.quantity);
      position.cost += m.amount;
    } else {
      const share = position.quantity > 0 ? Math.min(1, m.quantity / position.quantity) : 1;
      position.cost = Math.round(position.cost * (1 - share));
      position.quantity = round8(position.quantity - m.quantity);
    }
  }
  for (const [asset, position] of Object.entries(positions)) {
    if (position.quantity <= 0) delete positions[asset];
  }
  return positions;
}

/**
 * Alle aksjer eller mynter på kontoene, samlet per aksje/mynt (på tvers av kontoer), største først:
 * antall, kostpris, snittkurs (GAV), siste kurs, verdi, avkastning og endring siste døgn.
 */
export function holdingsOverview(accounts, movements, prices = {}) {
  const byKey = new Map();
  for (const account of accounts) {
    const kind = accountKind(account);
    if (!isMarketKind(kind)) continue;
    for (const [asset, { quantity, cost }] of Object.entries(holdingsCost(movementsFor(account.id, movements)))) {
      const key = priceKey(kind, asset);
      const row = byKey.get(key) ?? { key, asset, kind, quantity: 0, cost: 0, accountIds: [] };
      row.quantity = round8(row.quantity + quantity);
      row.cost += cost;
      row.accountIds.push(account.id);
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .map((row) => {
      const price = prices[row.key]?.price;
      const value = typeof price === 'number' ? Math.round(row.quantity * price * 100) : null;
      const gain = value === null ? null : value - row.cost;
      return {
        ...row,
        price: typeof price === 'number' ? price : null,
        change24h: prices[row.key]?.change24h ?? null,
        averagePrice: row.cost / 100 / row.quantity,
        value,
        gain,
        gainRatio: gain !== null && row.cost > 0 ? gain / row.cost : null,
      };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.key.localeCompare(b.key));
}

/** Har minst én aksje eller mynt fått kurs? Før det er endringen i dag ukjent («–», ikke 0 kr). */
export const hasPrices = (holdings) => holdings.some((holding) => holding.value !== null);

/**
 * Hvor mye beholdningen har endret seg siste døgn (krypto) eller siden i går (aksjer), ut fra kursene.
 * Med `total` (hele porteføljen, også fond uten dagskurs) regnes prosenten av alt, ikke bare av det som har kurs.
 */
export function dayChange(holdings, total = null) {
  let amount = 0;
  let before = 0;
  for (const holding of holdings) {
    if (holding.value === null || typeof holding.change24h !== 'number') continue;
    const previous = holding.value / (1 + holding.change24h / 100);
    amount += holding.value - previous;
    before += previous;
  }
  if (total !== null) before = total - amount;
  return { amount: Math.round(amount), ratio: before > 0 ? amount / before : null };
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

/** Endring fra første til siste punkt i en serie, i kroner og i prosent av startverdien. */
export function seriesChange(series) {
  if (series.length < 2) return null;
  const first = series[0].value;
  const amount = series.at(-1).value - first;
  return { amount, ratio: first > 0 ? amount / first : null, from: series[0].date };
}
