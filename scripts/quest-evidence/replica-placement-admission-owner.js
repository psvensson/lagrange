#!/usr/bin/env node
// Seal-time receipt producer of the quest replica-placement-admission-owner.
//
// It re-runs the two witnesses that must be measured RED on the candidate
// before the quest is sealed (design section 4.2), parses each subtest's
// verdict from the TAP summary, and writes the test-receipt probe artifact:
//   - reproducer-red-on-candidate: the deterministic drain reproducer; the
//     receipt holds when every subtest named in mustFail fails;
//   - cross-coordinator-target-census-witness: witness W-T; measured here on
//     its candidate half only (the census subtest red, the paired control
//     green), so it never passes here: it holds once the owner tree turns
//     the witness green, which a later producer measures.
// Every other receipt the quest requires is written as not measured and
// never passing, and the file's status is never "pass", so the quest's
// doneWhen cannot close on this artifact.
//
//   node scripts/quest-evidence/replica-placement-admission-owner.js
//     [--output <path>]
//
// Exits 0 when the measured verdicts are the expected ones, 1 otherwise.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {headSha} from '../solve/guards.js';
import {readQuest} from '../solve/store.js';

const QUEST_ID = 'replica-placement-admission-owner';
const RECEIPT_SCHEMA = 'test-receipt/1';
// Never "pass": the test-receipt probe closes a quest only on "pass".
const STATUS_SEAL_MEASUREMENT = 'seal-measurement';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTF8 = 'utf8';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const TAP_REPORTER = '--test-reporter=tap';
const NODE_TEST_CONTEXT_ENV = 'NODE_TEST_CONTEXT';
const CHILD_MAX_BUFFER = 64 * 1024 * 1024;
const TOP_LEVEL_VERDICT = /^(ok|not ok) \d+ - (.+)$/u;
const ERROR_KEY = /^\s+error: (?:\|-|')?(.*)$/u;
const FAILURE_EXCERPT_CHARS = 600;
const NOT_OK = 'not ok';
const OUTPUT_FLAG = '--output';
const ARGV_OFFSET = 2;
const EXIT_OK = 0;
const EXIT_UNEXPECTED = 1;
const CHILD_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);
const LINE_BREAK = '\n';
const VERDICT_AS_EXPECTED = 'as expected';
const VERDICT_UNEXPECTED = 'UNEXPECTED';

const REPRODUCER = 'test/convergence/dt-placement-owner-formation-drain.test.js';
const WITNESS = 'test/rebalancer/placement-admission-cross-coordinator-target-census.test.js';

const MEASURED = Object.freeze([
  Object.freeze({
    id: 'reproducer-red-on-candidate',
    testFile: REPRODUCER,
    // The design's stated reasons (A1, A2, A4) plus the order, work
    // conservation and retry properties the candidate also breaks.
    mustFail: Object.freeze([
      'A1 capacity', 'A2 causality', 'A3 work conservation',
      'A4 quiescence', 'A6 order', 'ledger repair is never starved',
      'a move whose create FAILED',
    ]),
    mustPass: Object.freeze([]),
    holdsWhenAsExpected: true,
    detail: 'Deterministic drain of a fresh three-node formation in frozen ' +
      'time over the tree\'s own placement composition: on the candidate ' +
      'no admission happens without a placement timer, the timer probe ' +
      'drives more than K_src=2 concurrent copies from the seed, the ' +
      'background wave starts while nodes-p1 waits, and a failed ledger ' +
      'move is not admitted again until its terminal row is delivered twice.',
  }),
  Object.freeze({
    id: 'cross-coordinator-target-census-witness',
    testFile: WITNESS,
    mustFail: Object.freeze(['W-T: with B at capacity', 'W-T converse']),
    mustPass: Object.freeze(['W-T paired control']),
    holdsWhenAsExpected: false,
    detail: 'Candidate half of witness W-T: with two live copies onto B ' +
      'created by A, C (its cache publication held) commits a third copy ' +
      'onto B, its owner-scoped census bound to its own node id; a stale ' +
      'cached row of a terminal copy holds B\'s slot; with both copies ' +
      'published to C the copy is refused (paired control). The receipt ' +
      'holds only once the owner tree turns the witness green.',
  }),
]);

const NOT_MEASURED_BY = Object.freeze({
  'reproducer-and-owned-roots-green': 'WP-F/WP-H: the reproducer, W-T and ' +
    'the owned roots of design section 4.3 green on the owner tree',
  'negative-controls-red': 'WP-I: paired witnesses N1-N4 red on the owner tree',
  'owner-churn-and-host-topology-witnesses': 'WP-F/WP-D: variants V1-V3',
  'single-admission-path-and-removed-mechanism-census-zero':
    'WP-G: the caller-set check and the removed-mechanism census',
  'lab-drain-mechanism-and-metrics-product-defaults': 'WP-J: lab drain ' +
    'metrics at product defaults (owner decision D1 = b)',
  'comparative-smoke-setup': 'WP-J: the comparative smoke through the lab target',
  'independent-verification': 'WP-I: a fresh verifier with the seven templates',
});

