// Grafer og andre små datavisninger. Fargene kommer fra CSS-variabler (se styles.css),
// så både lyst og mørkt tema fungerer.
import { getCategory } from './categories.js';
import { dateLabel, monthLabel } from './dates.js';
import { escapeHtml, html } from './html.js';
import { icon } from './icons.js';
import { formatCompact, formatMoney } from './money.js';

const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const shortMonth = (month) => monthLabel(month, { short: true }).replace(/\.$/, '');

/** Fin inndeling av en akse fra `min` til `max` (steg på 1, 2, 2,5 eller 5 × 10ⁿ). Tåler negative tall. */
export function niceRange(min, max, tickCount = 4) {
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (high === low) {
    // flat linje: gi den litt luft over og under
    const pad = Math.max(Math.abs(high) * 0.1, 100_000);
    low -= pad;
    high += pad;
  }
  const rough = (high - low) / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks = [];
  for (let i = 0; start + i * step <= end + step / 2; i++) ticks.push(start + i * step);
  return { min: start, max: end, step, ticks };
}

/** Akse fra 0 og opp (stolpediagram). */
export function niceScale(maxValue, tickCount = 4) {
  const { max, step, ticks } = niceRange(0, maxValue > 0 ? maxValue : 100_000, tickCount);
  return { max, step, ticks };
}

/** SVG-sti for en søyle med runde hjørner på toppen og rett bunn. */
function columnPath(x, y, width, height, radius = 4) {
  const r = Math.min(radius, width / 2, height);
  return (
    `M${round(x)},${round(y + height)}V${round(y + r)}A${r},${r} 0 0 1 ${round(x + r)},${round(y)}` +
    `H${round(x + width - r)}A${r},${r} 0 0 1 ${round(x + width)},${round(y + r)}V${round(y + height)}Z`
  );
}

/** Liggende søyler med forbruk per kategori; hver søyle lenker til transaksjonene. */
export function categoryBars(rows, { currency, month }) {
  const largest = Math.max(1, ...rows.map((row) => row.amount));
  return html`<ol class="cat-bars">
    ${rows.map((row) => {
      const category = getCategory(row.category);
      const width = (row.amount / largest) * 100;
      return html`<li>
        <a class="cat-bar" href="#/transaksjoner?month=${month}&amp;category=${row.category}" title="Vis transaksjoner for ${category.name}">
          <span class="cat-bar-label"><span class="cat-icon" aria-hidden="true">${category.icon}</span>${category.name}</span>
          <span class="cat-bar-value"><strong>${formatMoney(row.amount, currency, { whole: true })}</strong><span class="cat-bar-share">${Math.round(row.share * 100)} %</span></span>
          <span class="cat-bar-track" aria-hidden="true"><span class="cat-bar-fill" style="width: ${width.toFixed(1)}%"></span></span>
        </a>
      </li>`;
    })}
  </ol>`;
}

/** Fremdriftslinje for et budsjett. `pace` (0–1) tegner en strek for dagens dato. */
export function budgetMeter({ spent, limit, level }, { label, currency, pace = null }) {
  const percent = Math.round((spent / limit) * 100);
  return html`<div class="meter meter-${level}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${Math.min(percent, 100)}"
      aria-valuetext="${formatMoney(spent, currency, { whole: true })} av ${formatMoney(limit, currency, { whole: true })} (${percent} %)">
    <span class="meter-fill" style="width: ${Math.min(percent, 100)}%"></span>
    ${pace === null ? '' : html`<span class="meter-pace" style="left: ${(pace * 100).toFixed(1)}%" title="I dag"></span>`}
  </div>`;
}

const STATUS = {
  ok: ['check', 'I rute'],
  warning: ['warning', 'Nær grensen'],
  over: ['over', 'Over budsjett'],
};

/** Budsjettstatus: alltid ikon og ord, aldri bare farge. */
export function statusBadge(level) {
  const [iconName, label] = STATUS[level];
  return html`<span class="status status-${level}">${icon(iconName, { size: 16 })}${label}</span>`;
}

