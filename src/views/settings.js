// Settings page: display options, backups and demo data.
import { html } from '../html.js';
import { icon } from '../icons.js';
import { CURRENCIES } from '../money.js';
import { pageHeader } from './shared.js';

const THEME_LABELS = { system: 'Match my device', light: 'Light', dark: 'Dark' };

export function renderSettings({ state }) {
  const { settings, transactions, budgets } = state;
  const budgetCount = Object.keys(budgets).length;
  const isEmpty = transactions.length === 0 && budgetCount === 0;

  return html`
    ${pageHeader('Settings')}
    <div class="stack">
      <section class="card">
        <h2 class="card-title">Display</h2>
        <div class="settings-grid">
          <div class="field">
            <label for="setting-currency">Currency</label>
            <select class="input" id="setting-currency" data-setting="currency">
              ${CURRENCIES.map((code) => html`<option value="${code}" ${code === settings.currency ? 'selected' : ''}>${code}</option>`)}
            </select>
            <p class="field-hint">Only changes how amounts are shown – nothing is converted.</p>
          </div>
          <div class="field">
            <label for="setting-theme">Appearance</label>
            <select class="input" id="setting-theme" data-setting="theme">
              ${Object.entries(THEME_LABELS).map(([value, label]) => html`<option value="${value}" ${value === settings.theme ? 'selected' : ''}>${label}</option>`)}
            </select>
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Your data</h2>
        <p class="settings-text">
          ${icon('lock', { size: 18 })}
          <span>
            Everything is stored in this browser only – nothing is uploaded anywhere. You have
            <strong>${transactions.length} transactions</strong> and <strong>${budgetCount} budgets</strong>.
            Clearing your browsing data deletes them, so download a backup now and then.
          </span>
        </p>
        <div class="button-row">
          <button type="button" class="button button-secondary" data-action="export-backup" ${isEmpty ? 'disabled' : ''}>${icon('download', { size: 18 })} Download backup</button>
          <button type="button" class="button button-secondary" data-action="import-backup">${icon('upload', { size: 18 })} Restore backup</button>
          <button type="button" class="button button-secondary" data-action="export-csv" ${transactions.length ? '' : 'disabled'}>${icon('table', { size: 18 })} Export CSV</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Demo data</h2>
        <p class="settings-text">
          <span>Fill the app with six months of realistic sample data for a student in Norway – handy for trying it out.
          This replaces your current data, but you can undo it straight after.</span>
        </p>
        <div class="button-row">
          <button type="button" class="button button-secondary" data-action="load-demo">Load demo data</button>
        </div>
      </section>

      <section class="card danger-zone">
        <h2 class="card-title">Delete all data</h2>
        <p class="settings-text"><span>Removes every transaction and budget from this browser. Your settings are kept.</span></p>
        <div class="button-row">
          <button type="button" class="button button-danger" data-action="clear-data" ${isEmpty ? 'disabled' : ''}>${icon('trash', { size: 18 })} Delete all data</button>
        </div>
      </section>

      <p class="about">Pengeflyt 1.0 · A prototype made with AI assistance for the Intro to AI course.
        Keyboard shortcuts: <kbd>N</kbd> new transaction, <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> undo.</p>
    </div>`;
}
