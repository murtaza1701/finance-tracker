// The app's data – transactions, monthly budgets and settings – and every way to change it.
// Each change is validated, saved to localStorage (so it stays in this browser only)
// and announced to subscribers so the page can re-render.
import { findCategory } from './categories.js';
import { isValidISODate } from './dates.js';
import { CURRENCIES } from './money.js';

export const STORAGE_KEY = 'pengeflyt:v1';
export const MAX_AMOUNT = 10_000_000_000; // 100 million kr, in øre
export const MAX_NOTE_LENGTH = 120;
export const THEMES = ['system', 'light', 'dark'];

export function emptyState() {
  return { version: 1, transactions: [], budgets: {}, settings: { currency: 'NOK', theme: 'system' } };
}

/** Returns an error message per invalid field – an empty object means the transaction is valid. */
export function validateTransaction(tx) {
  const errors = {};
  if (tx.type !== 'income' && tx.type !== 'expense') errors.type = 'Choose income or expense.';
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) errors.amount = 'Enter an amount greater than 0.';
  else if (tx.amount > MAX_AMOUNT) errors.amount = 'That amount is too large.';
  if (findCategory(tx.category)?.type !== tx.type) errors.category = 'Choose a category.';
  if (!isValidISODate(tx.date)) errors.date = 'Choose a valid date.';
  if (typeof tx.note !== 'string' || tx.note.length > MAX_NOTE_LENGTH) {
    errors.note = `Keep the note under ${MAX_NOTE_LENGTH} characters.`;
  }
  return errors;
}

export function isValidBudget(category, limit) {
  return findCategory(category)?.type === 'expense' && Number.isInteger(limit) && limit > 0 && limit <= MAX_AMOUNT;
}

function createId() {
  // randomUUID only exists on https:// and localhost, so fall back to something random enough
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toTransaction(input, overrides = {}) {
  return {
    id: typeof input.id === 'string' && input.id ? input.id : createId(),
    type: input.type,
    amount: input.amount,
    category: input.category,
    date: input.date,
    note: typeof input.note === 'string' ? input.note.trim() : '',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Turns anything – saved data or an imported backup file – into a valid state.
 * Invalid transactions are dropped (and counted) instead of breaking the app.
 */
export function sanitizeState(raw) {
  const state = emptyState();
  let skipped = 0;
  if (!raw || typeof raw !== 'object') return { state, skipped };

  const ids = new Set();
  for (const item of Array.isArray(raw.transactions) ? raw.transactions : []) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const tx = toTransaction(item);
    tx.note = tx.note.slice(0, MAX_NOTE_LENGTH);
    if (ids.has(tx.id)) tx.id = createId();
    if (Object.keys(validateTransaction(tx)).length > 0) {
      skipped++;
      continue;
    }
    ids.add(tx.id);
    state.transactions.push(tx);
  }

  if (raw.budgets && typeof raw.budgets === 'object') {
    for (const [category, limit] of Object.entries(raw.budgets)) {
      if (isValidBudget(category, limit)) state.budgets[category] = limit;
    }
  }

  const settings = raw.settings ?? {};
  if (CURRENCIES.includes(settings.currency)) state.settings.currency = settings.currency;
  if (THEMES.includes(settings.theme)) state.settings.theme = settings.theme;
  return { state, skipped };
}

/**
 * Creates the store. `storage` is window.localStorage in the app and a fake in the
 * tests; it may be null when the browser blocks storage (data then lives in memory only).
 */
export function createStore(storage, { onSaveError = () => {} } = {}) {
  let state = load();
  const listeners = new Set();

  function load() {
    let text = null;
    try {
      text = storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      // storage is blocked – start empty
    }
    if (!text) return emptyState();
    try {
      return sanitizeState(JSON.parse(text)).state;
    } catch {
      // Unreadable data: keep a copy under another key instead of overwriting it later.
      try {
        storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, text);
      } catch {
        // nothing more we can do
      }
      return emptyState();
    }
  }

  function commit(next) {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      onSaveError(error); // e.g. storage full
    }
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    addTransaction(input) {
      const tx = toTransaction(input, { id: createId(), createdAt: new Date().toISOString() });
      const errors = validateTransaction(tx);
      if (Object.keys(errors).length > 0) return { ok: false, errors };
      commit({ ...state, transactions: [...state.transactions, tx] });
      return { ok: true, transaction: tx };
    },

    updateTransaction(id, changes) {
      const existing = state.transactions.find((t) => t.id === id);
      if (!existing) return { ok: false, errors: { id: 'This transaction no longer exists.' } };
      const tx = toTransaction({ ...existing, ...changes }, { id, createdAt: existing.createdAt });
      const errors = validateTransaction(tx);
      if (Object.keys(errors).length > 0) return { ok: false, errors };
      commit({ ...state, transactions: state.transactions.map((t) => (t.id === id ? tx : t)) });
      return { ok: true, transaction: tx };
    },

    /** Deletes a transaction and returns it, so it can be restored with "Undo". */
    removeTransaction(id) {
      const tx = state.transactions.find((t) => t.id === id);
      if (!tx) return null;
      commit({ ...state, transactions: state.transactions.filter((t) => t.id !== id) });
      return tx;
    },

    restoreTransaction(tx) {
      if (state.transactions.some((t) => t.id === tx.id)) return;
      commit({ ...state, transactions: [...state.transactions, tx] });
    },

    setBudget(category, limit) {
      if (!isValidBudget(category, limit)) return false;
      commit({ ...state, budgets: { ...state.budgets, [category]: limit } });
      return true;
    },

    removeBudget(category) {
      const budgets = { ...state.budgets };
      delete budgets[category];
      commit({ ...state, budgets });
    },

    /** Replaces all budgets at once (used by budget suggestions and their "Undo"). */
    setBudgets(budgets) {
      const clean = {};
      for (const [category, limit] of Object.entries(budgets)) {
        if (isValidBudget(category, limit)) clean[category] = limit;
      }
      commit({ ...state, budgets: clean });
    },

    updateSettings(changes) {
      const settings = { ...state.settings };
      if (CURRENCIES.includes(changes.currency)) settings.currency = changes.currency;
      if (THEMES.includes(changes.theme)) settings.theme = changes.theme;
      commit({ ...state, settings });
    },

    /** Replaces everything, e.g. when loading demo data or restoring a backup. */
    replaceAll(data) {
      const { state: next, skipped } = sanitizeState(data);
      commit(next);
      return { skipped, count: next.transactions.length };
    },

    /** Deletes all transactions and budgets but keeps the settings. */
    clearAll() {
      commit({ ...emptyState(), settings: state.settings });
    },
  };
}
