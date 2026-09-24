// A membership publication in flight when its node shuts down ends on the CDC
// integration service's terminal lifecycle answer, in every order.
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
// shutting down, a write it routes or waits on answers the typed terminal
// SHUT_DOWN carrying what the write last answered as its cause (a released or
// accepted-but-unconfirmed write stays OUTCOME_UNKNOWN there); a write that
// arrives afterwards is refused before any engine, definitely not applied; and
// every wait or retry delay it holds for a write ends at once. Callers do not
// detect teardown: the control-plane classifier holds the answer terminal.
//
// Composition: the real membership publication coordinator, the real
// publications and nodes owners, the real gateway, the real CDC service on an
// injected clock, and the real seed cleanup step
// (SeedCleanupHandler.shutdownSqlQueryEngine). The one seam is the SQL engine,
// modelled on the partition write lifecycle: a routed write is held in flight
// until it is accepted or released with the write kernel's own released
// answer. Order is controlled by resolving that write or by the owner's retry
// sleep, never by a sleep; timers are read from the owners' own state (the CDC
// time source, the owner's retry sleep), never waited for.

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
  NodesOwner,
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
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ERRORS} from '../../src/constants/errors.js';

const NODE_ID = 'shutdown-node';
const JOINER_NODE_ID = 'joiner-node';
const PUBLICATION_ID = 'membership-publication:1';
const RELEASED_ENTRY_ID = 'released-entry';
const PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
// Event-loop turns the witness yields while the in-memory composition
// settles; a settled outcome needs few.
const SETTLE_TURNS = 50;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

function releasedWriteAnswer() {
  return buildReleasedPendingWriteAnswer({
    entryId: RELEASED_ENTRY_ID,
    proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
  }, PUBLICATIONS_PARTITION_ID,
  {cause: PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN});
}

// The SQL engine seam, on the partition write lifecycle: a routed write is
// held in flight until it is accepted or released (proposed, so its outcome
// is not known to this replica); the engine's shutdown releases what it holds.
function createInFlightEngine(shutdownState) {
  const engine = {
    writesAfterShutdown: 0,
    submissions: 0,
    pendingWrite: null,
    executeQuery() {
      engine.submissions += 1;
      if (shutdownState.begun) {
        engine.writesAfterShutdown += 1;
      }
      return new Promise((resolve) => {
        engine.pendingWrite = resolve;
      });
    },
    settle(answer) {
      const resolve = engine.pendingWrite;
      engine.pendingWrite = null;
      resolve(answer);
    },
    accept() {
      engine.settle({success: true, affectedRows: 1, rows: []});
    },
    release() {
      engine.settle(releasedWriteAnswer());
    },
    async shutdown() {
      if (engine.pendingWrite) {
        engine.release();
      }
    },
  };
  return engine;
}

function composeSeedWriters({withEngine = true, onOwnerSleep = null} = {}) {
  const shutdownState = {begun: false};
  const timeSource = new VirtualTimeSource();
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(), timeSource,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  const engine = createInFlightEngine(shutdownState);
  if (withEngine) {
    cdcIntegrationService.sqlQueryEngine = engine;
  }
  const retrySleepsAfterShutdown = [];
  let ownerNowMs = 0;
  const ownerOptions = {
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId: NODE_ID, cdcIntegrationService,
    }),
    // The owners' retry clock: a retry delay is recorded and moves the
    // clock, so a loop that re-arms is counted rather than waited for.
    controlPlaneWriteRetryNow: () => ownerNowMs,
    controlPlaneWriteRetrySleep: async (delayMs) => {
      if (shutdownState.begun) {
        retrySleepsAfterShutdown.push(delayMs);
      }
      ownerNowMs += delayMs;
      await onOwnerSleep?.();
    },
  };
  const publicationsOwner = new ControlPlanePublicationsOwner(ownerOptions);
  const nodesOwner = new NodesOwner(ownerOptions);
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: NODE_ID,
    controlPlanePublicationsOwner: publicationsOwner,
    logger: QUIET_LOGGER,
  });
  let registeredEngine = withEngine ? engine : null;
  const cleanup = new SeedCleanupHandler({delegates: {}});
  const shutDownSqlQueryEngine = () => {
    shutdownState.begun = true;
    return cleanup.shutdownSqlQueryEngine({
      getCdcIntegrationService: () => cdcIntegrationService,
      getSqlQueryEngine: () => registeredEngine,
      setSqlQueryEngine: (next) => {
        registeredEngine = next;
      },
    });
  };
  return {
    cdcIntegrationService, engine, timeSource, retrySleepsAfterShutdown,
    coordinator, nodesOwner, shutDownSqlQueryEngine,
  };
}

async function yieldTurns(turns) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function track(operation) {
  const box = {outcome: null};
  box.done = operation.then(
    (value) => {
      box.outcome = {value};
    },
    (error) => {
      box.outcome = {error};
    },
  );
  return box;
}

