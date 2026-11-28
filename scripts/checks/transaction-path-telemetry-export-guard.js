#!/usr/bin/env node

// Probe of quest transaction-path-telemetry-export: counts the unmet
// properties among the witnesses in scope (design record O1 section 8 as
// ruled: W1, W2, W3, W4, W7, W8, W9 and the negative controls N1, N2; N3 is
// this guard measured on the unchanged tree). In process only: a real
// SQLQueryEngine, the coordinator, an in-memory gateway, the PG-wire handler
// on a recording socket and the admin API through fastify inject without a
// listener. It starts no cluster and makes no network call (R27). The
// witnesses have one owner, shared with the node:test file.

import {
  negativeControlAccountingOverrun,
  negativeControlUndrivenEntry,
  witnessAccounting,
  witnessCatalogueCoverage,
  witnessCollection,
  witnessFifoWait,
  witnessReads,
  witnessRouteAnswer,
  witnessWindow,
} from '../../test/diagnostics/transaction-telemetry-export-witnesses.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySlice = Function.call.bind(Array.prototype.slice);

const ZERO = 0;
const ONE = 1;
const ARGV_OFFSET = 2;
const JSON_INDENT = 2;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const NEWLINE = '\n';
const PASS_LINE = 'transaction-path-telemetry-export-guard: PASS\n';
const FAIL_PREFIX = 'FAIL ';
const COLON_SPACE = ': ';

const WITNESS_W1 = 'W1-route-typed-node-answer';
const WITNESS_W2 = 'W2-accounting-through-pgwire';
const WITNESS_W3 = 'W3-in-transaction-reads-timed-and-counted';
const WITNESS_W4 = 'W4-fifo-wait-behind-recovery';
const WITNESS_W7 = 'W7-window-cursor-drop-and-restart';
const WITNESS_W8 = 'W8-collection-typed-entry-per-node';
const WITNESS_W9 = 'W9-catalogue-coverage';
const CONTROL_N1 = 'N1-rejects-phases-over-total';
const CONTROL_N2 = 'N2-rejects-undriven-catalogue-entry';
const CATALOGUE_WITNESS_W2 = 'W2';
const CATALOGUE_WITNESS_W3 = 'W3';
const CATALOGUE_WITNESS_W4 = 'W4';
const CATALOGUE_WITNESS_W7 = 'W7';
const CATALOGUE_WITNESS_W8 = 'W8';

// Answers each catalogue driver read in this run; W9 checks coverage over
// them instead of driving the same scenarios twice.
const answersByWitness = new Map();

function recordingAnswers(catalogueWitness, witness) {
  return async () => {
    const result = await witness();
    answersByWitness.set(catalogueWitness, result.answers);
  };
}

const CHECKS = Object.freeze([
  [WITNESS_W1, witnessRouteAnswer],
  [WITNESS_W2, recordingAnswers(CATALOGUE_WITNESS_W2, witnessAccounting)],
  [WITNESS_W3, recordingAnswers(CATALOGUE_WITNESS_W3, witnessReads)],
  [WITNESS_W4, recordingAnswers(CATALOGUE_WITNESS_W4, witnessFifoWait)],
  [WITNESS_W7, recordingAnswers(CATALOGUE_WITNESS_W7, witnessWindow)],
  [WITNESS_W8, recordingAnswers(CATALOGUE_WITNESS_W8, witnessCollection)],
  [WITNESS_W9, () => witnessCatalogueCoverage(answersByWitness)],
  [CONTROL_N1, negativeControlAccountingOverrun],
  [CONTROL_N2, negativeControlUndrivenEntry],
]);

async function runSingleCheck([id, check]) {
  try {
    await check();
    return {id, passed: true, error: null};
  } catch (error) {
    return {id, passed: false, error: String(error?.message || error)};
  }
}

async function evaluateChecks() {
  const results = [];
  for (const entry of CHECKS) {
    results.push(await runSingleCheck(entry));
  }
  const unmet = arrayFilter(results, (result) => !result.passed).length;
  return {results, unmet};
}

function reportFailedChecks(results) {
  for (const row of arrayFilter(results, (result) => !result.passed)) {
    process.stderr.write(`${FAIL_PREFIX}${row.id}${COLON_SPACE}${row.error}${NEWLINE}`);
  }
}

async function main(argv) {
  const {results, unmet} = await evaluateChecks();
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(`${JSON.stringify({results, unmet}, null, JSON_INDENT)}${NEWLINE}`);
  } else if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${unmet}${NEWLINE}`);
  } else if (unmet === ZERO) {
    process.stdout.write(PASS_LINE);
  } else {
    reportFailedChecks(results);
    process.stdout.write(`${unmet}${NEWLINE}`);
  }
  process.exitCode = Number(unmet > ZERO);
}

main(arraySlice(process.argv, ARGV_OFFSET)).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || error}${NEWLINE}`);
  process.exitCode = ONE;
});
