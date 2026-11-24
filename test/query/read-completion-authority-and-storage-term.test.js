// Review §3 & §4 regression and mutation-control witnesses:
// 1. Inseparable read-completion authority boundary (createInvocationTermFloorTracker
//    / invocation.completeDelivery & finalizeAcceptedResult) across all 6 held-response
//    cases on Direct, Redirected (both readDelivery and direct), and Retained
//    (readDelivery.select after routing probe) delivery paths, plus deliberate
//    mutation controls rejecting unsealed envelopes, unissued tickets, cross-invocation
//    seals, and post-validation deadline/abort gaps.
// 2. Storage-owned persisted term observation (observePersistedPartitionTerm via
//    RaftRsDurableStore, sqliteConnectionState, and retained-read-view-custody)
//    across the complete production replica lifecycle, snapshot replacement,
//    artifact deletion, same-path recreation, failed-close custody retention and
//    capacity consumption, process-restart empty cache, typed read failures, and
//    live-owner unavailability precedence over disk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION as DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {removeReplicaStorageArtifacts} from '../../src/node/replica-storage-artifacts.js';
import {
  QUERY_ERROR_CODE,
  QUERY_RESPONSE_TYPE,
} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  DEADLINE_EXPIRED_COMPLETION_CODE,
  READ_COMPLETION_STATE,
  READ_ROUTE_SUPERSEDED_CODE,
  UNISSUED_READ_TICKET_CODE,
  UNSEALED_READ_COMPLETION_CODE,
  createInvocationTermFloorTracker,
  resolveSelfPublishedLeaderTermFloor,
} from '../../src/query/query-executor-self-leader-term-floor.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {
  RaftRsDurableStore,
  observePersistedPartitionTerm,
} from '../../src/raft/raft-rs-durable-store.js';
import {getPartitionDbPath} from '../../src/storage/data-directory-manager.js';
import {
  CUSTODY_ERROR_CODE,
  PERSISTED_TERM_STATE,
  PERSISTED_TERM_UNAVAILABLE_REASON,
  assertStorageArtifactsUnlinkSafe,
  createPersistedPartitionTermObserver,
  endStorageIncarnationCustody,
  getPersistedTermReaderStats,
  getRetainedPersistedTermReader,
  inspectDbPathCustody,
  resetPersistedTermReaders,
} from '../../src/storage/retained-read-view-custody.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const PARTITION = 'sys_ledger-p1';
const TABLE = 'sys_ledger';
const READ_SQL = 'SELECT operation_id, workflow_step FROM sys_ledger WHERE operation_id = ?';
const OPERATION = 'op-read-completion-authority';
const READ_BUDGET_MS = 4000;
const PROBE_INTERVAL_MS = 50;

function createTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.teardown(() => {
    resetPersistedTermReaders('test_teardown');
    fs.rmSync(dir, {recursive: true, force: true});
  });
  return dir;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function buildLeaderWitness({nodeId, replicaId, term, leaderRead}) {
  return Object.freeze({
    appliedIndex: 12,
    commitIndex: 12,
    currentTermApplied: true,
    ...(leaderRead ? {leaderRead} : {}),
    observedAtMs: Date.now(),
    partitionId: PARTITION,
    role: RAFT_ROLE.LEADER,
    servingNodeId: nodeId,
    servingReplicaId: replicaId,
    state: 'observed',
    term,
  });
}

function seedDurableStoreTerm(dataDir, partitionId, replicaId, term, commit = 1) {
  const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const store = new RaftRsDurableStore(db);
  try {
    store.persistReady(partitionId, {
      hardState: {
        commit: String(commit),
        term: String(term),
        vote: '1',
      },
      mustSync: true,
    });
  } finally {
    store.close();
  }
  return dbPath;
}

const DELIVERY_MODES = Object.freeze([
  Object.freeze({
    kind: 'direct',
    label: 'direct (!readDelivery)',
    useReadDelivery: false,
    useRedirect: false,
  }),
  Object.freeze({
    kind: 'redirected-direct',
    label: 'redirected (!readDelivery)',
    useReadDelivery: false,
    useRedirect: true,
  }),
  Object.freeze({
    kind: 'redirected-recovery',
    label: 'redirected (readDelivery.redirect)',
    useReadDelivery: true,
    useRedirect: true,
  }),
  Object.freeze({
    kind: 'retained-recovery',
    label: 'retained (readDelivery.select after probe)',
    useReadDelivery: true,
    useRedirect: false,
  }),
]);

