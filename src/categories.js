// Built-in categories. The id is what gets saved; the name and icon are for display.

export const CATEGORIES = [
  { id: 'housing', type: 'expense', name: 'Housing', icon: '🏠' },
  { id: 'groceries', type: 'expense', name: 'Groceries', icon: '🛒' },
  { id: 'dining', type: 'expense', name: 'Eating out', icon: '🍕' },
  { id: 'transport', type: 'expense', name: 'Transport', icon: '🚌' },
  { id: 'bills', type: 'expense', name: 'Bills & phone', icon: '💡' },
  { id: 'subscriptions', type: 'expense', name: 'Subscriptions', icon: '📺' },
  { id: 'shopping', type: 'expense', name: 'Shopping', icon: '🛍️' },
  { id: 'health', type: 'expense', name: 'Health & fitness', icon: '💪' },
  { id: 'fun', type: 'expense', name: 'Fun & social', icon: '🎉' },
  { id: 'education', type: 'expense', name: 'Education', icon: '📚' },
  { id: 'travel', type: 'expense', name: 'Travel', icon: '✈️' },
  { id: 'other-expense', type: 'expense', name: 'Other', icon: '📦' },
  { id: 'student-support', type: 'income', name: 'Student loan & grant', icon: '🎓' },
  { id: 'salary', type: 'income', name: 'Salary', icon: '💼' },
  { id: 'gifts', type: 'income', name: 'Gifts', icon: '🎁' },
  { id: 'refunds', type: 'income', name: 'Refunds', icon: '↩️' },
  { id: 'other-income', type: 'income', name: 'Other income', icon: '💰' },
];

const byId = new Map(CATEGORIES.map((category) => [category.id, category]));
const UNKNOWN = { id: 'unknown', type: 'expense', name: 'Unknown', icon: '❔' };

/** The category with this id, or null if there is none. */
export function findCategory(id) {
  return byId.get(id) ?? null;
}

/** Like findCategory, but falls back to an "Unknown" category so the UI can always show something. */
export function getCategory(id) {
  return byId.get(id) ?? UNKNOWN;
}

export function categoriesFor(type) {
  return CATEGORIES.filter((category) => category.type === type);
}
