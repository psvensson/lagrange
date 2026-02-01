/**
 * Tap runner shim for this repo's test harness.
 *
 * In this environment, tap's IPC/child-runner output can be flaky (tap ends up
 * reporting "no tests found"). Make test output deterministic by:
 * - disabling tap's IPC mode (clear TAP_CHILD_* env vars + process.send)
 * - forcing stdout/stderr writes to go directly to the underlying file
 *   descriptors
 *
 * This module must live outside `test/` so tap does not execute it as a test.
 */

import fs from 'node:fs';

// tap exits non-zero on incomplete coverage by default. Our repo uses coverage
// as a signal (reporting), but not as a hard gate in `npm test`.
if (!process.env.TAP_ALLOW_INCOMPLETE_COVERAGE) {
  process.env.TAP_ALLOW_INCOMPLETE_COVERAGE = '1';
}

if (process.env.TAP_CHILD_ID) {
  delete process.env.TAP_CHILD_ID;
  delete process.env.TAP_CHILD_KEY;
  delete process.env.TAP_JOB_ID;
  delete process.env.TAP_BAIL;
}

if (typeof process.send === 'function') {
  process.send = undefined;

  process.disconnect = undefined;
}

const rawWrite = (fd) => (chunk, encoding, cb) => {
  let enc = encoding;
  let callback = cb;
  if (typeof enc === 'function') {
    callback = enc;
    enc = undefined;
  }
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), enc || 'utf8');
  try {
    fs.writeSync(fd, buf);
  } catch {
    // Ignore EPIPE or other stream errors; tap will report failures if needed.
  }
  if (typeof callback === 'function') callback();
  return true;
};

process.stdout.write = rawWrite(1);
process.stderr.write = rawWrite(2);

const tap = await import('tap');
const t = tap.default ?? tap;

export const test = t.test.bind(t);
export const beforeEach = t.beforeEach?.bind(t);
export const afterEach = t.afterEach?.bind(t);
export default t;