function startPublication(composed) {
  return track(composed.coordinator.persistPublicationRow({
    publication_id: PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    published_active_node_ids: [NODE_ID],
  }));
}

async function untilWriteInFlight(composed) {
  for (let turn = 0; turn < SETTLE_TURNS && !composed.engine.pendingWrite;
    turn += 1) {
    await yieldTurns(1);
  }
  assert.ok(composed.engine.pendingWrite, 'the write is in flight');
}

function linkedFailures(error) {
  const failures = [];
  for (let current = error; current; current = current.cause) {
    failures.push(current);
  }
  return failures;
}

// The externally relevant properties of any ordering: the operation settles
// with no clock moving, is never reported a success, is terminal, arms no
// retry delay and holds no timer after shutdown, and is not re-issued to an
// engine after shutdown began.
function assertTerminalAfterShutdown(composed, box) {
  assert.notEqual(box.outcome, null,
    'the write settles once shutdown wins, without any clock moving');
  assert.deepEqual(composed.retrySleepsAfterShutdown, [],
    'no retry delay is armed after shutdown began');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'the CDC service holds no timer after shutdown');
  assert.equal(composed.engine.writesAfterShutdown, 0,
    'the write is not re-issued to an engine after shutdown began');
  assert.ok(box.outcome.error instanceof Error,
    'a write shutdown overtook is never reported as a success');
  assert.equal(isRetryableControlPlaneError(box.outcome.error), false,
    'the control-plane classifier holds the answer terminal');
  assert.ok(typeof CDC_CONSTANTS.CDC_ERROR_CODE?.SHUT_DOWN === 'string' &&
    box.outcome.error.code === CDC_CONSTANTS.CDC_ERROR_CODE.SHUT_DOWN,
  'the answer is the CDC service\'s typed shut-down code');
}

// A write the engine held or accepted before shutdown is indeterminate: never
// answered as a write that did not happen.
function assertOutcomeUnknownCause(box) {
  assert.ok(linkedFailures(box.outcome.error).some((failure) =>
    failure.message === ERRORS.WRITE_OUTCOME_UNKNOWN),
  'the write\'s unknown outcome stays on the answer as its cause');
  assert.equal(box.outcome.error.writeOutcome,
    CDC_CONSTANTS.CDC_SHUT_DOWN_WRITE_OUTCOME?.NOT_CONFIRMED ?? 'a typed write outcome',
    'the answer says its outcome is not confirmed, never not routed');
}

test('(i) shutdown wins before the membership side continues: the released ' +
  'write ends terminal and stays OUTCOME_UNKNOWN', async () => {
  const composed = composeSeedWriters();
  const box = startPublication(composed);
  await untilWriteInFlight(composed);

  // Shutdown releases the in-flight write; the membership side has not yet
  // seen the released answer when teardown completes.
  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalAfterShutdown(composed, box);
  assertOutcomeUnknownCause(box);
  await box.done;
});

test('(ii-a) the write crossed its accepted boundary immediately before ' +
  'shutdown wins: terminal, its outcome not known here', async () => {
  const composed = composeSeedWriters();
  const box = startPublication(composed);
  await untilWriteInFlight(composed);

  composed.engine.accept();
  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalAfterShutdown(composed, box);
  assertOutcomeUnknownCause(box);
  await box.done;
});

