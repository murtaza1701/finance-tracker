import { test, assertEqual } from './harness.js';
import { escapeHtml, html, raw } from '../src/html.js';

test('escapeHtml escapes the five special characters', () => {
  assertEqual(escapeHtml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('html`` escapes values so user text cannot inject markup', () => {
  const note = '<img src=x onerror=alert(1)>';
  assertEqual(String(html`<p>${note}</p>`), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assertEqual(String(html`<input value="${'" autofocus onfocus="alert(1)'}">`), '<input value="&quot; autofocus onfocus=&quot;alert(1)">');
});

test('html`` nests templates and joins lists without double escaping', () => {
  const items = ['a&b', 'c'].map((item) => html`<li>${item}</li>`);
  assertEqual(String(html`<ul>${items}</ul>`), '<ul><li>a&amp;b</li><li>c</li></ul>');
  assertEqual(String(html`<span>${raw('<b>ok</b>')}</span>`), '<span><b>ok</b></span>');
});

test('html`` leaves out null, undefined and false but keeps 0', () => {
  assertEqual(String(html`${null}${undefined}${false}${0}`), '0');
});
