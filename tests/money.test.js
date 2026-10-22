import { test, assertEqual } from './harness.js';
import {
  formatAmountInput,
  formatCompact,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatQuantityInput,
  minorToDecimal,
  parseAmount,
  parseQuantity,
} from '../src/money.js';

// Intl bruker hardt mellomrom og ekte minustegn; sammenlign med vanlige tegn.
const plain = (text) => text.replace(/[  ]/g, ' ').replace(/−/g, '-');

test('parseAmount reads whole numbers as kroner', () => {
  assertEqual(parseAmount('450'), 45000);
  assertEqual(parseAmount('  12 000 '), 1200000);
});

test('parseAmount accepts both decimal comma and decimal point', () => {
  assertEqual(parseAmount('450,5'), 45050);
  assertEqual(parseAmount('450.50'), 45050);
  assertEqual(parseAmount('0,05'), 5);
});

test('parseAmount understands thousands separators in Norwegian and English style', () => {
  assertEqual(parseAmount('1 234,50'), 123450);
  assertEqual(parseAmount('1 234,50'), 123450);
  assertEqual(parseAmount('1,234.50'), 123450);
  assertEqual(parseAmount('1.234,50'), 123450);
  assertEqual(parseAmount('1,500'), 150000);
  assertEqual(parseAmount('12.000.000'), 1200000000);
});

test('parseAmount ignores currency symbols and the "199,-" price style', () => {
  assertEqual(parseAmount('kr 99'), 9900);
  assertEqual(parseAmount('99 kr'), 9900);
  assertEqual(parseAmount('199,-'), 19900);
  assertEqual(parseAmount('€12.50'), 1250);
});

test('parseAmount rejects text it cannot read', () => {
  for (const input of ['', 'abc', '-5', '1.2345', '1,234,56', '1..2', '0.125', '12a', null, undefined]) {
    assertEqual(parseAmount(input), NaN, `input ${JSON.stringify(input)}`);
  }
});

test('amounts in øre add up exactly (no 0.1 + 0.2 rounding errors)', () => {
  assertEqual(parseAmount('0.1') + parseAmount('0.2'), parseAmount('0.3'));
});

test('formatMoney uses Norwegian format and shows decimals only when needed', () => {
  assertEqual(plain(formatMoney(123450)), '1 234,50 kr');
  assertEqual(plain(formatMoney(45000)), '450 kr');
  assertEqual(plain(formatMoney(123450, 'NOK', { locale: 'en-US' })), 'kr 1,234.50');
  assertEqual(plain(formatMoney(999, 'EUR')), '9,99 €');
});

test('formatMoney can force a sign and round to whole kroner', () => {
  assertEqual(plain(formatMoney(45000, 'NOK', { sign: true })), '+450 kr');
  assertEqual(plain(formatMoney(-45000, 'NOK', { sign: true })), '-450 kr');
  assertEqual(plain(formatMoney(0, 'NOK', { sign: true })), '0 kr');
  assertEqual(plain(formatMoney(123450, 'NOK', { whole: true })), '1 235 kr');
});

test('rounding to whole kroner treats negative amounts the same way (bug found while testing)', () => {
  assertEqual(plain(formatMoney(-123450, 'NOK', { whole: true })), '-1 235 kr');
  assertEqual(plain(formatMoney(-123450, 'NOK', { whole: true, sign: true })), '-1 235 kr');
  assertEqual(plain(formatMoney(-123449, 'NOK', { whole: true })), '-1 234 kr');
});

test('formatCompact shortens axis labels', () => {
  assertEqual(formatCompact(1500000, { locale: 'en-US' }), '15K');
  assertEqual(formatCompact(0), '0');
});

test('formatPrice shows more decimals for cheap coins', () => {
  assertEqual(plain(formatPrice(766290.4)), '766 290 kr');
  assertEqual(plain(formatPrice(12.434)), '12,43 kr');
  assertEqual(plain(formatPrice(0.742961)), '0,7430 kr');
});

test('formatQuantity and formatPercent use Norwegian decimal commas', () => {
  assertEqual(formatQuantity(0.0213), '0,0213');
  assertEqual(formatQuantity(0.123456789), '0,12345679', 'at most 8 decimals');
  assertEqual(formatQuantity(51.6865696, { short: true }), '51,69', 'short: 2 decimals from 1 and up');
  assertEqual(formatQuantity(0.00873909, { short: true }), '0,008739', 'short: 4 significant digits below 1');
  assertEqual(plain(formatQuantity(12345.6, { short: true })), '12 346', 'short: no decimals from 1000');
  assertEqual(plain(formatPercent(0.126)), '12,6 %');
  assertEqual(plain(formatPercent(-0.05, { sign: true })), '-5 %');
});

test('minorToDecimal gives exact text with a decimal comma for exports', () => {
  assertEqual(minorToDecimal(-45050), '-450,50');
  assertEqual(minorToDecimal(5), '0,05');
  assertEqual(minorToDecimal(0), '0,00');
  assertEqual(minorToDecimal(123456789), '1234567,89');
});

test('formatAmountInput pre-fills the edit form in a format parseAmount reads back', () => {
  assertEqual(formatAmountInput(45050), '450,50');
  assertEqual(formatAmountInput(45050, { locale: 'en-US' }), '450.50');
  assertEqual(formatAmountInput(123400), '1234');
  for (const minor of [1, 99, 45050, 123400, 987654321]) {
    for (const locale of ['en-US', 'nb-NO', 'de-DE']) {
      assertEqual(parseAmount(formatAmountInput(minor, { locale })), minor, `${minor} in ${locale}`);
    }
  }
});

test('parseQuantity reads coin amounts with up to 8 decimals', () => {
  assertEqual(parseQuantity('0,0213'), 0.0213);
  assertEqual(parseQuantity('0.0213'), 0.0213);
  assertEqual(parseQuantity('1,5'), 1.5, 'the last separator is always the decimal point');
  assertEqual(parseQuantity('1 500'), 1500);
  assertEqual(parseQuantity('1.234,5'), 1234.5);
  assertEqual(parseQuantity('0.123456789'), 0.12345679);
  for (const input of ['', ',', 'abc', '-1', '1e5', null]) {
    assertEqual(parseQuantity(input), NaN, `input ${JSON.stringify(input)}`);
  }
});

test('formatQuantityInput gives text that parseQuantity reads back', () => {
  for (const quantity of [0.00012345, 0.5, 2, 1500.25]) {
    assertEqual(parseQuantity(formatQuantityInput(quantity)), quantity);
  }
});
