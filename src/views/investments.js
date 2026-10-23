// Aksjer og fond: totalverdi, endring i dag, graf og beholdningen med snittkurs (GAV) og
// avkastning – bygd opp som oversikten hos en aksjemegler.
import { accountsIn, assetName } from '../accounts.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney, formatPrice, formatQuantity } from '../money.js';
import { dayChange, heldAssets, holdingsOverview, summarizeNetWorth } from '../networth.js';
import { historyChart, historyFor, mountHistory } from './history.js';
import { updateLiveValues } from './live.js';
import { accountRows, changeText, emptyState, gainText, liveChip, newAccountButton, pageHeader, stockIcon, trendClass } from './shared.js';

const tradeButtons = html`
  <button type="button" class="button button-buy" data-action="section-move" data-section="investments" data-kind="buy">Kjøp</button>
  <button type="button" class="button button-sell" data-action="section-move" data-section="investments" data-kind="sell">Selg</button>`;

export function renderInvestments(ctx) {
  const { state, feed } = ctx;
  const currency = state.settings.currency;
  const accounts = accountsIn('investments', state.accounts);
  const header = pageHeader('Aksjer og fond', { actions: accounts.length > 0 ? tradeButtons : '' });

  if (accounts.length === 0) {
    return html`${header}
      <section class="card">
        ${emptyState({
          emoji: '📈',
          title: 'Ingen aksjer eller fond ennå',
          text: 'Legg til aksjesparekontoen eller fondene dine. Aksjene får kurser automatisk, og fondsverdien oppdaterer du selv.',
          actions: html`
            <button type="button" class="button button-primary" data-action="add-account" data-type="stocks">${icon('plus', { size: 18 })} Ny aksjekonto</button>
            <button type="button" class="button button-secondary" data-action="add-account" data-type="fund">Nytt fond</button>`,
        })}
      </section>`;
  }

  const prices = feed.prices();
  const summary = summarizeNetWorth(accounts, state.movements, prices);
  const holdings = holdingsOverview(accounts, state.movements, prices);
  const day = dayChange(holdings, summary.total);
  const funds = summary.rows.filter((row) => row.kind === 'investment');
  const stockAccounts = summary.rows.filter((row) => row.kind !== 'investment');
  const series = historyFor(ctx, accounts);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });

  return html`${header}
    <section class="card portfolio">
      <div class="hero-top">
        <p class="hero-label">Totalverdi</p>
        ${holdings.length > 0 ? liveChip(feed) : ''}
      </div>
      <p class="hero-value" data-live-section="investments">${money(summary.total)}</p>
      <dl class="portfolio-stats">
        <div>
          <dt>I dag</dt>
          <dd class="delta-value ${trendClass(day.amount)}" data-live-day="investments">${holdings.length > 0 ? gainText(day.amount, day.ratio, currency) : '–'}</dd>
        </div>
        <div>
          <dt>Avkastning</dt>
          <dd class="delta-value ${trendClass(summary.gain?.amount)}" data-live-sectiongain="investments">${summary.gain ? gainText(summary.gain.amount, summary.gain.ratio, currency) : '–'}</dd>
        </div>
        <div>
          <dt>Satt inn</dt>
          <dd>${money(summary.rows.reduce((sum, row) => sum + row.invested, 0))}</dd>
        </div>
      </dl>
      ${historyChart(ctx, series, { label: 'Aksjer og fond', chartId: 'investments' })}
    </section>

    <section class="card list-card">
      <header class="card-header">
        <div>
          <h2 class="card-title">Aksjer</h2>
          <p class="card-subtitle">Kurser fra Yahoo Finance, ca. 15 minutter forsinket</p>
        </div>
      </header>
      ${holdings.length > 0
        ? holdingsTable(holdings, prices, currency)
        : html`<p class="muted-note">Ingen aksjer ennå. Trykk «Kjøp» for å registrere et kjøp.</p>`}
    </section>

    ${funds.length > 0 ? fundsCard(funds, currency) : ''}

    ${stockAccounts.length > 0
      ? html`<section class="card list-card">
          <header class="card-header">
            <h2 class="card-title">Kontoer</h2>
            ${newAccountButton('stocks')}
          </header>
          ${accountRows(stockAccounts, currency)}
        </section>`
      : ''}`;
}

