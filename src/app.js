// Pengeflyt – startpunktet for appen.
// Kobler dataene til sidene: ruting (#/oversikt, #/bank …), tegning av sidene, kurser og alle knappene.
import { COINS, INSTITUTIONS, SECTIONS, accountKind, accountsIn, movementLabel, sectionOf } from './accounts.js';
import { findCategory, getCategory } from './categories.js';
import { transactionsToCSV } from './csv.js';
import { currentMonth, isValidMonth, monthLabel, monthOf, shiftMonth, todayISO } from './dates.js';
import { generateDemoData } from './demo.js';
import { createAccountDialog, createBudgetDialog, createMovementDialog, createTransactionDialog } from './dialogs.js';
import { byNewest, filterTransactions, suggestBudgets } from './finance.js';
import { icon } from './icons.js';
import { formatMoney } from './money.js';
import { heldAssets } from './networth.js';
import { createPriceFeed } from './prices.js';
import { canTransferWith, createStore, sanitizeState } from './store.js';
import { confirmDialog, downloadFile, showToast } from './ui.js';
import { mountAccount, renderAccount } from './views/account.js';
import { renderBank } from './views/bank.js';
import { renderBudgets } from './views/budgets.js';
import { mountCrypto, renderCrypto } from './views/crypto.js';
import { mountInvestments, renderInvestments } from './views/investments.js';
import { mountOverview, renderOverview } from './views/overview.js';
import { renderSettings } from './views/settings.js';
import { mountSpending, renderSpending } from './views/spending.js';
import { renderTransactions } from './views/transactions.js';

// path er det som står i adressefeltet; nav er menypunktet som lyser (for en konto: delen den hører til).
const VIEWS = {
  overview: { path: 'oversikt', title: 'Oversikt', nav: 'overview', render: renderOverview, mount: mountOverview },
  bank: { path: 'bank', title: 'Bank', nav: 'bank', render: renderBank },
  investments: { path: 'aksjer', title: 'Aksjer og fond', nav: 'investments', render: renderInvestments, mount: mountInvestments },
  crypto: { path: 'krypto', title: 'Krypto', nav: 'crypto', render: renderCrypto, mount: mountCrypto },
  account: { path: 'konto', title: 'Konto', nav: null, render: renderAccount, mount: mountAccount },
  spending: { path: 'forbruk', title: 'Forbruk', nav: 'bank', render: renderSpending, mount: mountSpending },
  transactions: { path: 'transaksjoner', title: 'Transaksjoner', nav: 'bank', render: renderTransactions },
  budgets: { path: 'budsjett', title: 'Budsjett', nav: 'bank', render: renderBudgets },
  settings: { path: 'innstillinger', title: 'Innstillinger', nav: 'settings', render: renderSettings },
};
const ROUTES = new Map([...Object.entries(VIEWS).map(([key, view]) => [view.path, key]), ['formue', 'overview']]);
// Sider med kurser: de tegnes på nytt når en aksje eller mynt får kurs for første gang.
const LIVE_ROUTES = new Set(['overview', 'investments', 'crypto', 'account']);
// Sider der "Registrer"-knappen registrerer forbruk (resten registrerer bevegelser på kontoer).
const SPENDING_ROUTES = new Set(['spending', 'transactions', 'budgets']);
// Sider med egne knapper (Overfør, Kjøp, Selg …): her ville den flytende +-knappen bare dekket innholdet.
const OWN_ACTION_ROUTES = new Set(['bank', 'investments', 'crypto', 'account']);

const defaultFilters = (month) => ({ month, type: 'all', category: 'all', query: '' });
const categoryName = (id) => getCategory(id).name;

// Det du ser på akkurat nå. Lagres ikke; en ny innlasting starter på oversikten.
const ui = {
  route: 'overview',
  accountId: null,
  month: currentMonth(),
  filters: defaultFilters(currentMonth()),
  chartMode: 'chart',
  historyRange: '1y',
  historyMode: 'chart',
};

