// A membership publication in flight when its node shuts down ends on the CDC
// integration service's terminal lifecycle answer, in either order.
//
// Witnessed on the rs-raft cutover (seed-node-bootstrap, 110 s against 31 s):
// a seed shut down while a publication upsert was in flight. Shutdown released
// the write as OUTCOME_UNKNOWN, the seed cleanup marked the CDC integration
// service shutting down and released its engine, and every retry after that
// answered the startup-time "engine not provided" deferRetry. The owner's
// retry loop re-armed a referenced 100 ms timer for its 30 s budget, and the
// publication persist loop ran that three times.
//
// The CDC integration service owns its lifecycle answer. Once it is marked
// shutting down, every write it routes or waits on answers the typed terminal
// SHUT_DOWN, carrying what the write last answered as its cause (a released
// write stays OUTCOME_UNKNOWN there), and a wait it holds for a write ends at
// once instead of at its budget. Callers do not detect teardown: the
// control-plane classifier holds the answer terminal and every loop stops.
//
// Composition: the real membership publication coordinator, the real
// publications owner, the real gateway, the real CDC service on an injected
// clock, and the real seed cleanup step (SeedCleanupHandler
// .shutdownSqlQueryEngine). The one seam is the SQL engine, modelled on the
// partition write lifecycle: a routed write is held in flight, and the
// engine's shutdown releases it with the write kernel's own released answer.
// Order is controlled by resolving that write, never by a sleep; timers are
// read from the owners' own state (the CDC time source, the owner's retry
// sleep), never waited for. Red on the pre-fix tree: the owner retries
// through the torn-down service, or its visibility wait holds a timer.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import * as CDC_CONSTANTS from '../../src/cdc/cdc-constants.js';
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
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {SeedCleanupHandler} from
  '../../src/bootstrap/phases/seed-cleanup-handler.js';
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
import {ERRORS} from '../../src/constants/errors.js';

const NODE_ID = 'shutdown-node';
const PUBLICATION_ID = 'membership-publication:1';
const RELEASED_ENTRY_ID = 'released-entry';
const PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
// Event-loop turns the witness yields while waiting for the composition to
// settle; the composition is in memory, so a settled outcome needs few.
const SETTLE_TURNS = 50;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

// The SQL engine seam, on the partition write lifecycle: a routed write is
// held in flight until it is accepted or the engine shuts down, and shutdown
// releases it with the write kernel's released answer (proposed, so its
// outcome is not known to this replica).
function createInFlightEngine() {
  const engine = {
    routedWrites: 0,
    shutdowns: 0,
    pendingWrite: null,
    executeQuery() {
      engine.routedWrites += 1;
      return new Promise((resolve) => {
        engine.pendingWrite = resolve;
      });
    },
    accept() {
      const resolve = engine.pendingWrite;
      engine.pendingWrite = null;
      resolve({success: true, affectedRows: 1, rows: []});
    },
    async shutdown() {
      engine.shutdowns += 1;
      const resolve = engine.pendingWrite;
      engine.pendingWrite = null;
      resolve?.(buildReleasedPendingWriteAnswer({
        entryId: RELEASED_ENTRY_ID,
        proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      }, PUBLICATIONS_PARTITION_ID,
      {cause: PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN}));
    },
  };
  return engine;
}

function composeSeedPublication() {
  const timeSource = new VirtualTimeSource();
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(), timeSource,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  const engine = createInFlightEngine();
  cdcIntegrationService.sqlQueryEngine = engine;
  const retrySleeps = [];
  let ownerNowMs = 0;
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId: NODE_ID, cdcIntegrationService,
    }),
    // The owner's retry clock: a retry delay is recorded and moves the
    // clock, so a loop that re-arms is counted rather than waited for.
    controlPlaneWriteRetryNow: () => ownerNowMs,
    controlPlaneWriteRetrySleep: async (delayMs) => {
      retrySleeps.push(delayMs);
      ownerNowMs += delayMs;
    },
  });
  const upserts = [];
  const upsertPublication = owner.upsertPublication.bind(owner);
  owner.upsertPublication = (row, options) => {
    upserts.push(row.publication_id);
    return upsertPublication(row, options);
  };
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: NODE_ID, controlPlanePublicationsOwner: owner, logger: QUIET_LOGGER,
  });
  // The seed cleanup's delegates onto this node's CDC service and engine.
  let registeredEngine = engine;
  const cleanup = new SeedCleanupHandler({delegates: {}});
  const shutDownSqlQueryEngine = () => cleanup.shutdownSqlQueryEngine({
    getCdcIntegrationService: () => cdcIntegrationService,
    getSqlQueryEngine: () => registeredEngine,
    setSqlQueryEngine: (next) => {
      registeredEngine = next;
    },
  });
  return {
    cdcIntegrationService, engine, timeSource, retrySleeps, upserts,
    coordinator, shutDownSqlQueryEngine,
  };
}

