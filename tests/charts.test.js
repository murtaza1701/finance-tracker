import { test, assert, assertDeepEqual, assertEqual } from './harness.js';
import { categoryBars, niceRange, niceScale } from '../src/charts.js';

test('niceScale rounds the axis up to a nice number', () => {
  assertDeepEqual(niceScale(2_000_000), { max: 2_000_000, step: 500_000, ticks: [0, 500_000, 1_000_000, 1_500_000, 2_000_000] });
  assertEqual(niceScale(2_150_000).max, 3_000_000);
  assertEqual(niceScale(1_234_567).max, 1_500_000);
});

test('niceScale gives an empty chart an axis', () => {
  assertDeepEqual(niceScale(0).ticks, [0, 25_000, 50_000, 75_000, 100_000]);
});

test('every value fits under the axis maximum', () => {
  for (const value of [1, 99, 12_345, 999_999, 7_654_321]) {
    const { max, ticks } = niceScale(value);
    assert(max >= value, `${max} < ${value}`);
    assertEqual(ticks.at(-1), max);
  }
});

test('niceRange covers the values, also below zero (debt)', () => {
  const range = niceRange(-3_200_000, 9_100_000);
  assert(range.min <= -3_200_000 && range.max >= 9_100_000, JSON.stringify(range));
  assert(range.ticks.includes(0), 'zero is one of the ticks');
  assertDeepEqual(niceRange(9_000_000, 11_000_000).ticks, [9_000_000, 9_500_000, 10_000_000, 10_500_000, 11_000_000], 'does not need to start at zero');
});

test('niceRange gives a flat line some room above and below', () => {
  const range = niceRange(5_000_000, 5_000_000);
  assert(range.min < 5_000_000 && range.max > 5_000_000, JSON.stringify(range));
});

test('categoryBars scales bars to the biggest category and links to its transactions', () => {
  const markup = String(
    categoryBars(
      [
        { category: 'housing', amount: 620_000, share: 0.8 },
        { category: 'groceries', amount: 155_000, share: 0.2 },
      ],
      { currency: 'NOK', month: '2026-10' },
    ),
  );
  assert(markup.includes('style="width: 100.0%"'), 'largest bar is full width');
  assert(markup.includes('style="width: 25.0%"'), 'other bars are relative to it');
  assert(markup.includes('href="#/transaksjoner?month=2026-10&amp;category=groceries"'), 'links to the filtered list');
});