// Every required receipt this producer does not measure names its owning work
// package; an undeclared one is a defect in this producer, never a label.
function notMeasuredOwnerOf(id) {
  if (!Object.hasOwn(NOT_MEASURED_BY, id)) {
    throw new Error(`${QUEST_ID}: required receipt ${id} has no declared producer`);
  }
  return NOT_MEASURED_BY[id];
}

function resolveOutputFile(declared, argv) {
  const index = argv.indexOf(OUTPUT_FLAG);
  if (index < 0) return declared;
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${OUTPUT_FLAG} requires a receipt file path`);
  }
  return value;
}

function digestOf(file) {
  return createHash(DIGEST_ALGORITHM)
    .update(fs.readFileSync(path.join(ROOT, file))).digest(DIGEST_ENCODING);
}

// One in-process node:test run of a file; a red file exits non-zero, which
// is a measurement here, not an error.
function runTapFile(file) {
  const env = {...process.env};
  delete env[NODE_TEST_CONTEXT_ENV];
  try {
    return execFileSync(process.execPath, [TAP_REPORTER, file], {
      cwd: ROOT, encoding: UTF8, env, maxBuffer: CHILD_MAX_BUFFER,
      stdio: [...CHILD_STDIO],
    });
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.length > 0) {
      return error.stdout;
    }
    throw error;
  }
}

// The verdict of every top-level test and the first line of each failure.
function parseTap(stdout) {
  const verdicts = [];
  const lines = stdout.split(LINE_BREAK);
  for (let index = 0; index < lines.length; index += 1) {
    const match = TOP_LEVEL_VERDICT.exec(lines[index]);
    if (!match) continue;
    const verdict = {name: match[2], passed: match[1] !== NOT_OK,
      failure: null};
    if (!verdict.passed) {
      for (let next = index + 1; next < lines.length &&
          !TOP_LEVEL_VERDICT.test(lines[next]); next += 1) {
        const error = ERROR_KEY.exec(lines[next]);
        if (!error) continue;
        const text = error[1] || lines[next + 1] || '';
        verdict.failure = text.trim().slice(0, FAILURE_EXCERPT_CHARS);
        break;
      }
    }
    verdicts.push(verdict);
  }
  return verdicts;
}

function named(verdicts, prefix) {
  return verdicts.filter((verdict) => verdict.name.startsWith(prefix));
}

function measure(spec) {
  const verdicts = parseTap(runTapFile(spec.testFile));
  const missing = [...spec.mustFail, ...spec.mustPass]
    .filter((prefix) => named(verdicts, prefix).length === 0);
  const notRed = spec.mustFail.filter((prefix) =>
    named(verdicts, prefix).some((verdict) => verdict.passed));
  const notGreen = spec.mustPass.filter((prefix) =>
    named(verdicts, prefix).some((verdict) => !verdict.passed));
  const asExpected = missing.length === 0 && notRed.length === 0 &&
    notGreen.length === 0;
  return {
    id: spec.id,
    measured: true,
    passed: spec.holdsWhenAsExpected && asExpected,
    measuredAsExpected: asExpected,
    command: `node ${TAP_REPORTER} ${spec.testFile}`,
    testFile: spec.testFile,
    expectedRed: spec.mustFail,
    expectedGreen: spec.mustPass,
    unexpected: {missing, notRed, notGreen},
    verdicts,
    detail: spec.detail,
  };
}

function main() {
  const quest = readQuest(ROOT, QUEST_ID);
  const outputFile = resolveOutputFile(quest.doneWhen.args.file,
    process.argv.slice(ARGV_OFFSET));
  const measured = MEASURED.map(measure);
  const measuredIds = new Set(measured.map((receipt) => receipt.id));
  const receipts = [
    ...measured,
    ...quest.doneWhen.args.requiredReceipts
      .filter((id) => !measuredIds.has(id))
      .map((id) => ({
        id,
        measured: false,
        passed: false,
        detail: `not yet measured: ${notMeasuredOwnerOf(id)}`,
      })),
  ];
  const payload = {
    schema: RECEIPT_SCHEMA,
    quest: QUEST_ID,
    status: STATUS_SEAL_MEASUREMENT,
    testFileDigests: Object.fromEntries(MEASURED.map((spec) =>
      [spec.testFile, digestOf(spec.testFile)])),
    source: {head: headSha(ROOT)},
    generatedAt: new Date().toISOString(),
    receipts,
  };
  const target = path.resolve(ROOT, outputFile);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  const unexpected = measured.filter((receipt) => !receipt.measuredAsExpected);
  for (const receipt of measured) {
    process.stdout.write(`${receipt.id}: ` +
      `${receipt.measuredAsExpected ? VERDICT_AS_EXPECTED : VERDICT_UNEXPECTED} ` +
      `(${receipt.verdicts.filter((verdict) => !verdict.passed).length} red, ` +
      `${receipt.verdicts.filter((verdict) => verdict.passed).length} green)\n`);
  }
  process.stdout.write(`${outputFile}: ${payload.status}\n`);
  process.exitCode = unexpected.length === 0 ? EXIT_OK : EXIT_UNEXPECTED;
}

main();