const storage = openStorage();
const store = createStore(storage, {
  onSaveError: () => showToast('Kunne ikke lagre – nettleserens lagring kan være full eller blokkert.'),
});
const feed = createPriceFeed({ storage, currency: store.getState().settings.currency });
const main = document.getElementById('view');
const transactionDialog = createTransactionDialog({ store, onDone: afterTransactionSaved });
const budgetDialog = createBudgetDialog({ store, onDone: (message) => showToast(message) });
const accountDialog = createAccountDialog({ store, feed, onDone: afterAccountSaved, onDelete: deleteAccount });
const movementDialog = createMovementDialog({ store, feed, onDone: afterMovementSaved });
let unmountView = null;
let lastUndo = null;

function openStorage() {
  try {
    const key = 'pengeflyt:test';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    return null; // f.eks. blokkert av personvernsinnstillinger
  }
}

// ---------- Tegning ----------

function render({ focusMain = false } = {}) {
  const view = VIEWS[ui.route];
  const state = store.getState();
  feed.setAssets(watchedAssets(state));
  const context = { state, ui, feed, today: todayISO(), thisMonth: currentMonth(), rerender: render };
  const focused = rememberFocus();
  unmountView?.();
  main.innerHTML = String(view.render(context));
  unmountView = view.mount?.(main, context) ?? null;
  restoreFocus(focused);
  if (focusMain) main.focus({ preventScroll: true });

  const account = ui.route === 'account' ? state.accounts.find((a) => a.id === ui.accountId) : null;
  document.title = `${account?.name ?? view.title} · Pengeflyt`;
  const nav = view.nav ?? (account ? sectionOf(account) : 'overview');
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const label = SPENDING_ROUTES.has(ui.route) ? 'Ny transaksjon' : 'Registrer';
  document.querySelector('[data-slot="quick-add-label"]').textContent = label;
  const fab = document.querySelector('.fab');
  fab.setAttribute('aria-label', label);
  fab.hidden = OWN_ACTION_ROUTES.has(ui.route);
}

// Siden tegnes på nytt etter hver endring, så behold markøren der den var (f.eks. i søkefeltet).
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
      // ikke et tekstfelt
    }
  }
}

/** Kursene appen skal følge: det du eier, og på kryptosiden alle myntene (til markedslisten). */
function watchedAssets(state) {
  const held = heldAssets(state.accounts, state.movements);
  return ui.route === 'crypto' ? [...held, ...COINS.map((coin) => coin.symbol)] : held;
}

function applyTheme({ theme }) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// ---------- Ruting ----------

function readRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const route = ROUTES.get(path) ?? 'overview';
  const params = new URLSearchParams(query);

  if (route === 'account') ui.accountId = params.get('id');

  // Lenker som #/transaksjoner?month=2026-10&category=groceries setter filtrene.
  if (route === 'transactions' && query) {
    const month = params.get('month');
    const category = params.get('category');
    const type = params.get('type');
    ui.filters = defaultFilters(month === 'all' || isValidMonth(month) ? month : ui.month);
    if (findCategory(category)) ui.filters.category = category;
    if (type === 'income' || type === 'expense') ui.filters.type = type;
    if (isValidMonth(month)) ui.month = month;
    history.replaceState(null, '', '#/transaksjoner');
  }

  const changed = route !== ui.route || route === 'account';
  ui.route = route;
  render({ focusMain: changed });
  if (changed) window.scrollTo(0, 0);
}

function setMonth(month) {
  ui.month = month;
  ui.filters = { ...ui.filters, month };
  render();
}

// ---------- Handlinger (knapper med data-action="…") ----------

/** Første konto i en del av appen som kan få denne typen bevegelse (ikke lån ved innskudd på Bank). */
function firstAccountIn(section, kind) {
  const accounts = accountsIn(section, store.getState().accounts);
  if (section === 'investments' && (kind === 'buy' || kind === 'sell')) return accounts.find((a) => a.type === 'stocks');
  return accounts.find((a) => accountKind(a) !== 'debt') ?? accounts[0];
}