/** Tabellversjonen av inntekter/utgifter-grafen (for skjermlesere og nøyaktige tall). */
export function seriesTable(series, currency) {
  return html`<div class="table-scroll"><table class="data-table">
    <caption class="visually-hidden">Inntekter og utgifter per måned</caption>
    <thead><tr><th scope="col">Måned</th><th scope="col">Inntekter</th><th scope="col">Utgifter</th><th scope="col">Netto</th></tr></thead>
    <tbody>
      ${series.map(
        (d) => html`<tr>
          <th scope="row">${monthLabel(d.month)}</th>
          <td>${formatMoney(d.income, currency, { whole: true })}</td>
          <td>${formatMoney(d.expense, currency, { whole: true })}</td>
          <td>${formatMoney(d.net, currency, { sign: true, whole: true })}</td>
        </tr>`,
      )}
    </tbody>
  </table></div>`;
}

/** Tabellversjonen av en linjegraf: verdien ved slutten av hver måned. */
export function historyTable(points, currency, { label = 'Verdi' } = {}) {
  const months = new Map();
  for (const point of points) months.set(point.date.slice(0, 7), point);
  const rows = [...months.values()].reverse();
  return html`<div class="table-scroll"><table class="data-table">
    <caption class="visually-hidden">${label} ved slutten av hver måned</caption>
    <thead><tr><th scope="col">Dato</th><th scope="col">${label}</th></tr></thead>
    <tbody>
      ${rows.map((point) => html`<tr><th scope="row">${dateLabel(point.date)}</th><td>${formatMoney(point.value, currency, { whole: true })}</td></tr>`)}
    </tbody>
  </table></div>`;
}

/** Legger verktøytipset til høyre for det som pekes på hvis det er plass, ellers til venstre. */
function placeTooltip(tooltip, { left, right }, width, top) {
  const tipWidth = tooltip.offsetWidth;
  let x = right + 6;
  if (x + tipWidth > width) x = left - tipWidth - 6;
  tooltip.style.transform = `translate(${Math.round(clamp(x, 0, Math.max(0, width - tipWidth)))}px, ${top}px)`;
}

/**
 * Tegner søyler (inntekter og utgifter per måned) som SVG i `container`, i full bredde og
 * på nytt når bredden endres. Pek eller fokuser på en måned for nøyaktige tall.
 * Gir en opprydningsfunksjon.
 */
