import { test, assertDeepEqual, assertEqual } from './harness.js';
import { parseGeckoHistory, parseGeckoPrices, parseMiniTicker, priceOnDate } from '../src/prices.js';

test('parseGeckoPrices maps CoinGecko ids to coin symbols', () => {
  const json = {
    bitcoin: { nok: 766290, nok_24h_change: -1.89 },
    tether: { nok: 9.37 },
    'not-a-coin-we-know': { nok: 1 },
  };
  assertDeepEqual(parseGeckoPrices(json, 'NOK'), {
    BTC: { price: 766290, change24h: -1.89 },
    USDT: { price: 9.37, change24h: null },
  });
  assertDeepEqual(parseGeckoPrices(null, 'NOK'), {});
});

test('parseMiniTicker converts a live Binance price from USDT to kroner', () => {
  const message = { stream: 'btcusdt@miniTicker', data: { s: 'BTCUSDT', c: '80000.00', o: '78000.00' } };
  const tick = parseMiniTicker(message, 9.5);
  assertEqual(tick.symbol, 'BTC');
  assertEqual(tick.price, 760_000);
  assertEqual(Math.round(tick.change24h * 100) / 100, 2.56);
});

test('parseMiniTicker ignores unknown pairs and waits for the USDT rate', () => {
  assertEqual(parseMiniTicker({ data: { s: 'FOOUSDT', c: '1', o: '1' } }, 9.5), null);
  assertEqual(parseMiniTicker({ data: { s: 'BTCUSDT', c: '80000', o: '1' } }, null), null);
});

test('parseGeckoHistory keeps one price per day, sorted by date', () => {
  const day = (iso, hour) => new Date(`${iso}T${hour}:00:00`).getTime();
  const points = parseGeckoHistory({
    prices: [
      [day('2026-10-02', '12'), 3],
      [day('2026-10-01', '01'), 1],
      [day('2026-10-01', '23'), 2],
    ],
  });
  assertDeepEqual(points, [['2026-10-01', 2], ['2026-10-02', 3]]);
});

test('priceOnDate uses the price of that day, or the closest earlier day', () => {
  const points = [['2026-10-01', 100], ['2026-10-03', 300], ['2026-10-05', 500]];
  assertEqual(priceOnDate(points, '2026-10-03'), 300);
  assertEqual(priceOnDate(points, '2026-10-04'), 300);
  assertEqual(priceOnDate(points, '2026-12-31'), 500);
  assertEqual(priceOnDate(points, '2026-01-01'), 100, 'before the history: the first price');
  assertEqual(priceOnDate([], '2026-10-01'), undefined);
});
