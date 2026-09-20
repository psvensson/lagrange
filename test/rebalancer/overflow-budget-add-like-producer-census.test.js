// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The census of every production producer of an add-like replica operation,
// crossed with the partition classes the overflow budget is evaluated for
// (quest critical-spread-overflow-budget-audit, receipt
// every-add-like-producer-is-in-the-matrix).
//
// Mechanical on purpose. Three sources are scanned, and a producer added
// later turns this red instead of being missed:
//   - the cure policy's OWN condition table says which cure conditions are
//     add-like; the census finds every src file that asks the policy to type
//     a cure;
//   - the two coordinator entry points that persist a NEW operation
//     (createOperation) and the paths that write or re-write an operation row
//     without going through it;
//   - the provisioning path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PLACEMENT_CURE_BY_CONDITION,
  resolvePlacementCure,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  MATRIX_JSON,
  measurePartitionSets,
  readJsonArtifact,
} from './overflow-budget-audit-support.js';
import {
  emitAndAssertReceipts,
  producerNotDrivenReceipt,
} from './overflow-budget-receipt-emission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const JS_SUFFIX = '.js';
const UTF8 = 'utf8';
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT = /\/\/[^\n]*/gu;

// The call shapes that create, re-create or re-type an add-like operation.
// Each is a named sink in the matrix's producer inventory.
const SINK_PATTERNS = Object.freeze({
  createOperation: /\.createOperation\s*\(/u,
  persistNewOperation: /\.persistNewOperation(?:Unlocked)?\s*\(/u,
  createOperationRecordInternal: /\.createOperationRecordInternal\s*\(/u,
  resolvePlacementCure: /\bresolvePlacementCure\s*\(/u,
  classifyLedgerExpandForSpreadCureCondition:
    /\bclassifyLedgerExpandForSpreadCureCondition\s*\(/u,
  classifyPriorityExpandForSpreadCureCondition:
    /\bclassifyPriorityExpandForSpreadCureCondition\s*\(/u,
  classifyPriorityOverTargetSpreadCureCondition:
    /\bclassifyPriorityOverTargetSpreadCureCondition\s*\(/u,
  classifyPriorityRecoveryFollowUpCureCondition:
    /\bclassifyPriorityRecoveryFollowUpCureCondition\s*\(/u,
  authorizeSpreadCureTransition: /\bauthorizeSpreadCureTransition\s*\(/u,
  // Not a creator: the sink that decides whether the operation that made a
  // learner is VISIBLE to the guard at all. A learner whose operation has
  // gone terminal reaches the guard with no owned add-like row.
  readInFlightAddLikeOperationRowsForPromotion:
    /\breadInFlightAddLikeOperationRowsForPromotion\s*\(/u,
});

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(JS_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

function censusSinkSites() {
  const census = {};
  for (const file of listSourceFiles(SRC_ROOT).sort()) {
    const relative = path.relative(process.cwd(), file);
    const source = fs.readFileSync(file, UTF8)
      .replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
    for (const line of source.split('\n')) {
      for (const [sink, pattern] of Object.entries(SINK_PATTERNS)) {
        if (!pattern.test(line)) {
          continue;
        }
        census[sink] = census[sink] || {};
        census[sink][relative] = (census[sink][relative] || 0) + 1;
      }
    }
  }
  return census;
}

function addLikeCureConditions() {
  const addLike = [];
  for (const condition of PLACEMENT_CURE_BY_CONDITION.keys()) {
    const cure = resolvePlacementCure(condition);
    if (cure.moveType === REBALANCER_MOVE_TYPE.ADD ||
        cure.moveType === REBALANCER_MOVE_TYPE.REPLACE) {
      addLike.push(condition);
    }
  }
  return addLike.sort();
}

const THIS_FILE =
  'test/rebalancer/overflow-budget-add-like-producer-census.test.js';
const THIS_TEST = 'every production producer of an add-like operation is in the matrix';
const EMIT_KEY = 'add-like-producer-census';
const NO_STATES = 0;
// The censused producers no test in this audit drives. Named here, at the
// census that found them, and never read back from a matrix row.
const UNDRIVEN_PRODUCERS = Object.freeze(['planner-paired-relocation-replace']);

test('every production producer of an add-like operation is in the matrix',
  () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const sets = measurePartitionSets();
    // 1. The policy owner's own table decides which cures are add-like.
    assert.deepEqual(addLikeCureConditions(),
      [...matrix.method.addLikeCureConditions].sort(),
      'the matrix records the add-like cure conditions the policy declares');
    // 2. The call-site census equals the recorded sink inventory, file for
    // file and count for count.
    const census = censusSinkSites();
    assert.deepEqual(census, matrix.method.sinkCensus,
      'the measured add-like operation sink census equals the recorded one');
    // 3. Every recorded producer names a sink that exists in the census and
    // a file that carries it.
    for (const producer of matrix.producers) {
      assert.ok(producer.id && producer.file && producer.entryPoint,
        'a producer entry names its id, file and entry point');
      const sites = census[producer.sink];
      assert.ok(sites, `the producer's sink is censused: ${producer.sink}`);
      assert.ok(Object.hasOwn(sites, producer.file),
        `the producer's file carries its sink: ${producer.id}`);
      assert.ok(Array.isArray(producer.partitionScope.partitionIds),
        `the producer states its partition scope: ${producer.id}`);
      for (const partitionId of producer.partitionScope.partitionIds) {
        assert.ok(sets.all.includes(partitionId),
          `the producer's scope names a declared partition: ${partitionId}`);
      }
    }
    // 4. Every (producer, budget-evaluated partition) pair it can reach is
    // covered by at least one matrix row, and every matrix row names a
    // producer that exists.
    const producerIds = new Set(matrix.producers.map((entry) => entry.id));
    for (const row of matrix.rows) {
      for (const producerId of row.producers) {
        assert.ok(producerIds.has(producerId),
          `matrix row ${row.id} names a censused producer: ${producerId}`);
      }
    }
    for (const producer of matrix.producers) {
      const reachable = producer.partitionScope.partitionIds
        .filter((partitionId) => sets.budgetEvaluated.includes(partitionId));
      for (const partitionId of reachable) {
        const covering = matrix.rows.filter((row) =>
          row.producers.includes(producer.id) &&
          row.partitionClass.includes(partitionId));
        assert.ok(covering.length >= 1,
          'every producer crossed with every budget-evaluated partition it ' +
            `reaches has a row: ${producer.id} x ${partitionId}`);
      }
    }
    // 5. The receipts this census is the witness for: a producer the census
    // located in production and that nothing in this audit drove, with the
    // partition scope the census measured for it.
    const emitted = UNDRIVEN_PRODUCERS.map((producerId) => {
      const producer = matrix.producers
        .find((entry) => entry.id === producerId);
      assert.ok(producer, `the undriven producer is censused: ${producerId}`);
      return producerNotDrivenReceipt({
        producerId,
        measuredPartitions: producer.partitionScope.partitionIds
          .filter((partitionId) => sets.all.includes(partitionId)),
        witness: {file: THIS_FILE, test: THIS_TEST},
        result: {producerDriven: false, statesEnumerated: NO_STATES,
          censusedSink: producer.sink},
      });
    });
    emitAndAssertReceipts(EMIT_KEY, emitted);
  });