function createHeldModeHarness(mode, {
  initialLocalRole = RAFT_ROLE.FOLLOWER,
  initialLocalTerm = 5,
  maxAttempts = 1,
  onSecondTargetDelivery = null,
  targetResponseTerm = 6,
}) {
  const clock = new VirtualTimeSource({startMs: 1_000_000});
  let localRole = initialLocalRole;
  let localTerm = initialLocalTerm;
  const selfReplicaId = `${PARTITION}-r1`;
  const peerBReplicaId = `${PARTITION}-r2`;
  const peerCReplicaId = `${PARTITION}-r3`;
  const services = [
    {address: `node-a/partition/${PARTITION}`, nodeId: 'node-a', replicaId: selfReplicaId},
    {address: `node-b/partition/${PARTITION}`, nodeId: 'node-b', replicaId: peerBReplicaId},
    {address: `node-c/partition/${PARTITION}`, nodeId: 'node-c', replicaId: peerCReplicaId},
  ];
  const peerIdentities = new Map([
    ['node-a', {bootIncarnation: 'boot-a-1', connectionId: 'local', nodeId: 'node-a'}],
    ['node-b', {bootIncarnation: 'boot-b-1', connectionId: 'conn-b-1', nodeId: 'node-b'}],
    ['node-c', {bootIncarnation: 'boot-c-1', connectionId: 'conn-c-1', nodeId: 'node-c'}],
  ]);
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    leader_node_id: 'node-a',
    partition_id: PARTITION,
    table_id: TABLE,
  });
  for (const svc of services) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      address: svc.address,
      node_id: svc.nodeId,
      partition_id: PARTITION,
      replica_id: svc.replicaId,
      service_id: svc.replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      status: SERVICE_STATUS.ACTIVE,
    });
  }
  const localReplica = {
    partitionId: PARTITION,
    raft: {
      observeCurrentAuthority: () => ({
        groupId: PARTITION,
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        replicaIdentity: selfReplicaId,
        role: localRole,
        term: localTerm,
      }),
    },
    replicaId: selfReplicaId,
  };
  const heldTargetEntered = createDeferred();
  const releaseHeldTarget = createDeferred();
  const peerCEntered = createDeferred();
  const releasePeerC = createDeferred();
  const heldNodeId = mode.useRedirect ? 'node-c' : 'node-b';
  const heldReplicaId = mode.useRedirect ? peerCReplicaId : peerBReplicaId;
  let heldTargetDeliveries = 0;

  const messageRouter = {
    getConnectedNodes: () => ['node-b', 'node-c'],
    getConnectionState: () => 'connected',
    getCurrentPrimaryConnectionBootIncarnation: (nodeId) => peerIdentities.get(nodeId) || null,
    getLocalBootIncarnationIdentity: () => peerIdentities.get('node-a'),
    nodeId: 'node-a',
    reconnectIntervalMs: PROBE_INTERVAL_MS,
    timeSource: clock,
    async deliver(address, request) {
      if (address.startsWith('node-a/')) {
        if (localRole === RAFT_ROLE.LEADER) {
          return buildDeliveryEnvelope({acknowledged: true}, {
            readAuthorityWitness: buildLeaderWitness({
              leaderRead: request.leaderRead,
              nodeId: 'node-a',
              replicaId: selfReplicaId,
              term: localTerm,
            }),
            rowSetComplete: true,
            rows: [{operation_id: OPERATION, workflow_step: `local-leader-term-${localTerm}`}],
            success: true,
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          error: REASON.NOT_LEADER,
          failureCode: REASON.NOT_LEADER,
          leaderAddressRefusal: 'no_known_leader',
          partitionId: PARTITION,
          success: false,
        });
      }
      if (mode.useRedirect && address.startsWith('node-b/')) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          error: REASON.NOT_LEADER,
          failureCode: REASON.NOT_LEADER,
          leaderAddress: `node-c/partition/${PARTITION}`,
          partitionId: PARTITION,
          redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
          success: false,
        });
      }
      if (address.startsWith(`${heldNodeId}/`)) {
        heldTargetDeliveries += 1;
        if (heldTargetDeliveries === 1) {
          heldTargetEntered.resolve();
          await releaseHeldTarget.promise;
          return buildDeliveryEnvelope({acknowledged: true}, {
            readAuthorityWitness: buildLeaderWitness({
              leaderRead: request.leaderRead,
              nodeId: heldNodeId,
              replicaId: heldReplicaId,
              term: targetResponseTerm,
            }),
            rowSetComplete: true,
            rows: [{operation_id: OPERATION, workflow_step: `held-term-${targetResponseTerm}`}],
            success: true,
          });
        }
        if (typeof onSecondTargetDelivery === 'function') {
          return onSecondTargetDelivery({
            address,
            buildLeaderWitness,
            heldNodeId,
            heldReplicaId,
            request,
          });
        }
      }
      if (!mode.useRedirect && address.startsWith('node-c/')) {
        peerCEntered.resolve();
        if (typeof onSecondTargetDelivery === 'function') {
          await releasePeerC.promise;
          return onSecondTargetDelivery({
            address,
            buildLeaderWitness,
            heldNodeId: 'node-c',
            heldReplicaId: peerCReplicaId,
            request,
          });
        }
        await releasePeerC.promise;
        return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
      }
      return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
    },
  };

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner({
      projectedDimensions: {controlPlaneRecoveryEligible: true},
    }),
    getLocalPartitionReplicas: () => [localReplica],
    messageRouter,
    nodeId: 'node-a',
    nowFn: () => clock.now(),
    systemCache: cache,
  });
  executor.readRetryAttempts = maxAttempts;
  executor.leaderRetryDelayMs = 0;

  function startRead(extraOptions = {}) {
    const baseOptions = mode.useReadDelivery ? {
      readAuthority: {
        authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: LEADER_MODE.REQUIRED,
      },
      routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      timeoutMs: READ_BUDGET_MS,
    } : {
      readAuthority: {
        authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: LEADER_MODE.REQUIRED,
      },
      requireLeader: true,
      routingReadinessDimension: DIMENSION.SERVE_ELIGIBLE,
      timeoutMs: READ_BUDGET_MS,
    };
    return executor.executeOnPartition(
      PARTITION,
      READ_SQL,
      [OPERATION],
      true,
      true,
      false,
      {...baseOptions, ...extraOptions},
    );
  }

  async function awaitHeldState() {
    await heldTargetEntered.promise;
    if (mode.kind === 'retained-recovery') {
      // Advance virtual clock past probeMs so readDelivery marks node-b as probed
      // and retains its in-flight completion while starting node-c.
      clock.advance(PROBE_INTERVAL_MS + 1);
      await peerCEntered.promise;
    }
  }

  return {
    awaitHeldState,
    cache,
    clock,
    executor,
    heldNodeId,
    heldReplicaId,
    peerIdentities,
    releaseHeldTarget,
    releasePeerC,
    setLocalAuthority(nextRole, nextTerm) {
      localRole = nextRole;
      localTerm = nextTerm;
    },
    startRead,
  };
}

