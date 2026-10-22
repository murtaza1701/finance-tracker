import { test, assertEqual } from './harness.js';
import { formatAmountInput, formatCompact, formatMoney, minorToDecimal, parseAmount } from '../src/money.js';

// Intl uses non-breaking spaces in some locales; compare with normal spaces.
const plain = (text) => text.replace(/[  ]/g, ' ');

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

test('formatMoney shows decimals only when needed', () => {
  assertEqual(plain(formatMoney(123450, 'NOK', { locale: 'en-US' })), 'kr 1,234.50');
  assertEqual(plain(formatMoney(45000, 'NOK', { locale: 'en-US' })), 'kr 450');
  assertEqual(plain(formatMoney(123450, 'NOK', { locale: 'nb-NO' })), '1 234,50 kr');
  assertEqual(plain(formatMoney(999, 'EUR', { locale: 'en-US' })), '€9.99');
});

test('formatMoney can force a sign and round to whole kroner', () => {
  assertEqual(plain(formatMoney(45000, 'NOK', { locale: 'en-US', sign: true })), '+kr 450');
  assertEqual(plain(formatMoney(-45000, 'NOK', { locale: 'en-US', sign: true })), '-kr 450');
  assertEqual(plain(formatMoney(0, 'NOK', { locale: 'en-US', sign: true })), 'kr 0');
  assertEqual(plain(formatMoney(123450, 'NOK', { locale: 'en-US', whole: true })), 'kr 1,235');
});

test('rounding to whole kroner treats negative amounts the same way (bug found while testing)', () => {
  assertEqual(plain(formatMoney(-123450, 'NOK', { locale: 'en-US', whole: true })), '-kr 1,235');
  assertEqual(plain(formatMoney(-123450, 'NOK', { locale: 'en-US', whole: true, sign: true })), '-kr 1,235');
  assertEqual(plain(formatMoney(-123449, 'NOK', { locale: 'en-US', whole: true })), '-kr 1,234');
});

test('formatCompact shortens axis labels', () => {
  assertEqual(formatCompact(1500000, { locale: 'en-US' }), '15K');
  assertEqual(formatCompact(0, { locale: 'en-US' }), '0');
});

test('minorToDecimal gives exact text for exports', () => {
  assertEqual(minorToDecimal(-45050), '-450.50');
  assertEqual(minorToDecimal(5), '0.05');
  assertEqual(minorToDecimal(0), '0.00');
  assertEqual(minorToDecimal(123456789), '1234567.89');
});

test('formatAmountInput pre-fills the edit form in a format parseAmount reads back', () => {
  assertEqual(formatAmountInput(45050, { locale: 'en-US' }), '450.50');
  assertEqual(formatAmountInput(45050, { locale: 'nb-NO' }), '450,50');
  assertEqual(formatAmountInput(123400, { locale: 'en-US' }), '1234');
  for (const minor of [1, 99, 45050, 123400, 987654321]) {
    for (const locale of ['en-US', 'nb-NO', 'de-DE']) {
      assertEqual(parseAmount(formatAmountInput(minor, { locale })), minor, `${minor} in ${locale}`);
    }
  }
});
