import { test, assertEqual } from './harness.js';
import { csvField, neutralizeFormula, transactionsToCSV } from '../src/csv.js';

test('csvField quotes separators, quotes and line breaks', () => {
  assertEqual(csvField('plain'), 'plain');
  assertEqual(csvField('a;b'), '"a;b"');
  assertEqual(csvField('Melk, brød'), 'Melk, brød', 'commas are fine, the separator is a semicolon');
  assertEqual(csvField('say "hi"'), '"say ""hi"""');
  assertEqual(csvField('two\nlines'), '"two\nlines"');
  assertEqual(csvField(null), '');
});

test('neutralizeFormula stops spreadsheet formulas from running', () => {
  assertEqual(neutralizeFormula('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assertEqual(neutralizeFormula('@cmd'), "'@cmd");
  assertEqual(neutralizeFormula('Kaffe'), 'Kaffe');
});

test('transactionsToCSV writes Norwegian headers, semicolons and decimal commas', () => {
  const csv = transactionsToCSV(
    [
      { date: '2026-10-22', type: 'expense', category: 'groceries', note: 'Melk; brød', amount: 4550 },
      { date: '2026-10-20', type: 'income', category: 'salary', note: '=1+1', amount: 650000 },
    ],
    { currency: 'NOK', categoryName: (id) => ({ groceries: 'Dagligvarer', salary: 'Lønn' })[id] },
  );
  assertEqual(
    csv,
    'Dato;Type;Kategori;Notat;Beløp;Valuta\r\n' +
      '2026-10-22;Utgift;Dagligvarer;"Melk; brød";-45,50;NOK\r\n' +
      "2026-10-20;Inntekt;Lønn;'=1+1;6500,00;NOK\r\n",
  );
});