/** Registrer en bevegelse i en del av appen, eller lag en konto først hvis det ikke finnes noen. */
function moveIn(section, kind, extra = {}) {
  const account = firstAccountIn(section, kind);
  if (!account) {
    const type = section === 'investments' && (kind === 'buy' || kind === 'sell') ? 'stocks' : SECTIONS[section].newType;
    accountDialog.open({ type });
    return;
  }
  movementDialog.open({ accountId: account.id, kind, ...extra });
}

const ACTIONS = {
  'quick-add': () => {
    if (SPENDING_ROUTES.has(ui.route)) transactionDialog.open();
    else if (ui.route === 'account' && ui.accountId) movementDialog.open({ accountId: ui.accountId });
    else if (ui.route === 'bank' || ui.route === 'investments' || ui.route === 'crypto') moveIn(ui.route, null);
    else if (store.getState().accounts.length === 0) accountDialog.open();
    else movementDialog.open();
  },
  'section-move': (button) => moveIn(button.dataset.section, button.dataset.kind),
  'buy-coin': (button) => moveIn('crypto', 'buy', { asset: button.dataset.asset }),
  transfer: () => {
    // Fra den første kontoen (som regel brukskontoen) til den neste, f.eks. sparekontoen.
    const accounts = accountsIn('bank', store.getState().accounts).filter(canTransferWith);
    if (accounts.length < 2) {
      showToast('Du trenger minst to kontoer for å overføre mellom dem.');
      return;
    }
    movementDialog.open({ accountId: accounts[0].id, counterId: accounts[1].id, transfer: true });
  },
  'prev-month': () => setMonth(shiftMonth(ui.month, -1)),
  'next-month': () => setMonth(shiftMonth(ui.month, 1)),
  'this-month': () => setMonth(currentMonth()),
  'add-transaction': (button) => transactionDialog.open({ type: button.dataset.type }),
  'edit-transaction': (button) => transactionDialog.open({ id: button.dataset.id }),
  'edit-budget': (button) => budgetDialog.open(button.dataset.category, ui.month),
  'suggest-budgets': suggestMissingBudgets,
  'add-account': (button) => accountDialog.open({ type: button.dataset.type }),
  'edit-account': (button) => accountDialog.open({ id: button.dataset.id }),
  'add-movement': (button) => {
    if (store.getState().accounts.length === 0) accountDialog.open();
    else movementDialog.open({ accountId: button.dataset.account, kind: button.dataset.kind });
  },
  'delete-movement': (button) => deleteMovement(button.dataset.id),
  'history-range': (button) => {
    ui.historyRange = button.dataset.range;
    render();
  },
  'history-mode': (button) => {
    ui.historyMode = button.dataset.mode;
    render();
  },
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
  showToast(message, { actionLabel: 'Angre', onAction: runUndo });
}

function runUndo() {
  const undo = lastUndo;
  lastUndo = null;
  undo?.();
}

function afterTransactionSaved(kind, transaction) {
  if (kind === 'deleted') {
    toastWithUndo('Transaksjonen ble slettet.', () => store.restoreTransaction(transaction));
    return;
  }
  const month = monthOf(transaction.date);
  const message = kind === 'added' ? 'Transaksjonen ble lagt til' : 'Endringene ble lagret';
  const visible = month === ui.month || (ui.route === 'transactions' && ui.filters.month === 'all');
  if (visible) showToast(`${message}.`);
  else showToast(`${message} i ${monthLabel(month).toLowerCase()}.`, { actionLabel: 'Vis', onAction: () => setMonth(month) });
}

function afterAccountSaved(kind, account) {
  if (kind === 'updated') {
    showToast('Kontoen ble lagret.');
    return;
  }
  showToast(`«${account.name}» ble lagt til.`, {
    actionLabel: 'Åpne',
    onAction: () => {
      location.hash = `#/konto?id=${encodeURIComponent(account.id)}`;
    },
  });
}

