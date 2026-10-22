// Innstillinger: visning, sikkerhetskopi og eksempeldata.
import { html } from '../html.js';
import { icon } from '../icons.js';
import { CURRENCIES } from '../money.js';
import { pageHeader } from './shared.js';

const THEME_LABELS = { system: 'Følg enheten', light: 'Lyst', dark: 'Mørkt' };

export function renderSettings({ state }) {
  const { settings, transactions, budgets, accounts, movements } = state;
  const budgetCount = Object.keys(budgets).length;
  const isEmpty = transactions.length === 0 && budgetCount === 0 && accounts.length === 0;

  return html`
    ${pageHeader('Innstillinger')}
    <div class="stack">
      <section class="card">
        <h2 class="card-title">Visning</h2>
        <div class="settings-grid">
          <div class="field">
            <label for="setting-currency">Valuta</label>
            <select class="input" id="setting-currency" data-setting="currency">
              ${CURRENCIES.map((code) => html`<option value="${code}" ${code === settings.currency ? 'selected' : ''}>${code}</option>`)}
            </select>
            <p class="field-hint">Beløpene du har registrert, regnes ikke om. Kryptokursene hentes i valutaen du velger.</p>
          </div>
          <div class="field">
            <label for="setting-theme">Utseende</label>
            <select class="input" id="setting-theme" data-setting="theme">
              ${Object.entries(THEME_LABELS).map(([value, label]) => html`<option value="${value}" ${value === settings.theme ? 'selected' : ''}>${label}</option>`)}
            </select>
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Dataene dine</h2>
        <p class="settings-text">
          ${icon('lock', { size: 18 })}
          <span>
            Alt lagres bare i denne nettleseren – ingenting lastes opp. Du har
            <strong>${accounts.length} kontoer</strong> med <strong>${movements.length} bevegelser</strong>,
            <strong>${transactions.length} transaksjoner</strong> og <strong>${budgetCount} budsjetter</strong>.
            Sletter du nettleserdataene, forsvinner de, så last ned en sikkerhetskopi av og til.
          </span>
        </p>
        <div class="button-row">
          <button type="button" class="button button-secondary" data-action="export-backup" ${isEmpty ? 'disabled' : ''}>${icon('download', { size: 18 })} Last ned sikkerhetskopi</button>
          <button type="button" class="button button-secondary" data-action="import-backup">${icon('upload', { size: 18 })} Gjenopprett sikkerhetskopi</button>
          <button type="button" class="button button-secondary" data-action="export-csv" ${transactions.length ? '' : 'disabled'}>${icon('table', { size: 18 })} Eksporter transaksjoner (CSV)</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Kryptokurser</h2>
        <p class="settings-text">
          ${icon('bars', { size: 18 })}
          <span>
            Kursene hentes fra Binance (i sanntid) og CoinGecko, uten innlogging. Appen spør bare om kurser for
            myntene du eier – hvor mye du har, sendes aldri noe sted.
          </span>
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Eksempeldata</h2>
        <p class="settings-text">
          <span>Fyll appen med realistiske data for en student i Norge: et år med kontoer og bevegelser og seks måneder
          med forbruk. Det erstatter dataene dine, men du kan angre rett etterpå.</span>
        </p>
        <div class="button-row">
          <button type="button" class="button button-secondary" data-action="load-demo">Last inn eksempeldata</button>
        </div>
      </section>

      <section class="card danger-zone">
        <h2 class="card-title">Slett alle data</h2>
        <p class="settings-text"><span>Fjerner alle kontoer, bevegelser, transaksjoner og budsjetter fra denne nettleseren. Innstillingene beholdes.</span></p>
        <div class="button-row">
          <button type="button" class="button button-danger" data-action="clear-data" ${isEmpty ? 'disabled' : ''}>${icon('trash', { size: 18 })} Slett alle data</button>
        </div>
      </section>

      <p class="about">Pengeflyt 2.0 · En prototype laget med hjelp fra KI i emnet Intro til KI.
        Hurtigtaster: <kbd>N</kbd> ny registrering, <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> angre.</p>
    </div>`;
}
