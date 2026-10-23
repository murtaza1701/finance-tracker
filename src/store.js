// Dataene i appen og alle måter å endre dem på: kontoer og bevegelser (formue),
// transaksjoner og budsjetter (forbruk) og innstillinger. Hver endring sjekkes, lagres i
// localStorage (bare i denne nettleseren) og varsles til siden slik at den tegnes på nytt.
import { accountKind, findAccountType, findCoin, isMarketKind, isValidTicker } from './accounts.js';
import { findCategory } from './categories.js';
import { isValidISODate, todayISO } from './dates.js';
import { CURRENCIES, formatQuantity } from './money.js';
import { MOVEMENT_KINDS, movementsFor, replayAccount } from './networth.js';

export const STORAGE_KEY = 'pengeflyt:v1';
export const MAX_AMOUNT = 10_000_000_000; // 100 millioner kr, i øre
export const MAX_QUANTITY = 1_000_000_000_000;
export const MAX_NOTE_LENGTH = 120;
export const MAX_NAME_LENGTH = 40;
export const THEMES = ['system', 'light', 'dark'];

export function emptyState() {
  return {
    version: 2,
    accounts: [],
    movements: [],
    transactions: [],
    budgets: {},
    settings: { currency: 'NOK', theme: 'system' },
  };
}

const hasErrors = (errors) => Object.keys(errors).length > 0;

function createId() {
  // randomUUID finnes bare på https:// og localhost, så ha en reserve
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Transaksjoner og budsjetter (forbruk) ----------

/** Gir en feilmelding per ugyldig felt – et tomt objekt betyr at transaksjonen er gyldig. */
export function validateTransaction(tx) {
  const errors = {};
  if (tx.type !== 'income' && tx.type !== 'expense') errors.type = 'Velg inntekt eller utgift.';
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) errors.amount = 'Skriv inn et beløp større enn 0.';
  else if (tx.amount > MAX_AMOUNT) errors.amount = 'Beløpet er for stort.';
  if (findCategory(tx.category)?.type !== tx.type) errors.category = 'Velg en kategori.';
  if (!isValidISODate(tx.date)) errors.date = 'Velg en gyldig dato.';
  if (typeof tx.note !== 'string' || tx.note.length > MAX_NOTE_LENGTH) {
    errors.note = `Hold notatet under ${MAX_NOTE_LENGTH} tegn.`;
  }
  return errors;
}

