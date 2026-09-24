// A system-metadata owner write released by shutdown ends in one pass.
//
// Witnessed on the rs-raft cutover (seed-node-bootstrap, 110 s against 31 s):
// a seed shut down while a publication upsert was in flight. Shutdown released
// the write as OUTCOME_UNKNOWN (retryable, and honestly so), the seed cleanup
// then marked the CDC integration service shutting down and released its
// engine, and every retry after that answered the startup-time "engine not
// provided" deferRetry. The owner's retry loop re-armed a referenced 100 ms
// timer for its whole 30 s budget, and the publication persist loop ran that
// three times: the process outlived its tests by about 80 s.
//
// The CDC integration service owns what its missing engine means: before it
// is wired the engine is still to come (retryable); once it is marked
// shutting down the engine is gone for good, and its answer is the typed
// terminal SHUT_DOWN. This file composes the real owner, the real gateway and
// the real CDC service on an injected clock and reads every timer from the
// owners' own state: the owner's retry sleep and the CDC service's time
// source. Red on revert: the owner re-attempts until its budget runs out.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_ERROR_CODE} from '../../src/cdc/cdc-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  ControlPlanePublicationsOwner,
} from '../../src/control-plane/owners/index.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_STATUS,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  isControlPlaneWriterShutDown,
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  PARTITION_WRITE_RELEASE_CAUSE,
  buildReleasedPendingWriteAnswer,
} from '../../src/partition/partition-write-kernel.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';
import {
  INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const NODE_ID = 'shutdown-node';
const PUBLICATION_ID = 'membership-publication:1';
const RELEASED_ENTRY_ID = 'released-entry';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

// The seed cleanup's order (seed-cleanup-handler shutdownSqlQueryEngine):
// mark the service shutting down, then release its engine.
function tearDownCdcService(service) {
  service.markShuttingDown();
  service.sqlQueryEngine = null;
}

function composeOwnerOverShuttingDownWriter() {
  const timeSource = new VirtualTimeSource();
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(), timeSource,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  const engineWrites = [];
  // The in-flight publication write: shutdown releases it as OUTCOME_UNKNOWN
  // and the node tears its CDC service down while the answer travels back.
  cdcIntegrationService.sqlQueryEngine = {
    async executeQuery(sql) {
      engineWrites.push(sql);
      tearDownCdcService(cdcIntegrationService);
      return buildReleasedPendingWriteAnswer({
        entryId: RELEASED_ENTRY_ID,
        proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      },
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
      {cause: PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN});
    },
  };
  const sleeps = [];
  let nowMs = 0;
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId: NODE_ID, cdcIntegrationService,
    }),
    // The owner's own retry clock: a sleep is recorded and moves the clock,
    // so a loop that re-arms is counted rather than waited for.
    controlPlaneWriteRetryNow: () => nowMs,
    controlPlaneWriteRetrySleep: async (delayMs) => {
      sleeps.push(delayMs);
      nowMs += delayMs;
    },
  });
  return {owner, timeSource, engineWrites, sleeps};
}

test('an owner write released by shutdown ends on the torn-down writer\'s ' +
  'terminal answer in one pass', async () => {
  const composed = composeOwnerOverShuttingDownWriter();
  const retries = [];
  const failure = await composed.owner.upsertPublication(
    {publication_id: PUBLICATION_ID, status: MEMBERSHIP_PUBLICATION_STATUS.OPEN},
    {controlPlaneWriteRetryOnRetry: (retry) => retries.push(retry)},
  ).then(() => null, (error) => error);

  assert.ok(failure instanceof Error, 'the write must fail, not land');
  assert.equal(composed.engineWrites.length, 1,
    'only the released write reached an engine');
  assert.equal(retries.length, 1,
    'the owner retries the released OUTCOME_UNKNOWN once and never retries ' +
    'the torn-down writer\'s answer');
  assert.equal(failure.code, CDC_ERROR_CODE.SHUT_DOWN,
    'the failure carries the CDC service\'s typed shut-down code');
  assert.equal(failure.deferRetry, undefined,
    'a torn-down writer never asks to be retried later');
  assert.equal(isControlPlaneWriterShutDown(failure), true,
    'the classifier names the answer a torn-down writer');
  assert.equal(isRetryableControlPlaneError(failure), false,
    'the classifier holds the answer terminal');
  assert.deepEqual(composed.sleeps, [retries[0].delayMs],
    'the owner armed exactly the one retry delay of the released write');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'the CDC service left no timer armed');
});

test('the publication persist loop ends on the torn-down writer\'s answer ' +
  'in one pass', async () => {
  const composed = composeOwnerOverShuttingDownWriter();
  const upserts = [];
  const upsertPublication = composed.owner.upsertPublication.bind(
    composed.owner);
  composed.owner.upsertPublication = (row, options) => {
    upserts.push(row.publication_id);
    return upsertPublication(row, options);
  };
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: NODE_ID,
    controlPlanePublicationsOwner: composed.owner,
    logger: QUIET_LOGGER,
  });
  const failure = await coordinator.persistPublicationRow({
    publication_id: PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    published_active_node_ids: [],
  }).then(() => null, (error) => error);

  assert.ok(failure instanceof Error, 'the publication must fail, not land');
  assert.deepEqual(upserts, [PUBLICATION_ID],
    'one owner write: the persist loop never re-attempts through a ' +
    'torn-down writer');
  assert.equal(composed.sleeps.length, 1,
    'the only delay armed is the owner\'s one retry of the released write');
  assert.equal(failure.code, CDC_ERROR_CODE.SHUT_DOWN,
    'the persist loop surfaces the typed shut-down answer');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'the CDC service left no timer armed');
});

test('the engine missing before the service is wired stays the retryable ' +
  'startup answer', async () => {
  const timeSource = new VirtualTimeSource();
  const service = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(), timeSource,
  });
  service.bootstrapMode = false;
  service.logger = QUIET_LOGGER;
  service.retryMaxAttempts = 1;
  const failure = await service.executeSQLViaQueryEngine(
    'UPSERT INTO control_plane_publications (publication_id) VALUES (?)',
    [PUBLICATION_ID],
  ).then(() => null, (error) => error);

  assert.ok(failure instanceof Error, 'an unwired service cannot route');
  assert.notEqual(failure.code, CDC_ERROR_CODE.SHUT_DOWN,
    'an unwired service is not a torn-down one');
  assert.equal(failure.deferRetry, true,
    'an unwired service asks to be retried once its engine arrives');
  assert.equal(isRetryableControlPlaneError(failure), true,
    'the classifier holds the startup answer retryable');
});
