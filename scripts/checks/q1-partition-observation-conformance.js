#!/usr/bin/env node

// Behavioral contract vectors, evaluated by an independent Python decoder.
// This proves the Q1a representation, not current public ingress or recovery.
//
// A reference invocation is evidence only when it exited 0 without a signal,
// wrote nothing to stderr and printed exactly one non-negative decimal metric.
// Anything else (spawn failure, signal, non-zero exit, stderr on success,
// blank or malformed output) proves nothing: it fails the whole proof under
// its own name and is never read as a metric or as a rejected control.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayPush = Function.call.bind(Array.prototype.push);
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REFERENCE = path.join(REPO_ROOT, 'test/partition/portability-observation-reference.py');
const VECTORS = path.join(REPO_ROOT, 'test/partition/portability-observation-v1.vectors.json');
const PYTHON = 'python3';
const ENCODING = 'utf8';
const METRIC_FLAG = '--metric';
const METRIC_TARGET = 0;
const DECIMAL_RADIX = 10;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const LINE_BREAK = '\n';
const PASS_MESSAGE = 'Q1a independent observation vectors and negative controls pass\n';
const BASE_INVOCATION = 'base corpus';
const INVOCATION_FAILED = 'Q1a reference invocation failed';
const BASE_DEFICITS = 'Q1a representation deficits in the base corpus';
const CONTROL_ACCEPTED = 'Q1a negative control accepted';
const CONTROL_ACCEPTED_DETAIL = 'the reference reported metric 0 for the mutated corpus';
// The reference prints one line holding a decimal deficit count. No sign, zero
// padding, fraction, exponent, surrounding whitespace or second token is a
// metric; at most 15 digits keeps every metric an exact safe integer.
const METRIC_LINE = /^(0|[1-9][0-9]{0,14})\n?$/u;

// How one reference invocation ended. Only METRIC is evidence.
const INVOCATION = Object.freeze({
  METRIC: 'printed a metric',
  NOT_RUN: 'did not run to completion',
  SIGNALLED: 'was terminated by signal',
  FAILED_EXIT: 'exited with status',
  STDERR_ON_SUCCESS: 'exited 0 but wrote to stderr',
  NO_METRIC: 'printed no metric',
  MALFORMED_METRIC: 'printed a malformed metric',
});

function withStderr(text, run) {
  return run.stderr === '' ? text : `${text}; stderr ${JSON.stringify(run.stderr)}`;
}

// Ordered decision table: the first row that holds names the invocation's
// state. Python reports exceptions it ignores (atexit, __del__) on stderr
// without changing the exit status, so stderr on success is not evidence.
const INVOCATION_STATES = Object.freeze([
  {state: INVOCATION.NOT_RUN, holds: (run) => run.error !== undefined,
    describe: (run) => `${INVOCATION.NOT_RUN}: ${run.error.message}`},
  {state: INVOCATION.SIGNALLED, holds: (run) => run.signal !== null,
    describe: (run) => withStderr(`${INVOCATION.SIGNALLED} ${run.signal}`, run)},
  {state: INVOCATION.FAILED_EXIT, holds: (run) => run.status !== 0,
    describe: (run) => withStderr(`${INVOCATION.FAILED_EXIT} ${run.status}`, run)},
  {state: INVOCATION.STDERR_ON_SUCCESS, holds: (run) => run.stderr !== '',
    describe: (run) => withStderr(INVOCATION.STDERR_ON_SUCCESS, run)},
  {state: INVOCATION.NO_METRIC, holds: (run) => run.stdout === '',
    describe: () => INVOCATION.NO_METRIC},
  {state: INVOCATION.MALFORMED_METRIC,
    holds: (run) => regExpExec(METRIC_LINE, run.stdout) === null,
    describe: (run) => `${INVOCATION.MALFORMED_METRIC} ${JSON.stringify(run.stdout)}`},
  {state: INVOCATION.METRIC, holds: () => true},
]);

