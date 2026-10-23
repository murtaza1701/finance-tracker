// Dialogene: ny/endre transaksjon, budsjett, ny/endre konto og registrering av bevegelser.
// Markupen ligger i index.html; koden her fyller dem ut, sjekker det som er skrevet og lagrer via store.
import { ACCOUNT_TYPES, COINS, accountKind, actionLabel, assetName, findAccountType, isMarketKind, isValidTicker, priceKey } from './accounts.js';
import { categoriesFor, getCategory } from './categories.js';
import { todayISO } from './dates.js';
import { suggestBudgets } from './finance.js';
import { html } from './html.js';
import {
  currencySymbol,
  formatAmountInput,
  formatMoney,
  formatPrice,
  formatQuantity,
  formatQuantityInput,
  parseAmount,
  parseQuantity,
} from './money.js';
import { MOVEMENT_KINDS, movementsFor, replayAccount } from './networth.js';
import { canTransferWith, counterKind } from './store.js';

function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  for (const button of dialog.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => dialog.close());
  }
}

/** Viser (eller fjerner) feilmeldingen under hvert felt, og flytter fokus til den første feilen. */
function showErrors(form, prefix, fields, errors) {
  for (const field of fields) {
    const message = errors[field] ?? '';
    const error = form.querySelector(`#${prefix}-${field}-error`);
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    form.querySelector(`#${prefix}-${field}`)?.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  const first = fields.find((field) => errors[field]);
  if (first) (form.querySelector(`#${prefix}-${first}`) ?? form.querySelector(`[name="${first}"]`))?.focus();
}

const show = (form, name, visible) => {
  for (const element of form.querySelectorAll(`[data-for="${name}"]`)) element.hidden = !visible;
};

const round8 = (value) => Math.round(value * 1e8) / 1e8;
const normalizeTicker = (text) => text.trim().toUpperCase();

/** Søk hos Yahoo mens du skriver i et tickerfelt; forslagene vises i <datalist id="ticker-suggestions">. */
function attachTickerSearch(input, feed, onPick) {
  const list = document.getElementById('ticker-suggestions');
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    // Valgt fra listen: hent kursen med en gang.
    if ([...list.options].some((option) => option.value === query)) {
      onPick();
      return;
    }
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      const results = await feed.searchStocks(query);
      if (input.value.trim() !== query) return; // brukeren har skrevet videre
      list.innerHTML = String(html`${results.map((r) => html`<option value="${r.symbol}">${r.name}${r.exchange ? ` · ${r.exchange}` : ''}</option>`)}`);
    }, 300);
  });
  input.addEventListener('change', onPick);
}

/** Forslag i tickerfeltet før du har søkt: aksjene du allerede eier. */
function suggestHeld(tickers, prices) {
  document.getElementById('ticker-suggestions').innerHTML = String(
    html`${tickers.map((ticker) => html`<option value="${ticker}">${assetName('stocks', ticker, prices)}</option>`)}`,
  );
}

/** Teksten under antall/ticker: kursen nå, eller hvorfor den mangler. */
function priceHint({ kind, asset, price, failed, currency, prices }) {
  if (!asset) return kind === 'stocks' ? 'Søk på navnet, f.eks. «Equinor», og velg fra listen.' : '';
  if (failed) return `Fant ikke kurs for ${asset}. Søk på navnet og velg fra listen.`;
  if (!price) return 'Henter kurs …';
  return kind === 'stocks'
    ? `${assetName(kind, asset, prices)}: ${formatPrice(price, currency)} per aksje (ca. 15 min forsinket)`
    : `1 ${asset} ≈ ${formatPrice(price, currency)}`;
}

// ---------- Transaksjon ----------

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
    dialog.querySelector('#tx-dialog-title').textContent = existing ? 'Endre transaksjon' : 'Ny transaksjon';
    deleteButton.hidden = !existing;

    dialog.showModal();
    form.elements.amount.focus();
    form.elements.amount.select(); // ved redigering erstatter det du skriver det gamle beløpet
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'type') renderCategories(event.target.value, null);
  });

  // Fjern feilmeldingen for et felt så snart det rettes.
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
      if (Number.isNaN(input.amount)) errors.amount = String(data.get('amount')).trim() ? 'Skriv inn et tall, f.eks. 450 eller 129,90.' : 'Skriv inn et beløp.';
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

