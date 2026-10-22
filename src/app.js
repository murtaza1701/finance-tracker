// Pengeflyt – the app's entry point.
// Connects the data store to the pages: routing (#/overview etc.), rendering and user actions.
import { findCategory, getCategory } from './categories.js';
import { transactionsToCSV } from './csv.js';
import { currentMonth, isValidMonth, monthLabel, monthOf, shiftMonth, todayISO } from './dates.js';
import { generateDemoData } from './demo.js';
import { createBudgetDialog, createTransactionDialog } from './dialogs.js';
import { byNewest, filterTransactions, suggestBudgets } from './finance.js';
import { icon } from './icons.js';
import { createStore, sanitizeState } from './store.js';
import { confirmDialog, downloadFile, showToast } from './ui.js';
import { mountDashboard, renderDashboard } from './views/dashboard.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings } from './views/settings.js';
import { renderTransactions } from './views/transactions.js';

const VIEWS = {
  dashboard: { title: 'Overview', render: renderDashboard, mount: mountDashboard },
  transactions: { title: 'Transactions', render: renderTransactions },
  budgets: { title: 'Budgets', render: renderBudgets },
  settings: { title: 'Settings', render: renderSettings },
};

const defaultFilters = (month) => ({ month, type: 'all', category: 'all', query: '' });
const categoryName = (id) => getCategory(id).name;

// What you're looking at right now. This is not saved; a reload starts at this month's overview.
const ui = {
  route: 'dashboard',
  month: currentMonth(),
  filters: defaultFilters(currentMonth()),
  chartMode: 'chart',
};

const storage = openStorage();
const store = createStore(storage, {
  onSaveError: () => showToast("Couldn't save – your browser's storage may be full or blocked."),
});
const main = document.getElementById('view');
const transactionDialog = createTransactionDialog({ store, onDone: afterTransactionSaved });
const budgetDialog = createBudgetDialog({ store, onDone: (message) => showToast(message) });
let unmountView = null;
let lastUndo = null;

function openStorage() {
  try {
    const key = 'pengeflyt:test';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    return null; // e.g. blocked by privacy settings
  }
}

// ---------- Rendering ----------

function render({ focusMain = false } = {}) {
  const view = VIEWS[ui.route];
  const context = { state: store.getState(), ui, today: todayISO(), thisMonth: currentMonth() };
  const focused = rememberFocus();
  unmountView?.();
  main.innerHTML = String(view.render(context));
  unmountView = view.mount?.(main, context) ?? null;
  restoreFocus(focused);
  if (focusMain) main.focus({ preventScroll: true });

  document.title = `${view.title} · Pengeflyt`;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === ui.route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

// The page is re-rendered after every change, so keep the cursor where it was
// (for example in the search box while typing).
function rememberFocus() {
  const element = document.activeElement;
  if (!element?.id || !main.contains(element)) return null;
  return { id: element.id, start: element.selectionStart, end: element.selectionEnd };
}

function restoreFocus(saved) {
  const element = saved && document.getElementById(saved.id);
  if (!element) return;
  element.focus({ preventScroll: true });
  if (typeof saved.start === 'number') {
    try {
      element.setSelectionRange(saved.start, saved.end);
    } catch {
      // not a text field
    }
  }
}

function applyTheme({ theme }) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// ---------- Routing ----------

function readRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const route = Object.hasOwn(VIEWS, path) ? path : 'dashboard';
  const params = new URLSearchParams(query);

  // Links such as #/transactions?month=2026-10&category=groceries set the list filters.
  if (route === 'transactions' && query) {
    const month = params.get('month');
    const category = params.get('category');
    const type = params.get('type');
    ui.filters = defaultFilters(month === 'all' || isValidMonth(month) ? month : ui.month);
    if (findCategory(category)) ui.filters.category = category;
    if (type === 'income' || type === 'expense') ui.filters.type = type;
    if (isValidMonth(month)) ui.month = month;
    history.replaceState(null, '', '#/transactions');
  }

  const changed = route !== ui.route;
  ui.route = route;
  render({ focusMain: changed });
  if (changed) window.scrollTo(0, 0);
}

function setMonth(month) {
  ui.month = month;
  ui.filters = { ...ui.filters, month };
  render();
}

// ---------- Actions (buttons with data-action="…") ----------

const ACTIONS = {
  'prev-month': () => setMonth(shiftMonth(ui.month, -1)),
  'next-month': () => setMonth(shiftMonth(ui.month, 1)),
  'this-month': () => setMonth(currentMonth()),
  'add-transaction': (button) => transactionDialog.open({ type: button.dataset.type }),
  'edit-transaction': (button) => transactionDialog.open({ id: button.dataset.id }),
  'edit-budget': (button) => budgetDialog.open(button.dataset.category, ui.month),
  'suggest-budgets': suggestMissingBudgets,
  'chart-mode': (button) => {
    ui.chartMode = button.dataset.mode;
    render();
  },
  'clear-filters': () => {
    ui.filters = defaultFilters(ui.filters.month);
    render();
  },
  'export-csv': exportCsv,
  'export-backup': exportBackup,
  'import-backup': () => document.getElementById('import-file').click(),
  'load-demo': loadDemoData,
  'clear-data': clearAllData,
};

function toastWithUndo(message, undo) {
  lastUndo = undo;
  showToast(message, { actionLabel: 'Undo', onAction: runUndo });
}

function runUndo() {
  const undo = lastUndo;
  lastUndo = null;
  undo?.();
}

