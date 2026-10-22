// Faste kategorier for forbruk. Id-en er det som lagres; navn og ikon er bare for visning.

export const CATEGORIES = [
  { id: 'housing', type: 'expense', name: 'Bolig', icon: '🏠' },
  { id: 'groceries', type: 'expense', name: 'Dagligvarer', icon: '🛒' },
  { id: 'dining', type: 'expense', name: 'Spise ute', icon: '🍕' },
  { id: 'transport', type: 'expense', name: 'Transport', icon: '🚌' },
  { id: 'bills', type: 'expense', name: 'Regninger og mobil', icon: '💡' },
  { id: 'subscriptions', type: 'expense', name: 'Abonnementer', icon: '📺' },
  { id: 'shopping', type: 'expense', name: 'Shopping', icon: '🛍️' },
  { id: 'health', type: 'expense', name: 'Helse og trening', icon: '💪' },
  { id: 'fun', type: 'expense', name: 'Fritid og sosialt', icon: '🎉' },
  { id: 'education', type: 'expense', name: 'Studier', icon: '📚' },
  { id: 'travel', type: 'expense', name: 'Reise', icon: '✈️' },
  { id: 'other-expense', type: 'expense', name: 'Annet', icon: '📦' },
  { id: 'student-support', type: 'income', name: 'Studielån og stipend', icon: '🎓' },
  { id: 'salary', type: 'income', name: 'Lønn', icon: '💼' },
  { id: 'gifts', type: 'income', name: 'Gaver', icon: '🎁' },
  { id: 'refunds', type: 'income', name: 'Refusjoner', icon: '↩️' },
  { id: 'other-income', type: 'income', name: 'Andre inntekter', icon: '💰' },
];

const byId = new Map(CATEGORIES.map((category) => [category.id, category]));
const UNKNOWN = { id: 'unknown', type: 'expense', name: 'Ukjent', icon: '❔' };

/** Kategorien med denne id-en, eller null. */
export function findCategory(id) {
  return byId.get(id) ?? null;
}

/** Som findCategory, men gir "Ukjent" i stedet for null, så noe alltid kan vises. */
export function getCategory(id) {
  return byId.get(id) ?? UNKNOWN;
}

export function categoriesFor(type) {
  return CATEGORIES.filter((category) => category.type === type);
}
