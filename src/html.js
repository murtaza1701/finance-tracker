// Trygge HTML-maler.
// Sidene skrives som html`<p>${note}</p>`: hver ${verdi} blir "escapet" med mindre den selv
// er en html``-mal eller raw(), så tekst brukeren skriver (f.eks. et notat) aldri kan
// legge inn markup eller skript på siden.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

class SafeHtml {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

/** Merker tekst som trygg HTML. Bruk den bare for markup skrevet i denne koden (f.eks. ikoner). */
export function raw(text) {
  return new SafeHtml(String(text));
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

function toHtml(value) {
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}