export function mountIncomeExpenseChart(container, series, { currency, selectedMonth }) {
  container.innerHTML = '<div class="chart-plot"></div><div class="chart-tooltip" aria-hidden="true" hidden></div>';
  const plot = container.querySelector('.chart-plot');
  const tooltip = container.querySelector('.chart-tooltip');
  let layout = null;

  function draw() {
    const width = Math.max(280, Math.floor(plot.clientWidth));
    const height = 240;
    const margin = { top: 12, right: 4, bottom: 28, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const { max, ticks } = niceScale(Math.max(...series.map((d) => Math.max(d.income, d.expense))));
    const base = Math.round(margin.top + plotHeight);
    const y = (value) => base - (value / max) * plotHeight;
    const band = plotWidth / series.length;
    const barWidth = Math.max(6, Math.min(24, (band * 0.62 - 2) / 2));
    layout = { width, margin, band };

    const parts = [];
    series.forEach((_, i) => {
      parts.push(`<rect class="band" data-index="${i}" x="${round(margin.left + band * i)}" y="${margin.top}" width="${round(band)}" height="${base - margin.top}"/>`);
    });
    for (const tick of ticks) {
      const ty = Math.round(y(tick)) + 0.5;
      if (tick > 0) parts.push(`<line class="gridline" x1="${margin.left}" x2="${width - margin.right}" y1="${ty}" y2="${ty}"/>`);
      parts.push(`<text class="tick" x="${margin.left - 8}" y="${ty}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatCompact(tick))}</text>`);
    }
    series.forEach((d, i) => {
      const center = margin.left + band * i + band / 2;
      // to søyler per måned med 2px mellomrom
      if (d.income > 0) parts.push(`<path class="bar bar-income" d="${columnPath(center - 1 - barWidth, y(d.income), barWidth, base - y(d.income))}"/>`);
      if (d.expense > 0) parts.push(`<path class="bar bar-expense" d="${columnPath(center + 1, y(d.expense), barWidth, base - y(d.expense))}"/>`);
      const selected = d.month === selectedMonth ? ' is-selected' : '';
      parts.push(`<text class="tick x-tick${selected}" x="${round(center)}" y="${height - 8}" text-anchor="middle">${escapeHtml(shortMonth(d.month))}</text>`);
    });
    parts.push(`<line class="baseline" x1="${margin.left}" x2="${width - margin.right}" y1="${base + 0.5}" y2="${base + 0.5}"/>`);
    series.forEach((d, i) => {
      // Usynlige treffområder, en hel måned brede, så pekeren ikke må treffe en tynn søyle.
      const label = `${monthLabel(d.month)}: inntekter ${formatMoney(d.income, currency, { whole: true })}, utgifter ${formatMoney(d.expense, currency, { whole: true })}`;
      parts.push(`<rect class="hit" tabindex="0" role="img" aria-label="${escapeHtml(label)}" data-index="${i}" x="${round(margin.left + band * i)}" y="0" width="${round(band)}" height="${height}"/>`);
    });
    plot.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Inntekter og utgifter per måned">${parts.join('')}</svg>`;
  }

  function show(index) {
    const d = series[index];
    tooltip.innerHTML = String(html`
      <p class="tooltip-title">${monthLabel(d.month)}</p>
      <p class="tooltip-row"><span class="tooltip-key key-income"></span><strong>${formatMoney(d.income, currency, { whole: true })}</strong><span>Inntekter</span></p>
      <p class="tooltip-row"><span class="tooltip-key key-expense"></span><strong>${formatMoney(d.expense, currency, { whole: true })}</strong><span>Utgifter</span></p>
      <p class="tooltip-row tooltip-net"><span class="tooltip-key"></span><strong>${formatMoney(d.net, currency, { sign: true, whole: true })}</strong><span>Netto</span></p>`);
    tooltip.hidden = false;
    const { width, margin, band } = layout;
    placeTooltip(tooltip, { left: margin.left + band * index, right: margin.left + band * (index + 1) }, width, margin.top);
    for (const el of plot.querySelectorAll('.band')) el.classList.toggle('is-active', Number(el.dataset.index) === index);
  }

  function hide() {
    tooltip.hidden = true;
    for (const el of plot.querySelectorAll('.band.is-active')) el.classList.remove('is-active');
  }

  const indexFrom = (event) => {
    const hit = event.target.closest?.('.hit');
    return hit ? Number(hit.dataset.index) : null;
  };
  container.addEventListener('pointerover', (event) => {
    const index = indexFrom(event);
    if (index !== null) show(index);
  });
  container.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') hide(); // på mobil blir verktøytipset stående til neste trykk
  });
  container.addEventListener('focusin', (event) => {
    const index = indexFrom(event);
    if (index !== null) show(index);
  });
  container.addEventListener('focusout', hide);

  return observeWidth(plot, draw, hide);
}

/** Tegner på nytt når bredden endres. Gir en opprydningsfunksjon. */
function observeWidth(plot, draw, beforeRedraw) {
  draw();
  let lastWidth = plot.clientWidth;
  const observer = new ResizeObserver(() => {
    if (plot.clientWidth === lastWidth) return;
    lastWidth = plot.clientWidth;
    beforeRedraw();
    draw();
  });
  observer.observe(plot);
  return () => observer.disconnect();
}

/** Hvilke datoer som får en etikett under x-aksen. */
function xLabels(points, maxLabels) {
  if (points.length <= 45) {
    const step = Math.max(1, Math.ceil(points.length / maxLabels));
    const labels = [];
    for (let i = 0; i < points.length; i += step) labels.push([i, dateLabel(points[i].date, { year: false })]);
    return labels;
  }
  const monthStarts = points.map((point, i) => [i, point.date]).filter(([, date]) => date.endsWith('-01'));
  const step = Math.max(1, Math.ceil(monthStarts.length / maxLabels));
  return monthStarts.filter((_, i) => i % step === 0).map(([i, date]) => [i, shortMonth(date.slice(0, 7))]);
}

/**
 * Tegner én linje med en svak flate under (f.eks. formuen over tid) med trådkors og
 * verktøytips. points: [{ date, value }] i øre. Piltastene flytter trådkorset.
 * Gir en opprydningsfunksjon.
 */