test('Review §3: all 6 held-response cases across Direct, Redirected, and Retained ' +
  'delivery paths complete through one sealed owner operation', async (t) => {
  for (const mode of DELIVERY_MODES) {
    await t.test(`[${mode.label}] 1. floor 5, term-6 response held, local term advances to 8 -> reject 6`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        h.setLocalAuthority(RAFT_ROLE.FOLLOWER, 8);
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, false, 'stale term-6 response rejected after floor rose to 8');
        t.equal(result.failureCode, REASON.BELOW_TERM_FLOOR);
        t.same(result.rows, []);
      });

    await t.test(`[${mode.label}] 2. floor 5, term-6 response held, local FOLLOWER -> LEADER at term 8 -> reject 6`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        h.setLocalAuthority(RAFT_ROLE.LEADER, 8);
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, false, 'term-6 response rejected when local replica becomes LEADER at term 8');
        t.equal(result.failureCode, REASON.BELOW_TERM_FLOOR);
        t.same(result.rows, []);
      });

    await t.test(`[${mode.label}] 3. retry or redirect follows advance -> invocation floor remains >= 8`,
      async (t) => {
        let followUpCalls = 0;
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 3,
          targetResponseTerm: 6,
          onSecondTargetDelivery({
            buildLeaderWitness: makeWitness,
            heldNodeId,
            heldReplicaId,
            request,
          }) {
            followUpCalls += 1;
            const followTerm = followUpCalls === 1 ? 7 : 8;
            return buildDeliveryEnvelope({acknowledged: true}, {
              readAuthorityWitness: makeWitness({
                leaderRead: request.leaderRead,
                nodeId: heldNodeId,
                replicaId: heldReplicaId,
                term: followTerm,
              }),
              rowSetComplete: true,
              rows: [{operation_id: OPERATION, workflow_step: `follow-term-${followTerm}`}],
              success: true,
            });
          },
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        // Raise floor to 8 while first response (term 6) is held.
        h.setLocalAuthority(RAFT_ROLE.FOLLOWER, 8);
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, true, 'succeeds once follow-up response reaches term >= 8');
        t.equal(result.readAuthorityWitness?.term, 8,
          'rejected term-6 and intermediate term-7 before accepting term-8');
        t.same(result.rows, [{operation_id: OPERATION, workflow_step: 'follow-term-8'}]);
        t.ok(followUpCalls >= 2, 'intermediate term-7 retry was rejected by monotonic floor >= 8');
      });

    await t.test(`[${mode.label}] 4a. term is sufficient (6 >= 5), but peer incarnation changes during flight -> reject obsolete reply`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        // Peer restarts / reconnects with new bootIncarnation & connectionId while reply is held.
        h.peerIdentities.set(h.heldNodeId, {
          bootIncarnation: `boot-${h.heldNodeId}-restarted-2`,
          connectionId: `conn-${h.heldNodeId}-2`,
          nodeId: h.heldNodeId,
        });
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, false, 'obsolete reply from prior peer incarnation must be rejected');
        t.same(result.rows, []);
      });

    await t.test(`[${mode.label}] 4b. term is sufficient (6 >= 5), but route replica identity changes during flight -> reject obsolete reply`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        // Withdraw the answering replica's SERVICES row while reply is in flight.
        const existingRow = h.cache.get(TABLES.SERVICES, h.heldReplicaId);
        h.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE, existingRow);
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, false, 'obsolete reply from withdrawn route must be rejected');
        t.same(result.rows, []);
      });

    await t.test(`[${mode.label}] 5a. authority remains valid, but original deadline expires while reply is held -> reject late completion`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        // Advance clock past the original execution deadline while reply is held.
        h.clock.advance(READ_BUDGET_MS + 100);
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, false, 'late reply resolving after original deadline must be rejected');
        t.equal(result.errorCode, QUERY_ERROR_CODE.TIMEOUT);
        t.same(result.rows, []);
      });

    await t.test(`[${mode.label}] 5b. authority remains valid, but AbortSignal aborts while reply is held -> reject late completion`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const abortController = new AbortController();
        const settled = h.startRead({signal: abortController.signal}).then(
          (value) => ({ok: true, value}),
          (error) => ({error, ok: false}),
        );
        await h.awaitHeldState();
        abortController.abort(new Error('caller_aborted_in_flight'));
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const outcome = await settled;
        t.equal(outcome.ok, false, 'aborted invocation must reject late reply');
        t.match(String(outcome.error?.message || outcome.error), /caller_aborted_in_flight|aborted/i);
      });

    await t.test(`[${mode.label}] 6. valid companion (no invalidating transition) -> completes with sealed receipt`,
      async (t) => {
        const h = createHeldModeHarness(mode, {
          initialLocalRole: RAFT_ROLE.FOLLOWER,
          initialLocalTerm: 5,
          maxAttempts: 1,
          targetResponseTerm: 6,
        });
        const pending = h.startRead();
        await h.awaitHeldState();
        h.releaseHeldTarget.resolve();
        h.releasePeerC.resolve();
        const result = await pending;
        t.equal(result.success, true, 'valid companion completes with sealed receipt');
        t.equal(result.readAuthorityWitness?.term, 6);
        t.equal(result.readAuthorityWitness?.servingNodeId, h.heldNodeId);
        t.same(result.rows, [{operation_id: OPERATION, workflow_step: 'held-term-6'}]);
      });
  }
});