function afterMovementSaved(result, account) {
  const { movement, counter } = result;
  const { accounts, settings } = store.getState();
  const label = movementLabel(movement.kind, accountKind(account));
  const counterAccount = counter && accounts.find((a) => a.id === counter.accountId);
  let message = `${label} registrert på ${account.name}.`;
  if (counterAccount && (movement.kind === 'deposit' || movement.kind === 'withdrawal')) {
    // Penger flyttet mellom to kontoer: si det som en overføring
    const [from, to] = counter.kind === 'withdrawal' ? [counterAccount, account] : [account, counterAccount];
    message = `Overførte ${formatMoney(movement.amount, settings.currency)} fra ${from.name} til ${to.name}.`;
  } else if (counterAccount) {
    message = `${label} registrert på ${account.name}, og ${counter.kind === 'withdrawal' ? 'trukket fra' : 'satt inn på'} ${counterAccount.name}.`;
  }
  toastWithUndo(message, () => store.removeMovement(movement.id));
}

async function deleteAccount(id) {
  const account = store.getState().accounts.find((a) => a.id === id);
  if (!account) return;
  const confirmed = await confirmDialog({
    title: `Slette «${account.name}»?`,
    message: 'Kontoen og alle bevegelsene på den fjernes. Overføringer til og fra andre kontoer fjernes på begge sider.',
    confirmLabel: 'Slett konto',
    danger: true,
  });
  if (!confirmed) return;
  const removed = store.removeAccount(id);
  if (ui.route === 'account') location.hash = `#/${SECTIONS[sectionOf(account)].path}`;
  toastWithUndo(`«${account.name}» ble slettet.`, () => store.restoreAccount(removed));
}

function deleteMovement(id) {
  const removed = store.removeMovement(id);
  if (removed.length === 0) return;
  toastWithUndo(removed.length > 1 ? 'Overføringen ble slettet fra begge kontoene.' : 'Bevegelsen ble slettet.', () => store.restoreMovements(removed));
}

function suggestMissingBudgets() {
  const { transactions, budgets } = store.getState();
  const suggestions = suggestBudgets(transactions, ui.month);
  const missing = Object.entries(suggestions).filter(([category]) => !Object.hasOwn(budgets, category));
  if (missing.length === 0) {
    showToast(
      Object.keys(suggestions).length === 0
        ? 'For lite historikk ennå – forslagene bygger på de 3 månedene før denne.'
        : 'Alle kategoriene du bruker penger på, har allerede budsjett.',
    );
    return;
  }
  store.setBudgets({ ...budgets, ...Object.fromEntries(missing) });
  toastWithUndo(`La til ${missing.length} ${missing.length === 1 ? 'budsjett' : 'budsjetter'} basert på de siste 3 månedene.`, () => store.setBudgets(budgets));
}

function exportCsv() {
  const { transactions, settings } = store.getState();
  const list = ui.route === 'transactions' ? filterTransactions(transactions, ui.filters, categoryName) : [...transactions].sort(byNewest);
  if (list.length === 0) {
    showToast('Det er ingenting å eksportere.');
    return;
  }
  const csv = transactionsToCSV(list, { currency: settings.currency, categoryName });
  downloadFile(`pengeflyt-transaksjoner-${todayISO()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8'); // BOM så Excel leser æøå
  showToast(`Eksporterte ${list.length} ${list.length === 1 ? 'transaksjon' : 'transaksjoner'}.`);
}

function exportBackup() {
  const backup = { app: 'pengeflyt', exportedAt: new Date().toISOString(), ...store.getState() };
  downloadFile(`pengeflyt-sikkerhetskopi-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast('Sikkerhetskopien ble lastet ned.');
}

async function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = ''; // så samme fil kan velges igjen
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showToast('Filen er ikke en sikkerhetskopi fra Pengeflyt.');
    return;
  }
  const { state: incoming, skipped } = sanitizeState(data);
  const parts = [
    [incoming.accounts.length, 'kontoer'],
    [incoming.transactions.length, 'transaksjoner'],
    [Object.keys(incoming.budgets).length, 'budsjetter'],
  ].filter(([count]) => count > 0);
  if (parts.length === 0) {
    showToast('Fant ingen kontoer, transaksjoner eller budsjetter i filen.');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Gjenopprette sikkerhetskopien?',
    message: `Dataene dine erstattes med ${parts.map(([count, what]) => `${count} ${what}`).join(', ')} fra «${file.name}».`,
    confirmLabel: 'Gjenopprett',
  });
  if (!confirmed) return;

  const before = store.getState();
  store.replaceAll(incoming);
  const note = skipped > 0 ? ` (${skipped} ugyldige rader ble hoppet over)` : '';
  toastWithUndo(`Sikkerhetskopien ble gjenopprettet${note}.`, () => store.replaceAll(before));
}