export function mountLineChart(container, points, { currency, label }) {
  container.innerHTML = '<div class="chart-plot"></div><div class="chart-tooltip" aria-hidden="true" hidden></div>';
  const plot = container.querySelector('.chart-plot');
  const tooltip = container.querySelector('.chart-tooltip');
  let layout = null;
  let active = null;

  function draw() {
    const width = Math.max(280, Math.floor(plot.clientWidth));
    const height = 220;
    const margin = { top: 14, right: 16, bottom: 28, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = points.map((point) => point.value);
    const { min, max, ticks } = niceRange(Math.min(...values), Math.max(...values));
    const last = points.length - 1;
    const x = (i) => margin.left + (last === 0 ? plotWidth : (i / last) * plotWidth);
    const y = (value) => margin.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
    layout = { width, margin, plotWidth, x, y };

    const parts = [];
    for (const tick of ticks) {
      const ty = Math.round(y(tick)) + 0.5;
      const kind = tick === 0 || tick === min ? 'baseline' : 'gridline';
      parts.push(`<line class="${kind}" x1="${margin.left}" x2="${width - margin.right}" y1="${ty}" y2="${ty}"/>`);
      parts.push(`<text class="tick" x="${margin.left - 8}" y="${ty}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatCompact(tick))}</text>`);
    }
    for (const [i, text] of xLabels(points, Math.max(2, Math.floor(plotWidth / 72)))) {
      parts.push(`<text class="tick x-tick" x="${round(x(i))}" y="${height - 8}" text-anchor="middle">${escapeHtml(text)}</text>`);
    }
    const line = points.map((point, i) => `${i ? 'L' : 'M'}${round(x(i))},${round(y(point.value))}`).join('');
    const bottom = round(y(min));
    parts.push(`<path class="area" d="${line}L${round(x(last))},${bottom}L${round(x(0))},${bottom}Z"/>`);
    parts.push(`<path class="line" d="${line}"/>`);
    parts.push(`<circle class="end-dot" cx="${round(x(last))}" cy="${round(y(points[last].value))}" r="4"/>`);
    parts.push(
      `<g class="crosshair"><line class="crosshair-line" y1="${margin.top}" y2="${margin.top + plotHeight}"/>` +
        '<circle class="crosshair-dot" r="4"/></g>',
    );
    const first = points[0];
    const summary = `${label} fra ${dateLabel(first.date)} til ${dateLabel(points[last].date)}: fra ${formatMoney(first.value, currency, { whole: true })} til ${formatMoney(points[last].value, currency, { whole: true })}. Bruk piltastene for å se enkeltdager.`;
    parts.push(`<rect class="hit" tabindex="0" role="img" aria-label="${escapeHtml(summary)}" x="${margin.left}" y="0" width="${plotWidth}" height="${height}"/>`);
    plot.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
  }

  function show(index) {
    active = clamp(index, 0, points.length - 1);
    const point = points[active];
    const cx = round(layout.x(active));
    const cy = round(layout.y(point.value));
    const crosshair = plot.querySelector('.crosshair');
    crosshair.classList.add('is-visible');
    crosshair.querySelector('line').setAttribute('x1', cx);
    crosshair.querySelector('line').setAttribute('x2', cx);
    crosshair.querySelector('circle').setAttribute('cx', cx);
    crosshair.querySelector('circle').setAttribute('cy', cy);
    tooltip.innerHTML = String(html`<p class="tooltip-title">${dateLabel(point.date)}</p>
      <p class="tooltip-row"><span class="tooltip-key key-line"></span><strong>${formatMoney(point.value, currency, { whole: true })}</strong><span>${label}</span></p>`);
    tooltip.hidden = false;
    placeTooltip(tooltip, { left: cx - 6, right: cx + 6 }, layout.width, layout.margin.top);
  }

  function hide() {
    tooltip.hidden = true;
    plot.querySelector('.crosshair')?.classList.remove('is-visible');
  }

  const indexAt = (clientX) => {
    const left = plot.getBoundingClientRect().left + layout.margin.left;
    return Math.round(((clientX - left) / layout.plotWidth) * (points.length - 1));
  };
  container.addEventListener('pointermove', (event) => {
    if (event.target.closest?.('.hit')) show(indexAt(event.clientX));
  });
  container.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('.hit')) show(indexAt(event.clientX));
  });
  container.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') hide();
  });
  container.addEventListener('focusin', () => show(active ?? points.length - 1));
  container.addEventListener('focusout', hide);
  container.addEventListener('keydown', (event) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1, PageDown: -7, PageUp: 7 };
    if (event.key in keys) show((active ?? points.length - 1) + keys[event.key]);
    else if (event.key === 'Home') show(0);
    else if (event.key === 'End') show(points.length - 1);
    else return;
    event.preventDefault();
  });

  return observeWidth(plot, draw, hide);
}
