// Penger og tall.
// Beløp lagres som hele øre (heltall): 1 234,50 kr lagres som 123450.
// Heltall summeres helt nøyaktig, desimaltall gjør ikke det (0.1 + 0.2 = 0.30000000000000004).

export const CURRENCIES = ['NOK', 'SEK', 'DKK', 'EUR', 'USD', 'GBP'];
export const LOCALE = 'nb-NO'; // norsk tallformat: 1 234,50 kr

const formatters = new Map();

function formatter(locale, options) {
  const key = JSON.stringify([locale, options]);
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, options));
  return formatters.get(key);
}

/**
 * 123450 → "1 234,50 kr". Hele beløp vises uten desimaler.
 * Valg: sign (vis alltid + eller −), whole (avrund til hele kroner), decimals (alltid to desimaler, som i en nettbank).
 */
export function formatMoney(minor, currency = 'NOK', { locale = LOCALE, sign = false, whole = false, decimals = false } = {}) {
  // Rund halve kroner bort fra null, så både -1 234,50 og 1 234,50 blir 1 235 (Math.round(-1234.5) er -1234).
  const value = whole ? Math.sign(minor) * Math.round(Math.abs(minor) / 100) : minor / 100;
  const digits = decimals ? 2 : whole || minor % 100 === 0 ? 0 : 2;
  return formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(value);
}

/** Korte akseetiketter: 1500000 → "15k". */
export function formatCompact(minor, { locale = LOCALE } = {}) {
  return formatter(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}

/** Kurs for én mynt (vanlig tall, ikke øre): 766290 → "766 290 kr", 0.743 → "0,7430 kr". */
export function formatPrice(price, currency = 'NOK', { locale = LOCALE } = {}) {
  const digits = price >= 100 ? 0 : price >= 1 ? 2 : 4;
  return formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(price);
}

/**
 * Antall mynter med inntil 8 desimaler: 0.0213 → "0,0213".
 * Med short (i oversikter): 51.6865696 → "51,69" og 0.00873909 → "0,008739".
 */
export function formatQuantity(quantity, { locale = LOCALE, short = false } = {}) {
  if (!short) return formatter(locale, { maximumFractionDigits: 8 }).format(quantity);
  if (quantity >= 1) return formatter(locale, { maximumFractionDigits: quantity >= 1000 ? 0 : 2 }).format(quantity);
  return formatter(locale, { maximumSignificantDigits: 4 }).format(quantity);
}

/** 0.126 → "12,6 %" (med fortegn hvis sign er satt). */
export function formatPercent(ratio, { locale = LOCALE, sign = false } = {}) {
  return formatter(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(ratio);
}

/** Bare valutasymbolet, f.eks. "kr" eller "€". */
export function currencySymbol(currency, { locale = LOCALE } = {}) {
  const parts = formatter(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

/** Nøyaktig tekst for eksport, med desimalkomma: -45050 → "-450,50". */
export function minorToDecimal(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Tekst å fylle et beløpsfelt med ved redigering: 45050 → "450,50". */
export function formatAmountInput(minor, { locale = LOCALE } = {}) {
  const digits = minor % 100 === 0 ? 0 : 2;
  return formatter(locale, { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 100);
}

/** Tekst å fylle et antallsfelt med: 0.0213 → "0,0213". */
export function formatQuantityInput(quantity, { locale = LOCALE } = {}) {
  return formatter(locale, { useGrouping: false, maximumFractionDigits: 8 }).format(quantity);
}

const THOUSANDS = /^[1-9]\d{0,2}([.,]\d{3})+$/; // "1,234" eller "12.345.678"

function cleanNumberText(input) {
  return String(input ?? '')
    .replace(/[\s  ']/g, '')
    .replace(/^(kr|nok|sek|dkk|eur|usd|gbp|[$€£])/i, '')
    .replace(/(kr|nok|sek|dkk|eur|usd|gbp|[$€£]|,-|\.-)$/i, '');
}

/**
 * Gjør om det brukeren skrev til øre. Godtar både norsk og engelsk skrivemåte:
 * "450", "450,50", "450.50", "1 234,50", "1,234.50", "1.234,50", "kr 99", "199,-".
 * Et skilletegn fulgt av nøyaktig tre sifre leses som tusenskille, fordi kronebeløp
 * aldri har mer enn to desimaler. Gir NaN hvis teksten ikke kan leses.
 */
export function parseAmount(input) {
  const text = cleanNumberText(input);
  if (!/^\d[\d.,]*$/.test(text)) return NaN;

  let whole = text;
  let fraction = '';
  const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  if (lastSeparator !== -1) {
    const tail = text.slice(lastSeparator + 1);
    if (tail.length === 3) {
      // "1,500" eller "12.000.000": alle skilletegn er tusenskille
      if (!THOUSANDS.test(text) || new Set(text.match(/[.,]/g)).size > 1) return NaN;
      whole = text.replace(/[.,]/g, '');
    } else if (tail.length <= 2) {
      // "450,5" eller "1 234.50": det siste skilletegnet er desimaltegnet
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

/**
 * Gjør om et antall mynter til et tall med inntil 8 desimaler: "0,0213", "0.0213", "1 500", "2".
 * Her er det siste skilletegnet alltid desimaltegnet ("1,5" og "1.5" er halvannen).
 */
export function parseQuantity(input) {
  const text = String(input ?? '').replace(/[\s  ]/g, '');
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return NaN;
  const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const normalized =
    lastSeparator === -1 ? text : `${text.slice(0, lastSeparator).replace(/[.,]/g, '')}.${text.slice(lastSeparator + 1)}`;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 1e8) / 1e8 : NaN;
}
