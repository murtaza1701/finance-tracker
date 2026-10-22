// Builds a CSV file (opens in Excel, Numbers and Google Sheets) from transactions.
import { minorToDecimal } from './money.js';

/** Quotes a value if it contains a comma, quote or line break (RFC 4180). */
export function csvField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Stops spreadsheet apps from running text such as "=HYPERLINK(...)" as a formula. */
export function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function transactionsToCSV(transactions, { currency, categoryName }) {
  const rows = [['Date', 'Type', 'Category', 'Note', 'Amount', 'Currency']];
  for (const t of transactions) {
    rows.push([
      t.date,
      t.type,
      neutralizeFormula(categoryName(t.category)),
      neutralizeFormula(t.note),
      minorToDecimal(t.type === 'expense' ? -t.amount : t.amount),
      currency,
    ]);
  }
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}
