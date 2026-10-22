// Kontosiden: verdien til én konto, knapper for innskudd/uttak/kjøp/salg, beholdning og alle bevegelser.
import { accountKind, actionLabel, findAccountType, findCoin } from '../accounts.js';
import { mountLineChart } from '../charts.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney, formatPrice, formatQuantity } from '../money.js';
import { MOVEMENT_KINDS, movementsFor, summarizeNetWorth } from '../networth.js';
import { updateLiveValues } from './live.js';
import { historyCard, historyFor } from './networth.js';
import { changeText, emptyState, gainText, liveChip, movementRow, trendClass } from './shared.js';

const backLink = () => html`<a class="back-link" href="#/formue">${icon('arrow-left', { size: 18 })} Formue</a>`;

export function findAccount(ctx) {
  return ctx.state.accounts.find((account) => account.id === ctx.ui.accountId) ?? null;
}

export function renderAccount(ctx) {
  const { state, feed } = ctx;
  const account = findAccount(ctx);
  if (!account) {
    return html`${backLink()}
      <section class="card">
        ${emptyState({
          emoji: '🔍',
          title: 'Fant ikke kontoen',
          text: 'Den kan ha blitt slettet.',
          actions: html`<a class="button button-primary" href="#/formue">Til formuen</a>`,
        })}
      </section>`;
  }

  const currency = state.settings.currency;
  const type = findAccountType(account.type);
  const kind = accountKind(account);
  const row = summarizeNetWorth([account], state.movements, feed.prices()).rows[0];
  const movements = movementsFor(account.id, state.movements).reverse();
  const series = historyFor(ctx, [account]);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });

  return html`
    ${backLink()}
    <header class="page-header">
      <div class="account-title">
        <span class="account-type-icon" aria-hidden="true">${type.icon}</span>
        <div>
          <h1>${account.name}</h1>
          <p class="muted">${[type.name, account.institution].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div class="page-actions">
        <button type="button" class="button button-secondary" id="edit-account" data-action="edit-account" data-id="${account.id}">
          ${icon('pencil', { size: 18 })} Endre
        </button>
      </div>
    </header>

    <section class="card hero">
      <div class="hero-top">
        <p class="hero-label">${kind === 'debt' ? 'Du skylder' : 'Verdi nå'}</p>
        ${kind === 'crypto' ? liveChip(feed) : ''}
      </div>
      <p class="hero-value" data-live-account="${account.id}">${money(row.value)}</p>
      ${row.gain !== null
        ? html`<p class="hero-note">
            Du har satt inn ${money(row.invested)} · avkastning
            <span class="gain ${trendClass(row.gain)}" data-live-gain="${account.id}">${gainText(row.gain, row.gainRatio, currency)}</span>
          </p>`
        : ''}
      ${row.missing.length > 0 ? html`<p class="hero-note">Venter på kurs for ${row.missing.join(', ')} …</p>` : ''}
      <div class="button-row hero-actions">
        ${MOVEMENT_KINDS[kind].map(
          (movementKind, i) => html`<button type="button" class="button ${i === 0 ? 'button-primary' : 'button-secondary'}" id="action-${movementKind}"
            data-action="add-movement" data-account="${account.id}" data-kind="${movementKind}">${actionLabel(movementKind, kind)}</button>`,
        )}
      </div>
    </section>

    ${kind === 'crypto' ? holdingsCard(account, row, feed, currency, money) : ''}

    ${historyCard(ctx, series, {
      title: 'Utvikling',
      subtitle: kind === 'debt' ? 'Gjelden over tid (vist som minus)' : 'Verdien over tid',
      label: kind === 'debt' ? 'Gjeld' : 'Verdi',
      chartId: 'account',
    })}

    <section class="card">
      <header class="card-header">
        <div>
          <h2 class="card-title">Bevegelser</h2>
          <p class="card-subtitle">${movements.length} registrert · nyeste først</p>
        </div>
      </header>
      ${movements.length > 0
        ? html`<ul class="tx-list">${movements.map((m) => movementRow(m, account, currency, { deletable: true }))}</ul>`
        : html`<p class="muted-note">Ingen bevegelser ennå. Bruk knappene over for å registrere den første.</p>`}
    </section>`;
}

export function mountAccount(container, ctx) {
  const account = findAccount(ctx);
  if (!account) return null;
  const cleanups = [];
  const target = container.querySelector('[data-chart="account"]');
  if (target) {
    const label = accountKind(account) === 'debt' ? 'Gjeld' : 'Verdi';
    cleanups.push(mountLineChart(target, historyFor(ctx, [account]), { currency: ctx.state.settings.currency, label }));
  }
  cleanups.push(ctx.feed.subscribe(() => updateLiveValues(container, ctx.state, ctx.feed)));
  if (accountKind(account) === 'crypto') {
    const coins = Object.keys(summarizeNetWorth([account], ctx.state.movements, {}).rows[0].holdings);
    ctx.feed.loadHistory(coins).then((changed) => changed && ctx.rerender());
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

function holdingsCard(account, row, feed, currency, money) {
  const prices = feed.prices();
  const holdings = Object.entries(row.holdings);
  return html`<section class="card">
    <header class="card-header">
      <div>
        <h2 class="card-title">Beholdning</h2>
        <p class="card-subtitle">Antall mynter og hva de er verdt nå</p>
      </div>
    </header>
    ${holdings.length === 0
      ? html`<p class="muted-note">Ingen mynter på kontoen. Trykk «Kjøp» for å legge til.</p>`
      : html`<div class="table-scroll"><table class="data-table holdings-table">
          <caption class="visually-hidden">Beholdning på ${account.name}</caption>
          <thead><tr><th scope="col">Mynt</th><th scope="col">Antall</th><th scope="col">Kurs</th><th scope="col">Verdi</th><th scope="col">24 t</th></tr></thead>
          <tbody>
            ${holdings.map(([symbol, quantity]) => {
              const price = prices[symbol];
              return html`<tr>
                <th scope="row"><span class="coin-badge" aria-hidden="true">${symbol}</span> ${findCoin(symbol)?.name ?? symbol}</th>
                <td>${formatQuantity(quantity)}</td>
                <td data-live-price="${symbol}">${price ? formatPrice(price.price, currency) : '–'}</td>
                <td data-live-holding="${account.id}:${symbol}">${price ? money(Math.round(quantity * price.price * 100)) : '–'}</td>
                <td class="change ${trendClass(price?.change24h)}" data-live-change="${symbol}">${changeText(price?.change24h)}</td>
              </tr>`;
            })}
          </tbody>
        </table></div>`}
  </section>`;
}
