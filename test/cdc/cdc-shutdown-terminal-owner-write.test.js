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
//
// The CDC integration service's terminal boundary, witnessed as the owner's
// properties:
//
// - P-Q (quiescence). Once a CDC lifecycle owner has reached its terminal
//   state, no CDC-owned retry or publication work may remain pending, be
//   newly scheduled, or execute.
// - P-L (process liveness), kept distinct from P-Q. Terminal shutdown leaves
//   no referenced CDC-owned handle capable of keeping the process alive.
//
// The terminal boundary is markShuttingDown()'s first statement,
// `isShuttingDown = true` (cdc-integration-service-lifecycle.js). The service
// has no other lifecycle flag. The seed and join cleanups mark it before they
// shut the engine down and before the partitions release their writes. The
// owner's delayed-work primitives are delayUntilShutdown (a delay held until
// the mark) and holdUntilShutdown (a wait released at the mark).
//
// The proof has four owner-scoped legs. None of them counts global Node
// handles.
// - Census (structural). Every site in src/cdc that can create delayed work
//   is the primitive, a wait held by the primitive, or classified outside
//   P-Q and P-L with its reason. There is no bypass route: no delayOn, no
//   node:timers or timers/promises import, and no timer refresh.
// - Semantic. After the mark, the primitive arms nothing and resolves at once,
//   a hold is released at once, and every caller gets the terminal answer
//   instead of a retry.
// - State. After the mark the owner holds no pending timer on its clock and no
//   hold, and every waiter has settled with the terminal answer. On the real
//   clock, the owner work ledger (test/helpers/owner-work-ledger.js) holds no
//   pending owner handle (P-Q) and no referenced one (P-L).
// - Execution. No retry callback runs after the mark: the clock is moved past
//   every delay, and no engine write and no authoritative read follows.
// - In flight at the mark (round-8 R8-1, R8-2): the owner's read, repair and
//   routed-write work that awaits its transport when the mark lands. It is
//   driven through the real read flow, visibility repair and routed mutation,
//   with seams as low as the composition allows: the owner-RPC transport,
//   the engine's routing overlay and SQL entry, and the local partition
//   service. After the mark, no read is issued, no repair is applied, and no
//   engine or partition submission is made. The terminal answer stays
//   honest: nothing is counted caught up that was not applied before the
//   mark, the catch-up summary carries the owner's typed terminal code, and a
//   write whose outcome is unknown is not reported as not routed.
// - Routing (structural). Two checks that every read issue, overlay reseed,
//   repair apply, and engine or partition submission routes through the
//   owner's terminal gate (refuseIfTerminal):
//   - With only the gate answering terminal (the owner itself is not marked),
//     nothing reaches its transport and nothing is applied.
//   - With the owner live, every effect happens in the same synchronous step
//     as a gate consult, so no await separates the check from the effect.
//     The call sites that effect comes from are cross-checked against the
//     static list of every effect call site in src/cdc, write-router/
//     included.
// The end-to-end corroboration is seed-node-bootstrap (graceful shutdown
// within its accepted budget).
//
// Stated limits:
// - A retry the owner hands as data to a foreign scheduler that existed
//   before the ledger opened evades the ledger's attribution (verifier probe
//   verify-seed-parity/r8c/ledger-esc/probe2.out). No production instance is
//   known; only a census of the owner's hand-offs would close it.
// - The routing leg's static list names the effect methods it knows
//   (EFFECT_METHODS). An effect issued through a method outside that list is
//   seen only by the in-flight lanes' seam counts.

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
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {readdirSync} from 'node:fs';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';
import {
  censusCallSites,
  censusDelayedWorkSites,
  createOwnerWorkLedger,
  ownerCallSiteOnStack,
} from '../helpers/owner-work-ledger.js';
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
// Further than any delay the owner arms (retry delays, visibility budgets,
// the catch-up's retry-after answers).
const PAST_EVERY_DELAY_MS = 24 * 60 * 60 * 1000;
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_FILE = fileURLToPath(import.meta.url);
// The owner's files, subdirectories included (write-router/).
const CDC_OWNER_FILE = /[\\/]src[\\/]cdc[\\/](?:[\w-]+[\\/])*[\w-]+\.js$/u;

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