// ---------- Budsjett ----------

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
      ? `Du pleier å bruke rundt ${formatMoney(suggestion, settings.currency)} i måneden på dette.`
      : 'Hvor mye vil du bruke på dette hver måned?';
    useSuggestion.hidden = !suggestion;
    useSuggestion.dataset.value = suggestion ? formatAmountInput(suggestion) : '';
    useSuggestion.textContent = suggestion ? `Bruk ${formatMoney(suggestion, settings.currency)}` : '';

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
      showErrors(form, 'budget', ['amount'], { amount: input.value.trim() ? 'Skriv inn et tall, f.eks. 3000 eller 2 500.' : 'Skriv inn et beløp.' });
      return;
    }
    if (!store.setBudget(category, amount)) {
      showErrors(form, 'budget', ['amount'], { amount: 'Beløpet er for stort.' });
      return;
    }
    dialog.close();
    onDone(`Budsjett for ${getCategory(category).name} lagret.`);
  });

  removeButton.addEventListener('click', () => {
    store.removeBudget(category);
    dialog.close();
    onDone(`Budsjett for ${getCategory(category).name} fjernet.`);
  });

  closeOnBackdropClick(dialog);
  return { open };
}

// ---------- Konto ----------

export function createAccountDialog({ store, feed, onDone, onDelete }) {
  const dialog = document.getElementById('account-dialog');
  const form = dialog.querySelector('form');
  const typeGrid = form.querySelector('[data-slot="types"]');
  const assetSelect = form.querySelector('#account-asset');
  const tickerInput = form.querySelector('#account-ticker');
  const fields = ['type', 'name', 'institution', 'amount', 'invested', 'asset', 'ticker', 'quantity', 'paid'];
  const quoted = new Set();
  const failed = new Set();
  let editingId = null;

  assetSelect.innerHTML = String(html`${COINS.map((coin) => html`<option value="${coin.symbol}">${coin.symbol} – ${coin.name}</option>`)}`);

  const selectedType = () => form.querySelector('input[name="account-type"]:checked')?.value ?? 'bank';
  const selectedKind = () => findAccountType(selectedType()).kind;
  const currentAsset = (kind) => (kind === 'stocks' ? normalizeTicker(tickerInput.value) : assetSelect.value);

  function renderTypes(selected, lockedKind) {
    typeGrid.innerHTML = String(
      html`${ACCOUNT_TYPES.map(
        (type) => html`<label class="category-option">
          <input type="radio" name="account-type" value="${type.id}" ${type.id === selected ? 'checked' : ''}
            ${lockedKind && type.kind !== lockedKind ? 'disabled' : ''}>
          <span><span class="category-emoji" aria-hidden="true">${type.icon}</span>${type.name}</span>
        </label>`,
      )}`,
    );
  }

  function updateFields() {
    const type = findAccountType(selectedType());
    const creating = editingId === null;
    form.querySelector('#account-name').placeholder = `F.eks. ${type.example}`;
    const market = isMarketKind(type.kind);
    show(form, 'opening', creating && !market);
    show(form, 'invested', creating && type.kind === 'investment');
    show(form, 'holding', creating && market);
    show(form, 'coin', type.kind === 'crypto');
    show(form, 'ticker', type.kind === 'stocks');
    const labels = { balance: 'Saldo nå', investment: 'Verdi nå', debt: 'Hvor mye skylder du nå?' };
    form.querySelector('[data-slot="amount-label"]').textContent = labels[type.kind] ?? 'Saldo nå';
    if (creating && market) updateHint();
  }

  function updateHint() {
    const kind = selectedKind();
    const asset = currentAsset(kind);
    const key = priceKey(kind, asset);
    const price = feed.prices()[key]?.price;
    const text = priceHint({ kind, asset, price, failed: failed.has(key), currency: store.getState().settings.currency, prices: feed.prices() });
    form.querySelector('[data-slot="crypto-hint"]').textContent = price ? `${text}. Står «Betalt» tomt, brukes dagens kurs.` : text;
    // Hent kursen én gang per mynt eller aksje (ikke i en løkke hvis det feiler).
    const lookup = kind === 'crypto' || isValidTicker(asset);
    if (asset && !price && lookup && !quoted.has(key)) {
      quoted.add(key);
      feed.quote(key).then((found) => {
        if (found === undefined) failed.add(key);
        if (dialog.open) updateHint();
      });
    }
  }

  attachTickerSearch(tickerInput, feed, () => updateHint());

  /** Åpner for en ny konto (eventuelt med en type ferdig valgt) eller for å endre en konto. */
  function open({ id = null, type = 'bank' } = {}) {
    const { accounts, movements, settings } = store.getState();
    const existing = id ? accounts.find((account) => account.id === id) : null;
    editingId = existing?.id ?? null;
    quoted.clear();
    failed.clear();
    form.reset();
    suggestHeld([], {});
    showErrors(form, 'account', fields, {});
    const hasMovements = existing && movements.some((m) => m.accountId === existing.id);
    renderTypes(existing?.type ?? (findAccountType(type) ? type : 'bank'), hasMovements ? accountKind(existing) : null);
    form.querySelector('#account-name').value = existing?.name ?? '';
    form.querySelector('#account-institution').value = existing?.institution ?? '';
    for (const slot of form.querySelectorAll('[data-slot="currency"]')) slot.textContent = currencySymbol(settings.currency);
    dialog.querySelector('#account-dialog-title').textContent = existing ? 'Endre konto' : 'Ny konto';
    form.querySelector('[data-delete]').hidden = !existing;
    updateFields();
    dialog.showModal();
    form.querySelector(existing ? '#account-name' : 'input[name="account-type"]:checked').focus();
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'account-type' || event.target === assetSelect) updateFields();
  });


  form.addEventListener('input', (event) => {
    const field = event.target.id?.replace('account-', '');
    if (fields.includes(field)) showErrors(form, 'account', [field], {});
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = selectedType();
    const kind = findAccountType(type)?.kind;
    const input = {
      name: form.querySelector('#account-name').value,
      type,
      institution: form.querySelector('#account-institution').value,
    };

    if (editingId) {
      const result = store.updateAccount(editingId, input);
      if (!result.ok) return showErrors(form, 'account', fields, result.errors);
      dialog.close();
      onDone('updated', result.account);
      return;
    }

    const errors = {};
    let opening = null;
    if (isMarketKind(kind)) {
      const quantityText = form.querySelector('#account-quantity').value.trim();
      const paidText = form.querySelector('#account-paid').value.trim();
      const asset = currentAsset(kind);
      if (quantityText || (kind === 'stocks' && asset)) {
        const quantity = parseQuantity(quantityText);
        // Kursen trengs både for å sjekke tickeren og som kjøpspris når "Betalt" står tomt.
        const price = kind === 'stocks' && !isValidTicker(asset) ? undefined : await feed.quote(priceKey(kind, asset));
        const paid = paidText ? parseAmount(paidText) : price ? Math.round(quantity * price * 100) : 0;
        if (kind === 'stocks' && price === undefined) errors.ticker = `Fant ikke kurs for ${asset || 'tickeren'}. Søk på navnet og velg fra listen.`;
        if (Number.isNaN(quantity)) errors.quantity = quantityText ? 'Skriv inn et antall, f.eks. 0,005.' : 'Skriv inn hvor mange.';
        if (Number.isNaN(paid)) errors.paid = 'Skriv inn et tall, f.eks. 2 000.';
        opening = { asset, quantity, amount: paid };
      }
    } else {
      const amountText = form.querySelector('#account-amount').value.trim();
      const investedText = form.querySelector('#account-invested').value.trim();
      const amount = amountText ? parseAmount(amountText) : 0;
      if (Number.isNaN(amount)) errors.amount = 'Skriv inn et tall, f.eks. 12 500.';
      opening = { amount };
      if (kind === 'investment' && investedText) {
        opening.invested = parseAmount(investedText);
        if (Number.isNaN(opening.invested)) errors.invested = 'Skriv inn et tall, f.eks. 10 000.';
      }
    }
    if (Object.keys(errors).length > 0) return showErrors(form, 'account', fields, errors);

    const result = store.addAccount(input, opening);
    if (!result.ok) {
      const mapped = { ...result.errors };
      if (isMarketKind(kind) && mapped.amount) mapped.paid = mapped.amount;
      if (kind === 'stocks' && mapped.asset) mapped.ticker = mapped.asset;
      return showErrors(form, 'account', fields, mapped);
    }
    dialog.close();
    onDone('added', result.account);
  });

  form.querySelector('[data-delete]').addEventListener('click', () => {
    const id = editingId;
    dialog.close();
    onDelete(id);
  });

  closeOnBackdropClick(dialog);
  return { open };
}

