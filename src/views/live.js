// Oppdaterer tallene på siden når kursene endrer seg, uten å tegne hele siden på nytt
// (da ville åpne nedtrekkslister lukkes og verktøytips forsvinne hvert sekund).
// Elementer merkes med data-live-* i markupen; endrede tall blinker kort grønt eller rødt.
import { accountsIn, isMarketKind, priceKey } from '../accounts.js';
import { formatMoney, formatPrice } from '../money.js';
import { dayChange, hasPrices, holdingsOverview, summarizeNetWorth } from '../networth.js';
import { changeText, gainText, liveStatus, trendClass } from './shared.js';

function setLive(element, text, value = null) {
  if (!element || element.textContent === text) return;
  const previous = Number(element.dataset.value);
  element.textContent = text;
  if (value === null) return;
  element.dataset.value = value;
  if (Number.isFinite(previous) && previous !== value) {
    element.classList.remove('flash-up', 'flash-down');
    void element.offsetWidth; // start animasjonen på nytt
    element.classList.add(value > previous ? 'flash-up' : 'flash-down');
  }
}

function setTrend(element, value) {
  if (!element) return;
  element.classList.remove('is-up', 'is-down');
  const trend = trendClass(value);
  if (trend) element.classList.add(trend);
}

export function updateLiveValues(container, state, feed) {
  const currency = state.settings.currency;
  const prices = feed.prices();
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });
  const find = (selector) => container.querySelector(selector);
  const findAll = (selector) => container.querySelectorAll(selector);

  // Hele formuen (oversikten)
  const totalElement = find('[data-live="total"]');
  if (totalElement) {
    const { total } = summarizeNetWorth(state.accounts, state.movements, prices);
    setLive(totalElement, money(total), total);
  }

  // Aksjer og fond, og krypto: totalverdi, endring i dag og avkastning
  for (const section of ['investments', 'crypto']) {
    if (!find(`[data-live-section="${section}"]`)) continue;
    const accounts = accountsIn(section, state.accounts);
    const summary = summarizeNetWorth(accounts, state.movements, prices);
    const holdings = holdingsOverview(accounts, state.movements, prices);
    const day = dayChange(holdings, summary.total);
    setLive(find(`[data-live-section="${section}"]`), money(summary.total), summary.total);
    // Uten aksjer eller mynter med kurs (bare fond, eller kursene lastes) står "I dag" som "–", som når siden tegnes.
    if (hasPrices(holdings)) {
      const dayElement = find(`[data-live-day="${section}"]`);
      setLive(dayElement, gainText(day.amount, day.ratio, currency));
      setTrend(dayElement, day.amount);
    }
    const gainElement = find(`[data-live-sectiongain="${section}"]`);
    if (summary.gain) {
      setLive(gainElement, gainText(summary.gain.amount, summary.gain.ratio, currency));
      setTrend(gainElement, summary.gain.amount);
    }
  }

  // Hver aksje og mynt, samlet på tvers av kontoer
  for (const holding of holdingsOverview(state.accounts, state.movements, prices)) {
    const key = CSS.escape(holding.key);
    if (holding.value !== null) {
      for (const element of findAll(`[data-live-hvalue="${key}"]`)) setLive(element, money(holding.value), holding.value);
    }
    if (holding.gain !== null) {
      for (const element of findAll(`[data-live-hgain="${key}"]`)) {
        // data-short: bare kronebeløpet (på mobil, der det er trangt)
        setLive(element, gainText(holding.gain, 'short' in element.dataset ? null : holding.gainRatio, currency));
        setTrend(element, holding.gain);
      }
    }
  }

  // Kontoer med kurser (lister og kontosiden)
  for (const row of summarizeNetWorth(state.accounts, state.movements, prices).rows) {
    if (!isMarketKind(row.kind)) continue; // bare krypto og aksjer endrer seg med kursene
    const id = CSS.escape(row.account.id);
    for (const element of findAll(`[data-live-account="${id}"]`)) setLive(element, money(row.value), row.value);
    if (row.gain !== null) {
      for (const element of findAll(`[data-live-gain="${id}"]`)) {
        setLive(element, gainText(row.gain, row.gainRatio, currency));
        setTrend(element, row.gain);
      }
    }
    for (const [symbol, quantity] of Object.entries(row.holdings)) {
      const price = prices[priceKey(row.kind, symbol)]?.price;
      if (typeof price !== 'number') continue;
      const value = Math.round(quantity * price * 100);
      setLive(find(`[data-live-holding="${id}:${CSS.escape(symbol)}"]`), money(value), value);
    }
  }

  for (const element of findAll('[data-live-price]')) {
    const price = prices[element.dataset.livePrice];
    if (price) setLive(element, formatPrice(price.price, currency), price.price);
  }
  for (const element of findAll('[data-live-change]')) {
    const change = prices[element.dataset.liveChange]?.change24h;
    setLive(element, changeText(change));
    setTrend(element, change);
  }

  const { status, text, title } = liveStatus(feed);
  for (const chip of findAll('[data-live-status]')) {
    chip.className = `live-chip live-${status}`;
    chip.title = title;
    setLive(chip.querySelector('[data-live-status-text]'), text);
  }
}