export function mountInvestments(container, ctx) {
  const accounts = accountsIn('investments', ctx.state.accounts);
  const cleanups = [mountHistory(container, ctx, accounts, { chartId: 'investments', label: 'Aksjer og fond' })];
  cleanups.push(ctx.feed.subscribe(() => updateLiveValues(container, ctx.state, ctx.feed)));
  const assets = heldAssets(accounts, ctx.state.movements);
  if (assets.length > 0) ctx.feed.loadHistory(assets).then((changed) => changed && ctx.rerender());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

/** Beholdningen som en tabell: navn, antall, snittkurs (GAV), siste kurs, i dag, verdi og avkastning. */
function holdingsTable(holdings, prices, currency) {
  const money = (minor) => formatMoney(minor, currency, { whole: true });
  return html`<div class="table-scroll"><table class="data-table holdings">
    <caption class="visually-hidden">Aksjene dine</caption>
    <thead>
      <tr>
        <th scope="col">Navn</th>
        <th scope="col" class="col-optional">Antall</th>
        <th scope="col" class="col-optional">GAV</th>
        <th scope="col" class="col-optional">Siste</th>
        <th scope="col">I dag</th>
        <th scope="col">Verdi</th>
        <th scope="col" class="col-optional">Avkastning</th>
      </tr>
    </thead>
    <tbody>
      ${holdings.map(
        (h) => html`<tr>
          <th scope="row">
            <a class="holding-link" href="#/konto?id=${h.accountIds[0]}">
              ${stockIcon(h.asset)}
              <span class="holding-text">
                <span class="holding-title">${assetName('stocks', h.asset, prices)}</span>
                <span class="holding-meta">${h.asset}<span class="mobile-only"> · ${formatQuantity(h.quantity)} stk</span></span>
              </span>
            </a>
          </th>
          <td class="col-optional">${formatQuantity(h.quantity)}</td>
          <td class="col-optional">${formatPrice(h.averagePrice, currency)}</td>
          <td class="col-optional" data-live-price="${h.key}">${h.price === null ? '–' : formatPrice(h.price, currency)}</td>
          <td class="change ${trendClass(h.change24h)}" data-live-change="${h.key}">${changeText(h.change24h)}</td>
          <td>
            <span class="holding-value" data-live-hvalue="${h.key}">${h.value === null ? '–' : money(h.value)}</span>
            <span class="mobile-only gain ${trendClass(h.gain)}" data-live-hgain="${h.key}" data-short>${h.gain === null ? '' : gainText(h.gain, null, currency)}</span>
          </td>
          <td class="col-optional gain ${trendClass(h.gain)}" data-live-hgain="${h.key}">${h.gain === null ? '–' : gainText(h.gain, h.gainRatio, currency)}</td>
        </tr>`,
      )}
    </tbody>
  </table></div>`;
}

function fundsCard(funds, currency) {
  return html`<section class="card list-card">
    <header class="card-header">
      <div>
        <h2 class="card-title">Fond</h2>
        <p class="card-subtitle">Én kurs per dag – oppdater verdien fra megleren din</p>
      </div>
      ${newAccountButton('fund', 'Nytt fond')}
    </header>
    <ul class="plain-list">
      ${funds.map(
        (row) => html`<li class="fund-row">
          <a class="fund-main" href="#/konto?id=${row.account.id}">
            <span class="account-name">${row.account.name}</span>
            <span class="account-sub">${row.account.institution || 'Fond'}</span>
          </a>
          <span class="account-figures">
            <strong>${formatMoney(row.value, currency, { whole: true })}</strong>
            <span class="gain ${trendClass(row.gain)}">${gainText(row.gain, row.gainRatio, currency)}</span>
          </span>
          <button type="button" class="button button-small button-secondary" data-action="add-movement"
            data-account="${row.account.id}" data-kind="value">Ny verdi</button>
        </li>`,
      )}
    </ul>
  </section>`;
}