test('Review §3 deliberate mutation controls: unsealed envelopes, unissued tickets, ' +
  'cross-invocation seals, and post-validation deadline/abort gaps are rejected', async (t) => {
  const clock = new VirtualTimeSource({startMs: 5_000_000});
  const abortController = new AbortController();
  const currentFloor = 5;
  const candidate = {
    address: `node-b/partition/${PARTITION}`,
    nodeId: 'node-b',
    replicaId: `${PARTITION}-r2`,
  };
  const routingSnapshot = {
    canonicalLeaderNodeId: 'node-a',
    routableServices: [{
      address: candidate.address,
      node_id: candidate.nodeId,
      replica_id: candidate.replicaId,
      service_id: candidate.replicaId,
    }],
  };
  const fakeExecutor = {
    getLocalPartitionReplicas: () => [{
      partitionId: PARTITION,
      raft: {
        observeCurrentAuthority: () => ({
          groupId: PARTITION,
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          replicaIdentity: `${PARTITION}-r1`,
          role: RAFT_ROLE.FOLLOWER,
          term: currentFloor,
        }),
      },
      replicaId: `${PARTITION}-r1`,
    }],
    getPartitionRecord: () => ({leader_claim_raft_term: currentFloor}),
    messageRouter: {
      getCurrentPrimaryConnectionBootIncarnation: () => ({
        bootIncarnation: 'boot-b-1',
        connectionId: 'conn-b-1',
        nodeId: 'node-b',
      }),
      nodeId: 'node-a',
    },
    nodeId: 'node-a',
    nowFn: () => clock.now(),
    throwIfCancelled: () => {},
  };

  function makeInvocation(deadlineOffsetMs = 1000) {
    return createInvocationTermFloorTracker(fakeExecutor, PARTITION, {
      buildSuccessResult: (answer) => ({
        partitionId: PARTITION,
        readAuthorityWitness: answer.readAuthorityWitness,
        rows: answer.rows,
        success: true,
      }),
      candidateEligibility: {
        redirectCandidate: (addr) => (addr === candidate.address ? candidate : null),
      },
      executionOptions: {
        deadlineMs: clock.now() + deadlineOffsetMs,
        signal: abortController.signal,
      },
      forRead: true,
      isSuccessfulResponse: (env) => Boolean(env?.answer?.success ?? env?.success),
      requireCanonicalLeader: true,
      resolveCandidates: () => ({
        candidates: [candidate],
        routingSnapshot,
        selfPublishedLeaderTermFloor: currentFloor,
      }),
    });
  }

  const invocationA = makeInvocation(1000);
  const invocationB = makeInvocation(1000);
  invocationA.resolveRoutes();
  invocationB.resolveRoutes();

  // 1. Attempting to return an unsealed transport envelope or raw buildSuccessResult output is rejected.
  const rawUnsealedResult = {
    partitionId: PARTITION,
    readAuthorityWitness: buildLeaderWitness({
      nodeId: 'node-b',
      replicaId: candidate.replicaId,
      term: 6,
    }),
    rows: [{operation_id: OPERATION, workflow_step: 'unsealed'}],
    success: true,
  };
  t.throws(
    () => invocationA.finalizeAcceptedResult(rawUnsealedResult),
    {code: UNSEALED_READ_COMPLETION_CODE},
    'raw unsealed result skipping completeDelivery is rejected',
  );

  // 2. Attempting to complete delivery with an unissued plain ticket object is rejected.
  const validDelivery = buildDeliveryEnvelope({acknowledged: true}, {
    readAuthorityWitness: buildLeaderWitness({
      nodeId: 'node-b',
      replicaId: candidate.replicaId,
      term: 6,
    }),
    rows: [{operation_id: OPERATION, workflow_step: 'valid'}],
    success: true,
  });
  t.throws(
    () => invocationA.completeDelivery({
      delivery: validDelivery,
      ticket: {address: candidate.address, request: {}, serviceInfo: candidate},
    }),
    {code: UNISSUED_READ_TICKET_CODE},
    'forged/unissued ticket is rejected by completeDelivery',
  );

  // 3. Attempting to complete delivery on invocationA with a ticket issued by invocationB is rejected.
  const ticketFromB = invocationB.issueTicket({
    address: candidate.address,
    request: {},
    serviceInfo: candidate,
  });
  t.throws(
    () => invocationA.completeDelivery({
      delivery: validDelivery,
      ticket: ticketFromB,
    }),
    {code: UNISSUED_READ_TICKET_CODE},
    'ticket issued by another invocation is rejected',
  );

  // 4. Valid completion on invocationA produces a sealed result that invocationA accepts
  //    but invocationB rejects.
  const ticketFromA = invocationA.issueTicket({
    address: candidate.address,
    request: {},
    serviceInfo: candidate,
  });
  const completionA = invocationA.completeDelivery({
    delivery: validDelivery,
    ticket: ticketFromA,
  });
  t.equal(completionA.state, READ_COMPLETION_STATE.ACCEPTED);
  t.equal(completionA.accepted, true);
  t.equal(
    invocationA.finalizeAcceptedResult(completionA.completedResult),
    completionA.completedResult,
    'owning invocation accepts its own sealed result',
  );
  t.throws(
    () => invocationB.finalizeAcceptedResult(completionA.completedResult),
    {code: UNSEALED_READ_COMPLETION_CODE},
    'another invocation cannot finalize a result sealed by invocationA',
  );

  // 5. Post-validation gap check: if deadline expires before finalizeAcceptedResult, it throws.
  clock.advance(1500);
  t.throws(
    () => invocationA.finalizeAcceptedResult(completionA.completedResult),
    {code: DEADLINE_EXPIRED_COMPLETION_CODE},
    'finalizeAcceptedResult rejects result if deadline expired after completion',
  );
  t.equal(READ_ROUTE_SUPERSEDED_CODE, 'READ_ROUTE_SUPERSEDED');
});

