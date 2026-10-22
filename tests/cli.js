// Kjører enhetstestene i terminalen med JavaScript-motoren som følger med macOS:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/cli.js
// (Andre steder: åpne tests/index.html via den lokale serveren i stedet.)
import { run } from './harness.js';
import './all.js';

const results = await run();
for (const result of results) {
  print(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.ok ? '' : `\n        ${result.error}`}`);
}
const failed = results.filter((result) => !result.ok).length;
print(`\n${results.length - failed} bestått, ${failed} feilet`);
if (failed > 0) throw new Error(`${failed} test(er) feilet`);
