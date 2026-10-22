// Runs the unit tests in a terminal with the JavaScript engine that ships with macOS:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/cli.js
// (Anywhere else, open tests/index.html through the local server instead.)
import { run } from './harness.js';
import './all.js';

const results = await run();
for (const result of results) {
  print(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.ok ? '' : `\n        ${result.error}`}`);
}
const failed = results.filter((result) => !result.ok).length;
print(`\n${results.length - failed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
