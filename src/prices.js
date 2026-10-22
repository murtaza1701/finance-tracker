// Kryptokurser. Live-kurser kommer fra Binance i sanntid (en WebSocket som sender ny pris hvert
// sekund, i USDT) og regnes om til kroner med kursen for USDT fra CoinGecko. CoinGecko gir også
// kurser i kroner direkte (hvert minutt), døgnendring og historiske dagskurser til grafen.
// Bare kurser hentes – hva du eier, sendes aldri noe sted. Ingen innlogging eller nøkler trengs.
import { COINS, findCoin } from './accounts.js';
import { todayISO, toISODate } from './dates.js';

const GECKO = 'https://api.coingecko.com/api/v3';
const BINANCE_STREAM = 'wss://stream.binance.com:9443/stream';
const POLL_MS = 60_000;
const LIVE_TIMEOUT_MS = 15_000;
const HISTORY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'pengeflyt:prices:v1';
const HISTORY_KEY = 'pengeflyt:history:v1';

// ---------- Rene funksjoner (testes i tests/prices.test.js) ----------

/** Gjør om svaret fra CoinGecko /simple/price til { BTC: { price, change24h } }. */
export function parseGeckoPrices(json, currency) {
  const key = currency.toLowerCase();
  const prices = {};
  for (const coin of COINS) {
    const entry = json?.[coin.gecko];
    if (typeof entry?.[key] !== 'number') continue;
    const change = entry[`${key}_24h_change`];
    prices[coin.symbol] = { price: entry[key], change24h: typeof change === 'number' ? change : null };
  }
  return prices;
}

/** Leser en melding fra Binance (miniTicker) og regner prisen om fra USDT med `usdtRate`. */
export function parseMiniTicker(message, usdtRate) {
  const data = message?.data ?? message;
  const coin = COINS.find((c) => c.binance && c.binance === data?.s);
  const close = Number(data?.c);
  const open = Number(data?.o);
  if (!coin || !(close > 0) || !(usdtRate > 0)) return null;
  return { symbol: coin.symbol, price: close * usdtRate, change24h: open > 0 ? ((close - open) / open) * 100 : null };
}

/** Gjør om CoinGecko /market_chart til en sortert liste [[dato, kurs], …] med én kurs per dag. */
export function parseGeckoHistory(json) {
  const byDate = new Map();
  for (const point of json?.prices ?? []) {
    const [timestamp, price] = point;
    if (typeof timestamp === 'number' && typeof price === 'number') byDate.set(toISODate(new Date(timestamp)), price);
  }
  return [...byDate].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Kursen på en dato: den dagen eller nærmeste dag før (eller den første, hvis datoen er før historikken). */
export function priceOnDate(points, date) {
  if (!points?.length) return undefined;
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle][0] <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return points[found >= 0 ? found : 0][1];
}

// ---------- Kursstrømmen i nettleseren ----------

function readJSON(storage, key) {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // full eller blokkert lagring: kursene hentes på nytt neste gang
  }
}

/**
 * Holder kursene for myntene du eier oppdatert. status():
 *  'idle' (ingen krypto), 'loading', 'live' (sanntid fra Binance), 'ok' (CoinGecko), 'error' (frakoblet).
 */