export function isValidBudget(category, limit) {
  return findCategory(category)?.type === 'expense' && Number.isInteger(limit) && limit > 0 && limit <= MAX_AMOUNT;
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

// ---------- Kontoer og bevegelser (formue) ----------

export function validateAccount(account) {
  const errors = {};
  const name = typeof account.name === 'string' ? account.name.trim() : '';
  if (!name) errors.name = 'Gi kontoen et navn.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Hold navnet under ${MAX_NAME_LENGTH} tegn.`;
  if (!findAccountType(account.type)) errors.type = 'Velg en kontotype.';
  if (typeof account.institution !== 'string' || account.institution.length > MAX_NAME_LENGTH) {
    errors.institution = `Hold navnet under ${MAX_NAME_LENGTH} tegn.`;
  }
  return errors;
}

/** Sjekker en bevegelse mot kontoen den hører til. */
export function validateMovement(m, account) {
  const errors = {};
  const kind = accountKind(account);
  if (!account) errors.accountId = 'Velg en konto.';
  else if (m.kind === 'opening' ? isMarketKind(kind) : !MOVEMENT_KINDS[kind].includes(m.kind)) errors.kind = 'Velg hva som skjedde.';

  if (m.kind === 'buy' || m.kind === 'sell') {
    if (kind === 'stocks' ? !isValidTicker(m.asset) : !findCoin(m.asset)) {
      errors.asset = kind === 'stocks' ? 'Skriv inn en gyldig ticker, f.eks. EQNR.OL.' : 'Velg en kryptovaluta.';
    }
    if (!(typeof m.quantity === 'number' && m.quantity > 0 && m.quantity <= MAX_QUANTITY)) errors.quantity = 'Skriv inn et antall større enn 0.';
    if (!Number.isInteger(m.amount) || m.amount < 0) errors.amount = 'Skriv inn et gyldig beløp.';
    else if (m.amount > MAX_AMOUNT) errors.amount = 'Beløpet er for stort.';
  } else {
    const needsAmount = m.kind === 'deposit' || m.kind === 'withdrawal';
    if (!Number.isInteger(m.amount) || m.amount < (needsAmount ? 1 : 0)) {
      errors.amount = needsAmount ? 'Skriv inn et beløp større enn 0.' : 'Skriv inn et gyldig beløp.';
    } else if (m.amount > MAX_AMOUNT) {
      errors.amount = 'Beløpet er for stort.';
    }
    if (m.invested !== undefined && !(Number.isInteger(m.invested) && m.invested >= 0 && m.invested <= MAX_AMOUNT)) {
      errors.invested = 'Skriv inn et gyldig beløp.';
    }
  }
  if (!isValidISODate(m.date)) errors.date = 'Velg en gyldig dato.';
  if (typeof m.note !== 'string' || m.note.length > MAX_NOTE_LENGTH) errors.note = `Hold notatet under ${MAX_NOTE_LENGTH} tegn.`;
  return errors;
}

function toAccount(input, overrides = {}) {
  return {
    id: typeof input.id === 'string' && input.id ? input.id : createId(),
    name: typeof input.name === 'string' ? input.name.trim() : '',
    type: input.type,
    institution: typeof input.institution === 'string' ? input.institution.trim() : '',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    ...overrides,
  };
}

function toMovement(input, overrides = {}) {
  const movement = {
    id: typeof input.id === 'string' && input.id ? input.id : createId(),
    accountId: input.accountId,
    kind: input.kind,
    date: input.date,
    amount: input.amount,
    note: typeof input.note === 'string' ? input.note.trim() : '',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
  };
  if (input.kind === 'buy' || input.kind === 'sell') {
    movement.asset = input.asset;
    movement.quantity = input.quantity;
  }
  if (input.kind === 'opening' && input.invested !== undefined && input.invested !== null) movement.invested = input.invested;
  if (typeof input.link === 'string' && input.link) movement.link = input.link;
  return { ...movement, ...overrides };
}

/**
 * Når penger flyttes mellom to kontoer, hvilken bevegelse får motkontoen?
 * Penger inn på en konto (eller betaling av gjeld) kommer fra motkontoen; penger ut går til den.
 */
export function counterKind(kind, kindOfAccount) {
  const fromCounter = kindOfAccount === 'debt' ? kind === 'withdrawal' : kind === 'deposit' || kind === 'buy';
  return fromCounter ? 'withdrawal' : 'deposit';
}

/** Kan denne kontoen brukes som "fra/til konto" ved en overføring? */
export function canTransferWith(account) {
  const kind = accountKind(account);
  return kind === 'balance' || kind === 'investment';
}

// ---------- Opprydding av lagrede data og sikkerhetskopier ----------

/**
 * Gjør hva som helst (lagrede data eller en sikkerhetskopi) om til en gyldig tilstand.
 * Ugyldige rader fjernes (og telles) i stedet for å ødelegge appen.
 */
export function sanitizeState(raw) {
  const state = emptyState();
  let skipped = 0;
  if (!raw || typeof raw !== 'object') return { state, skipped };
  const list = (value) => (Array.isArray(value) ? value : []);

  const transactionIds = new Set();
  for (const item of list(raw.transactions)) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const tx = toTransaction(item);
    tx.note = tx.note.slice(0, MAX_NOTE_LENGTH);
    if (transactionIds.has(tx.id)) tx.id = createId();
    if (hasErrors(validateTransaction(tx))) {
      skipped++;
      continue;
    }
    transactionIds.add(tx.id);
    state.transactions.push(tx);
  }

  if (raw.budgets && typeof raw.budgets === 'object') {
    for (const [category, limit] of Object.entries(raw.budgets)) {
      if (isValidBudget(category, limit)) state.budgets[category] = limit;
    }
  }

  // Aksjekontoer var tidligere kontoer med verdi du skrev inn selv. Slike gamle kontoer flyttes
  // til "Fond" (som fortsatt virker sånn), så verdiene ikke forsvinner.
  const manualKinds = new Set(['opening', 'deposit', 'withdrawal', 'value']);
  const manualStockAccounts = new Set(
    list(raw.movements).filter((m) => m && manualKinds.has(m.kind)).map((m) => m.accountId),
  );

  const accounts = new Map();
  for (const item of list(raw.accounts)) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const account = toAccount(item);
    if (account.type === 'stocks' && manualStockAccounts.has(account.id)) account.type = 'fund';
    if (accounts.has(account.id) || hasErrors(validateAccount(account))) {
      skipped++;
      continue;
    }
    accounts.set(account.id, account);
    state.accounts.push(account);
  }

  const movementIds = new Set();
  for (const item of list(raw.movements)) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const movement = toMovement(item);
    movement.note = movement.note.slice(0, MAX_NOTE_LENGTH);
    if (movementIds.has(movement.id)) movement.id = createId();
    if (hasErrors(validateMovement(movement, accounts.get(movement.accountId)))) {
      skipped++;
      continue;
    }
    movementIds.add(movement.id);
    state.movements.push(movement);
  }

  const settings = raw.settings ?? {};
  if (CURRENCIES.includes(settings.currency)) state.settings.currency = settings.currency;
  if (THEMES.includes(settings.theme)) state.settings.theme = settings.theme;
  return { state, skipped };
}