function composeSeedWriters({
  withEngine = true, onOwnerSleep = null, timeSource = new VirtualTimeSource(),
} = {}) {
  const shutdownState = {begun: false};
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

function startPublication(composed, persistOptions = undefined) {
  return track(composed.coordinator.persistPublicationRow({
    publication_id: PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    published_active_node_ids: [NODE_ID],
  }, persistOptions));
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
  assertOwnerQuiescent(composed);
}

// State and execution legs on the owner's clock: no hold is left, no timer
// is pending, and moving the clock past every delay runs no engine write.
function assertOwnerQuiescent(composed) {
  assert.equal(composed.cdcIntegrationService.shutdownReleases.size, 0,
    'the owner holds no wait or delay after the mark');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'no owner timer is pending after the mark (P-Q)');
  composed.timeSource.advance(PAST_EVERY_DELAY_MS);
  assert.equal(composed.engine.writesAfterShutdown, 0,
    'no engine write runs after the mark, however far the clock moves');
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
  const box = track(composed.nodesOwner.insertNode({
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
  const box = track(composed.nodesOwner.insertNode({
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

test('(vii) shutdown lands while the cache-visibility repair holds its ' +
  'retry delay: the delay ends at once, no further authoritative read',
async () => {
  const composed = composeSeedWriters();
  // The second seam: the authoritative row source answers the accepted row
  // not yet visible, so the repair is not confirmed and arms its retry delay.
  const authoritativeReads = {total: 0, afterShutdown: 0};
  composed.cdcIntegrationService.executeAuthoritativeSystemTableRead =
    async () => {
      authoritativeReads.total += 1;
      if (composed.cdcIntegrationService.isShuttingDown === true) {
        authoritativeReads.afterShutdown += 1;
      }
      return {success: true, rows: [], count: 0, rowCount: 0};
    };
  // The reconcile driver's write: it confirms through the CDC service's own
  // visibility repair rather than a publication read-back.
  const box = startPublication(composed, {skipPublicationWriteReadback: true});
  await untilWriteInFlight(composed);
  composed.engine.accept();
  // Move the CDC clock one step at a time until the visibility wait's budget
  // fires and the repair's first read has answered.
  for (let step = 0; step < composed.cdcIntegrationService.cacheWaitTimeoutMs &&
    authoritativeReads.total === 0; step += 1) {
    composed.timeSource.advance(1);
    await yieldTurns(2);
  }
  await yieldTurns(SETTLE_TURNS);
  assert.equal(authoritativeReads.total, 1, 'the repair read once');
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the repair holds its retry delay on the CDC clock');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);
  assertTerminalAfterShutdown(composed, box);
  // Even a clock that moves on arms no second repair read.
  composed.timeSource.advance(
    composed.cdcIntegrationService.authoritativeFallbackRetryDelayMs * 100);
  await yieldTurns(SETTLE_TURNS);
  assert.equal(authoritativeReads.afterShutdown, 0,
    'no authoritative read is issued after shutdown');
  assertOutcomeUnknownCause(box);
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

// Semantic leg: after the mark, the owner's primitives arm nothing.
test('semantic: after the mark the delayed-work primitive arms nothing and ' +
  'resolves at once, and a hold is released at once', async () => {
  const composed = composeSeedWriters();
  const service = composed.cdcIntegrationService;
  service.markShuttingDown();
  let delayed = false;
  service.delayUntilShutdown(PAST_EVERY_DELAY_MS).then(() => {
    delayed = true;
  });
  let released = false;
  service.holdUntilShutdown(() => {
    released = true;
  });
  await yieldTurns(SETTLE_TURNS);
  assert.equal(delayed, true, 'the delay resolves at once, holding nothing');
  assert.equal(released, true, 'a hold taken after the mark is released at once');
  assertOwnerQuiescent(composed);
});

// The catch-up: CDC-owned repair work (it re-reads the CDC-propagated tables
// from the authoritative owner and applies them to the local cache), retried
// on deferred answers. After the mark it reads nothing, holds nothing, runs
// no retry, settles, and reports no table it did not catch up as caught up.
const CATCHUP_TABLES = Object.freeze(['nodes', 'services']);

function deferAuthoritativeReads(composed) {
  const reads = {beforeMark: 0, afterMark: 0};
  composed.cdcIntegrationService.executeAuthoritativeSystemTableRead =
    async () => {
      if (composed.cdcIntegrationService.isShuttingDown === true) {
        reads.afterMark += 1;
      } else {
        reads.beforeMark += 1;
      }
      // Deferred by pressure: the catch-up retries after a delay.
      return {success: false, deferRetry: true, retryAfterMs: 500, rows: []};
    };
  return reads;
}

function assertCatchupAnsweredTerminal(box) {
  assert.notEqual(box.outcome, null,
    'the catch-up settles once the owner is marked, without any clock moving');
  const summary = box.outcome.value;
  if (summary) {
    assert.equal(summary.tablesHydrated, 0,
      'no table is reported caught up that was not');
    assert.equal(summary.rowsApplied, 0, 'no row is applied after the mark');
  } else {
    assert.ok(box.outcome.error instanceof Error,
      'a catch-up that does not answer a summary answers an error');
  }
}

test('catch-up: the mark lands while it sleeps between deferred reads: no ' +
  'further read, no pending timer, no retry runs', async () => {
  const composed = composeSeedWriters();
  const reads = deferAuthoritativeReads(composed);
  const box = track(composed.cdcIntegrationService
    .hydrateCdcPropagatedTablesFromAuthority({tables: [...CATCHUP_TABLES]}));
  for (let turn = 0; turn < SETTLE_TURNS &&
    composed.timeSource.pendingTimerCount() === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(reads.beforeMark, 1, 'the first read was deferred');
  assert.equal(composed.timeSource.pendingTimerCount(), 1,
    'the catch-up sleeps before its retry');

  await composed.shutDownSqlQueryEngine();
  await yieldTurns(SETTLE_TURNS);

  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'the catch-up holds no timer after the mark (P-Q)');
  assert.equal(reads.afterMark, 0, 'no authoritative read after the mark');
  assertCatchupAnsweredTerminal(box);
  composed.timeSource.advance(PAST_EVERY_DELAY_MS);
  await yieldTurns(SETTLE_TURNS);
  assert.equal(reads.afterMark, 0,
    'no authoritative read runs after the mark, however far the clock moves');
  assert.equal(composed.cdcIntegrationService.shutdownReleases.size, 0,
    'the owner holds nothing after the mark');
});

test('catch-up: started after the mark, it reads nothing and settles at once',
  async () => {
    const composed = composeSeedWriters();
    const reads = deferAuthoritativeReads(composed);
    await composed.shutDownSqlQueryEngine();
    const box = track(composed.cdcIntegrationService
      .hydrateCdcPropagatedTablesFromAuthority());
    await yieldTurns(SETTLE_TURNS);

    assert.equal(reads.afterMark, 0, 'no authoritative read after the mark');
    assert.equal(composed.timeSource.pendingTimerCount(), 0,
      'no timer is armed after the mark');
    assertCatchupAnsweredTerminal(box);
    composed.timeSource.advance(PAST_EVERY_DELAY_MS);
    await yieldTurns(SETTLE_TURNS);
    assert.equal(reads.afterMark, 0,
      'no authoritative read runs after the mark, however far the clock moves');
  });

// P-L and the ledger's P-Q legs on the owner's real clock: each kind of
// delayed work the owner holds when the mark lands leaves no pending and no
// referenced owner handle, runs no owner callback, and creates nothing.
const REAL_CLOCK_LANES = [
  {name: 'the routed-mutation retry delay', async drive(composed) {
    const box = startPublication(composed);
    await untilWriteInFlight(composed);
    composed.engine.release();
    return box;
  }},
  {name: 'the catch-up sleep', async drive(composed) {
    deferAuthoritativeReads(composed);
    return track(composed.cdcIntegrationService
      .hydrateCdcPropagatedTablesFromAuthority({tables: [...CATCHUP_TABLES]}));
  }},
];

for (const lane of REAL_CLOCK_LANES) {
  test(`real clock: ${lane.name} at the mark leaves no pending or ` +
    'referenced owner handle (P-Q, P-L)', async () => {
    const ledger = createOwnerWorkLedger({
      ownerFile: CDC_OWNER_FILE, testFile: TEST_FILE,
    });
    ledger.open();
    try {
      const composed = composeSeedWriters({timeSource: new RealTimeSource()});
      const box = await lane.drive(composed);
      await yieldTurns(SETTLE_TURNS);
      assert.ok(ledger.report().pending.length > 0,
        'the owner holds its delayed work on the real clock before the mark');

      ledger.markTerminal();
      await composed.shutDownSqlQueryEngine();
      await yieldTurns(SETTLE_TURNS);

      const report = ledger.report();
      assert.deepEqual(report.referenced, [],
        'no referenced owner handle keeps the process alive (P-L)');
      assert.deepEqual(report.pending, [],
        'no owner timer is pending after the mark (P-Q)');
      assert.deepEqual(report.executedAfterTerminal, [],
        'no owner callback runs after the mark');
      assert.deepEqual(report.createdAfterTerminal, [],
        'nothing is scheduled after the mark, from any stack');
      assert.notEqual(box.outcome, null, 'the work settles at the mark');
    } finally {
      ledger.close();
    }
  });
}

// The owner's effects: reads issued to a transport, the routing reseed,
// engine and partition submissions, and cache mutations.
const EFFECT_METHODS = Object.freeze(['executeOnPartition', 'executeLocalQuery',
  'executeQuery', 'installRecoveryRoutingOverlayEntry',
  'applySystemTableChange', 'reconcileAgainstAuthoritativeTruth']);

// Census leg: every site in the owner that can create delayed work.
const CDC_OWNER_FILES = Object.freeze(
  readdirSync(new URL('../../src/cdc/', import.meta.url), {recursive: true})
    .map((name) => String(name).split('\\').join('/'))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => `src/cdc/${name}`));
// (a) the primitive, and the one wait it holds; (c) outside P-Q and P-L.
const CLASSIFIED_TIMER_SITES = Object.freeze([
  // (c) A caller's confirmation wait, not CDC retry or publication work: its
  // timer only rejects the waiter. The tracker has its own shutdown() that
  // clears every timer, and no production code constructs it (PartitionService
  // takes it as an option).
  'src/cdc/cdc-confirmation-tracker.js:awaitConfirmation:setTimeout',
  // (a) The visibility wait's budget timer, held by holdUntilShutdown: the
  // mark releases the wait and its cleanup clears the timer.
  'src/cdc/cdc-integration-service-cache-visibility-wait.js:' +
    'waitForCacheUpdate:setTimeout',
  // (a) The primitive.
  'src/cdc/cdc-integration-service-lifecycle.js:delayUntilShutdown:setTimeout',
]);
// (c) Delayed-work helpers a src/cdc module imports from elsewhere.
const CLASSIFIED_IMPORTED_SLEEPS = Object.freeze([
  // A caller-owned startup readiness wait (seed and joiner), not CDC retry or
  // publication work; the callers inject their own sleep.
  'src/cdc/cdc-pipeline-readiness-gate.js:CDC_PIPELINE_READINESS_SLEEP',
]);
const IMPORT_CLAUSE =
  /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s*['"]([^'"]+)['"]/gu;
// A name that can carry delayed work: sleeping, delaying, waiting, timers,
// backoff, scheduling, deferral, polling, ticking, doing it later.
const DELAY_NAME =
  /sleep|delay(?!_?ms)|wait(?!for)|timer|backoff|schedul|defer(?!red)|later|tick|poll(?!_interval)/iu;
// Whether an import specifier resolves inside the owner (src/cdc).
function importsFromOwner(file, from) {
  if (!from.startsWith('.')) {
    return false;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(file), from));
  return resolved.startsWith('src/cdc/');
}

test('census: every CDC delayed-work site is the primitive or classified, ' +
  'with no bypass route', () => {
  const census = censusDelayedWorkSites(REPOSITORY_ROOT, CDC_OWNER_FILES);
  assert.deepEqual(census.timerSites, [...CLASSIFIED_TIMER_SITES],
    'no CDC timer outside the owner\'s primitive and the classified sites');
  const visibilityWait = census.text.get(
    'src/cdc/cdc-integration-service-cache-visibility-wait.js');
  assert.match(visibilityWait, /holdUntilShutdown\(/u,
    'the visibility wait is held by the owner\'s primitive');
  assert.deepEqual(census.forbiddenImports, [],
    'no node:timers or timers/promises import in the owner');
  assert.deepEqual(census.refreshCalls, [],
    'no timer is re-armed with refresh()');
  const bypass = [...census.text].filter(([, source]) =>
    /\bdelayOn\b/u.test(source)).map(([file]) => file);
  assert.deepEqual(bypass, [],
    'no delayOn: a sleep on the time source that bypasses the primitive');
  const importedSleeps = [];
  for (const [file, source] of census.text) {
    for (const [, defaultName, names = '', namespace, from] of
      source.matchAll(IMPORT_CLAUSE)) {
      if (importsFromOwner(file, from)) {
        continue;
      }
      for (const name of [defaultName, namespace, ...names.split(',').map(
        (entry) => entry.trim().split(/\s+as\s+/u).at(-1))].filter(Boolean)) {
        if (DELAY_NAME.test(name)) {
          importedSleeps.push(`${file}:${name}`);
        }
      }
    }
  }
  assert.deepEqual(importedSleeps.sort(), [...CLASSIFIED_IMPORTED_SLEEPS],
    'no delayed-work helper imported from outside the owner, but the ' +
    'classified ones');
});

// ---------------------------------------------------------------------------
// In flight at the mark: the owner's read, repair and routed-write work that
// is awaiting its transport when the mark lands. The real read flow, repair
// and routed mutation run; the seams are as low as the composition allows:
// the owner-RPC transport (queryExecutor.executeOnPartition), the engine's
// routing overlay and SQL entry (installRecoveryRoutingOverlayEntry,
// executeQuery), and the local partition service (executeLocalQuery,
// executeQuery). Every seam records whether it was called after the mark, and
// the cache records every change after the mark through its own listener.
// ---------------------------------------------------------------------------

const IN_FLIGHT_ROW = Object.freeze({
  node_id: 'in-flight-node', node_address: 'ws://in-flight-node',
  status: 'ACTIVE',
});

function heldAnswers() {
  const queue = [];
  return {
    queue,
    hold() {
      return new Promise((resolve, reject) => queue.push({resolve, reject}));
    },
    answer(value) {
      queue.shift().resolve(value);
    },
    fail(error) {
      queue.shift().reject(error);
    },
  };
}

function composeReadFlow({
  ownerRpc = null, localPartition = null, onSeam = null,
} = {}) {
  const timeSource = new VirtualTimeSource();
  const cache = new SystemTableCache();
  const afterMark = {
    ownerRpcReads: 0, localReads: 0, localWrites: 0, overlayReseeds: 0,
    engineSubmissions: 0, cacheChanges: 0,
  };
  const partitionServices = new Map();
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: cache, timeSource,
    partitionServicesProvider: partitionServices,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  const marked = () => cdcIntegrationService.isShuttingDown === true;
  const count = (seam) => {
    onSeam?.(seam);
    if (marked()) {
      afterMark[seam] += 1;
    }
  };
  cdcIntegrationService.messageRouter = {
    getConnectedNodes: () => ['peer-node'],
  };
  cdcIntegrationService.sqlQueryEngine = {
    queryExecutor: {
      executeOnPartition(...args) {
        count('ownerRpcReads');
        return ownerRpc ? ownerRpc(...args) :
          Promise.resolve({success: false, error: 'owner unavailable'});
      },
    },
    installRecoveryRoutingOverlayEntry() {
      count('overlayReseeds');
      return true;
    },
    executeQuery() {
      count('engineSubmissions');
      // An engine that never answers: a submission after the mark would hold
      // its caller.
      return new Promise(() => {});
    },
  };
  if (localPartition) {
    const partitionService = {
      partitionId: localPartition.partitionId,
      isLeader: true,
      getRole: () => 'leader',
      executeQuery(...args) {
        // A partition without a local query path reads through executeQuery.
        const isRead = /^\s*select/iu.test(String(args[0]));
        count(isRead ? 'localReads' : 'localWrites');
        return isRead ? localPartition.read(...args) :
          localPartition.write(...args);
      },
    };
    if (localPartition.localQuery !== false) {
      partitionService.executeLocalQuery = (...args) => {
        count('localReads');
        return localPartition.read(...args);
      };
    }
    partitionServices.set(localPartition.partitionId, partitionService);
  }
  // Every mutation of the cache, observed synchronously at the cache owner's
  // own entry points (its change listeners are notified later).
  for (const mutation of ['applySystemTableChange',
    'reconcileAgainstAuthoritativeTruth']) {
    const apply = cache[mutation]?.bind(cache);
    if (apply) {
      cache[mutation] = (...args) => {
        count('cacheChanges');
        return apply(...args);
      };
    }
  }
  return {cdcIntegrationService, cache, timeSource, afterMark, partitionServices};
}

const NOTHING_AFTER_THE_MARK = Object.freeze({
  ownerRpcReads: 0, localReads: 0, localWrites: 0, overlayReseeds: 0,
  engineSubmissions: 0, cacheChanges: 0,
});

// The work's own continuation, once the transport answers after the mark,
// issues no read, applies no repair and submits nothing, however far the
// clock then moves.
async function assertNothingAfterTheMark(composed) {
  await yieldTurns(SETTLE_TURNS);
  composed.timeSource.advance(PAST_EVERY_DELAY_MS);
  await yieldTurns(SETTLE_TURNS);
  assert.deepEqual({...composed.afterMark}, {...NOTHING_AFTER_THE_MARK},
    'no read issued, no repair applied and no engine or partition ' +
    'submission after the mark');
  assert.equal(composed.timeSource.pendingTimerCount(), 0,
    'no owner timer is pending after the mark');
}

// The catch-up's terminal answer is honest: nothing counted caught up that
// was not applied before the mark, every table not caught up reported
// failed, under the owner's typed terminal code.
function assertCatchupSummaryHonest(summary, tables, {appliedBeforeMark = 0} = {}) {
  assert.equal(summary.tablesHydrated, appliedBeforeMark,
    'only tables applied before the mark are counted caught up');
  assert.equal(summary.rowsApplied, appliedBeforeMark === 0 ? 0 : summary.rowsApplied,
    'no row is counted applied after the mark');
  assert.ok(tables.every((table) => summary.tablesFailed.includes(table)),
    'every table the mark cut off is reported failed');
  assert.equal(summary.code, CDC_CONSTANTS.CDC_ERROR_CODE?.SHUT_DOWN ??
    'the owner\'s typed terminal code',
  'the summary carries the owner\'s typed terminal code');
}

async function untilQueued(held) {
  for (let turn = 0; turn < SETTLE_TURNS && held.queue.length === 0;
    turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(held.queue.length, 1, 'the transport call is in flight');
}

test('in flight (S1): the catch-up\'s owner-RPC read is in flight at the ' +
  'mark and answers table-not-found: no reseed, no re-read, an honest ' +
  'terminal summary', async () => {
  const held = heldAnswers();
  const composed = composeReadFlow({ownerRpc: () => held.hold()});
  const catchup = track(composed.cdcIntegrationService
    .hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}));
  await untilQueued(held);
  composed.cdcIntegrationService.markShuttingDown();
  held.answer({success: false, errorCode: 'TABLE_NOT_FOUND',
    error: 'Table not found: nodes'});
  await assertNothingAfterTheMark(composed);
  assert.notEqual(catchup.outcome, null, 'the catch-up settles');
  assertCatchupSummaryHonest(catchup.outcome.value, ['nodes']);
});

test('in flight (K5): the catch-up\'s read is in flight at the mark and ' +
  'answers rows: nothing is applied or counted caught up', async () => {
  const held = heldAnswers();
  const composed = composeReadFlow({ownerRpc: () => held.hold()});
  const catchup = track(composed.cdcIntegrationService
    .hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}));
  await untilQueued(held);
  composed.cdcIntegrationService.markShuttingDown();
  held.answer({success: true, rows: [{...IN_FLIGHT_ROW}]});
  await assertNothingAfterTheMark(composed);
  assert.equal(composed.cache.has('nodes', IN_FLIGHT_ROW.node_id), false,
    'the read\'s rows are not applied after the mark');
  assert.notEqual(catchup.outcome, null, 'the catch-up settles');
  assertCatchupSummaryHonest(catchup.outcome.value, ['nodes']);
});

test('in flight (S2): the catch-up\'s local read is in flight at the mark ' +
  'and answers unusable: no owner-RPC read, no SQL fallback', async () => {
  const held = heldAnswers();
  const composed = composeReadFlow({
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => held.hold(),
      write: () => Promise.resolve({success: true}),
    },
  });
  const catchup = track(composed.cdcIntegrationService
    .hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}));
  await untilQueued(held);
  composed.cdcIntegrationService.markShuttingDown();
  held.answer({success: false, error: 'local replica not ready', rows: []});
  await assertNothingAfterTheMark(composed);
  assert.notEqual(catchup.outcome, null, 'the catch-up settles');
  assertCatchupSummaryHonest(catchup.outcome.value, ['nodes']);
});

// The visibility repair behind a write's cache wait: attempt 1 or its retry
// has its authoritative read in flight when the mark lands.
async function visibilityRepairInFlight(heldAttempt) {
  const held = heldAnswers();
  let reads = 0;
  const composed = composeReadFlow({
    ownerRpc: () => {
      reads += 1;
      // Before the held attempt the row is not yet authoritative: the repair
      // is not confirmed and retries after its delay.
      return reads < heldAttempt ?
        Promise.resolve({success: true, rows: []}) :
        held.hold();
    },
  });
  const wait = track(composed.cdcIntegrationService.waitForCacheUpdate(
    'nodes', IN_FLIGHT_ROW.node_id, true, {timeoutMs: 1000}));
  for (let step = 0; step < PAST_EVERY_DELAY_MS && held.queue.length === 0;
    step += 1) {
    composed.timeSource.advance(1);
    await yieldTurns(2);
  }
  assert.equal(held.queue.length, 1,
    `repair attempt ${heldAttempt}'s read is in flight`);
  composed.cdcIntegrationService.markShuttingDown();
  held.answer({success: true, rows: [{...IN_FLIGHT_ROW}]});
  await assertNothingAfterTheMark(composed);
  assert.equal(composed.cache.has('nodes', IN_FLIGHT_ROW.node_id), false,
    'the repair is not applied after the mark');
  assert.notEqual(wait.outcome, null, 'the waiter settles');
  assert.ok(wait.outcome.error instanceof Error,
    'the waiter is not answered visible');
  assert.equal(isRetryableControlPlaneError(wait.outcome.error), false,
    'the waiter\'s answer is terminal');
}

test('in flight (S4): the first visibility-repair read is in flight at the ' +
  'mark: the repair is not applied', async () => {
  await visibilityRepairInFlight(1);
});

test('in flight (S3): the visibility-repair retry\'s read is in flight at ' +
  'the mark: the repair is not applied', async () => {
  await visibilityRepairInFlight(2);
});

test('after the mark (S5, S6): the repair entry points read nothing and ' +
  'apply nothing', async () => {
  const composed = composeReadFlow({
    ownerRpc: () => Promise.resolve({success: true, rows: [{...IN_FLIGHT_ROW}]}),
  });
  const service = composed.cdcIntegrationService;
  service.markShuttingDown();
  const refreshed = await service.refreshAuthoritativeCacheRow(
    'nodes', IN_FLIGHT_ROW.node_id).then((value) => ({value}),
    (error) => ({error}));
  const repaired = await service.repairCacheVisibilityHole(
    'nodes', IN_FLIGHT_ROW.node_id, true, null, null, {})
    .then((value) => ({value}), (error) => ({error}));
  await assertNothingAfterTheMark(composed);
  assert.equal(composed.cache.has('nodes', IN_FLIGHT_ROW.node_id), false,
    'nothing is applied to the cache');
  assert.notEqual(refreshed.value, true, 'the refresh does not claim a repair');
  assert.notEqual(repaired.value?.cacheRepaired, true,
    'the hole repair does not claim a repair');
});

// A routed write whose local-leader leg is in flight at the mark.
async function routedWriteLocalLegInFlight(localAnswer) {
  const held = heldAnswers();
  const composed = composeReadFlow({
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => Promise.resolve({success: true, rows: []}),
      write: () => held.hold(),
    },
  });
  const write = track(composed.cdcIntegrationService.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)',
    [IN_FLIGHT_ROW.node_id, IN_FLIGHT_ROW.node_address, IN_FLIGHT_ROW.status]));
  await untilQueued(held);
  composed.cdcIntegrationService.markShuttingDown();
  localAnswer(held);
  await assertNothingAfterTheMark(composed);
  assert.notEqual(write.outcome, null,
    'the write settles without waiting on an engine');
  assert.ok(write.outcome.error instanceof Error,
    'the write is never reported a success');
  assert.equal(isRetryableControlPlaneError(write.outcome.error), false,
    'the write\'s answer is terminal');
  return write.outcome.error;
}

