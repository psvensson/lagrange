/**
 * Read a node's transaction telemetry the way GET
 * /api/admin/diagnostics/transactions does: through the answer builder the
 * admin composition binds (quest transaction-path-telemetry-export). The
 * consumers of the retired per-transaction breakdown read their transactions
 * from here (ruling 7): one retention, no second accessor.
 */
import assert from 'node:assert/strict';

import {createTransactionTelemetryAnswerBuilder} from
  '../../src/admin/admin-transaction-telemetry-answer.js';

const READER_NODE_ID = 'transaction-telemetry-reader';
const READER_BOOT_INCARNATION = 1;
const MEASURED = 'measured';

const buildAnswer = createTransactionTelemetryAnswerBuilder({
  nodeId: READER_NODE_ID,
  bootIncarnation: READER_BOOT_INCARNATION,
});

const WHOLE_RING = Object.freeze({sinceSequence: 0, bootIncarnation: 0, telemetryEpoch: 0});

/**
 * @param {Object} sqlQueryEngine - The engine whose telemetry is read.
 * @return {Object} The node answer over the whole retained ring.
 */
function readTransactionTelemetryAnswer(sqlQueryEngine) {
  return buildAnswer({sqlQueryEngine, cursor: WHOLE_RING}).answer;
}

/**
 * @param {Object} answer
 * @return {Object[]} The retained samples, oldest first.
 */
function transactionSamplesOf(answer) {
  const section = answer.sections.coordinator;
  assert.equal(section.availability.state, MEASURED, 'the coordinator section is measured');
  return section.samples.entries;
}

/**
 * The retained sample of one transaction.
 * @param {Object} sqlQueryEngine
 * @param {string} transactionId
 * @return {Object}
 */
function transactionSampleOf(sqlQueryEngine, transactionId) {
  const sample = transactionSamplesOf(readTransactionTelemetryAnswer(sqlQueryEngine))
    .find((entry) => entry.identity.transactionId === transactionId);
  assert.ok(sample, `a sample of transaction ${transactionId} is retained`);
  return sample;
}

/**
 * @param {Object} sample
 * @return {number} Every metadata submission the sample accounts for.
 */
function metadataSubmissionCountOf(sample) {
  return Object.values(sample.metadata.submissionCountByPurpose)
    .reduce((total, count) => total + count, 0);
}

export {
  metadataSubmissionCountOf,
  readTransactionTelemetryAnswer,
  transactionSampleOf,
  transactionSamplesOf,
};