// ---------- Bevegelse (innskudd, uttak, ny verdi, kjøp, salg) ----------

export function createMovementDialog({ store, feed, onDone }) {
  const dialog = document.getElementById('move-dialog');
  const form = dialog.querySelector('form');
  const accountSelect = form.querySelector('#move-account');
  const kindsBox = form.querySelector('[data-slot="kinds"]');
  const assetSelect = form.querySelector('#move-asset');
  const tickerInput = form.querySelector('#move-ticker');
  const quantityInput = form.querySelector('#move-quantity');
  const amountInput = form.querySelector('#move-amount');
  const counterSelect = form.querySelector('#move-counter');
  const accountField = accountSelect.closest('.field');
  const amountField = amountInput.closest('.field');
  const counterField = counterSelect.closest('.field');
  const fields = ['account', 'kind', 'asset', 'ticker', 'quantity', 'amount', 'counter', 'date', 'note'];
  const quoted = new Set();
  const failed = new Set();
  let touched = { quantity: false, amount: false };
  // Overføring: et uttak fra én konto ("Fra konto") som settes inn på en annen ("Til konto").
  let transferring = false;

  const state = () => store.getState();
  const currentAccount = () => state().accounts.find((account) => account.id === accountSelect.value) ?? null;
  const currentKind = () => form.querySelector('input[name="kind"]:checked')?.value ?? null;
  const currency = () => state().settings.currency;
  const priceOf = (key) => feed.prices()[key]?.price;
  const marketKind = () => accountKind(currentAccount());
  const currentAsset = () => (marketKind() === 'stocks' ? normalizeTicker(tickerInput.value) : assetSelect.value);
  const currentKey = () => priceKey(marketKind(), currentAsset());

  function heldOn(account) {
    return replayAccount(movementsFor(account.id, state().movements)).holdings;
  }

  function renderAccounts(selectedId) {
    const usable = (account) => !transferring || canTransferWith(account);
    accountSelect.innerHTML = String(
      html`${ACCOUNT_TYPES.map((type) => {
        const accounts = state().accounts.filter((account) => account.type === type.id && usable(account));
        if (accounts.length === 0) return '';
        return html`<optgroup label="${type.icon} ${type.name}">
          ${accounts.map((account) => html`<option value="${account.id}" ${account.id === selectedId ? 'selected' : ''}>${account.name}${account.institution ? ` (${account.institution})` : ''}</option>`)}
        </optgroup>`;
      })}`,
    );
  }

  function renderKinds(selectedKind) {
    const kind = accountKind(currentAccount());
    const kinds = MOVEMENT_KINDS[kind];
    const chosen = kinds.includes(selectedKind) ? selectedKind : kinds[0];
    kindsBox.innerHTML = String(
      html`<legend class="visually-hidden">Hva skjedde?</legend>
        ${kinds.map((k) => html`<label><input type="radio" name="kind" id="move-kind-${k}" value="${k}" ${k === chosen ? 'checked' : ''}><span>${actionLabel(k, kind)}</span></label>`)}`,
    );
  }

  function renderAssets() {
    const account = currentAccount();
    const held = account ? Object.keys(heldOn(account)) : [];
    const coins = currentKind() === 'sell' && held.length > 0 ? COINS.filter((coin) => held.includes(coin.symbol)) : COINS;
    const keep = coins.some((coin) => coin.symbol === assetSelect.value) ? assetSelect.value : held[0] ?? coins[0].symbol;
    assetSelect.innerHTML = String(html`${coins.map((coin) => html`<option value="${coin.symbol}" ${coin.symbol === keep ? 'selected' : ''}>${coin.symbol} – ${coin.name}</option>`)}`);
  }

  function renderCounter() {
    const account = currentAccount();
    const kind = currentKind();
    const options = state().accounts.filter((other) => other.id !== account?.id && canTransferWith(other));
    const visible = Boolean(account) && kind !== 'value' && options.length > 0;
    show(form, 'counter', visible);
    if (!visible) {
      counterSelect.innerHTML = '<option value=""></option>';
      return;
    }
    const fromCounter = counterKind(kind, accountKind(account)) === 'withdrawal';
    form.querySelector('[data-slot="counter-label"]').textContent = transferring ? 'Til konto' : fromCounter ? 'Pengene kom fra' : 'Pengene gikk til';
    const keep = counterSelect.value;
    counterSelect.innerHTML = String(
      html`${transferring ? '' : html`<option value="">${fromCounter ? 'Utenfra (f.eks. lønn eller gave)' : 'Ut av oversikten (f.eks. brukt)'}</option>`}
        ${options.map((other) => html`<option value="${other.id}" ${other.id === keep ? 'selected' : ''}>${other.name}${other.institution ? ` (${other.institution})` : ''}</option>`)}`,
    );
  }

  function updateFields() {
    const account = currentAccount();
    const kindOfAccount = accountKind(account);
    const kind = currentKind();
    const crypto = kindOfAccount === 'crypto';
    const stocks = kindOfAccount === 'stocks';
    show(form, 'asset', crypto);
    show(form, 'ticker', stocks);
    show(form, 'quantity', crypto || stocks);
    if (stocks) {
      const held = Object.keys(heldOn(account));
      suggestHeld(held, feed.prices());
      if (kind === 'sell' && !tickerInput.value && held.length > 0) tickerInput.value = held[0];
    }
    const labels = {
      deposit: kindOfAccount === 'debt' ? 'Hvor mye lånte du?' : 'Beløp satt inn',
      withdrawal: kindOfAccount === 'debt' ? 'Beløp betalt ned' : 'Beløp tatt ut',
      value: kindOfAccount === 'investment' ? 'Ny verdi' : 'Ny saldo',
      buy: 'Betalt (valgfritt)',
      sell: 'Fikk utbetalt (valgfritt)',
    };
    form.querySelector('[data-slot="amount-label"]').textContent = transferring ? 'Beløp' : labels[kind] ?? 'Beløp';
    const amountHints = {
      value: kindOfAccount === 'investment' ? 'Hele verdien slik den står hos megleren nå.' : 'Hele saldoen slik den står i nettbanken nå.',
    };
    form.querySelector('[data-slot="amount-hint"]').textContent = amountHints[kind] ?? '';
    if (crypto) renderAssets();
    renderCounter();
    updateEstimate(null);
  }

  /** Regner ut beløp fra antall (eller omvendt) med live-kurs, så lenge brukeren ikke har skrevet i det andre feltet. */
  function updateEstimate(source) {
    const account = currentAccount();
    const kind = accountKind(account);
    if (!isMarketKind(kind)) return;
    const asset = currentAsset();
    const key = currentKey();
    const price = priceOf(key);
    const held = heldOn(account)[asset] ?? 0;
    const parts = [priceHint({ kind, asset, price, failed: failed.has(key), currency: currency(), prices: feed.prices() })];
    if (asset && currentKind() === 'sell') parts.push(held > 0 ? `du har ${formatQuantity(held)} ${asset}` : `du har ingen ${asset} her`);
    form.querySelector('[data-slot="quantity-hint"]').textContent = parts.filter(Boolean).join(' · ');
    if (!price) {
      // En mynt eller aksje appen ikke følger ennå: hent kursen én gang.
      if (asset && (kind === 'crypto' || isValidTicker(asset)) && !quoted.has(key)) {
        quoted.add(key);
        feed.quote(key).then((found) => {
          if (found === undefined) failed.add(key);
          if (dialog.open) updateEstimate(source);
        });
      }
      return;
    }
    if (source === 'quantity' && !touched.amount) {
      const quantity = parseQuantity(quantityInput.value);
      amountInput.value = quantity > 0 ? formatAmountInput(Math.round(quantity * price * 100)) : '';
    } else if (source === 'amount' && !touched.quantity) {
      const amount = parseAmount(amountInput.value);
      quantityInput.value = amount > 0 ? formatQuantityInput(round8(amount / 100 / price)) : '';
    }
  }

  /**
   * Åpner dialogen. Alt er valgfritt: kontoen, hva som skjedde (kind), mynten/aksjen (asset),
   * motkontoen (counterId) og overskriften. Med transfer: true blir den et rent overføringsskjema
   * (Fra konto, Til konto, Beløp) uten valg av hva som skjedde.
   */
  function open({ accountId = null, kind = null, asset = null, counterId = null, title = 'Registrer', transfer = false } = {}) {
    const { accounts } = state();
    const id = accounts.some((account) => account.id === accountId) ? accountId : accounts[0]?.id;
    transferring = transfer;
    dialog.querySelector('#move-dialog-title').textContent = transfer ? 'Overfør' : title;
    accountField.querySelector('label').textContent = transfer ? 'Fra konto' : 'Konto';
    kindsBox.hidden = transfer;
    form.querySelector('#move-counter-hint').hidden = transfer;
    // "Til konto" rett under "Fra konto" (flyttes i DOM-en, så tab-rekkefølgen følger det du ser)
    if (transfer) accountField.after(counterField);
    else amountField.after(counterField);
    form.reset();
    counterSelect.innerHTML = ''; // ikke ta med motkontoen fra forrige gang
    touched = { quantity: false, amount: false };
    quoted.clear();
    failed.clear();
    showErrors(form, 'move', fields, {});
    renderAccounts(id);
    renderKinds(transfer ? 'withdrawal' : kind);
    form.querySelector('#move-date').value = todayISO();
    form.querySelector('[data-slot="currency"]').textContent = currencySymbol(currency());
    if (asset && accountKind(currentAccount()) === 'stocks') tickerInput.value = asset;
    updateFields();
    if (asset && accountKind(currentAccount()) === 'crypto' && [...assetSelect.options].some((option) => option.value === asset)) {
      assetSelect.value = asset;
      updateEstimate(null);
    }
    if (counterId && [...counterSelect.options].some((option) => option.value === counterId)) counterSelect.value = counterId;
    dialog.showModal();
    const focusKind = accountKind(currentAccount());
    (focusKind === 'stocks' && !tickerInput.value ? tickerInput : isMarketKind(focusKind) ? quantityInput : amountInput).focus();
  }

  form.addEventListener('change', (event) => {
    if (event.target === accountSelect) {
      renderKinds(currentKind());
      touched = { quantity: false, amount: false };
      updateFields();
    } else if (event.target.name === 'kind') {
      updateFields();
    } else if (event.target === assetSelect) {
      updateEstimate(touched.amount && !touched.quantity ? 'amount' : 'quantity');
    }
  });

  attachTickerSearch(tickerInput, feed, () => updateEstimate(touched.amount && !touched.quantity ? 'amount' : 'quantity'));

  form.addEventListener('input', (event) => {
    if (event.target === quantityInput) {
      touched.quantity = quantityInput.value.trim() !== '';
      updateEstimate('quantity');
    } else if (event.target === amountInput) {
      touched.amount = amountInput.value.trim() !== '';
      updateEstimate('amount');
    }
    const field = event.target.id?.replace('move-', '');
    if (fields.includes(field)) showErrors(form, 'move', [field], {});
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const account = currentAccount();
    const kind = accountKind(account);
    const market = isMarketKind(kind);
    const amountText = amountInput.value.trim();
    const asset = currentAsset();
    // Kursen trengs som kjøpspris når beløpet står tomt, og for å sjekke at en ny ticker finnes.
    const price = market && (kind === 'crypto' || isValidTicker(asset)) ? await feed.quote(currentKey()) : undefined;
    const input = {
      accountId: account?.id,
      kind: currentKind(),
      date: form.querySelector('#move-date').value,
      note: form.querySelector('#move-note').value,
      amount: amountText ? parseAmount(amountText) : market ? 0 : NaN,
    };
    if (market) {
      input.asset = asset;
      input.quantity = parseQuantity(quantityInput.value);
      if (!amountText && input.quantity > 0 && price) input.amount = Math.round(input.quantity * price * 100);
    }
    const counterAccountId = form.querySelector('[data-for="counter"]').hidden ? null : counterSelect.value || null;
    if (kind === 'stocks' && input.kind === 'buy' && price === undefined) {
      showErrors(form, 'move', fields, { ticker: `Fant ikke kurs for ${asset || 'tickeren'}. Søk på navnet og velg fra listen.` });
      return;
    }
    const result = store.addMovement(input, { counterAccountId });
    if (!result.ok) {
      const errors = { ...result.errors, account: result.errors.accountId };
      if (Number.isNaN(input.amount)) errors.amount = amountText ? 'Skriv inn et tall, f.eks. 2 000 eller 129,90.' : 'Skriv inn et beløp.';
      if (market && Number.isNaN(input.quantity)) errors.quantity = quantityInput.value.trim() ? 'Skriv inn et antall, f.eks. 0,005.' : 'Skriv inn hvor mange.';
      if (kind === 'stocks' && errors.asset) errors.ticker = errors.asset;
      showErrors(form, 'move', fields, errors);
      return;
    }
    dialog.close();
    onDone(result, account);
  });

  closeOnBackdropClick(dialog);
  return {
    open,
    /** Oppdater kurs-hintet mens dialogen er åpen (kalles når kursene endres). */
    refreshEstimate: () => dialog.open && updateEstimate(null),
  };
}