test('in flight (S7): the local-leader leg answers a transient failure ' +
  '(thrown): no engine submission after the mark', async () => {
  await routedWriteLocalLegInFlight((held) =>
    held.fail(new Error(ERRORS.PARTITION_SERVICE_NOT_FOUND)));
});

test('in flight (S7): the local-leader leg answers a reroutable failure ' +
  '(returned): no engine submission after the mark', async () => {
  await routedWriteLocalLegInFlight((held) =>
    held.answer({success: false, error: ERRORS.PARTITION_SERVICE_NOT_FOUND}));
});

test('in flight (S7, honesty): the local-leader leg answers an unknown ' +
  'outcome: the answer stays indeterminate, never not-applied', async () => {
  const error = await routedWriteLocalLegInFlight((held) =>
    held.answer(releasedWriteAnswer()));
  // The partition's answer is linked as the cause, as an error or as the
  // write kernel's typed result.
  assert.ok(linkedFailures(error).some((failure) =>
    failure.message === ERRORS.WRITE_OUTCOME_UNKNOWN ||
    failure.error === ERRORS.WRITE_OUTCOME_UNKNOWN),
  'the unknown outcome stays on the answer as its cause');
  assert.notEqual(error.writeOutcome,
    CDC_CONSTANTS.CDC_SHUT_DOWN_WRITE_OUTCOME?.NOT_ROUTED,
    'a write the partition may have applied is not reported not routed');
});

