#!/usr/bin/env node
/**
 * Unwired-event census: find emitted events with no listener anywhere, or
 * with test-only listeners — the "designed-but-unwired mechanism" class that
 * produced three production defects on the affinity-demo line (zero-listener
 * readModelDivergence would have repaired the run-15 cache staleness; the
 * ignoreExisting option existed unwired; merge_plan had zero consumers).
 *
 * Detection is CONSTANT-REFERENCE based: an emission `X.emit(SOME.CONSTANT,…)`
 * is matched against listener registrations `.on(SOME.CONSTANT` /
 * `once(SOME.CONSTANT` / `addListener(SOME.CONSTANT` and — because emitter
 * and listener may import the constant under a different alias — against the
 * constant's resolved STRING VALUE and bare key name as well. String-literal
 * emissions are matched by literal.
 *
 * Classification per event:
 *   src-wired  — at least one listener registration in src/
 *   test-only  — listeners only in test/
 *   orphaned   — no listener registration anywhere
 *
 * Caveats (adjudicate, don't auto-delete): fire-and-forget diagnostic events
 * are legitimate; dynamically-computed event names are invisible to this
 * census; process-level and ws/raft transport events are excluded by the
 * builtin-name filter below.
 *
 * Usage: node scripts/census/unwired-event-census.mjs [--json <outPath>]
 */

import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const SRC_ROOT = 'src';
const TEST_ROOT = 'test';

// Node/lib builtin event names and transport-level events that are consumed
// by external machinery (ws, liferaft internals, process) — not census targets.
const BUILTIN_EVENT_NAMES = new Set([
  'close', 'open', 'error', 'message', 'data', 'end', 'exit', 'listening',
  'connection', 'upgrade', 'drain', 'finish', 'timeout', 'abort', 'pong',
  'ping', 'unhandledRejection', 'uncaughtException', 'SIGTERM', 'SIGINT',
  'beforeExit', 'disconnect', 'spawn', 'readable', 'change',
  // liferaft wire/internal events consumed inside the raft provider seam:
  'heartbeat', 'leader', 'follower', 'candidate', 'commit', 'term change',
  'leader change', 'state change', 'vote', 'join', 'leave', 'rpc',
]);

function walk(root, out = []) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (name === 'node_modules' || name === 'spike') {
        continue;
      }
      walk(path, out);
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      out.push(path);
    }
  }
  return out;
}

const EMIT_RE =
  /\.emit\(\s*(?:([A-Z][A-Z0-9_]*(?:_[A-Z0-9_]+)*)\.([A-Z][A-Z0-9_]*)|'([^']+)'|"([^"]+)")/g;
const LISTEN_RE =
  /\.(?:on|once|addListener|prependListener)\(\s*(?:([A-Z][A-Z0-9_]*(?:_[A-Z0-9_]+)*)\.([A-Z][A-Z0-9_]*)|'([^']+)'|"([^"]+)")/g;
const CONST_DEF_RE =
  /([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/g;

function scanFiles(files, regex) {
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(regex)) {
      const [, constObj, constKey, single, double] = match;
      hits.push({
        file,
        ref: constObj ? `${constObj}.${constKey}` : null,
        key: constKey || null,
        literal: single || double || null,
      });
    }
  }
  return hits;
}

function buildConstantValueMap(files) {
  // key name -> set of string values it is defined as anywhere (best-effort).
  const valuesByKey = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(CONST_DEF_RE)) {
      const [, key, value] = match;
      if (!valuesByKey.has(key)) {
        valuesByKey.set(key, new Set());
      }
      valuesByKey.get(key).add(value);
    }
  }
  return valuesByKey;
}

function main() {
  const srcFiles = walk(SRC_ROOT);
  const testFiles = walk(TEST_ROOT);
  const allFiles = [...srcFiles, ...testFiles];

  const emissions = scanFiles(srcFiles, EMIT_RE);
  const srcListens = scanFiles(srcFiles, LISTEN_RE);
  const testListens = scanFiles(testFiles, LISTEN_RE);
  const valuesByKey = buildConstantValueMap(allFiles);

  // Index listeners by every name they could be registered under.
  function listenerNameSet(listens) {
    const names = new Set();
    for (const l of listens) {
      if (l.ref) {
        names.add(l.ref);
        names.add(l.key);
        for (const v of valuesByKey.get(l.key) || []) {
          names.add(v);
        }
      }
      if (l.literal) {
        names.add(l.literal);
      }
    }
    return names;
  }
  const srcNames = listenerNameSet(srcListens);
  const testNames = listenerNameSet(testListens);

  const byEvent = new Map();
  for (const e of emissions) {
    const candidates = new Set();
    let display;
    if (e.ref) {
      display = e.ref;
      candidates.add(e.ref);
      candidates.add(e.key);
      for (const v of valuesByKey.get(e.key) || []) {
        candidates.add(v);
      }
    } else {
      display = `'${e.literal}'`;
      candidates.add(e.literal);
    }
    const valueNames = e.ref ?
      [...(valuesByKey.get(e.key) || [])] :
      [e.literal];
    if (valueNames.some((v) => BUILTIN_EVENT_NAMES.has(v)) ||
        (e.literal && BUILTIN_EVENT_NAMES.has(e.literal))) {
      continue;
    }
    const entry = byEvent.get(display) || {
      event: display,
      emitFiles: new Set(),
      candidates: [...candidates],
    };
    entry.emitFiles.add(e.file);
    byEvent.set(display, entry);
  }

  const report = {srcWired: [], testOnly: [], orphaned: []};
  for (const entry of byEvent.values()) {
    const inSrc = entry.candidates.some((c) => srcNames.has(c));
    const inTest = entry.candidates.some((c) => testNames.has(c));
    const row = {
      event: entry.event,
      emitFiles: [...entry.emitFiles].sort(),
    };
    if (inSrc) {
      report.srcWired.push(row);
    } else if (inTest) {
      report.testOnly.push(row);
    } else {
      report.orphaned.push(row);
    }
  }
  for (const bucket of Object.values(report)) {
    bucket.sort((a, b) => a.event.localeCompare(b.event));
  }

  const summary =
    `unwired-event census: ${byEvent.size} distinct emitted events — ` +
    `${report.srcWired.length} src-wired, ` +
    `${report.testOnly.length} TEST-ONLY, ` +
    `${report.orphaned.length} ORPHANED`;
  console.log(summary);
  console.log('\nORPHANED (no listener anywhere):');
  for (const row of report.orphaned) {
    console.log(`  ${row.event}  [${row.emitFiles.join(', ')}]`);
  }
  console.log('\nTEST-ONLY listeners:');
  for (const row of report.testOnly) {
    console.log(`  ${row.event}  [${row.emitFiles.join(', ')}]`);
  }

  const jsonFlagIndex = process.argv.indexOf('--json');
  if (jsonFlagIndex !== -1 && process.argv[jsonFlagIndex + 1]) {
    writeFileSync(
      process.argv[jsonFlagIndex + 1],
      JSON.stringify({summary, ...report}, null, 2),
    );
    console.log(`\nreport written to ${process.argv[jsonFlagIndex + 1]}`);
  }
}

main();
