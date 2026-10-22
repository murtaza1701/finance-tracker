import { test, assertEqual } from './harness.js';
import { csvField, neutralizeFormula, transactionsToCSV } from '../src/csv.js';

test('csvField quotes commas, quotes and line breaks', () => {
  assertEqual(csvField('plain'), 'plain');
  assertEqual(csvField('a,b'), '"a,b"');
  assertEqual(csvField('say "hi"'), '"say ""hi"""');
  assertEqual(csvField('two\nlines'), '"two\nlines"');
  assertEqual(csvField(null), '');
});

test('neutralizeFormula stops spreadsheet formulas from running', () => {
  assertEqual(neutralizeFormula('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assertEqual(neutralizeFormula('@cmd'), "'@cmd");
  assertEqual(neutralizeFormula('Coffee'), 'Coffee');
});

test('transactionsToCSV writes a header and signed amounts', () => {
  const csv = transactionsToCSV(
    [
      { date: '2026-10-22', type: 'expense', category: 'groceries', note: 'Milk, bread', amount: 4550 },
      { date: '2026-10-20', type: 'income', category: 'salary', note: '=1+1', amount: 650000 },
    ],
    { currency: 'NOK', categoryName: (id) => ({ groceries: 'Groceries', salary: 'Salary' })[id] },
  );
  assertEqual(
    csv,
    'Date,Type,Category,Note,Amount,Currency\r\n' +
      '2026-10-22,expense,Groceries,"Milk, bread",-45.50,NOK\r\n' +
      "2026-10-20,income,Salary,'=1+1,6500.00,NOK\r\n",
  );
});
