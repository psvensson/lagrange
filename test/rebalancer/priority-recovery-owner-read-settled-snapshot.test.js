/**
 * Priority-recovery owner-read deferral reads a settled planning snapshot
 * (quest priority-recovery-owner-read-snapshot-await).
 *
 * The replica-operation repository decides whether a failed or slow-empty
 * authoritative operation read DEFERS (keeps the last observed operations
 * and states a deferred outcome) from the readiness service's planning
 * answer: a publication that is not PUBLISHED, or an unspread priority
 * partition, means priority recovery is active. Its owner read once handed
 * the callers the unawaited Promise of an async BestEffort alias instead of
 * the answer, so `isPriorityRecoveryOwnerReadActive` saw an object with no
 * fields and deferral never read as active. PR #201 moved the owner read to
 * the canonical reader (readPriorityRecoveryPlanningAnswerSync); this file
 * keeps it there: a resolver that answers a Promise, or null, fails the
 * active-side assertions, and one that reads active regardless fails the
 * PUBLISHED-side ones.
 *
 * Every witness here uses the REAL readiness service (one construction,
 * test/helpers/readiness-service-fixture.js) over a membership-publication
 * double whose latest publication is ESTABLISHING (recovery active) or
 * PUBLISHED (not active), and the repository's own clock passed through.
 *
 * Receipt owner-read-deferral-reads-a-settled-snapshot:
 * - the owner read answers a settled snapshot, not a thenable;
 * - sync caller (rebalance-coordinator-pressure-helper): recovery active;
 * - async callers (incomplete read, single-operation visibility read,
 *   entity visibility read): deferral active when the snapshot says so,
 *   and NOT active when the snapshot is PUBLISHED.
 * The alias-family witness is
 * test/rebalancer/priority-recovery-planning-best-effort-alias-collapsed.test.js.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  resolvePriorityRecoveryPlanningEvidence,
} from '../../src/rebalancer/rebalance-coordinator-pressure-helper.js';
import {createCache} from
  '../control-plane/control-plane-readiness-service-test-support.js';
import {createReadinessServiceForTest} from
  '../helpers/readiness-service-fixture.js';

const NODE_ID = 'owner-read-node';
const OPERATION_ID = 'owner-read-op';
const ENTITY_TYPE = 'partition';
const ENTITY_ID = 'user_table-p1';
const PRIORITY_PARTITION_ID = 'replica_operations-p1';
const START_MS = 1_700_000_000_000;
// The repository's slow-empty-read threshold is one second; the read below
// takes two on the repository's own clock.
const SLOW_READ_MS = 2_000;
const PUBLICATION_ESTABLISHING = 'ESTABLISHING';
const PUBLICATION_PUBLISHED = 'PUBLISHED';
const NON_RETRYABLE_READ_FAILURE = Object.freeze({
  success: false,
  error: 'owner read refused',
  errorCode: 'OWNER_READ_REFUSED',
});
const DEFERRED_STATE =
  PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED;
const INCOMPLETE_FAILURE_SOURCE =
  'priority_recovery_authoritative_operation_failure';
const VISIBILITY_FAILURE_SOURCE =
  'priority_recovery_authoritative_operation_visibility_failure';
const VISIBILITY_EMPTY_READ_SOURCE =
  'priority_recovery_authoritative_operation_visibility_empty_read';
const ENTITY_EMPTY_READ_SOURCE = 'priority_recovery_entity_operation_empty_read';

function publicationRow(status, now) {
  return {
    publicationEpoch: 1,
    status,
    createdAt: now,
    publishedActiveNodeIds: [NODE_ID],
  };
}

function createClock() {
  const clock = {nowMs: START_MS};
  clock.timeSource = {now: () => clock.nowMs};
  return clock;
}

// The REAL readiness owner: its planning answer derives from the latest
// publication the membership-publication double returns.
// `publication.status` is read on every planning derivation, so a status
// change lands in the next planning answer.
function createReadinessOwner(publication, clock) {
  return createReadinessServiceForTest({
    nodeId: NODE_ID,
    systemTableCache: createCache(),
    membershipPublicationService: {
      getLatestPublicationForNodeSync() {
        return publicationRow(publication.status, clock.nowMs);
      },
    },
    now: () => clock.nowMs,
  });
}

// `statusDuringRead`, when given, is the publication status the
// authoritative read leaves behind: the publication changes while the read
// is in flight, after any planning answer captured before it.
function createRepository({
  status,
  readResult,
  readDurationMs = 0,
  statusDuringRead = null,
}) {
  const clock = createClock();
  const publication = {status};
  const readCalls = [];
  const read = async (tableName, sql, params) => {
    readCalls.push({tableName, sql, params});
    clock.nowMs += readDurationMs;
    if (statusDuringRead) {
      publication.status = statusDuringRead;
    }
    return readResult;
  };
  const repository = new ReplicaOperationRepository({
    nodeId: NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: {
      readRows: read,
      readAuthoritativeRows: read,
      executeQuery: async () => ({success: true}),
    },
    controlPlaneReadinessService: createReadinessOwner(publication, clock),
    logger: {info() {}, warn() {}, error() {}, debug() {}},
    timeSource: clock.timeSource,
  });
  return {repository, readCalls, publication};
}

test('owner read answers a settled planning snapshot, never a thenable', async (t) => {
  const {repository} = createRepository({
    status: PUBLICATION_ESTABLISHING,
    readResult: {success: true, rows: []},
  });
  const snapshot = repository.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();
  t.ok(snapshot && typeof snapshot === 'object', 'the owner read answers a snapshot');
  t.equal(typeof snapshot?.then, 'undefined', 'the snapshot is settled, not a Promise');
  t.equal(
    snapshot?.publicationStatus,
    PUBLICATION_ESTABLISHING,
    'the snapshot is the readiness planning answer for the latest publication',
  );
  t.equal(
    repository.isPriorityRecoveryOwnerReadActive(snapshot),
    true,
    'an ESTABLISHING publication reads as active priority recovery',
  );
});

test('sync caller: the pressure helper reads recovery active from the settled snapshot',
  async (t) => {
    for (const [status, active] of [
      [PUBLICATION_ESTABLISHING, true],
      [PUBLICATION_PUBLISHED, false],
    ]) {
      const {repository} = createRepository({
        status,
        readResult: {success: true, rows: []},
      });
      const evidence = resolvePriorityRecoveryPlanningEvidence(
        {repository},
        PRIORITY_PARTITION_ID,
      );
      t.equal(
        evidence.recoveryActive,
        active,
        `a ${status} publication reads recoveryActive=${active}`,
      );
    }
  });

test('async caller: a failed incomplete-operation read defers while recovery is active',
  async (t) => {
    const active = createRepository({
      status: PUBLICATION_ESTABLISHING,
      readResult: NON_RETRYABLE_READ_FAILURE,
    });
    await active.repository.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });
    t.equal(active.readCalls.length, 1, 'the authoritative read was attempted');
    const outcome = active.repository.getLastIncompleteOperationReadOutcome();
    t.equal(outcome?.completionState, DEFERRED_STATE,
      'the failed read is a deferred outcome, not an empty answer');
    t.equal(outcome?.source, INCOMPLETE_FAILURE_SOURCE,
      'the deferral names the authoritative-read failure');

    const steady = createRepository({
      status: PUBLICATION_PUBLISHED,
      readResult: NON_RETRYABLE_READ_FAILURE,
    });
    await steady.repository.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });
    t.equal(steady.repository.getLastIncompleteOperationReadOutcome(), null,
      'with a PUBLISHED publication the same failure does not defer');
  });

test('async caller: the single-operation visibility read defers while recovery is active',
  async (t) => {
    for (const [readResult, source] of [
      [NON_RETRYABLE_READ_FAILURE, VISIBILITY_FAILURE_SOURCE],
      [{success: true, rows: []}, VISIBILITY_EMPTY_READ_SOURCE],
    ]) {
      const active = createRepository({status: PUBLICATION_ESTABLISHING, readResult});
      const observation =
        await active.repository.queryAuthoritativeOperationVisibilityObservation(
          OPERATION_ID,
          {allowPriorityRecoveryDeferredVisibility: true},
        );
      t.equal(
        observation?.deferredOutcome?.confirmationState,
        REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
        `${source}: the absent operation is deferred, not confirmed missing`,
      );
      t.equal(observation?.deferredOutcome?.source, source,
        `${source}: the deferral names its cause`);

      const steady = createRepository({status: PUBLICATION_PUBLISHED, readResult});
      const steadyObservation =
        await steady.repository.queryAuthoritativeOperationVisibilityObservation(
          OPERATION_ID,
          {allowPriorityRecoveryDeferredVisibility: true},
        );
      t.equal(steadyObservation?.deferredOutcome ?? null, null,
        `${source}: with a PUBLISHED publication nothing defers`);
    }
  });

test('async caller: a slow empty entity read defers while recovery is active',
  async (t) => {
    const active = createRepository({
      status: PUBLICATION_ESTABLISHING,
      readResult: {success: true, rows: []},
      readDurationMs: SLOW_READ_MS,
    });
    const observation =
      await active.repository.getOperationsByEntityAuthoritativeObservation(
        ENTITY_TYPE,
        ENTITY_ID,
      );
    t.equal(observation?.deferredOutcome?.source, ENTITY_EMPTY_READ_SOURCE,
      'the slow empty read is deferred while priority recovery is active');

    const steady = createRepository({
      status: PUBLICATION_PUBLISHED,
      readResult: {success: true, rows: []},
      readDurationMs: SLOW_READ_MS,
    });
    const steadyObservation =
      await steady.repository.getOperationsByEntityAuthoritativeObservation(
        ENTITY_TYPE,
        ENTITY_ID,
      );
    t.equal(steadyObservation?.deferredOutcome ?? null, null,
      'with a PUBLISHED publication the slow empty read is an answer');
  });

// Currency: the decision reads the planning answer as of the decision, not
// one captured earlier. Each case captures the answer first (through the
// sync helper), lets the publication status change during the
// authoritative read, and asserts the outcome follows the new status. A
// resolver that served the first answer it computed passes every case
// above and fails these.
const STATUS_FLIPS = Object.freeze([
  Object.freeze({
    from: PUBLICATION_ESTABLISHING,
    to: PUBLICATION_PUBLISHED,
    defers: false,
  }),
  Object.freeze({
    from: PUBLICATION_PUBLISHED,
    to: PUBLICATION_ESTABLISHING,
    defers: true,
  }),
]);

function createFlippingRepository(flip, readResult, readDurationMs = 0) {
  const fixture = createRepository({
    status: flip.from,
    readResult,
    readDurationMs,
    statusDuringRead: flip.to,
  });
  const before = resolvePriorityRecoveryPlanningEvidence(
    {repository: fixture.repository},
    PRIORITY_PARTITION_ID,
  );
  return {...fixture, before};
}

test('currency: the sync helper follows the publication status at each read',
  async (t) => {
    for (const flip of STATUS_FLIPS) {
      const {repository, before} = createFlippingRepository(
        flip,
        {success: true, rows: []},
      );
      t.equal(before.recoveryActive, !flip.defers,
        `${flip.from}: the helper reads recoveryActive=${!flip.defers} first`);
      await repository.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const after = resolvePriorityRecoveryPlanningEvidence(
        {repository},
        PRIORITY_PARTITION_ID,
      );
      t.equal(after.recoveryActive, flip.defers,
        `${flip.from} -> ${flip.to}: the helper reads recoveryActive=${flip.defers}`);
    }
  });

test('currency: a failed incomplete-operation read defers on the status at decision time',
  async (t) => {
    for (const flip of STATUS_FLIPS) {
      const {repository, readCalls} = createFlippingRepository(
        flip,
        NON_RETRYABLE_READ_FAILURE,
      );
      await repository.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      t.equal(readCalls.length, 1, `${flip.from} -> ${flip.to}: one authoritative read`);
      t.equal(
        repository.getLastIncompleteOperationReadOutcome()?.completionState ?? null,
        flip.defers ? DEFERRED_STATE : null,
        `${flip.from} -> ${flip.to}: deferred=${flip.defers}`,
      );
    }
  });

test('currency: the single-operation visibility read defers on the status at decision time',
  async (t) => {
    for (const flip of STATUS_FLIPS) {
      for (const [readResult, source] of [
        [NON_RETRYABLE_READ_FAILURE, VISIBILITY_FAILURE_SOURCE],
        [{success: true, rows: []}, VISIBILITY_EMPTY_READ_SOURCE],
      ]) {
        const {repository} = createFlippingRepository(flip, readResult);
        const observation =
          await repository.queryAuthoritativeOperationVisibilityObservation(
            OPERATION_ID,
            {allowPriorityRecoveryDeferredVisibility: true},
          );
        t.equal(
          observation?.deferredOutcome?.source ?? null,
          flip.defers ? source : null,
          `${source}, ${flip.from} -> ${flip.to}: deferred=${flip.defers}`,
        );
      }
    }
  });

test('currency: a slow empty entity read defers on the status at decision time',
  async (t) => {
    for (const flip of STATUS_FLIPS) {
      const {repository} = createFlippingRepository(
        flip,
        {success: true, rows: []},
        SLOW_READ_MS,
      );
      const observation =
        await repository.getOperationsByEntityAuthoritativeObservation(
          ENTITY_TYPE,
          ENTITY_ID,
        );
      t.equal(
        observation?.deferredOutcome?.source ?? null,
        flip.defers ? ENTITY_EMPTY_READ_SOURCE : null,
        `${flip.from} -> ${flip.to}: deferred=${flip.defers}`,
      );
    }
  });