async function loadDemoData() {
  const before = store.getState();
  const hasData = before.transactions.length > 0 || before.accounts.length > 0 || Object.keys(before.budgets).length > 0;
  if (hasData) {
    const confirmed = await confirmDialog({
      title: 'Laste inn eksempeldata?',
      message: 'Kontoene, transaksjonene og budsjettene dine erstattes med eksempeldata.',
      confirmLabel: 'Last inn eksempeldata',
    });
    if (!confirmed) return;
  }
  // Hent historiske kurser først, så kjøpene i eksempelet får kursene fra den dagen de ble gjort.
  showToast('Henter kurser til eksempeldataene …', { duration: 3000 });
  const history = feed.loadHistory(['BTC', 'ETH', 'SOL', 'USDT', 'aksje:EQNR.OL', 'aksje:DNB.OL']);
  await Promise.race([history, new Promise((resolve) => setTimeout(resolve, 8000))]);
  const demo = generateDemoData({ priceOn: (symbol, date) => feed.priceOn(symbol, date) });
  ui.month = currentMonth();
  ui.filters = defaultFilters(ui.month);
  store.replaceAll({ ...demo, settings: before.settings });
  if (ui.route !== 'overview') location.hash = '#/oversikt';
  if (hasData) toastWithUndo('Eksempeldataene er lastet inn.', () => store.replaceAll(before));
  else showToast('Eksempeldataene er lastet inn – ta en titt rundt!');
}

async function clearAllData() {
  const confirmed = await confirmDialog({
    title: 'Slette alle data?',
    message: 'Alle kontoer, bevegelser, transaksjoner og budsjetter fjernes fra denne nettleseren. Last ned en sikkerhetskopi først hvis du vil ta vare på dem.',
    confirmLabel: 'Slett alt',
    danger: true,
  });
  if (!confirmed) return;
  const before = store.getState();
  store.clearAll();
  toastWithUndo('Alle data ble slettet.', () => store.replaceAll(before));
}

// ---------- Hendelser ----------

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  const action = target && !target.disabled && ACTIONS[target.dataset.action];
  if (!action) return;
  event.preventDefault();
  action(target);
});

// Filtrene på transaksjonssiden og feltene i innstillingene
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
    ACTIONS['quick-add']();
  } else if (event.key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey && lastUndo) {
    event.preventDefault();
    runUndo();
  }
});

document.getElementById('import-file').addEventListener('change', importBackup);
window.addEventListener('hashchange', readRoute);

store.subscribe((state) => {
  applyTheme(state.settings);
  feed.setCurrency(state.settings.currency);
  render();
});

// Når en mynt eller aksje får kurs for første gang, tegnes siden på nytt (grafen og tallene trenger den).
// Ellers oppdateres bare tallene, i views/live.js.
let pricedCoins = Object.keys(feed.prices()).sort().join();
feed.subscribe(() => {
  movementDialog.refreshEstimate();
  const coins = Object.keys(feed.prices()).sort().join();
  // Med en dialog åpen venter vi (pricedCoins oppdateres ikke), så siden tegnes ved neste kurs etter at den lukkes.
  if (coins === pricedCoins || document.querySelector('dialog[open]')) return;
  pricedCoins = coins;
  if (LIVE_ROUTES.has(ui.route)) render();
});

// ---------- Oppstart ----------

for (const element of document.querySelectorAll('[data-icon]')) {
  element.innerHTML = String(icon(element.dataset.icon));
}
document.getElementById('institutions').innerHTML = INSTITUTIONS.map((name) => `<option value="${name}"></option>`).join('');
applyTheme(store.getState().settings);
readRoute();
if (!storage) {
  showToast('Nettleseren blokkerer lagring, så endringene forsvinner når du lukker fanen.', { duration: 12000 });
}
