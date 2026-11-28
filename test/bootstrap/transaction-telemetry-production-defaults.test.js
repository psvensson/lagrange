/**
 * The transaction-path telemetry export changes nothing production does
 * (quest transaction-path-telemetry-export, sealed constraint
 * production-unchanged).
 *
 * What this probe proves. Four one-participant transactions run through the
 * real SQLQueryEngine composition (transaction-telemetry-production-
 * scenarios.js): a committed write, a rolled-back write, a COMMIT whose
 * PREPARE the participant refuses, and a client ROLLBACK whose fan-out fails
 * followed by a COMMIT that re-drives the recorded ROLLBACK. For each, these
 * equal the values measured at the base commit
 * (transaction-telemetry-production-baseline.js): the gateway mutation
 * sequence, the router delivery sequence, the answer fields a client reads
 * (success, operation, stage, errorCode), the host timers armed through the
 * globals or an imported node:timers binding, async hook creations, the
 * number of promises created (an added await or promise link changes it),
 * metrics.* log tags and the decision trace. The export's per-purpose
 * submission counts equal the base's for the committed write and sum to the
 * gateway mutation count in every scenario. A static witness holds the hint
 * rule: only the telemetry owners and the answer path read the telemetry.
 *
 * What it does not prove. Participants answer through a recording router: no
 * partition, Raft group or transport runs, so Raft journal writes are not
 * observed. Their identity follows by inference only: no file under
 * src/raft, src/partition, src/control-plane, src/transport or src/workflow
 * changes in this quest, and the delivery sequence into them is identical.
 * It covers neither several participants nor concurrent sessions, nor
 * recovery, nor timing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {transactionSampleOf} from '../diagnostics/transaction-telemetry-sample-reader.js';
import {TRANSACTION_TELEMETRY_PRODUCTION_BASELINE as BASELINE} from
  './transaction-telemetry-production-baseline.js';
import {PRODUCTION_SCENARIO, observeProductionScenario} from
  './transaction-telemetry-production-scenarios.js';

const SRC_ROOT = 'src';
const JS_SUFFIX = '.js';
const OBSERVED_FIELDS = Object.freeze(['gatewayMutations', 'deliveries', 'answers',
  'armedHostPrimitives', 'promiseCreations', 'asyncHookCreations', 'metricsTags',
  'decisionTrace']);

// The read and answer side of the telemetry: nothing that decides may use it.
const TELEMETRY_READ_SYMBOLS = Object.freeze([
  'readTransactionTelemetrySection',
  'readParticipantRequestTelemetrySection',
  'indexParticipantRequests',
  'participantRequestsOfSample',
  'firstObservedAtMsOf',
  'createTransactionTelemetryAnswerBuilder',
  'transactionTelemetryAnswerBuilder',
  'collectTransactionTelemetry',
  'deriveTransactionTelemetryWindow',
  'validateTransactionTelemetryAnswer',
  'snapshotTelemetryObservations',
  'readTelemetryRingSince',
  'retainedTelemetryRingValues',
]);
const TELEMETRY_READERS = Object.freeze(new Set([
  'src/admin/admin-transaction-telemetry-answer.js',
  'src/admin/admin-websocket-diagnostics-route-methods.js',
  'src/admin/admin-websocket-api-base.js',
  'src/entrypoint-runtime-admin-composition.js',
  'src/diagnostics/transaction-telemetry-collection.js',
  'src/diagnostics/telemetry-histogram.js',
  'src/query/distributed/distributed-transaction-telemetry.js',
  'src/query/query-executor-delivery-telemetry.js',
]));
// The stores live on their owners, which create them and read nothing else.
const STORE_FIELD = /\b(transactionTelemetry|participantRequestTelemetry)\b/gu;
const STORE_CREATORS = Object.freeze(new Map([
  ['src/query/distributed/distributed-transaction-coordinator.js', 1],
  ['src/query/query-executor-partition-delivery.js', 1],
]));

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(child));
    else if (entry.name.endsWith(JS_SUFFIX)) files.push(child);
  }
  return files;
}

for (const scenario of Object.values(PRODUCTION_SCENARIO)) {
  test(`${scenario} behaves exactly as at the base commit: mutations, deliveries, ` +
    'answers, armed timers, promises, async hooks, metrics tags and decision trace',
  async () => {
    const expected = BASELINE.scenarios[scenario];
    const run = await observeProductionScenario(scenario);
    try {
      for (const field of OBSERVED_FIELDS) {
        assert.deepEqual(run.observation[field], expected[field], `${scenario}: ${field}`);
      }
      const submissions = transactionSampleOf(run.engine, run.transactionId)
        .metadata.submissionCountByPurpose;
      assert.equal(sum(Object.values(submissions)), expected.gatewayMutations.length,
        'the export accounts for every gateway mutation under a named purpose');
      if (expected.submissionCountByPurpose !== undefined) {
        assert.deepEqual(submissions, expected.submissionCountByPurpose,
          'the export names each submission\'s purpose as the base recorded it');
      }
    } finally {
      await run.dispose();
    }
  });
}

test('nothing that decides reads the telemetry: its read symbols and stores stay with ' +
  'the telemetry owners, the answer builder, its route and its binding', () => {
  const readers = [];
  const storeUses = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const relative = file.split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    if (!TELEMETRY_READERS.has(relative) &&
        TELEMETRY_READ_SYMBOLS.some((symbol) => source.includes(symbol))) {
      readers.push(relative);
    }
    const storeMentions = source.match(STORE_FIELD)?.length ?? 0;
    if (!TELEMETRY_READERS.has(relative) &&
        storeMentions !== (STORE_CREATORS.get(relative) ?? 0)) {
      storeUses.push(`${relative}: ${storeMentions}`);
    }
  }
  assert.deepEqual(readers, [], 'no other src module uses a telemetry read symbol');
  assert.deepEqual(storeUses, [], 'only the owners create the stores; nothing else reads them');
});