function afterTransactionSaved(kind, transaction) {
  if (kind === 'deleted') {
    toastWithUndo('Transaction deleted.', () => store.restoreTransaction(transaction));
    return;
  }
  const month = monthOf(transaction.date);
  const message = kind === 'added' ? 'Transaction added' : 'Changes saved';
  const visible = month === ui.month || (ui.route === 'transactions' && ui.filters.month === 'all');
  if (visible) showToast(`${message}.`);
  else showToast(`${message} to ${monthLabel(month)}.`, { actionLabel: 'Show', onAction: () => setMonth(month) });
}

function suggestMissingBudgets() {
  const { transactions, budgets } = store.getState();
  const suggestions = suggestBudgets(transactions, ui.month);
  const missing = Object.entries(suggestions).filter(([category]) => !Object.hasOwn(budgets, category));
  if (missing.length === 0) {
    showToast(
      Object.keys(suggestions).length === 0
        ? 'Not enough history yet – suggestions are based on the 3 months before this one.'
        : 'Every category you spend money on already has a budget.',
    );
    return;
  }
  store.setBudgets({ ...budgets, ...Object.fromEntries(missing) });
  toastWithUndo(`Added ${missing.length} budget${missing.length === 1 ? '' : 's'} based on your last 3 months.`, () => store.setBudgets(budgets));
}

function exportCsv() {
  const { transactions, settings } = store.getState();
  const list = ui.route === 'transactions' ? filterTransactions(transactions, ui.filters, categoryName) : [...transactions].sort(byNewest);
  if (list.length === 0) {
    showToast('There is nothing to export.');
    return;
  }
  const csv = transactionsToCSV(list, { currency: settings.currency, categoryName });
  downloadFile(`pengeflyt-transactions-${todayISO()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8'); // BOM so Excel reads æøå
  showToast(`Exported ${list.length} transaction${list.length === 1 ? '' : 's'}.`);
}

function exportBackup() {
  const backup = { app: 'pengeflyt', exportedAt: new Date().toISOString(), ...store.getState() };
  downloadFile(`pengeflyt-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast('Backup downloaded.');
}

async function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = ''; // so choosing the same file again still triggers "change"
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showToast("That file isn't a Pengeflyt backup.");
    return;
  }
  const { state: incoming, skipped } = sanitizeState(data);
  const count = incoming.transactions.length;
  const budgetCount = Object.keys(incoming.budgets).length;
  if (count === 0 && budgetCount === 0) {
    showToast('No transactions or budgets found in that file.');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Restore this backup?',
    message: `Your current data will be replaced with ${count} transactions and ${budgetCount} budgets from "${file.name}".`,
    confirmLabel: 'Restore',
  });
  if (!confirmed) return;

  const before = store.getState();
  store.replaceAll(incoming);
  const note = skipped > 0 ? ` (${skipped} invalid rows skipped)` : '';
  toastWithUndo(`Backup restored${note}.`, () => store.replaceAll(before));
}

async function loadDemoData() {
  const before = store.getState();
  const hasData = before.transactions.length > 0 || Object.keys(before.budgets).length > 0;
  if (hasData) {
    const confirmed = await confirmDialog({
      title: 'Load demo data?',
      message: 'Your current transactions and budgets will be replaced with six months of sample data.',
      confirmLabel: 'Load demo data',
    });
    if (!confirmed) return;
  }
  ui.month = currentMonth();
  ui.filters = defaultFilters(ui.month);
  store.replaceAll({ ...generateDemoData(), settings: before.settings });
  if (ui.route === 'settings') location.hash = '#/dashboard';
  if (hasData) toastWithUndo('Demo data loaded.', () => store.replaceAll(before));
  else showToast('Demo data loaded – have a look around!');
}

async function clearAllData() {
  const confirmed = await confirmDialog({
    title: 'Delete all data?',
    message: 'Every transaction and budget will be removed from this browser. Download a backup first if you want to keep them.',
    confirmLabel: 'Delete everything',
    danger: true,
  });
  if (!confirmed) return;
  const before = store.getState();
  store.clearAll();
  toastWithUndo('All data deleted.', () => store.replaceAll(before));
}

// ---------- Events ----------

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  const action = target && !target.disabled && ACTIONS[target.dataset.action];
  if (!action) return;
  event.preventDefault();
  action(target);
});

// Filter controls on the transactions page and the settings fields
main.addEventListener('input', (event) => {
  const field = event.target;
  if (field.dataset.filter) {
    const key = field.dataset.filter;
    ui.filters = { ...ui.filters, [key]: field.value };
    if (key === 'month' && field.value !== 'all') ui.month = field.value;
    if (key === 'type' && ui.filters.category !== 'all' && field.value !== 'all' && getCategory(ui.filters.category).type !== field.value) {
      ui.filters.category = 'all';
    }
    render();
  } else if (field.dataset.setting) {
    store.updateSettings({ [field.dataset.setting]: field.value });
  }
});

document.addEventListener('keydown', (event) => {
  const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (typing || document.querySelector('dialog[open]') || event.altKey) return;
  if (event.key === 'n' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    transactionDialog.open();
  } else if (event.key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey && lastUndo) {
    event.preventDefault();
    runUndo();
  }
});

document.getElementById('import-file').addEventListener('change', importBackup);
window.addEventListener('hashchange', readRoute);
store.subscribe((state) => {
  applyTheme(state.settings);
  render();
});

// ---------- Start ----------

for (const element of document.querySelectorAll('[data-icon]')) {
  element.innerHTML = String(icon(element.dataset.icon));
}
applyTheme(store.getState().settings);
readRoute();
if (!storage) {
  showToast("Your browser is blocking storage, so changes won't be kept after you close this tab.", { duration: 12000 });
}