async function yieldTurns(turns) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Start the membership operation and yield until its write is in flight at
// the engine.
async function startPublication(composed) {
  let outcome = null;
  const operation = composed.coordinator.persistPublicationRow({
    publication_id: PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    published_active_node_ids: [NODE_ID],
  }).then(
    (row) => {
      outcome = {row};
    },
    (error) => {
      outcome = {error};
    },
  );
  for (let turn = 0; turn < SETTLE_TURNS && !composed.engine.pendingWrite;
    turn += 1) {
    await yieldTurns(1);
  }
  return {operation, readOutcome: () => outcome};
}

function linkedFailures(error) {
  const failures = [];
  for (let current = error; current; current = current.cause) {
    failures.push(current);
  }
  return failures;
}

function assertTerminalTeardown(composed, outcome) {
  assert.notEqual(outcome, null,
    'the membership operation settles once shutdown wins, without any ' +
    'clock moving');
  assert.deepEqual(composed.retrySleeps, [],
    'no retry delay is armed after the service is shut down');
  assert.deepEqual(composed.upserts, [PUBLICATION_ID],
    'the persist loop never re-attempts through the shut-down service');
  assert.equal(composed.engine.routedWrites, 1,
    'only the in-flight write ever reached an engine');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'the CDC service holds no timer after shutdown');
  assert.ok(outcome.error instanceof Error,
    'a write shutdown overtook is never reported as a success');
  assert.equal(isRetryableControlPlaneError(outcome.error), false,
    'the control-plane classifier holds the answer terminal');
  assert.equal(outcome.error.code, CDC_CONSTANTS.CDC_ERROR_CODE.SHUT_DOWN,
    'the answer is the CDC service\'s typed shut-down code');
  assert.equal(composed.cdcIntegrationService.isShuttingDown, true,
    'the CDC service is in its terminal lifecycle state');
  assert.equal(composed.cdcIntegrationService.sqlQueryEngine, null,
    'teardown released the engine');
  assert.equal(composed.engine.shutdowns, 1, 'teardown shut the engine down');
}

test('(i) shutdown wins before the membership side continues: the released ' +
  'write ends on the terminal answer and stays OUTCOME_UNKNOWN', async () => {
  const composed = composeSeedPublication();
  const publication = await startPublication(composed);
  assert.ok(composed.engine.pendingWrite, 'the publication write is in flight');

  // Shutdown releases the in-flight write; the membership side has not yet
  // seen the released answer when teardown completes.
  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);
  const outcome = publication.readOutcome();

  assertTerminalTeardown(composed, outcome);
  // The CDC write path carries a partition answer by its text (the errors
  // owner's), not its code.
  assert.ok(linkedFailures(outcome.error).some((failure) =>
    failure.message === ERRORS.WRITE_OUTCOME_UNKNOWN),
  'the released write\'s unknown outcome stays on the answer as its cause');
  await publication.operation;
});

test('(ii-a) the write crossed its accepted boundary immediately before ' +
  'shutdown wins: the terminal answer, no visibility wait held', async () => {
  const composed = composeSeedPublication();
  const publication = await startPublication(composed);
  assert.ok(composed.engine.pendingWrite, 'the publication write is in flight');

  // Accepted, and shutdown begins in the same turn: the membership side has
  // not yet continued past the accepted write.
  composed.engine.accept();
  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalTeardown(composed, publication.readOutcome());
  await publication.operation;
});

test('(ii-b) the accepted write is waiting for cache visibility when ' +
  'shutdown wins: the wait ends at once with the terminal answer', async () => {
  const composed = composeSeedPublication();
  const publication = await startPublication(composed);
  composed.engine.accept();
  for (let turn = 0; turn < SETTLE_TURNS &&
    composed.timeSource.pendingTimerCount() === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the accepted write waits for its cache visibility on the CDC clock');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalTeardown(composed, publication.readOutcome());
  await publication.operation;
});