test('Review §4: observePersistedPartitionTerm complete production replica lifecycle ' +
  '(observe 5 -> open RaftRsDurableStore -> advance to 8 -> close with zero intermediate ' +
  'lookup -> next observation returns 8)', async (t) => {
  const dataDir = createTempDir(t, 'lagrange-storage-term-lifecycle-');
  const replicaId = `${PARTITION}-r1`;

  // 1. Seed initial durable hard-state term 5 via actual RaftRsDurableStore.
  const dbPath = seedDurableStoreTerm(dataDir, PARTITION, replicaId, 5, 1);

  const firstObs = observePersistedPartitionTerm({
    dataDir,
    partitionId: PARTITION,
    replicaId,
  });
  t.equal(firstObs.state, PERSISTED_TERM_STATE.OBSERVED);
  t.equal(firstObs.term, 5, 'initial observation reads durable term 5');
  const firstHandleId = firstObs.handleId;
  t.ok(typeof firstHandleId === 'string' && firstHandleId.length > 0);

  // Verify the readonly term reader is registered in retained-read-view-custody.
  const custodyBefore = inspectDbPathCustody(dbPath, {preserveIdleTermReaders: true});
  t.ok(
    custodyBefore.activeViewIds.includes(firstHandleId),
    'cached readonly term reader is registered in retained-read-view-custody',
  );

  // 2. Open the actual replica / RaftRsDurableStore on dbPath, durably advance
  //    term from 5 to 8, and close it with ZERO intervening query lookups.
  const replicaDb = new Database(dbPath);
  replicaDb.pragma('journal_mode = WAL');
  const replicaStore = new RaftRsDurableStore(replicaDb);
  replicaStore.persistReady(PARTITION, {
    hardState: {
      commit: '2',
      term: '8',
      vote: '1',
    },
    mustSync: true,
  });
  t.equal(RaftRsDurableStore.readPersistedTermIn(replicaDb, PARTITION), '8',
    'RaftRsDurableStore.readPersistedTermIn reads exact decimal term 8 on open store');
  replicaStore.close();

  // 3. Next observePersistedPartitionTerm observation MUST return 8.
  const secondObs = observePersistedPartitionTerm({
    dataDir,
    partitionId: PARTITION,
    replicaId,
  });
  t.equal(secondObs.state, PERSISTED_TERM_STATE.OBSERVED);
  t.equal(secondObs.term, 8,
    'next observePersistedPartitionTerm observation after store close returns 8 (never stale 5)');
  t.equal(
    RaftRsDurableStore.observePersistedPartitionTerm({
      dataDir,
      partitionId: PARTITION,
      replicaId,
    }).term,
    8,
    'RaftRsDurableStore.observePersistedPartitionTerm delegates to canonical storage observer',
  );

  // 4. Verify RaftRsDurableStore synced transaction timing & failure accounting (#365).
  const timingDb = new Database(dbPath);
  timingDb.pragma('journal_mode = WAL');
  const timingStore = new RaftRsDurableStore(timingDb);
  t.teardown(() => timingStore.close());
  timingStore.persistReady(PARTITION, {
    hardState: {commit: '3', term: '9', vote: '1'},
    mustSync: true,
  });
  const statsAfterCommit = timingStore.getDurableSyncStats();
  t.equal(statsAfterCommit.syncCommitCount, 1, 'successful synced transaction increments syncCommitCount');
  t.equal(statsAfterCommit.syncFailureCount, 0, 'successful synced transaction leaves syncFailureCount at 0');
  t.ok(statsAfterCommit.totalSyncMs > 0, 'synced transaction measures and accumulates totalSyncMs > 0');
  t.ok(statsAfterCommit.maxSyncMs > 0 && statsAfterCommit.maxSyncMs <= statsAfterCommit.totalSyncMs,
    'synced transaction records maxSyncMs');

  t.throws(
    () => timingStore.persistReady(PARTITION, {
      entries: [{entryType: 0, index: 'invalid-non-integer', term: '9'}],
      mustSync: true,
    }),
    'failing synced transaction throws',
  );
  const statsAfterFailure = timingStore.getDurableSyncStats();
  t.equal(statsAfterFailure.syncCommitCount, 1,
    'failed synced transaction must not increment syncCommitCount');
  t.equal(statsAfterFailure.syncFailureCount, 1,
    'failed synced transaction increments syncFailureCount');
  t.ok(statsAfterFailure.totalSyncMs >= statsAfterCommit.totalSyncMs,
    'failed synced transaction still accounts elapsed wall time');
});

