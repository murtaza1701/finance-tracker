// Lager en CSV-fil av transaksjoner. Semikolon og desimalkomma, slik norsk Excel forventer
// (Numbers og Google Sheets leser det også).
import { minorToDecimal } from './money.js';

const SEPARATOR = ';';

/** Setter verdien i anførselstegn hvis den inneholder semikolon, anførselstegn eller linjeskift. */
export function csvField(value) {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Hindrer regneark i å kjøre tekst som "=HYPERLINK(...)" som en formel. */
export function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function transactionsToCSV(transactions, { currency, categoryName }) {
  const rows = [['Dato', 'Type', 'Kategori', 'Notat', 'Beløp', 'Valuta']];
  for (const t of transactions) {
    rows.push([
      t.date,
      t.type === 'income' ? 'Inntekt' : 'Utgift',
      neutralizeFormula(categoryName(t.category)),
      neutralizeFormula(t.note),
      minorToDecimal(t.type === 'expense' ? -t.amount : t.amount),
      currency,
    ]);
  }
  return rows.map((row) => row.map(csvField).join(SEPARATOR)).join('\r\n') + '\r\n';
}