export function createPriceFeed({ storage, currency = 'NOK' }) {
  let assets = [];
  let prices = {};
  let usdtRate = null;
  let status = 'idle';
  let updatedAt = null;
  let lastTick = 0;
  let socket = null;
  let pollTimer = null;
  let retryTimer = null;
  let retries = 0;
  let emitTimer = null;
  let lastEmit = 0;
  let historyRequest = null;
  const listeners = new Set();
  const history = new Map(); // symbol → [[dato, kurs], …]

  const historyKey = (symbol) => `${HISTORY_KEY}:${currency}:${symbol}`;

  function storedHistory(symbol) {
    if (!history.has(symbol)) history.set(symbol, readJSON(storage, historyKey(symbol))?.points ?? null);
    return history.get(symbol);
  }

  const cached = readJSON(storage, CACHE_KEY);
  if (cached?.currency === currency && cached.prices) {
    prices = cached.prices;
    usdtRate = cached.usdtRate ?? null;
    updatedAt = cached.updatedAt ?? null;
  }

  // Varsle sidene, men høyst én gang i sekundet (Binance sender mange oppdateringer).
  function emit() {
    const wait = 1000 - (Date.now() - lastEmit);
    if (wait <= 0) {
      lastEmit = Date.now();
      listeners.forEach((listener) => listener());
    } else if (!emitTimer) {
      emitTimer = setTimeout(() => {
        emitTimer = null;
        emit();
      }, wait);
    }
  }

  async function poll() {
    if (assets.length === 0) return;
    const ids = new Set(assets.map((symbol) => findCoin(symbol)?.gecko).filter(Boolean));
    ids.add('tether'); // kursen for USDT trengs for å regne om Binance-prisene
    if (!updatedAt) status = 'loading';
    try {
      const url = `${GECKO}/simple/price?ids=${[...ids].join(',')}&vs_currencies=${currency.toLowerCase()}&include_24hr_change=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`CoinGecko svarte ${response.status}`);
      const fresh = parseGeckoPrices(await response.json(), currency);
      usdtRate = fresh.USDT?.price ?? usdtRate;
      const now = Date.now();
      for (const [symbol, price] of Object.entries(fresh)) {
        // Ikke bytt ut en ferskere live-pris fra Binance med CoinGecko sin (som henger litt etter).
        if (prices[symbol]?.source === 'live' && now - prices[symbol].updatedAt < LIVE_TIMEOUT_MS) continue;
        prices[symbol] = { ...price, updatedAt: now, source: 'gecko' };
      }
      updatedAt = now;
      if (status !== 'live') status = 'ok';
      writeJSON(storage, CACHE_KEY, { currency, prices, usdtRate, updatedAt });
    } catch {
      if (status !== 'live') status = 'error';
    }
    emit();
  }

  function closeSocket() {
    clearTimeout(retryTimer);
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  }

  function connect() {
    closeSocket();
    const streams = assets
      .map((symbol) => findCoin(symbol)?.binance)
      .filter(Boolean)
      .map((pair) => `${pair.toLowerCase()}@miniTicker`);
    if (streams.length === 0 || typeof WebSocket === 'undefined' || document.hidden) return;

    socket = new WebSocket(`${BINANCE_STREAM}?streams=${streams.join('/')}`);
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const tick = parseMiniTicker(message, usdtRate);
      if (!tick) return;
      const now = Date.now();
      prices[tick.symbol] = { price: tick.price, change24h: tick.change24h, updatedAt: now, source: 'live' };
      lastTick = now;
      updatedAt = now;
      status = 'live';
      retries = 0;
      emit();
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      socket = null;
      if (status === 'live') status = 'ok';
      emit();
      // Prøv igjen etter 1, 2, 4 … sekunder (maks 30).
      retryTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retries++));
    };
  }

  function start() {
    clearInterval(pollTimer);
    if (assets.length === 0) {
      closeSocket();
      status = 'idle';
      emit();
      return;
    }
    if (status === 'idle') status = 'loading';
    poll().then(connect);
    pollTimer = setInterval(poll, POLL_MS);
  }

  // Ikke hold forbindelsen åpen når fanen ikke vises.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollTimer);
        closeSocket();
      } else {
        start();
      }
    });
  }

  // Er det lenge siden siste live-pris, er vi ikke lenger "live".
  setInterval(() => {
    if (status === 'live' && Date.now() - lastTick > LIVE_TIMEOUT_MS) {
      status = updatedAt ? 'ok' : 'loading';
      emit();
    }
  }, 5_000);

  return {
    prices: () => prices,
    status: () => status,
    updatedAt: () => updatedAt,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Hvilke mynter skal følges? Kalles når kontoene endres. */
    setAssets(symbols) {
      const next = [...new Set(symbols)].filter((symbol) => findCoin(symbol)).sort();
      if (next.join() === assets.join()) return;
      assets = next;
      start();
    },

    setCurrency(code) {
      if (code === currency) return;
      currency = code;
      prices = {};
      usdtRate = null;
      updatedAt = null;
      history.clear();
      start();
    },

    refresh: () => poll(),

    /**
     * Kursen for én mynt nå, også for mynter appen ikke følger ennå (f.eks. når du
     * registrerer et kjøp av en ny mynt). Gir undefined hvis kursen ikke kan hentes.
     */
    async quote(symbol) {
      if (prices[symbol]) return prices[symbol].price;
      const coin = findCoin(symbol);
      if (!coin) return undefined;
      try {
        const url = `${GECKO}/simple/price?ids=${coin.gecko},tether&vs_currencies=${currency.toLowerCase()}&include_24hr_change=true`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`CoinGecko svarte ${response.status}`);
        const fresh = parseGeckoPrices(await response.json(), currency);
        usdtRate = fresh.USDT?.price ?? usdtRate;
        for (const [key, price] of Object.entries(fresh)) {
          if (!prices[key]) prices[key] = { ...price, updatedAt: Date.now(), source: 'gecko' };
        }
        emit();
        return prices[symbol]?.price;
      } catch {
        return undefined;
      }
    },

    /**
     * Henter historiske dagskurser (siste år) for grafen og lagrer dem i 6 timer.
     * Gir true hvis noe nytt ble hentet (da bør grafen tegnes på nytt).
     */
    loadHistory(symbols) {
      if (historyRequest) return historyRequest.then(() => false); // allerede i gang
      historyRequest = (async () => {
        let changed = false;
        for (const symbol of symbols) {
          const coin = findCoin(symbol);
          const stored = readJSON(storage, historyKey(symbol));
          if (!coin || (stored && Date.now() - stored.fetchedAt < HISTORY_MAX_AGE_MS)) continue;
          try {
            const url = `${GECKO}/coins/${coin.gecko}/market_chart?vs_currency=${currency.toLowerCase()}&days=365&interval=daily`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`CoinGecko svarte ${response.status}`);
            const points = parseGeckoHistory(await response.json());
            if (points.length) {
              history.set(symbol, points);
              writeJSON(storage, historyKey(symbol), { fetchedAt: Date.now(), points });
              changed = true;
            }
          } catch {
            // uten historikk brukes dagens kurs bakover i tid
          }
        }
        return changed;
      })().finally(() => {
        historyRequest = null;
      });
      return historyRequest;
    },

    /** Kursen på en dato: live-kurs for i dag, ellers historisk dagskurs (eller dagens kurs som reserve). */
    priceOn(symbol, date) {
      if (date >= todayISO() && prices[symbol]) return prices[symbol].price;
      return priceOnDate(storedHistory(symbol), date) ?? prices[symbol]?.price;
    },
  };
}
