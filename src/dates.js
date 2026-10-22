// Datoer.
// Datoer lagres som "ÅÅÅÅ-MM-DD" og måneder som "ÅÅÅÅ-MM", alltid i lokal tid.
// (toISOString() regner om til UTC, og da havner noe du registrerer kl. 23.30 på feil dag.)

const UI_LOCALE = 'nb-NO';

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(parseISODate(value)) === value; // avviser f.eks. 2026-02-30
}

export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Antall dager fra `from` til `to` (begge "ÅÅÅÅ-MM-DD"). */
export function daysBetween(from, to) {
  return Math.round((parseISODate(to) - parseISODate(from)) / 86_400_000);
}

export function monthOf(iso) {
  return iso.slice(0, 7);
}

export function currentMonth(now = new Date()) {
  return monthOf(toISODate(now));
}

export function shiftMonth(month, delta) {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  const newYear = Math.floor(index / 12);
  const newMonth = index - newYear * 12 + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

export function daysInMonth(month) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
}

export function dayOfMonth(iso) {
  return Number(iso.slice(8, 10));
}

/** "Oktober 2026", eller bare "okt." med { short: true }. */
export function monthLabel(month, { short = false } = {}) {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1, 1);
  if (short) return new Intl.DateTimeFormat(UI_LOCALE, { month: 'short' }).format(date);
  return capitalize(new Intl.DateTimeFormat(UI_LOCALE, { month: 'long', year: 'numeric' }).format(date));
}

/** "I dag", "I går" eller f.eks. "Tir. 20. okt." (med årstall hvis det ikke er i år). */
export function dayLabel(iso, today = todayISO()) {
  if (iso === today) return 'I dag';
  if (iso === addDays(today, -1)) return 'I går';
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (iso.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
  return capitalize(new Intl.DateTimeFormat(UI_LOCALE, options).format(parseISODate(iso)));
}

/** "22. okt. 2026", eller "22. okt." med { year: false }. */
export function dateLabel(iso, { year = true } = {}) {
  const options = { day: 'numeric', month: 'short' };
  if (year) options.year = 'numeric';
  return new Intl.DateTimeFormat(UI_LOCALE, options).format(parseISODate(iso));
}

/** Klokkeslett: "13:05". */
export function timeLabel(date) {
  return new Intl.DateTimeFormat(UI_LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
}