// Each control breaks one protected distinction; the reference must report at
// least one deficit for every one of them.
const NEGATIVE_CONTROLS = Object.freeze(
  // eslint-disable-next-line literal-guideline
  [
  ['drop the last accepted vector', (copy) => copy.accepted.pop()],
  ['duplicate the first accepted vector',
    (copy) => copy.accepted.push({...copy.accepted[0]})],
  ['zero-pad accepted[0].value.logIndex', (copy) => {
    copy.accepted[0].value.logIndex = '00';
  }],
  ['relabel settled accepted[0] as available', (copy) => {
    copy.accepted[0].value.kind = 'available';
  }],
  ['invert comparisons[0].order', (copy) => {
    copy.comparisons[0].order = -copy.comparisons[0].order;
  }],
  ['raise epochs[0].expected beyond 2^53 - 1', (copy) => {
    copy.epochs[0].expected = 9007199254740992;
  }],
  ['give applied accepted[0] a failureCode', (copy) => {
    copy.accepted[0].value.failureCode = 'SQLITE_ERROR';
  }],
  ['give failed accepted[2] changes', (copy) => {
    copy.accepted[2].value.changes = '1';
  }],
  ['give zero-change accepted[0] a lastInsertRowid', (copy) => {
    copy.accepted[0].value.lastInsertRowid = '1';
  }],
  ['zero-pad the txop ordinal of accepted[10]', (copy) => {
    copy.accepted[10].value.entryKey = 'txop:transaction-1:partition-1:00';
  }],
  ['claim identities[1] byte-equal', (copy) => {
    copy.identities[1].equal = true;
  }],
  ['collapse every accepted vector into accepted[0]', (copy) => {
    for (const [index, item] of copy.accepted.entries()) {
      copy.accepted[index] = {...copy.accepted[0], id: item.id};
    }
  }],
]);

// One reference run: {state: METRIC, metric} or {state, failure}.
function decodeWithReference(vectors) {
  const run = spawnSync(PYTHON, [REFERENCE], {
    cwd: REPO_ROOT, encoding: ENCODING, input: JSON.stringify(vectors),
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const {state, describe} = arrayFind(INVOCATION_STATES, (row) => row.holds(run));
  return state === INVOCATION.METRIC ?
    {state, metric: Number.parseInt(regExpExec(METRIC_LINE, run.stdout)[1], DECIMAL_RADIX)} :
    {state, failure: `${PYTHON} ${describe(run)}`};
}

// The metric counts unmet obligations, each named in the findings: the
// reference's own deficits for the base corpus, or else one per negative
// control that was accepted or whose invocation produced no evidence. Controls
// run only against a base corpus with a valid metric of 0.
function measure() {
  const vectors = JSON.parse(fs.readFileSync(VECTORS, ENCODING));
  const findings = [];
  const base = decodeWithReference(vectors);
  if (base.state !== INVOCATION.METRIC) {
    arrayPush(findings, `${INVOCATION_FAILED}: ${BASE_INVOCATION}: ${base.failure}`);
    return {metric: findings.length, findings};
  }
  if (base.metric > METRIC_TARGET) {
    arrayPush(findings, `${BASE_DEFICITS}: ${base.metric}`);
    return {metric: base.metric, findings};
  }
  for (const [index, [name, mutate]] of NEGATIVE_CONTROLS.entries()) {
    const copy = structuredClone(vectors);
    mutate(copy);
    const invocation = `negative control ${index + 1} (${name})`;
    const control = decodeWithReference(copy);
    if (control.state !== INVOCATION.METRIC) {
      arrayPush(findings, `${INVOCATION_FAILED}: ${invocation}: ${control.failure}`);
    } else if (control.metric === METRIC_TARGET) {
      arrayPush(findings, `${CONTROL_ACCEPTED}: ${invocation}: ${CONTROL_ACCEPTED_DETAIL}`);
    }
  }
  return {metric: findings.length, findings};
}

const {metric, findings} = measure();
for (const finding of findings) process.stderr.write(`${finding}${LINE_BREAK}`);
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${metric}${LINE_BREAK}`);
} else if (metric > METRIC_TARGET) {
  process.stderr.write(`Q1a conformance proof failed: metric ${metric}, ` +
    `target ${METRIC_TARGET}${LINE_BREAK}`);
  process.exitCode = 1;
} else {
  process.stdout.write(PASS_MESSAGE);
}