// ---------- Selve lageret ----------

/**
 * Lager lageret. `storage` er window.localStorage i appen og en etterligning i testene;
 * den kan være null når nettleseren blokkerer lagring (da ligger dataene bare i minnet).
 */
export function createStore(storage, { onSaveError = () => {} } = {}) {
  let state = load();
  const listeners = new Set();

  function load() {
    let text = null;
    try {
      text = storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      // lagring er blokkert – start tomt
    }
    if (!text) return emptyState();
    try {
      return sanitizeState(JSON.parse(text)).state;
    } catch {
      // Uleselige data: ta vare på en kopi under en annen nøkkel i stedet for å skrive over dem.
      try {
        storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, text);
      } catch {
        // ingenting mer å gjøre
      }
      return emptyState();
    }
  }

  function commit(next) {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      onSaveError(error); // f.eks. full lagring
    }
    listeners.forEach((listener) => listener(state));
  }

  const findAccount = (id) => state.accounts.find((account) => account.id === id);

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // ----- transaksjoner -----

    addTransaction(input) {
      const tx = toTransaction(input, { id: createId(), createdAt: new Date().toISOString() });
      const errors = validateTransaction(tx);
      if (hasErrors(errors)) return { ok: false, errors };
      commit({ ...state, transactions: [...state.transactions, tx] });
      return { ok: true, transaction: tx };
    },

    updateTransaction(id, changes) {
      const existing = state.transactions.find((t) => t.id === id);
      if (!existing) return { ok: false, errors: { id: 'Transaksjonen finnes ikke lenger.' } };
      const tx = toTransaction({ ...existing, ...changes }, { id, createdAt: existing.createdAt });
      const errors = validateTransaction(tx);
      if (hasErrors(errors)) return { ok: false, errors };
      commit({ ...state, transactions: state.transactions.map((t) => (t.id === id ? tx : t)) });
      return { ok: true, transaction: tx };
    },

    /** Sletter en transaksjon og gir den tilbake, så den kan gjenopprettes med "Angre". */
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

    // ----- budsjetter -----

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

    /** Bytter ut alle budsjetter på én gang (budsjettforslag og "Angre"). */
    setBudgets(budgets) {
      const clean = {};
      for (const [category, limit] of Object.entries(budgets)) {
        if (isValidBudget(category, limit)) clean[category] = limit;
      }
      commit({ ...state, budgets: clean });
    },

    // ----- kontoer -----

    /**
     * Oppretter en konto. `opening` er startverdien: { amount, invested } for vanlige kontoer,
     * eller { asset, quantity, amount } (en første beholdning) for kryptokontoer.
     */
    addAccount(input, opening = null) {
      const account = toAccount(input, { id: createId(), createdAt: new Date().toISOString() });
      const errors = validateAccount(account);
      let movement = null;
      if (opening && !errors.type) {
        const market = isMarketKind(accountKind(account));
        movement = toMovement({
          ...opening,
          accountId: account.id,
          kind: market ? 'buy' : 'opening',
          date: opening.date ?? todayISO(),
          note: market ? 'Startbeholdning' : 'Startsaldo',
        });
        Object.assign(errors, validateMovement(movement, account));
      }
      if (hasErrors(errors)) return { ok: false, errors };
      commit({
        ...state,
        accounts: [...state.accounts, account],
        movements: movement ? [...state.movements, movement] : state.movements,
      });
      return { ok: true, account };
    },

    updateAccount(id, changes) {
      const existing = findAccount(id);
      if (!existing) return { ok: false, errors: { name: 'Kontoen finnes ikke lenger.' } };
      const account = toAccount({ ...existing, ...changes }, { id, createdAt: existing.createdAt });
      const errors = validateAccount(account);
      const hasMovements = state.movements.some((m) => m.accountId === id);
      if (!errors.type && hasMovements && accountKind(account) !== accountKind(existing)) {
        errors.type = 'En konto med bevegelser kan bare byttes til en lignende type.';
      }
      if (hasErrors(errors)) return { ok: false, errors };
      commit({ ...state, accounts: state.accounts.map((a) => (a.id === id ? account : a)) });
      return { ok: true, account };
    },

    /** Sletter en konto med alle bevegelsene; gir dem tilbake så de kan gjenopprettes med "Angre". */
    removeAccount(id) {
      const account = findAccount(id);
      if (!account) return null;
      const removed = state.movements.filter((m) => m.accountId === id);
      // Overføringer til/fra kontoen fjernes på begge sider.
      const links = new Set(removed.map((m) => m.link).filter(Boolean));
      const movements = state.movements.filter((m) => m.accountId !== id && !(m.link && links.has(m.link)));
      const linked = state.movements.filter((m) => m.accountId !== id && m.link && links.has(m.link));
      commit({ ...state, accounts: state.accounts.filter((a) => a.id !== id), movements });
      return { account, movements: [...removed, ...linked] };
    },

    restoreAccount({ account, movements }) {
      if (findAccount(account.id)) return;
      const ids = new Set(state.movements.map((m) => m.id));
      commit({
        ...state,
        accounts: [...state.accounts, account],
        movements: [...state.movements, ...movements.filter((m) => !ids.has(m.id))],
      });
    },

    // ----- bevegelser -----

    /**
     * Registrerer en bevegelse på en konto. Med `counterAccountId` blir det en overføring:
     * motkontoen får samme beløp motsatt vei, så formuen ikke telles dobbelt.
     */
    addMovement(input, { counterAccountId = null } = {}) {
      const account = findAccount(input.accountId);
      const movement = toMovement(input, { id: createId(), createdAt: new Date().toISOString() });
      const errors = validateMovement(movement, account);

      if (!hasErrors(errors) && movement.kind === 'sell') {
        // Det du eide på salgsdatoen, så et salg ikke kan dateres før kjøpet
        const { holdings } = replayAccount(movementsFor(account.id, state.movements), movement.date);
        const held = holdings[movement.asset] ?? 0;
        if (movement.quantity > held + 1e-9) {
          errors.quantity = held > 0 ? `Du har bare ${formatQuantity(held)} ${movement.asset} på denne kontoen.` : `Du har ingen ${movement.asset} på denne kontoen.`;
        }
      }

      let counter = null;
      if (counterAccountId && !hasErrors(errors)) {
        const counterAccount = findAccount(counterAccountId);
        if (!counterAccount || counterAccountId === account.id || !canTransferWith(counterAccount) || movement.kind === 'value') {
          errors.counter = 'Velg en annen konto.';
        } else if (movement.amount <= 0) {
          errors.amount = 'Skriv inn beløpet som ble overført.';
        } else {
          const kind = counterKind(movement.kind, accountKind(account));
          movement.link = createId();
          counter = toMovement({
            accountId: counterAccount.id,
            kind,
            date: movement.date,
            amount: movement.amount,
            note: kind === 'withdrawal' ? `Overført til ${account.name}` : `Overført fra ${account.name}`,
            link: movement.link,
          });
        }
      }

      if (hasErrors(errors)) return { ok: false, errors };
      commit({ ...state, movements: [...state.movements, movement, ...(counter ? [counter] : [])] });
      return { ok: true, movement, counter };
    },

    /** Sletter en bevegelse (og den andre siden av en overføring). Gir de slettede tilbake for "Angre". */
    removeMovement(id) {
      const movement = state.movements.find((m) => m.id === id);
      if (!movement) return [];
      const removed = state.movements.filter((m) => m.id === id || (movement.link && m.link === movement.link));
      commit({ ...state, movements: state.movements.filter((m) => !removed.includes(m)) });
      return removed;
    },

    restoreMovements(movements) {
      const ids = new Set(state.movements.map((m) => m.id));
      const accounts = new Set(state.accounts.map((a) => a.id));
      const restorable = movements.filter((m) => !ids.has(m.id) && accounts.has(m.accountId));
      if (restorable.length) commit({ ...state, movements: [...state.movements, ...restorable] });
    },

    // ----- innstillinger og alt på én gang -----

    updateSettings(changes) {
      const settings = { ...state.settings };
      if (CURRENCIES.includes(changes.currency)) settings.currency = changes.currency;
      if (THEMES.includes(changes.theme)) settings.theme = changes.theme;
      commit({ ...state, settings });
    },

    /** Bytter ut alt, f.eks. ved eksempeldata eller gjenoppretting av en sikkerhetskopi. */
    replaceAll(data) {
      const { state: next, skipped } = sanitizeState(data);
      commit(next);
      return { skipped, count: next.transactions.length + next.movements.length };
    },

    /** Sletter alle data, men beholder innstillingene. */
    clearAll() {
      commit({ ...emptyState(), settings: state.settings });
    },
  };
}