// Structural leg, by routing: every read issue, repair apply and engine or
// partition submission passes the owner's terminal gate. The gate alone is
// made to answer terminal (the owner itself is not marked): an operation
// that reaches its transport or applies anyway does not route through the
// gate.
function forceGateTerminal(service) {
  assert.equal(typeof service.refuseIfTerminal, 'function',
    'the owner has one terminal gate (refuseIfTerminal)');
  const terminalTwin = new CDCIntegrationService({
    nodeId: NODE_ID, systemTableCache: new SystemTableCache(),
    timeSource: new VirtualTimeSource(),
  });
  terminalTwin.logger = QUIET_LOGGER;
  terminalTwin.markShuttingDown();
  const gateCalls = [];
  service.refuseIfTerminal = (...args) => {
    gateCalls.push(args[0]);
    return terminalTwin.refuseIfTerminal(...args);
  };
  return gateCalls;
}

test('routing: with only the gate answering terminal, no read, repair ' +
  'apply or submission reaches its transport', async () => {
  const seamCalls = {
    ownerRpcReads: 0, localReads: 0, localWrites: 0, overlayReseeds: 0,
    engineSubmissions: 0,
  };
  const composed = composeReadFlow({
    ownerRpc: () => {
      seamCalls.ownerRpcReads += 1;
      return Promise.resolve({success: true, rows: [{...IN_FLIGHT_ROW}]});
    },
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => {
        seamCalls.localReads += 1;
        return Promise.resolve({success: true, rows: [{...IN_FLIGHT_ROW}]});
      },
      write: () => {
        seamCalls.localWrites += 1;
        return Promise.resolve({success: true, affectedRows: 1});
      },
    },
  });
  composed.seamCalls = seamCalls;
  const service = composed.cdcIntegrationService;
  const engine = service.sqlQueryEngine;
  const executeQuery = engine.executeQuery;
  engine.executeQuery = (...args) => {
    seamCalls.engineSubmissions += 1;
    return executeQuery(...args);
  };
  const gateCalls = forceGateTerminal(service);
  const settle = (operation) => operation.then((value) => ({value}),
    (error) => ({error}));
  const catchup = await settle(
    service.hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}));
  const refreshed = await settle(
    service.refreshAuthoritativeCacheRow('nodes', IN_FLIGHT_ROW.node_id));
  const repaired = await settle(service.repairCacheVisibilityHole(
    'nodes', IN_FLIGHT_ROW.node_id, true, null, null, {}));
  const write = await settle(service.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)',
    [IN_FLIGHT_ROW.node_id, IN_FLIGHT_ROW.node_address, IN_FLIGHT_ROW.status]));
  const directRepair = service.applyAuthoritativeCacheRepair(
    'nodes', 'UPSERT', {...IN_FLIGHT_ROW}, IN_FLIGHT_ROW.node_id);
  await yieldTurns(SETTLE_TURNS);
  assert.deepEqual({...composed.seamCalls}, {
    ownerRpcReads: 0, localReads: 0, localWrites: 0, overlayReseeds: 0,
    engineSubmissions: 0,
  }, 'every read, write and reseed is refused at the gate');
  assert.equal(composed.cache.has('nodes', IN_FLIGHT_ROW.node_id), false,
    'every repair apply is refused at the gate');
  assert.notEqual(directRepair, true, 'a direct apply answers not applied');
  assert.ok(gateCalls.length > 0, 'the operations consulted the gate');
  assert.equal(catchup.value?.tablesHydrated ?? 0, 0,
    'the refused catch-up counts nothing caught up');
  assert.notEqual(refreshed.value, true, 'the refused refresh claims nothing');
  assert.notEqual(repaired.value?.cacheRepaired, true,
    'the refused hole repair claims nothing');
  assert.ok(write.error instanceof Error, 'the refused write is not a success');
});