test('(ii-b) the accepted write is waiting for cache visibility when ' +
  'shutdown wins: the wait ends at once, its outcome not known here',
async () => {
  const composed = composeSeedWriters();
  const box = startPublication(composed);
  await untilWriteInFlight(composed);
  composed.engine.accept();
  for (let turn = 0; turn < SETTLE_TURNS &&
    composed.timeSource.pendingTimerCount() === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the accepted write waits for its cache visibility on the CDC clock');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalAfterShutdown(composed, box);
  assertOutcomeUnknownCause(box);
  await box.done;
});

test('(iii) shutdown lands while the owner\'s retry loop sleeps: no ' +
  'further attempt, terminal', async () => {
  let composed = null;
  let shutdownDuringSleep = null;
  composed = composeSeedWriters({
    onOwnerSleep: async () => {
      if (shutdownDuringSleep === null) {
        shutdownDuringSleep = composed.shutDownSqlQueryEngine();
        await shutdownDuringSleep;
      }
    },
  });
  // One CDC attempt, so the released write reaches the owner's retry loop.
  composed.cdcIntegrationService.retryMaxAttempts = 1;
  const box = startPublication(composed);
  await untilWriteInFlight(composed);
  composed.engine.release();
  await yieldTurns(SETTLE_TURNS);

  assert.ok(shutdownDuringSleep, 'shutdown landed inside the owner\'s sleep');
  assertTerminalAfterShutdown(composed, box);
  // The owner's re-attempt arrived after shutdown: refused before any engine.
  assert.equal(box.outcome.error.writeOutcome,
    CDC_CONSTANTS.CDC_SHUT_DOWN_WRITE_OUTCOME?.NOT_ROUTED ?? 'a typed write outcome',
    'the owner\'s re-attempt is refused unrouted');
  await box.done;
});

test('(iv) shutdown lands while the CDC service holds its own retry delay: ' +
  'the delay ends at once, no further attempt', async () => {
  const composed = composeSeedWriters();
  const box = startPublication(composed);
  await untilWriteInFlight(composed);
  // Released while the service is live: the CDC loop arms its retry delay.
  composed.engine.release();
  for (let turn = 0; turn < SETTLE_TURNS &&
    composed.timeSource.pendingTimerCount() === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the CDC service holds its retry delay on its clock');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalAfterShutdown(composed, box);
  assertOutcomeUnknownCause(box);
  await box.done;
});

test('(v) shutdown lands while a write waits for an engine that never ' +
  'arrived: the delay ends at once, terminal', async () => {
  const composed = composeSeedWriters({withEngine: false});
  const box = track(composed.nodesOwner.upsertNode({
    node_id: JOINER_NODE_ID,
    node_address: `ws://${JOINER_NODE_ID}`,
    status: NODE_STATUS.ACTIVE,
  }));
  for (let turn = 0; turn < SETTLE_TURNS &&
    composed.timeSource.pendingTimerCount() === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the unwired service holds the write\'s retry delay on its clock');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assertTerminalAfterShutdown(composed, box);
  await box.done;
});

test('(vi) a write that arrives after shutdown began is refused before any ' +
  'engine: definitely not applied', async () => {
  const composed = composeSeedWriters();
  // The mark lands first; the engine is still registered.
  composed.cdcIntegrationService.markShuttingDown();
  const box = track(composed.nodesOwner.upsertNode({
    node_id: JOINER_NODE_ID,
    node_address: `ws://${JOINER_NODE_ID}`,
    status: NODE_STATUS.ACTIVE,
  }));
  await yieldTurns(SETTLE_TURNS);

  assert.equal(composed.engine.submissions, 0,
    'the write is never submitted to the still-registered engine');
  assert.notEqual(box.outcome, null, 'the write settles at once');
  assert.ok(box.outcome.error instanceof Error, 'the write is not applied');
  assert.equal(box.outcome.error.writeOutcome,
    CDC_CONSTANTS.CDC_SHUT_DOWN_WRITE_OUTCOME?.NOT_ROUTED ?? 'a typed write outcome',
    'the answer says the write was not routed');
  assert.equal(isRetryableControlPlaneError(box.outcome.error), false,
    'the control-plane classifier holds the answer terminal');
  await box.done;
});

// The persist loop: a failed answer does not prove the row is absent, so it
// reads the durable row back, except through a torn-down writer.
function persistThroughCommittingOwner(failure) {
  const table = new Map();
  const counts = {upserts: 0, reads: 0};
  const owner = {
    async getPublication(publicationId) {
      counts.reads += 1;
      return table.get(publicationId) || null;
    },
    async upsertPublication(row) {
      counts.upserts += 1;
      table.set(row.publication_id, {...row});
      throw failure;
    },
  };
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: NODE_ID, controlPlanePublicationsOwner: owner,
    logger: QUIET_LOGGER,
  });
  const box = track(coordinator.persistPublicationRow({
    publication_id: PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    published_active_node_ids: [NODE_ID],
  }));
  return {box, counts};
}

test('the publication persist loop reads a failed write back, except ' +
  'through a torn-down writer', async () => {
  const service = new CDCIntegrationService({nodeId: NODE_ID});
  service.markShuttingDown();
  const shutDown = await service.executeSQL(
    'INSERT OR REPLACE INTO control_plane_publications (publication_id) ' +
      'VALUES (?)', [PUBLICATION_ID]).then(() => null, (error) => error);
  const throughTornDown = persistThroughCommittingOwner(shutDown);
  await throughTornDown.box.done;
  assert.ok(throughTornDown.box.outcome.error,
    'a write answered shut down is not read back into a success');
  assert.deepEqual(throughTornDown.counts, {upserts: 1, reads: 1},
    'nothing is read back or re-attempted through a torn-down writer ' +
    '(the one read is the loop\'s pre-write read)');
});

test('an ordinary failure while the service is live is still read back: ' +
  'a committed publication answered failed is a success', async () => {
  const committedThenFailed = persistThroughCommittingOwner(
    new Error(CDC_CONSTANTS.CDC_ERROR_MSG.UPSERT_FAILED));
  await committedThenFailed.box.done;
  assert.ok(committedThenFailed.box.outcome.value,
    'the durable read-back finds the committed row');
  assert.deepEqual(committedThenFailed.counts, {upserts: 1, reads: 2},
    'one write, the pre-write read and the durable read-back');
});
