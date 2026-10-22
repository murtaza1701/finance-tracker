// Money helpers.
// Amounts are stored as whole øre/cents (integers): 1 234,50 kr is stored as 123450.
// Integers add up exactly, decimals don't (0.1 + 0.2 = 0.30000000000000004).

export const CURRENCIES = ['NOK', 'SEK', 'DKK', 'EUR', 'USD', 'GBP'];

const formatters = new Map();

function formatter(locale, options) {
  const key = JSON.stringify([locale ?? null, options]);
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, options));
  return formatters.get(key);
}

/**
 * 123450 → "kr 1,234.50" (English) or "1 234,50 kr" (Norwegian), following the
 * browser's number format. Whole amounts drop the decimals.
 * Options: sign (always show + or −), whole (round to whole kroner).
 */
export function formatMoney(minor, currency = 'NOK', { locale, sign = false, whole = false } = {}) {
  // Round halves away from zero, so -1 234,50 and 1 234,50 both become 1 235 (Math.round(-1234.5) is -1234).
  const value = whole ? Math.sign(minor) * Math.round(Math.abs(minor) / 100) : minor / 100;
  const digits = whole || minor % 100 === 0 ? 0 : 2;
  return formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(value);
}

/** Short axis labels: 1500000 → "15K". */
export function formatCompact(minor, { locale } = {}) {
  return formatter(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}

/** Just the currency symbol, e.g. "kr", "€" or "$". */
export function currencySymbol(currency, { locale } = {}) {
  const parts = formatter(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

/** Exact decimal text for exports: -45050 → "-450.50". */
export function minorToDecimal(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Text to pre-fill an amount field with when editing: 45050 → "450.50" or "450,50". */
export function formatAmountInput(minor, { locale } = {}) {
  const digits = minor % 100 === 0 ? 0 : 2;
  return formatter(locale, { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 100);
}

const THOUSANDS = /^[1-9]\d{0,2}([.,]\d{3})+$/; // "1,234" or "12.345.678"

/**
 * Turns what the user typed into øre. Accepts Norwegian and English styles:
 * "450", "450,50", "450.50", "1 234,50", "1,234.50", "1.234,50", "kr 99", "199,-".
 * A separator followed by exactly three digits is read as a thousands separator,
 * because money never has more than two decimals. Returns NaN if it can't be read.
 */
export function parseAmount(input) {
  const text = String(input ?? '')
    .replace(/[\s  ']/g, '')
    .replace(/^(kr|nok|sek|dkk|eur|usd|gbp|[$€£])/i, '')
    .replace(/(kr|nok|sek|dkk|eur|usd|gbp|[$€£]|,-|\.-)$/i, '');
  if (!/^\d[\d.,]*$/.test(text)) return NaN;

  let whole = text;
  let fraction = '';
  const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  if (lastSeparator !== -1) {
    const tail = text.slice(lastSeparator + 1);
    if (tail.length === 3) {
      // "1,500" or "12.000.000": every separator groups thousands
      if (!THOUSANDS.test(text) || new Set(text.match(/[.,]/g)).size > 1) return NaN;
      whole = text.replace(/[.,]/g, '');
    } else if (tail.length <= 2) {
      // "450,5" or "1 234.50": the last separator is the decimal point
      whole = text.slice(0, lastSeparator);
      fraction = tail;
      if (whole.includes(text[lastSeparator])) return NaN; // "1,234,56"
      if (/[.,]/.test(whole)) {
        if (!THOUSANDS.test(whole)) return NaN;
        whole = whole.replace(/[.,]/g, '');
      }
    } else {
      return NaN; // "1.2345"
    }
  }
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : NaN;
}
