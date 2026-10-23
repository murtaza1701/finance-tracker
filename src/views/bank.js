// Bank: kontoene med saldo, lån og siste bevegelser – bygd opp som en nettbank.
// Forbruk, transaksjoner og budsjett ligger som faner under Bank.
import { accountsIn } from '../accounts.js';
import { dayLabel } from '../dates.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { byDate, summarizeNetWorth } from '../networth.js';
import { accountRows, bankTabs, emptyState, movementRow, newAccountButton, pageHeader, quickAction } from './shared.js';

export function renderBank({ state, today }) {
  const currency = state.settings.currency;
  const accounts = accountsIn('bank', state.accounts);
  const header = html`${pageHeader('Bank', { actions: newAccountButton('bank') })}${bankTabs('bank')}`;

  if (accounts.length === 0) {
    return html`${header}
      <section class="card">
        ${emptyState({
          emoji: '🏦',
          title: 'Ingen bankkontoer ennå',
          text: 'Legg til brukskonto, sparekonto, BSU eller lån, så ser du saldoene her.',
          actions: html`<button type="button" class="button button-primary" data-action="add-account" data-type="bank">${icon('plus', { size: 18 })} Legg til bankkonto</button>`,
        })}
      </section>`;
  }

  const { rows } = summarizeNetWorth(accounts, state.movements, {});
  const accountRowsOnly = rows.filter((row) => row.kind !== 'debt');
  const loans = rows.filter((row) => row.kind === 'debt');
  const available = accountRowsOnly.reduce((sum, row) => sum + row.value, 0);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const recent = state.movements
    .filter((m) => byId.has(m.accountId))
    .sort(byDate)
    .reverse()
    .slice(0, 10);
  const days = [];
  for (const m of recent) {
    if (days.at(-1)?.date !== m.date) days.push({ date: m.date, items: [] });
    days.at(-1).items.push(m);
  }

  return html`${header}
    <section class="card bank-summary">
      <p class="hero-label">Totalt på kontoene</p>
      <p class="summary-value">${formatMoney(available, currency, { decimals: true })}</p>
      <div class="quick-actions">
        ${quickAction('swap', 'Overfør', { action: 'transfer' })}
        ${quickAction('plus', 'Sett inn', { action: 'section-move', data: { section: 'bank', kind: 'deposit' } })}
        ${quickAction('minus', 'Ta ut', { action: 'section-move', data: { section: 'bank', kind: 'withdrawal' } })}
        ${quickAction('pencil', 'Ny saldo', { action: 'section-move', data: { section: 'bank', kind: 'value' } })}
      </div>
    </section>

    ${accountRowsOnly.length > 0
      ? html`<section class="card list-card">
          <h2 class="card-title">Kontoer</h2>
          ${accountRows(accountRowsOnly, currency, { decimals: true })}
        </section>`
      : ''}

    ${loans.length > 0
      ? html`<section class="card list-card">
          <h2 class="card-title">Lån</h2>
          ${accountRows(loans, currency, { decimals: true })}
        </section>`
      : ''}

    <section class="card list-card">
      <h2 class="card-title">Siste bevegelser</h2>
      ${days.length > 0
        ? days.map(
            (day) => html`<div class="day-group">
              <h3 class="day-header"><span>${dayLabel(day.date, today)}</span></h3>
              <ul class="tx-list">${day.items.map((m) => movementRow(m, byId.get(m.accountId), currency, { showAccount: true, showDate: false }))}</ul>
            </div>`,
          )
        : html`<p class="muted-note">Ingen bevegelser ennå.</p>`}
    </section>`;
}
