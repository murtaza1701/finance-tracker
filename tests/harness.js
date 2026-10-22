// A tiny test runner with no dependencies. Test files call test(...) to register
// tests; tests/index.html (in a browser) or tests/cli.js (in a terminal) runs them.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(value, message = 'Expected a truthy value') {
  if (!value) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  if (!deepEqual(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
  }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

function show(value) {
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Runs every registered test and returns [{ name, ok, error }]. */
export async function run() {
  const results = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error?.message ?? String(error) });
    }
  }
  return results;
}
