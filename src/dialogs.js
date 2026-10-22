// The "Add/edit transaction" and "Budget" dialogs. Their markup lives in index.html;
// this code fills them in, validates what was typed and saves it through the store.
import { categoriesFor, getCategory } from './categories.js';
import { todayISO } from './dates.js';
import { suggestBudgets } from './finance.js';
import { html } from './html.js';
import { currencySymbol, formatAmountInput, formatMoney, parseAmount } from './money.js';

function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  for (const button of dialog.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => dialog.close());
  }
}

/** Shows (or clears) the error message under each field. */
function showErrors(form, prefix, fields, errors) {
  for (const field of fields) {
    const message = errors[field] ?? '';
    const error = form.querySelector(`#${prefix}-${field}-error`);
    error.textContent = message;
    error.hidden = !message;
    const input = form.querySelector(`#${prefix}-${field}`);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  const first = fields.find((field) => errors[field]);
  if (first) (form.querySelector(`#${prefix}-${first}`) ?? form.querySelector(`[name="${first}"]`))?.focus();
}

export function createTransactionDialog({ store, onDone }) {
  const dialog = document.getElementById('tx-dialog');
  const form = dialog.querySelector('form');
  const categoryGrid = form.querySelector('[data-slot="categories"]');
  const deleteButton = form.querySelector('[data-delete]');
  const fields = ['amount', 'category', 'date', 'note'];
  let editingId = null;

  function renderCategories(type, selected) {
    categoryGrid.innerHTML = String(
      html`${categoriesFor(type).map(
        (category) => html`<label class="category-option">
          <input type="radio" name="category" value="${category.id}" ${category.id === selected ? 'checked' : ''}>
          <span><span class="category-emoji" aria-hidden="true">${category.icon}</span>${category.name}</span>
        </label>`,
      )}`,
    );
  }

  function open({ id = null, type = 'expense' } = {}) {
    const { transactions, settings } = store.getState();
    const existing = id ? transactions.find((t) => t.id === id) : null;
    editingId = existing?.id ?? null;
    const txType = existing?.type ?? (type === 'income' ? 'income' : 'expense');

    form.reset();
    showErrors(form, 'tx', fields, {});
    form.elements.type.value = txType;
    form.elements.amount.value = existing ? formatAmountInput(existing.amount) : '';
    form.elements.date.value = existing?.date ?? todayISO();
    form.elements.note.value = existing?.note ?? '';
    renderCategories(txType, existing?.category);
    form.querySelector('[data-slot="currency"]').textContent = currencySymbol(settings.currency);
    dialog.querySelector('#tx-dialog-title').textContent = existing ? 'Edit transaction' : 'Add transaction';
    deleteButton.hidden = !existing;

    dialog.showModal();
    form.elements.amount.focus();
    form.elements.amount.select(); // when editing, typing replaces the old amount
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'type') renderCategories(event.target.value, null);
  });

  // Clear a field's error message as soon as the user fixes it.
  form.addEventListener('input', (event) => {
    if (fields.includes(event.target.name)) showErrors(form, 'tx', [event.target.name], {});
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const input = {
      type: data.get('type'),
      amount: parseAmount(data.get('amount')),
      category: data.get('category') ?? '',
      date: data.get('date'),
      note: String(data.get('note') ?? ''),
    };
    const result = editingId ? store.updateTransaction(editingId, input) : store.addTransaction(input);
    if (!result.ok) {
      const errors = { ...result.errors };
      if (Number.isNaN(input.amount)) errors.amount = String(data.get('amount')).trim() ? 'Enter a number, like 450 or 129,90.' : 'Enter an amount.';
      showErrors(form, 'tx', fields, errors);
      return;
    }
    dialog.close();
    onDone(editingId ? 'updated' : 'added', result.transaction);
  });

  deleteButton.addEventListener('click', () => {
    const removed = store.removeTransaction(editingId);
    dialog.close();
    if (removed) onDone('deleted', removed);
  });

  closeOnBackdropClick(dialog);
  return { open };
}

export function createBudgetDialog({ store, onDone }) {
  const dialog = document.getElementById('budget-dialog');
  const form = dialog.querySelector('form');
  const input = form.querySelector('#budget-amount');
  const hint = form.querySelector('[data-slot="hint"]');
  const useSuggestion = form.querySelector('[data-use-suggestion]');
  const removeButton = form.querySelector('[data-remove]');
  let category = null;

  function open(categoryId, month) {
    const { transactions, budgets, settings } = store.getState();
    const { name, icon } = getCategory(categoryId);
    category = categoryId;

    showErrors(form, 'budget', ['amount'], {});
    dialog.querySelector('#budget-dialog-title').textContent = `${icon} ${name}`;
    form.querySelector('[data-slot="currency"]').textContent = currencySymbol(settings.currency);
    input.value = budgets[categoryId] ? formatAmountInput(budgets[categoryId]) : '';
    removeButton.hidden = !budgets[categoryId];

    const suggestion = suggestBudgets(transactions, month)[categoryId];
    hint.textContent = suggestion
      ? `You usually spend about ${formatMoney(suggestion, settings.currency)} a month on this.`
      : 'How much do you want to spend on this each month?';
    useSuggestion.hidden = !suggestion;
    useSuggestion.dataset.value = suggestion ? formatAmountInput(suggestion) : '';
    useSuggestion.textContent = suggestion ? `Use ${formatMoney(suggestion, settings.currency)}` : '';

    dialog.showModal();
    input.focus();
    input.select();
  }

  useSuggestion.addEventListener('click', () => {
    input.value = useSuggestion.dataset.value;
    input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = parseAmount(input.value);
    if (!(amount > 0)) {
      showErrors(form, 'budget', ['amount'], { amount: input.value.trim() ? 'Enter a number, like 3000 or 2 500.' : 'Enter an amount.' });
      return;
    }
    if (!store.setBudget(category, amount)) {
      showErrors(form, 'budget', ['amount'], { amount: 'That amount is too large.' });
      return;
    }
    dialog.close();
    onDone(`Budget for ${getCategory(category).name} saved.`);
  });

  removeButton.addEventListener('click', () => {
    store.removeBudget(category);
    dialog.close();
    onDone(`Budget for ${getCategory(category).name} removed.`);
  });

  closeOnBackdropClick(dialog);
  return { open };
}