// Structural leg, per hop: every read issue, overlay reseed, repair apply and
// engine or partition submission is gated in the same synchronous step, with
// no await between the owner's gate and the effect. The owner is live (the
// gate lets everything through); the flows exercise every stage: a reseed
// retry, the local read and its owner-RPC fallback, the SQL fallback, the
// visibility repair and its retry, the refresh entry point, the routed write's
// local leg and engine hop, and the bootstrap direct write.
test('routing: every read, reseed, repair apply and submission is gated in ' +
  'the same synchronous step', async () => {
  const ungated = [];
  const seen = new Set();
  const exercisedSites = new Set();
  let gatedStep = false;
  const onSeam = (seam) => {
    seen.add(seam);
    const site = ownerCallSiteOnStack(REPOSITORY_ROOT, CDC_OWNER_FILE) ?? seam;
    exercisedSites.add(site);
    if (!gatedStep) {
      ungated.push(site);
    }
  };
  const wireGate = (service) => {
    assert.equal(typeof service.refuseIfTerminal, 'function',
      'the owner has one terminal gate (refuseIfTerminal)');
    const gate = service.refuseIfTerminal.bind(service);
    service.refuseIfTerminal = (...args) => {
      gatedStep = true;
      queueMicrotask(() => {
        gatedStep = false;
      });
      return gate(...args);
    };
  };
  const rpcAnswers = [];
  const composed = composeReadFlow({
    onSeam,
    ownerRpc: () => Promise.resolve(rpcAnswers.shift() ??
      {success: true, rows: [{...IN_FLIGHT_ROW}]}),
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => Promise.resolve({success: false, error: 'not ready', rows: []}),
      write: () => Promise.reject(new Error(ERRORS.PARTITION_SERVICE_NOT_FOUND)),
    },
  });
  const service = composed.cdcIntegrationService;
  wireGate(service);
  const engine = service.sqlQueryEngine;
  engine.executeQuery = () => {
    onSeam('engineSubmissions');
    return Promise.resolve({success: true, affectedRows: 1, rows: []});
  };
  // Drive each flow to its answer, moving the owner's clock through any
  // retry delay it takes.
  const settle = async (operation, timeSource = composed.timeSource) => {
    let done = false;
    const settled = operation.then(() => {
      done = true;
    }, () => {
      done = true;
    });
    for (let step = 0; step < 1000 && !done; step += 1) {
      timeSource.advance(100);
      await yieldTurns(2);
    }
    await settled;
  };
  // A reseed retry, then the local read's owner-RPC fallback, then a deferred
  // owner-RPC answer that may take the SQL fallback.
  rpcAnswers.push({success: false, errorCode: 'TABLE_NOT_FOUND',
    error: 'Table not found: nodes'});
  await settle(service.hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}));
  rpcAnswers.push({success: false, deferRetry: true, retryAfterMs: 1,
    error: 'deferred'});
  await settle(service.refreshAuthoritativeCacheRow('nodes', 'other-node'));
  // The visibility repair and its retry.
  rpcAnswers.push({success: true, rows: []});
  await settle(service.waitForCacheUpdate('nodes', 'repair-node', true,
    {timeoutMs: 1000}));
  // The routed write: the local leg answers transient, the engine takes it.
  await settle(service.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)',
    [IN_FLIGHT_ROW.node_id, IN_FLIGHT_ROW.node_address, IN_FLIGHT_ROW.status]));
  // The bootstrap direct write, on a service in bootstrap mode.
  const bootstrap = composeReadFlow({
    onSeam,
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => Promise.resolve({success: true, rows: []}),
      write: () => Promise.resolve({success: true, affectedRows: 1}),
    },
  });
  wireGate(bootstrap.cdcIntegrationService);
  bootstrap.cdcIntegrationService.setBootstrapMode(true,
    bootstrap.partitionServices);
  await settle(bootstrap.cdcIntegrationService.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)',
    [IN_FLIGHT_ROW.node_id, IN_FLIGHT_ROW.node_address, IN_FLIGHT_ROW.status]),
  bootstrap.timeSource);
  await yieldTurns(SETTLE_TURNS);

  // A local partition with no local query path (reads via executeQuery), the
  // bootstrap direct read, and the bootstrap direct fan-out when the raft lane
  // fails; the sweep entry point.
  const noLocalQuery = composeReadFlow({
    onSeam,
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      localQuery: false,
      read: () => Promise.resolve({success: true, rows: [{...IN_FLIGHT_ROW}]}),
      write: () => Promise.resolve({success: true, affectedRows: 1}),
    },
  });
  wireGate(noLocalQuery.cdcIntegrationService);
  await settle(noLocalQuery.cdcIntegrationService
    .hydrateCdcPropagatedTablesFromAuthority({tables: ['nodes']}),
  noLocalQuery.timeSource);
  const fanOut = composeReadFlow({
    onSeam,
    localPartition: {
      partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      read: () => Promise.resolve({success: true, rows: []}),
      write: () => Promise.resolve({success: false, error: 'no raft lane'}),
    },
  });
  wireGate(fanOut.cdcIntegrationService);
  fanOut.cdcIntegrationService.setBootstrapMode(true, fanOut.partitionServices);
  await settle(fanOut.cdcIntegrationService.executeSQL(
    'SELECT * FROM nodes WHERE node_id = ?', [IN_FLIGHT_ROW.node_id]),
  fanOut.timeSource);
  await settle(fanOut.cdcIntegrationService.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)',
    [IN_FLIGHT_ROW.node_id, IN_FLIGHT_ROW.node_address, IN_FLIGHT_ROW.status]),
  fanOut.timeSource);
  // The SQL fallback of an owner-RPC-preferred read whose owner answer is
  // deferred.
  rpcAnswers.push({success: false, deferRetry: true, retryAfterMs: 1,
    error: 'deferred'});
  await settle(service.executeAuthoritativeSystemTableRead('nodes',
    'SELECT * FROM nodes', [], {
      readAuthority: buildControlPlaneReadAuthority({
        authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      }),
    }));
  // The sweep entry point, with the owner's own mutation snapshot.
  service.applyAuthoritativeCacheSweep('nodes', [], {
    readStartedAtMs: Date.now(),
    authoritativeObservedAtMs: Date.now(),
    mutationSnapshot: service.captureAuthoritativeCacheSweepSnapshot('nodes'),
  });
  await yieldTurns(SETTLE_TURNS);

  for (const exercised of ['ownerRpcReads', 'overlayReseeds', 'localReads',
    'localWrites', 'engineSubmissions', 'cacheChanges']) {
    assert.ok(seen.has(exercised), `the flows exercise ${exercised}`);
  }
  assert.deepEqual(ungated, [],
    'every effect is gated in the same synchronous step as the owner\'s gate');
  // Every read, reseed, apply and submission call site in the owner is one
  // the flows exercised through the gate.
  const effectSites = [...new Set(censusCallSites(REPOSITORY_ROOT,
    CDC_OWNER_FILES, EFFECT_METHODS).map((site) =>
    site.split(':').slice(0, 2).join(':')))].sort();
  assert.deepEqual(effectSites.filter((site) => !exercisedSites.has(site)), [],
    'every effect call site in the owner is exercised through the gate');
});