test('Review §4: snapshot replacement, artifact deletion, same-path recreation, ' +
  'failed-close custody retention/capacity, restart empty cache, and live-owner precedence',
async (t) => {
  await t.test('1. snapshot replacement and deletion close/invalidate idle term readers before changing files',
    async (t) => {
      const dataDir = createTempDir(t, 'lagrange-term-replace-delete-');
      const replicaId = `${PARTITION}-r1`;
      const dbPath = seedDurableStoreTerm(dataDir, PARTITION, replicaId, 5, 1);

      const obs5 = observePersistedPartitionTerm({dataDir, partitionId: PARTITION, replicaId});
      t.equal(obs5.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(obs5.term, 5);
      const cachedBeforeReplace = getRetainedPersistedTermReader({
        dataDir,
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(cachedBeforeReplace?.db?.open, true);

      // Snapshot replacement calls assertStorageArtifactsUnlinkSafe(dbPath) before swapping files.
      const unlinkInspection = assertStorageArtifactsUnlinkSafe(dbPath);
      t.equal(unlinkInspection.hasLiveOrUnclosedReaders, false,
        'assertStorageArtifactsUnlinkSafe closes idle term reader before snapshot swap');
      t.equal(cachedBeforeReplace.db.open, false,
        'idle term reader SQLite handle is closed before snapshot files change');
      t.equal(getRetainedPersistedTermReader({dataDir, partitionId: PARTITION, replicaId}), null);

      // Stage a replacement snapshot DB with term 11 and atomically rename it into dbPath.
      const stagingDir = createTempDir(t, 'lagrange-term-staging-');
      const stagedDbPath = seedDurableStoreTerm(stagingDir, PARTITION, replicaId, 11, 4);
      for (const suffix of ['-wal', '-shm']) {
        fs.rmSync(`${dbPath}${suffix}`, {force: true});
      }
      fs.renameSync(stagedDbPath, dbPath);
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(`${stagedDbPath}${suffix}`)) {
          fs.renameSync(`${stagedDbPath}${suffix}`, `${dbPath}${suffix}`);
        }
      }

      const obs11 = observePersistedPartitionTerm({dataDir, partitionId: PARTITION, replicaId});
      t.equal(obs11.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(obs11.term, 11, 'post-replacement observation opens new handle and reads term 11');
      t.not(obs11.handleId, obs5.handleId, 'snapshot replacement obtains a distinct handleId');

      // Artifact deletion via removeReplicaStorageArtifacts closes the idle term reader and unlinks files.
      const cachedBeforeDelete = getRetainedPersistedTermReader({
        dataDir,
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(cachedBeforeDelete?.db?.open, true);
      const removal = await removeReplicaStorageArtifacts(fs, dbPath);
      t.equal(removal.allAbsent, true, 'removeReplicaStorageArtifacts closes idle term reader and deletes files');
      t.equal(cachedBeforeDelete.db.open, false, 'deleted replica term reader handle is closed');

      const afterDelete = observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(afterDelete.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(afterDelete.reason, PERSISTED_TERM_UNAVAILABLE_REASON.STORAGE_ABSENT);
      t.equal(afterDelete.term, null);
    });

  await t.test('2. same-path recreation obtains a new handle and observes the recreated term',
    async (t) => {
      const dataDir = createTempDir(t, 'lagrange-term-recreate-');
      const replicaId = `${PARTITION}-r1`;
      const dbPath = seedDurableStoreTerm(dataDir, PARTITION, replicaId, 5, 1);

      const first = observePersistedPartitionTerm({dataDir, partitionId: PARTITION, replicaId});
      t.equal(first.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(first.term, 5);
      const firstReader = getRetainedPersistedTermReader({
        dataDir,
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(firstReader?.db?.open, true);

      // Unlink and recreate a brand-new DB at the exact same path with term 14.
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${dbPath}${suffix}`, {force: true});
      }
      seedDurableStoreTerm(dataDir, PARTITION, replicaId, 14, 2);

      const second = observePersistedPartitionTerm({dataDir, partitionId: PARTITION, replicaId});
      t.equal(second.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(second.term, 14, 'same-path recreation observes new term 14');
      t.not(second.handleId, first.handleId, 'same-path recreation obtains a new handle');
      t.equal(firstReader.db.open, false, 'previous handle for old inode was closed');
    });

  await t.test('3. failed closure retains custody, consumes capacity, blocks unlink/replace, and refuses silent reuse',
    async (t) => {
      const dataDir = createTempDir(t, 'lagrange-term-close-fail-');
      const replica1 = `${PARTITION}-r1`;
      const replica2 = `${PARTITION}-r2`;
      const dbPath1 = seedDurableStoreTerm(dataDir, PARTITION, replica1, 6, 1);
      seedDurableStoreTerm(dataDir, PARTITION, replica2, 9, 1);

      let allowClose = false;
      const observer = createPersistedPartitionTermObserver({
        closeDatabase(db) {
          if (!allowClose) {
            throw new Error('injected_sqlite_close_failure');
          }
          if (db && db.open) {
            db.close();
          }
          return !db || db.open !== true;
        },
        maxReaders: 1,
      });
      t.teardown(() => {
        allowClose = true;
        observer.reset('teardown');
      });

      // Open reader 1 (consumes 1/1 capacity).
      const obs1 = observer.observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId: replica1,
      });
      t.equal(obs1.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(obs1.term, 6);
      t.equal(observer.stats().activeReaderCount, 1);

      // Trigger closure of reader 1 while allowClose === false.
      const closedOk = observer.invalidatePath(dbPath1, 'test_invalidation');
      t.equal(closedOk, false, 'invalidatePath reports false when close fails');
      t.equal(observer.stats().activeReaderCount, 0);
      t.equal(observer.stats().unclosedReaderCount, 1, 'failed close retains unclosed reader entry');
      t.equal(observer.stats().retainedReaderCount, 1, 'failed close continues consuming capacity');
      t.ok(observer.stats().closeFailureCount >= 1);

      // Custody fences snapshot replacement and artifact deletion on dbPath1.
      t.throws(
        () => assertStorageArtifactsUnlinkSafe(dbPath1),
        {
          code: CUSTODY_ERROR_CODE.CUSTODY_BLOCKED,
          name: 'RetainedReadViewCustodyError',
        },
        'snapshot replacement is blocked while failed-close term reader retains custody',
      );
      const blockedDelete = await removeReplicaStorageArtifacts(fs, dbPath1);
      t.equal(blockedDelete.blockedByRetainedReader, true,
        'artifact deletion is blocked while failed-close term reader retains custody');
      t.equal(fs.existsSync(dbPath1), true);

      // Subsequent observation on dbPath1 refuses silent reuse while unclosed.
      const reuseAttempt = observer.observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId: replica1,
      });
      t.equal(reuseAttempt.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(reuseAttempt.reason, PERSISTED_TERM_UNAVAILABLE_REASON.CUSTODY_CLOSE_FAILED,
        'refuses silent reuse of path with unclosed failed reader');

      // Observation on replica2 refuses to exceed maxReaders=1 capacity consumed by unclosed reader.
      const capacityAttempt = observer.observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId: replica2,
      });
      t.equal(capacityAttempt.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(capacityAttempt.reason, PERSISTED_TERM_UNAVAILABLE_REASON.CAPACITY_EXHAUSTED,
        'unclosed reader consumes capacity and prevents opening beyond maxReaders');

      // Once closure succeeds, custody and capacity are released.
      allowClose = true;
      const afterRecovery = observer.observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId: replica2,
      });
      t.equal(afterRecovery.state, PERSISTED_TERM_STATE.OBSERVED);
      t.equal(afterRecovery.term, 9, 'capacity freed once retry closes the previously failed handle');
      t.equal(observer.stats().unclosedReaderCount, 0);
      t.equal(observer.stats().activeReaderCount, 1);

      // endStorageIncarnationCustody also closes idle term readers for a dbPath.
      const endOutcome = endStorageIncarnationCustody({
        dbPath: getPartitionDbPath(dataDir, PARTITION, replica2),
      });
      t.equal(endOutcome.ok, true);
      t.equal(observer.stats().activeReaderCount, 0);
    });

  await t.test('4. process restart starts with an empty handle cache and open/read failures return typed unavailability',
    async (t) => {
      resetPersistedTermReaders('simulated_process_restart');
      const restartStats = getPersistedTermReaderStats();
      t.equal(restartStats.activeReaderCount, 0, 'restart begins with 0 active handles');
      t.equal(restartStats.unclosedReaderCount, 0, 'restart begins with 0 unclosed handles');
      t.equal(restartStats.openCount, 0, 'restart begins with 0 openCount');

      const freshObserver = createPersistedPartitionTermObserver();
      t.equal(freshObserver.stats().activeReaderCount, 0);
      t.equal(freshObserver.stats().retainedReaderCount, 0);

      // Invalid identity (missing replicaId or mismatched dbPath vs dataDir).
      const invalidId = observePersistedPartitionTerm({partitionId: PARTITION, replicaId: ''});
      t.equal(invalidId.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(invalidId.reason, PERSISTED_TERM_UNAVAILABLE_REASON.INVALID_IDENTITY);

      const dataDir = createTempDir(t, 'lagrange-term-errors-');
      const replicaId = `${PARTITION}-r1`;
      const mismatched = observePersistedPartitionTerm({
        dataDir,
        dbPath: path.join(dataDir, 'wrong-file.db'),
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(mismatched.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(mismatched.reason, PERSISTED_TERM_UNAVAILABLE_REASON.INVALID_IDENTITY);

      // Empty SQLite database without _raft_rs_hard_state table -> HARD_STATE_ABSENT.
      const emptyDbPath = getPartitionDbPath(dataDir, PARTITION, replicaId);
      fs.mkdirSync(path.dirname(emptyDbPath), {recursive: true});
      const rawDb = new Database(emptyDbPath);
      rawDb.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
      rawDb.close();
      const missingTable = observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId,
      });
      t.equal(missingTable.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(missingTable.reason, PERSISTED_TERM_UNAVAILABLE_REASON.HARD_STATE_ABSENT);

      // Corrupt SQLite file bytes -> READ_FAILED.
      const corruptReplicaId = `${PARTITION}-r-corrupt`;
      const corruptDbPath = getPartitionDbPath(dataDir, PARTITION, corruptReplicaId);
      fs.writeFileSync(corruptDbPath, 'not-a-valid-sqlite-database-header-bytes');
      const corruptOutcome = observePersistedPartitionTerm({
        dataDir,
        partitionId: PARTITION,
        replicaId: corruptReplicaId,
      });
      t.equal(corruptOutcome.state, PERSISTED_TERM_STATE.UNAVAILABLE);
      t.equal(corruptOutcome.reason, PERSISTED_TERM_UNAVAILABLE_REASON.READ_FAILED);
      t.equal(corruptOutcome.term, null);
    });

  await t.test('5. a live authority owner unavailable answer is never overridden by a disk fallback',
    async (t) => {
      const dataDir = createTempDir(t, 'lagrange-term-live-precedence-');
      const replicaId = `${PARTITION}-r1`;
      // Valid on-disk DB with term 9 exists in dataDir.
      seedDurableStoreTerm(dataDir, PARTITION, replicaId, 9, 1);

      const cache = new SystemTableCache();
      cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
        leader_claim_raft_term: 5,
        leader_node_id: 'node-a',
        partition_id: PARTITION,
        table_id: TABLE,
      });
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        address: `node-a/partition/${PARTITION}`,
        node_id: 'node-a',
        partition_id: PARTITION,
        replica_id: replicaId,
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        status: SERVICE_STATUS.ACTIVE,
      });

      // Prime the persisted term reader cache while no live replica is open.
      let liveReplicas = [];
      const executor = new QueryExecutor({
        controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
        dataDir,
        getLocalPartitionReplicas: () => liveReplicas,
        messageRouter: {deliver: async () => null, nodeId: 'node-a'},
        nodeId: 'node-a',
        systemCache: cache,
      });
      const snapshot = executor.getPartitionRoutingSnapshot(
        PARTITION,
        DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      );
      const diskFloor = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(diskFloor.eligible, true);
      t.equal(diskFloor.termFloor, 9, 'before live replica opens, persisted term 9 is observed');

      // Now a live local replica exists, and its observeCurrentAuthority() returns unavailable.
      liveReplicas = [{
        partitionId: PARTITION,
        raft: {
          observeCurrentAuthority: () => ({
            groupId: PARTITION,
            outcome: RAFT_OPERATION_OUTCOME.CORE_UNAVAILABLE,
            replicaIdentity: replicaId,
          }),
        },
        replicaId,
      }];
      const liveUnavailableFloor = resolveSelfPublishedLeaderTermFloor(
        executor,
        PARTITION,
        snapshot,
      );
      t.equal(liveUnavailableFloor.eligible, false,
        'live authority owner unavailable answer must fail closed and never fall back to disk term 9');
      t.equal(liveUnavailableFloor.termFloor, null);
      t.equal(
        getRetainedPersistedTermReader({dataDir, partitionId: PARTITION, replicaId}),
        null,
        'presence of live local replica invalidates cached disk term reader',
      );
    });
});
