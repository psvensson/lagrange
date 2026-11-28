// Deterministic convergence and boundary witnesses for
// formation-declared-size-latch (design sections 2.4, 3.1-3.6, 5.3):
//   - W1: D=3 cluster does not latch at 2 READY hosts even after priority
//         partitions spread to 2 hosts; latches to FORMED in frozen time once
//         the 3rd host publishes READY and all 6 priority partitions hold
//         caught-up ACTIVE voters on V(3, 3)=3 distinct hosts.
//   - W2: D=1 lone seed latches to FORMED immediately at epoch 1 (V(3, 1)=1).
//   - W3 / W3u: FORMED is a one-way monotone latch; node death and READY-lease
//         expiry after FORMED never revoke FORMED or close write/DDL admission.
//   - W3L: Once a process has observed FORMED for its clusterId through a
//         committed read, ServeEligibilityOwner.answerFormation() holds FORMED
//         for the life of the process (unaffected by lease expiry or loss of
//         the control_plane_publications-p1 leader), while a newly started
//         process before its first committed read answers UNAVAILABLE.
//   - I1: resolveClientStatementRefusal and SQLQueryEngine refuse user-table
//         writes, all DDL, and unresolvable targets before FORMED (independent
//         of CLIENT vs IN_PROCESS_OWNER ingress) with FORMATION_PENDING
//         (SQLSTATE 57P03), while admitting reads and in-process system-table
//         DML; BackupRestoreOwner.restoreFromBackup refuses with
//         FORMATION_PENDING before FORMED; ManagementV1Owner exposes
//         facts.cluster.formation (and declarationConfigDiffers on seed restart).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  resolveVoterTarget,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  CONTROL_PLANE_PUBLICATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  assertAllocationHeader,
  createSeedOriginalAllocation,
  requireDeclaredHostCount,
} from '../../src/bootstrap/seed-original-allocation-declaration.js';
import {
  ORIGINAL_ALLOCATION,
  ORIGINAL_ALLOCATION_COLUMN,
  ORIGINAL_FORMATION_RIGHT,
} from '../../src/raft/raft-rs-original-allocation-constants.js';
import {
  publishOriginalSeedFormationDeclaration,
} from '../../src/bootstrap/seed-original-registration.js';
import {
  BackupRestoreOwner,
} from '../../src/bootstrap/owners/backup-restore-owner.js';
import {
  ManagementV1Owner,
} from '../../src/bootstrap/owners/management-v1-owner.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  PARTITION_CDC_OBLIGATION_BOUND,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {
  buildCdcAcknowledgementCommand,
  cdcObligationEventKeyDigest,
  countCdcObligations,
  ensureCdcObligationLedger,
  insertCdcObligation,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  readCommittedStatementOutcome,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
} from '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  applyCommitted,
  awaitProposal,
  shutdownAll,
  startLeader,
  track,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  PG_ERROR_CODE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {
  FORMATION_PUBLICATION_ID,
  FORMATION_PUBLICATION_KIND,
  FORMATION_RECORD_STATUS,
  FORMATION_REFUSAL_REASON,
  FORMATION_TRANSITION_OUTCOME,
  buildFormationDeclareBody,
  buildFormationLatchBody,
  decodeFormationRecord,
  readFormationRecordIn,
  requestFormationDeclare,
  requestFormationLatch,
  requestFormationTransition,
} from '../../src/control-plane/membership-publication-formation-record.js';
import {
  buildFormationTransitionCommand,
  formationTransitionRowCount,
  isPinnedFormationTransitionCommand,
} from '../../src/control-plane/membership-publication-formation-transition-command.js';
import {
  declaredHostCountOf,
} from '../test-helpers/declared-node-host.js';
import {
  ServeEligibilityOwner,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER,
} from '../../src/partition/partition-statement-admission-constants.js';
import {
  runCommittedPartitionStatement,
} from '../../src/partition/partition-statement-admission.js';
import {PARTITION_SERVICE_OPERATION, PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {
  SQLParser,
} from '../../src/query/sql-parser.js';
import {
  QUERY_ERROR_CODE,
} from '../../src/query/query-constants.js';
import {
  CLIENT_STATEMENT_INGRESS,
  resolveClientStatementRefusal,
} from '../../src/query/sql-statement-ingress.js';
import {
  RAFT_ROLE,
} from '../../src/raft/constants.js';
import {
  isCaughtUpVoterReadyReplica,
} from '../../src/rebalancer/priority-publication-safety-topology.js';
import {
  PLACEMENT_FORMATION_STATE,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  resolveFailureSqlState,
} from '../../src/runtime/pgwire-result-mapper.js';
import {
  createRoundDriver,
} from './formation-joint-admission-rounds.js';
import {
  LOSING_ORDER,
  runArrivalOrder,
} from './formation-joint-admission-scenario.js';
import {
  PRIORITY_PARTITION_IDS,
  SEED_NODE_ID,
  createFormationWorld,
} from './formation-joint-admission-world.js';

const J1 = 'j1';
const J2 = 'j2';

function parseSql(sql) {
  return new SQLParser(sql).parse();
}

test('S2 unit contracts: resolveVoterTarget, isCaughtUpVoterReadyReplica, ' +
  'declaredHostCount validation, and seed original allocation', async () => {
  // 1. resolveVoterTarget(r, hosts): largest odd integer <= min(r, H) and >= 1
  assert.equal(resolveVoterTarget(3, 1), 1);
  assert.equal(resolveVoterTarget(3, 2), 1);
  assert.equal(resolveVoterTarget(3, 3), 3);
  assert.equal(resolveVoterTarget(3, 4), 3);
  assert.equal(resolveVoterTarget(3, 5), 3);
  assert.equal(resolveVoterTarget(5, 4), 3);
  assert.equal(resolveVoterTarget(5, 5), 5);
  assert.equal(resolveVoterTarget(3, ['h1', 'h2', 'h3', 'h1']), 3);
  assert.equal(resolveVoterTarget(3, new Set(['h1'])), 1);
  assert.equal(declaredHostCountOf([{hostId: 'h1'}, {hostId: 'h2'}, {hostId: 'h1'}]), 2);
  assert.equal(formationTransitionRowCount(), 1);
  const pinnedCmd = buildFormationTransitionCommand(
    {partitionId: 'control_plane_publications-p1', replicaId: 'r1'},
    {
      entryId: 'e1',
      body: buildFormationDeclareBody({
        clusterId: 'c1',
        declaredHostCount: 1,
        declaredByNodeId: 's1',
        declaredAt: 10,
      }),
    },
  );
  assert.equal(isPinnedFormationTransitionCommand(pinnedCmd), true);
  const badTargetRes = await requestFormationTransition(
    {tableName: 'nodes', partitionId: 'nodes-p1'},
    {entryId: 'e1', body: pinnedCmd.body},
  );
  assert.equal(badTargetRes.success, false);

  // 2. isCaughtUpVoterReadyReplica: requires ACTIVE voter on a READY node
  const committedNodeFloor = {
    nodeSemanticsById: new Map([
      ['n1', {readyNow: true}],
      ['n2', {readyNow: false}],
    ]),
  };
  const activeVoter = {
    node_id: 'n1',
    status: SERVICE_STATUS.ACTIVE,
    raft_role: RAFT_ROLE.FOLLOWER,
    address: 'n1/partition/p1',
  };
  const syncingVoter = {
    ...activeVoter,
    status: 'syncing',
  };
  const activeLearner = {
    ...activeVoter,
    raft_role: RAFT_ROLE.LEARNER,
  };
  const unreadyNodeVoter = {
    ...activeVoter,
    node_id: 'n2',
  };
  assert.equal(
    isCaughtUpVoterReadyReplica(activeVoter, {committedNodeFloor}),
    true,
  );
  assert.equal(
    isCaughtUpVoterReadyReplica(syncingVoter, {committedNodeFloor}),
    false,
    'SYNCING voter must not count toward the one-way formation latch',
  );
  assert.equal(
    isCaughtUpVoterReadyReplica(activeLearner, {committedNodeFloor}),
    false,
    'LEARNER replica must not count toward the formation latch',
  );
  assert.equal(
    isCaughtUpVoterReadyReplica(unreadyNodeVoter, {committedNodeFloor}),
    false,
    'voter on a node without a valid READY lease must not count',
  );

  // 3. Declared host count validation (D === 1 || D >= 3; D = 2 refused)
  assert.equal(requireDeclaredHostCount(1), 1);
  assert.equal(requireDeclaredHostCount(3), 3);
  assert.equal(requireDeclaredHostCount(5), 5);
  assert.throws(
    () => requireDeclaredHostCount(2),
    (err) =>
      err.code === 'FORMATION_DECLARED_HOST_COUNT_INVALID' &&
      err.reason === 'TWO_HOSTS_HAVE_NO_MAJORITY',
  );
  assert.throws(
    () =>
      new ConfigurationManager().initialize({
        formation: {declaredHostCount: 2},
      }),
    (err) =>
      err.code === 'FORMATION_DECLARED_HOST_COUNT_INVALID' &&
      err.reason === 'TWO_HOSTS_HAVE_NO_MAJORITY',
  );
  assert.throws(
    () =>
      new ConfigurationManager().initialize({
        formation: {declaredHostCount: 3},
        node: {seedNodeAddress: 'ws://seed:9000'},
      }),
    (err) => err.code === 'FORMATION_DECLARATION_SEED_ONLY',
  );

  // 4. Seed original allocation persists declaredHostCount and ORIGINAL_FORMATION_RIGHT
  const allocation = createSeedOriginalAllocation({
    dataDir: '/tmp/seed-s2-unit',
    nodeId: 'seed-1',
    buildDigest: 'sha256:test-build',
    now: 1700000000000,
    declaredHostCount: 3,
  });
  assert.equal(allocation.declaredHostCount, 3);
  assert.doesNotThrow(() =>
    assertAllocationHeader(allocation, {
      dataDir: '/tmp/seed-s2-unit',
      nodeId: 'seed-1',
      buildDigest: 'sha256:test-build',
    }),
  );
  assert.equal(
    ORIGINAL_ALLOCATION_COLUMN.FORMATION_RIGHT,
    'original_formation_right',
  );
  assert.equal(ORIGINAL_FORMATION_RIGHT, 'original_formation_right');

  const rightStates = new Map();
  const allocWorld = createFormationWorld({
    declaredHostCount: null,
    clusterId: 'cluster-s2-unit',
  });
  try {
    const pubService = allocWorld.publicationsPartitionService;
    const preparation = {
      formationDeclaration: () => ({
        replicaId: 'config-p1-r1',
        clusterId: 'cluster-s2-unit',
        declaredHostCount: 3,
        declaredByNodeId: 'seed-1',
        timestamp: 1700000000000,
      }),
      publishOriginalRight: async ({right, value, submit, observe}) => {
        rightStates.set(right, ORIGINAL_ALLOCATION.SUBMITTED);
        await submit(value);
        const ok = await observe(value);
        assert.equal(ok, true);
        rightStates.set(right, ORIGINAL_ALLOCATION.TRANSFERRED);
      },
    };
    const writer = {
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => {
          const row = readFormationRecordIn(pubService.db);
          return {success: Boolean(row), rows: row ? [row] : []};
        },
      },
    };
    await publishOriginalSeedFormationDeclaration(
      preparation,
      writer,
      pubService,
      {
        clusterId: 'cluster-s2-unit',
        declaredHostCount: 3,
        declaredByNodeId: 'seed-1',
        declaredAt: 1700000000000,
      },
    );
    assert.equal(
      rightStates.get(ORIGINAL_ALLOCATION_COLUMN.FORMATION_RIGHT),
      ORIGINAL_ALLOCATION.TRANSFERRED,
    );
  } finally {
    allocWorld.time.restore();
    allocWorld.publicationsPartitionService.close();
  }
});

test('S3 unit contracts: FORMATION_TRANSITION applier state machine and ' +
  'partition-boundary SQL refusal on cluster_formation', async () => {
  const world = createFormationWorld({
    declaredHostCount: null,
    clusterId: 'cluster-s3-apply',
  });
  const service = world.publicationsPartitionService;
  try {
    // 1. Before DECLARE: row is absent -> decodeFormationRecord answers UNDECLARED
    assert.equal(readFormationRecordIn(service.db), null);
    assert.equal(
      decodeFormationRecord(null, {clusterId: 'cluster-s3-apply'}).state,
      PLACEMENT_FORMATION_STATE.UNDECLARED,
    );

    // 2. Direct SQL writes to cluster_formation on control_plane_publications-p1
    // are refused at the partition boundary regardless of origin:
    for (const [sql, params] of [
      [
        'INSERT INTO control_plane_publications (publication_id, publication_kind, publication_epoch, publisher_node_id, published_active_node_ids, required_ack_node_ids, acknowledged_node_ids, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['cluster_formation', 'cluster_formation', 0, 'seed', '[]', '[]', '[]', 'DECLARED', 1, 1],
      ],
      [
        'UPDATE control_plane_publications SET status = ? WHERE publication_id = ?',
        ['FORMED', 'cluster_formation'],
      ],
      [
        'DELETE FROM control_plane_publications WHERE publication_id = ?',
        ['cluster_formation'],
      ],
    ]) {
      assert.throws(
        () =>
          runCommittedPartitionStatement(service, {
            type: PARTITION_SERVICE_OPERATION.QUERY,
            sql,
            params,
          }),
        (err) =>
          err.code === PARTITION_STATEMENT_REFUSAL_CODE &&
          err.refusalLayer ===
            PARTITION_STATEMENT_REFUSAL_LAYER.FORMATION_RECORD_PROTECTED,
      );
    }

    // 3. DECLARE transitions absent -> DECLARED
    const declareBody = buildFormationDeclareBody({
      clusterId: 'cluster-s3-apply',
      declaredHostCount: 3,
      declaredByNodeId: SEED_NODE_ID,
      declaredAt: 1000,
    });
    const declareRes = await requestFormationDeclare(service, {
      entryId: 'declare-1',
      body: declareBody,
    });
    assert.equal(declareRes.success, true);
    assert.equal(
      declareRes.formationResult.outcome,
      FORMATION_TRANSITION_OUTCOME.APPLIED,
    );

    // Same entryId replays settled outcome:
    const replayDeclare = await requestFormationDeclare(service, {
      entryId: 'declare-1',
      body: declareBody,
    });
    assert.equal(replayDeclare.success, true);

    // Same declaration under a new entryId settles idempotently:
    const idempotentDeclare = await requestFormationDeclare(service, {
      entryId: 'declare-2',
      body: declareBody,
    });
    assert.equal(idempotentDeclare.success, true);
    assert.equal(
      idempotentDeclare.formationResult.outcome,
      FORMATION_TRANSITION_OUTCOME.SETTLED,
    );

    // Different declaredHostCount is refused ALREADY_DECLARED:
    const conflictingDeclare = await requestFormationDeclare(service, {
      entryId: 'declare-conflict',
      body: buildFormationDeclareBody({
        clusterId: 'cluster-s3-apply',
        declaredHostCount: 5,
        declaredByNodeId: SEED_NODE_ID,
        declaredAt: 1001,
      }),
    });
    assert.equal(conflictingDeclare.success, false);
    assert.equal(
      conflictingDeclare.formationResult.reason,
      FORMATION_REFUSAL_REASON.ALREADY_DECLARED,
    );

    // 4. LATCH transitions DECLARED -> FORMED
    const priorityVoters = Object.fromEntries(
      PRIORITY_PARTITION_IDS.map((pid) => [
        pid,
        {
          voterNodeIds: ['j1', 'j2', 'seed'],
          voterHostIds: ['j1-machine', 'j2-machine', 'seed-machine'],
          voterReplicaIds: [`${pid}-r1`, `${pid}-r2`, `${pid}-r3`],
          targetVoterHosts: 3,
        },
      ]),
    );
    const latchBody = buildFormationLatchBody({
      clusterId: 'cluster-s3-apply',
      declaredHostCount: 3,
      formedAt: 2000,
      formedByNodeId: SEED_NODE_ID,
      formedPublicationEpoch: 2,
      formedHostIds: ['j1-machine', 'j2-machine', 'seed-machine'],
      formedReadyNodeIds: ['j1', 'j2', 'seed'],
      priorityPartitionVoters: priorityVoters,
    });
    const latchRes = await requestFormationLatch(service, {
      entryId: 'latch-1',
      body: latchBody,
    });
    assert.equal(latchRes.success, true);
    assert.equal(
      latchRes.formationResult.outcome,
      FORMATION_TRANSITION_OUTCOME.APPLIED,
    );
    const decodedFormed = decodeFormationRecord(
      readFormationRecordIn(service.db),
    );
    assert.equal(decodedFormed.state, PLACEMENT_FORMATION_STATE.FORMED);
    assert.equal(decodedFormed.latchEpoch, 2);
    assert.deepEqual(decodedFormed.formedHostIds, [
      'j1-machine',
      'j2-machine',
      'seed-machine',
    ]);

    // A different LATCH after FORMED is refused ALREADY_FORMED and never overwrites:
    const secondLatch = await requestFormationLatch(service, {
      entryId: 'latch-2',
      body: buildFormationLatchBody({
        ...latchBody,
        formedAt: 3000,
        formedPublicationEpoch: 4,
      }),
    });
    assert.equal(secondLatch.success, false);
    assert.equal(
      secondLatch.formationResult.reason,
      FORMATION_REFUSAL_REASON.ALREADY_FORMED,
    );
    assert.equal(
      decodeFormationRecord(readFormationRecordIn(service.db)).latchEpoch,
      2,
    );
  } finally {
    world.time.restore();
    service.close();
  }
});

test('S3 CDC capacity & positional cache listener witnesses: temporary CDC_CAPACITY ' +
  'leaves LATCH entryKey unsettled, retries pinned attempt bytes at same epoch after ' +
  'CDC_DELIVERED drain, and positional SystemTableCache listener fires latch',
async () => {
  // Part A (Item 3a): Real proposal path on control_plane_publications-p1 under
  // temporary CDC capacity pressure.
  const {leader, proposed} = await startLeader(
    {
      tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      schema: CONTROL_PLANE_PUBLICATIONS_SCHEMA,
    },
    'control_plane_publications-p1',
  );
  try {
    const cache = new SystemTableCache({nodeId: SEED_NODE_ID});
    let clockMs = 2000;
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: SEED_NODE_ID,
      systemTableCache: cache,
      publicationsPartitionService: leader,
      resolveIsControlPlanePublicationsWriteLeader: () => true,
      now: () => clockMs,
    });

    // Commit DECLARE{D: 1} through the real proposal path:
    const declarePending = track(
      requestFormationDeclare(leader, {
        entryId: 'declare-cdc-1',
        body: buildFormationDeclareBody({
          clusterId: 'cluster-cdc-pressure',
          declaredHostCount: 1,
          declaredByNodeId: SEED_NODE_ID,
          declaredAt: 1000,
        }),
      }),
    );
    const declareCmd = await awaitProposal(
      proposed,
      (entry) => entry.entryId === 'declare-cdc-1',
    );
    applyCommitted(leader, declareCmd);
    const declareAns = await declarePending.promise;
    assert.equal(declareAns.success, true);

    // Populate cache with PUBLISHED membership at epoch 1, 1 READY seed host,
    // and all 6 priority partitions holding caught-up ACTIVE voters:
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: SEED_NODE_ID,
      [COLUMN.HOST_ID]: 'seed-machine',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 60_000,
    });
    cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT', {
      publication_id: 'pub-epoch-1',
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      status: 'PUBLISHED',
      published_active_node_ids: JSON.stringify([SEED_NODE_ID]),
      required_ack_node_ids: JSON.stringify([SEED_NODE_ID]),
      acknowledged_node_ids: JSON.stringify([SEED_NODE_ID]),
    });
    for (const partitionId of PRIORITY_PARTITION_IDS) {
      cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
        [COLUMN.PARTITION_ID]: partitionId,
        replica_count: 3,
      });
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        [COLUMN.SERVICE_ID]: `${partitionId}-r1`,
        [COLUMN.REPLICA_ID]: `${partitionId}-r1`,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: partitionId,
        [COLUMN.NODE_ID]: SEED_NODE_ID,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: 'ws://seed:9000',
      });
    }

    // Fill the CDC obligation ledger to OWED_MAX_EVENTS - 1 so 1 slot remains
    // at preflight for both an ordinary write and the formation LATCH:
    ensureCdcObligationLedger(leader.db);
    const targetOwed = PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS - 1;
    const alreadyOwed = countCdcObligations(leader.db).owed;
    for (let i = 1; i <= targetOwed - alreadyOwed; i += 1) {
      insertCdcObligation(leader.db, {
        eventKey: `prefill:${i}:0`,
        logIndex: 100 + i,
        term: 1,
        ordinal: 0,
        entryId: `prefill-${i}`,
        eventJson: '{"type":"INSERT"}',
      });
    }
    assert.equal(countCdcObligations(leader.db).owed, targetOwed);

    // Propose an ordinary publication write AND the coordinator's formation LATCH
    // concurrently while 1 CDC slot remains:
    const ordinaryWritePending = track(
      leader.applyWrite({
        type: PARTITION_SERVICE_OPERATION.QUERY,
        entryId: 'ordinary-pub-write-1',
        sql:
          'INSERT INTO control_plane_publications (' +
          'publication_id, publication_kind, publication_epoch, publisher_node_id, ' +
          'published_active_node_ids, required_ack_node_ids, acknowledged_node_ids, ' +
          'status, created_at, updated_at, transition_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          'pub-epoch-1',
          'cluster_membership',
          1,
          SEED_NODE_ID,
          '["seed"]',
          '["seed"]',
          '["seed"]',
          'PUBLISHED',
          1500,
          1500,
          '[]',
        ],
      }),
    );
    const latchAttempt1Pending = track(
      coordinator.evaluateAndLatchFormationIfEligible(),
    );

    const ordinaryWriteCmd = await awaitProposal(
      proposed,
      (entry) => entry.entryId === 'ordinary-pub-write-1',
    );
    const expectedLatchEntryId = 'formation-latch:cluster-cdc-pressure:1';
    const latchCmd1 = await awaitProposal(
      proposed,
      (entry) => entry.entryId === expectedLatchEntryId,
    );
    assert.ok(ordinaryWriteCmd, 'ordinary publication write passed preflight');
    assert.ok(latchCmd1, 'formation LATCH passed preflight while 1 slot remained');

    // Apply the ordinary write first, exhausting the final CDC slot:
    applyCommitted(leader, ordinaryWriteCmd);
    const ordinaryWriteAns = await ordinaryWritePending.promise;
    assert.equal(ordinaryWriteAns.success, true);
    assert.equal(
      countCdcObligations(leader.db).owed,
      PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS,
    );

    // Apply the committed formation LATCH behind the write that exhausted capacity:
    applyCommitted(leader, latchCmd1);
    const latchAttempt1 = await latchAttempt1Pending.promise;
    assert.equal(latchAttempt1.latched, false);
    assert.equal(
      latchAttempt1.response?.failureCode,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY,
    );
    assert.equal(latchAttempt1.response?.deferRetry, true);
    assert.equal(
      latchAttempt1.response?.formationResult?.reason,
      FORMATION_REFUSAL_REASON.CDC_CAPACITY,
    );

    // Crucially, entryKey is UNRECORDED (not settled) in _partition_statement_outcomes,
    // and the coordinator retained the pinned attempt body (formedAt = 2000):
    const latchEntryKey = leader.getCommittedEntryKey(latchCmd1);
    assert.equal(
      readCommittedStatementOutcome(leader, latchEntryKey).state,
      PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED,
      'temporary CDC_CAPACITY refusal must NOT settle entryKey in _partition_statement_outcomes',
    );
    assert.equal(
      coordinator.retainedFormationLatchAttempts?.get(expectedLatchEntryId)?.body
        ?.formedAt,
      2000,
    );

    // Apply a committed CDC acknowledgment (buildCdcAcknowledgementCommand) to drain capacity:
    const ackCmd = buildCdcAcknowledgementCommand(
      leader.partitionId,
      [
        {
          logIndex: 101,
          events: [
            {
              ordinal: 0,
              eventKeyDigest: cdcObligationEventKeyDigest('prefill:1:0'),
            },
          ],
        },
      ],
      {
        timestamp: leader.hlcClock.now().toString(),
        proposedBy: leader.replicaId,
        proposedAt: clockMs,
      },
    );
    applyCommitted(leader, ackCmd);
    assert.equal(
      countCdcObligations(leader.db).owed,
      PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS - 1,
    );

    // Advance the clock and retry formation at the SAME publicationEpoch (1):
    clockMs = 9500;
    const proposedBeforeRetry = proposed.length;
    const latchAttempt2Pending = track(
      coordinator.evaluateAndLatchFormationIfEligible(),
    );
    const latchCmd2 = await awaitProposal(
      proposed,
      (entry, idx) =>
        idx >= proposedBeforeRetry && entry.entryId === expectedLatchEntryId,
    );
    assert.ok(latchCmd2, 'retry at same publicationEpoch proposed LATCH');
    assert.equal(
      latchCmd2.bodyText,
      latchCmd1.bodyText,
      'retry reuses exact pinned bodyText (including original formedAt)',
    );
    assert.equal(latchCmd2.body.formedAt, 2000);

    applyCommitted(leader, latchCmd2);
    const latchAttempt2 = await latchAttempt2Pending.promise;
    assert.equal(latchAttempt2.latched, true);
    assert.equal(
      latchAttempt2.response?.formationResult?.outcome,
      FORMATION_TRANSITION_OUTCOME.APPLIED,
    );
    assert.equal(
      coordinator.retainedFormationLatchAttempts?.has(expectedLatchEntryId),
      false,
      'settled LATCH clears retained attempt entry',
    );
    const formedAfterRetry = decodeFormationRecord(
      readFormationRecordIn(leader.db),
    );
    assert.equal(formedAfterRetry.state, PLACEMENT_FORMATION_STATE.FORMED);
    assert.equal(formedAfterRetry.latchEpoch, 1);
    assert.equal(formedAfterRetry.formedAt, 2000);
  } finally {
    await shutdownAll(leader);
  }

  // Part B (Item 3b): Positional SystemTableCache listener callback fires
  // evaluateAndLatchFormationIfEligible immediately on cache.set('services', ...).
  const listenerWorld = createFormationWorld({
    declaredHostCount: 1,
    clusterId: 'cluster-positional-cache-listener',
  });
  const listenerService = listenerWorld.publicationsPartitionService;
  try {
    const listenerCache = new SystemTableCache({nodeId: SEED_NODE_ID});
    await requestFormationDeclare(listenerService, {
      entryId: 'declare-listener-1',
      body: buildFormationDeclareBody({
        clusterId: 'cluster-positional-cache-listener',
        declaredHostCount: 1,
        declaredByNodeId: SEED_NODE_ID,
        declaredAt: 1000,
      }),
    });
    const declaredRow = readFormationRecordIn(listenerService.db);
    listenerCache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'INSERT',
      declaredRow,
    );
    listenerCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: SEED_NODE_ID,
      [COLUMN.HOST_ID]: 'seed-machine',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 60_000,
    });
    listenerCache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'INSERT',
      {
        publication_id: 'pub-listener-1',
        publication_kind: 'cluster_membership',
        publication_epoch: 1,
        status: 'PUBLISHED',
        published_active_node_ids: JSON.stringify([SEED_NODE_ID]),
        required_ack_node_ids: JSON.stringify([SEED_NODE_ID]),
        acknowledged_node_ids: JSON.stringify([SEED_NODE_ID]),
      },
    );
    for (const partitionId of PRIORITY_PARTITION_IDS) {
      listenerCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
        [COLUMN.PARTITION_ID]: partitionId,
        replica_count: 3,
      });
    }
    // Seed 5 of the 6 priority partitions before attaching the cache watcher:
    for (const partitionId of PRIORITY_PARTITION_IDS.slice(0, 5)) {
      listenerCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        [COLUMN.SERVICE_ID]: `${partitionId}-r1`,
        [COLUMN.REPLICA_ID]: `${partitionId}-r1`,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: partitionId,
        [COLUMN.NODE_ID]: SEED_NODE_ID,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: 'ws://seed:9000',
      });
    }
    const listenerCoordinator = new MembershipPublicationCoordinator({
      nodeId: SEED_NODE_ID,
      systemTableCache: listenerCache,
      publicationsPartitionService: listenerService,
      resolveIsControlPlanePublicationsWriteLeader: () => true,
      now: () => 3000,
    });
    listenerCoordinator.attachFormationLatchTriggers();
    assert.equal(
      decodeFormationRecord(readFormationRecordIn(listenerService.db)).state,
      PLACEMENT_FORMATION_STATE.FORMING,
    );

    // Final real cache mutation on SystemTableCache (invokes listener('services', ...)):
    const finalPartitionId = PRIORITY_PARTITION_IDS[5];
    listenerCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `${finalPartitionId}-r1`,
      [COLUMN.REPLICA_ID]: `${finalPartitionId}-r1`,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: finalPartitionId,
      [COLUMN.NODE_ID]: SEED_NODE_ID,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.ADDRESS]: 'ws://seed:9000',
    });
    await new Promise((resolve) => setImmediate(resolve));
    const latchedFromListener = decodeFormationRecord(
      readFormationRecordIn(listenerService.db),
    );
    assert.equal(
      latchedFromListener.state,
      PLACEMENT_FORMATION_STATE.FORMED,
      'positional SystemTableCache listener must trigger formation latch on services update',
    );
    assert.equal(latchedFromListener.latchEpoch, 1);
    listenerCoordinator.detachFormationLatchTriggers();
  } finally {
    listenerWorld.time.restore();
    listenerService.close();
  }
});

test('W1: late joiner with D=3 never latches at 2 hosts and latches to FORMED ' +
  'in frozen time once the 3rd host arrives and priority partitions spread',
async () => {
  const world = createFormationWorld({declaredHostCount: 3});
  const driver = createRoundDriver(world);
  try {
    await driver.formSeed();
    assert.equal(
      world.seed.controlPlaneReadinessService.answerFormation().state,
      PLACEMENT_FORMATION_STATE.FORMING,
      'lone seed with D=3 is FORMING, not FORMED',
    );

    // Only j1 arrives (2 hosts total: seed-machine and j1-machine < D=3):
    await driver.joinerArrives(J1);
    driver.startReadySignal(J1);
    await driver.settle();
    for (let r = 0; r < 8; r += 1) {
      await driver.round();
    }
    const twoHostFormation =
      world.seed.controlPlaneReadinessService.answerFormation();
    assert.equal(
      twoHostFormation.state,
      PLACEMENT_FORMATION_STATE.FORMING,
      'D=3 cluster must not latch to FORMED with only 2 READY hosts',
    );
    assert.equal(twoHostFormation.declaredHostCount, 3);
    assert.equal(twoHostFormation.readyHostCount, 2);
    assert.equal(twoHostFormation.missingHostCount, 1);
    assert.equal(
      readFormationRecordIn(world.publicationsPartitionService.db).status,
      FORMATION_RECORD_STATUS.DECLARED,
    );

    // Now j2 arrives (3rd host: j2-machine):
    await driver.joinerArrives(J2);
    driver.startReadySignal(J2);
    await driver.settle();
    for (let r = 0; r < 15; r += 1) {
      await driver.round();
      if (
        world.seed.controlPlaneReadinessService.answerFormation().state ===
        PLACEMENT_FORMATION_STATE.FORMED
      ) {
        break;
      }
    }
    const formed = world.seed.controlPlaneReadinessService.answerFormation();
    assert.equal(
      formed.state,
      PLACEMENT_FORMATION_STATE.FORMED,
      'D=3 cluster latches to FORMED once 3rd host is READY and priority partitions spread',
    );
    assert.equal(formed.declaredHostCount, 3);
    assert.deepEqual(formed.formedHostIds, [
      'j1-machine',
      'j2-machine',
      'seed-machine',
    ]);
    assert.equal(
      readFormationRecordIn(world.publicationsPartitionService.db).status,
      FORMATION_RECORD_STATUS.FORMED,
    );
  } finally {
    driver.close();
  }
});

test('W2: lone seed with D=1 latches to FORMED immediately at epoch 1',
  async () => {
    const report = await runArrivalOrder([], {declaredHostCount: 1});
    assert.equal(report.fixpoint, true);
    assert.equal(
      report.clusterGates.formation?.state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );
    assert.equal(report.clusterGates.formation?.declaredHostCount, 1);
    assert.equal(report.clusterGates.formation?.latchEpoch, 1);
    assert.deepEqual(report.clusterGates.formation?.formedHostIds, [
      'seed-machine',
    ]);
  });

test('W3 & W3u: FORMED stays latched after node death and READY lease expiry',
  async () => {
    let formationAfterFirstDeath = null;
    let formationAfterSecondDeath = null;
    const report = await runArrivalOrder(LOSING_ORDER, {
      declaredHostCount: 3,
      afterFixpoint: async (driver, world) => {
        assert.equal(
          world.seed.controlPlaneReadinessService.answerFormation().state,
          PLACEMENT_FORMATION_STATE.FORMED,
        );
        await driver.killJoiner(J1);
        await driver.readSeedAuthority();
        formationAfterFirstDeath =
          world.seed.controlPlaneReadinessService.answerFormation();

        await driver.killJoiner(J2);
        await driver.readSeedAuthority();
        formationAfterSecondDeath =
          world.seed.controlPlaneReadinessService.answerFormation();
      },
    });
    assert.equal(
      formationAfterFirstDeath?.state,
      PLACEMENT_FORMATION_STATE.FORMED,
      'FORMED must not revoke when 1 of 3 hosts dies and its lease expires',
    );
    assert.equal(
      formationAfterSecondDeath?.state,
      PLACEMENT_FORMATION_STATE.FORMED,
      'FORMED must not revoke even when 2 of 3 hosts die after formation',
    );
    assert.equal(
      report.clusterGates.formation?.state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );
    // Statement gate remains open for user writes and DDL after post-formation node death:
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('INSERT INTO items (id) VALUES (1)'),
        {[CLIENT_STATEMENT_INGRESS]: true},
        formationAfterSecondDeath,
      ),
      null,
    );
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('CREATE TABLE items (id INTEGER PRIMARY KEY)'),
        {[CLIENT_STATEMENT_INGRESS]: true},
        formationAfterSecondDeath,
      ),
      null,
    );
  });

test('W3L: once a process has read FORMED for its clusterId, answerFormation() ' +
  'holds FORMED for the life of the process across lease expiry and publications ' +
  'leader loss', async () => {
  let nowMs = 1_000_000;
  let publicationsLeaderUp = true;
  const nodeRows = [
    {
      [COLUMN.NODE_ID]: 'n1',
      [COLUMN.HOST_ID]: 'h1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + 15_000,
    },
  ];
  const formedRow = {
    publication_id: FORMATION_PUBLICATION_ID,
    publication_kind: FORMATION_PUBLICATION_KIND,
    publication_epoch: 2,
    publisher_node_id: 'n1',
    status: FORMATION_RECORD_STATUS.FORMED,
    created_at: nowMs,
    updated_at: nowMs,
    formation_record: JSON.stringify({
      version: 1,
      status: FORMATION_RECORD_STATUS.FORMED,
      clusterId: 'cluster-w3l',
      declaredHostCount: 1,
      declaredByNodeId: 'n1',
      declaredAt: nowMs,
      formedAt: nowMs + 5,
      formedByNodeId: 'n1',
      formedPublicationEpoch: 2,
      formedHostIds: ['h1'],
      formedReadyNodeIds: ['n1'],
      priorityPartitionVoters: {},
    }),
  };
  const membershipRow = {
    publication_id: 'cluster_membership-2',
    publication_kind: 'cluster_membership',
    publication_epoch: 2,
    publisher_node_id: 'n1',
    published_active_node_ids: JSON.stringify(['n1']),
    required_ack_node_ids: JSON.stringify(['n1']),
    acknowledged_node_ids: JSON.stringify(['n1']),
    status: 'PUBLISHED',
    created_at: nowMs,
    updated_at: nowMs,
  };
  const readCommittedRows = async (tableName) => {
    if (!publicationsLeaderUp) {
      return {success: false, error: 'leader_unavailable', rows: []};
    }
    if (tableName === TABLES.NODES) {
      return {success: true, rows: nodeRows};
    }
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      return {success: true, rows: [membershipRow, formedRow]};
    }
    return {success: false, error: 'unexpected', rows: []};
  };

  const owner = new ServeEligibilityOwner({
    now: () => nowMs,
    readTimeoutMs: 5_000,
    setTimeout: () => 1,
    clearTimeout: () => {},
    isNodeLoadReady: () => true,
    readCommittedRows,
  });
  try {
    // Before first committed read: UNAVAILABLE
    assert.equal(
      owner.answerFormation().state,
      PLACEMENT_FORMATION_STATE.UNAVAILABLE,
    );

    // First committed read observes FORMED:
    await owner.readServeEligibility();
    assert.equal(
      owner.answerFormation().state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );
    assert.equal(owner.answerFormation().clusterId, 'cluster-w3l');

    // Advance clock past node READY lease expiry AND stop the publications leader:
    nowMs += 60_000;
    publicationsLeaderUp = false;
    await owner.readServeEligibility();

    // Serve cohort is unavailable due to failed refresh + expired lease,
    // but answerFormation() and answerCommittedNodes().formation stay FORMED!
    assert.equal(owner.answerCohort().state, 'unavailable');
    assert.equal(
      owner.answerFormation().state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );
    assert.equal(
      owner.answerCommittedNodes().formation.state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );

    // A newly started process before its first committed read while the
    // publications leader is down answers UNAVAILABLE:
    const restartedOwner = new ServeEligibilityOwner({
      now: () => nowMs,
      readTimeoutMs: 5_000,
      setTimeout: () => 1,
      clearTimeout: () => {},
      isNodeLoadReady: () => true,
      readCommittedRows,
    });
    await restartedOwner.readServeEligibility();
    assert.equal(
      restartedOwner.answerFormation().state,
      PLACEMENT_FORMATION_STATE.UNAVAILABLE,
    );
    restartedOwner.shutdown();
  } finally {
    owner.shutdown();
  }
});

test('I1: statement ingress gate, SQLSTATE 57P03, BackupRestoreOwner gate, ' +
  'and ManagementV1Owner cluster.formation facts', async () => {
  const forming = Object.freeze({
    state: PLACEMENT_FORMATION_STATE.FORMING,
    reason: 'declared_hosts_pending',
    clusterId: 'cluster-i1',
    declaredHostCount: 3,
    readyHostCount: 2,
    missingHostCount: 1,
    readyHosts: Object.freeze(['h1', 'h2']),
    missingHosts: Object.freeze(['h3']),
  });
  const unavailable = Object.freeze({
    state: PLACEMENT_FORMATION_STATE.UNAVAILABLE,
    reason: 'no_committed_read',
  });
  const formed = Object.freeze({
    state: PLACEMENT_FORMATION_STATE.FORMED,
    clusterId: 'cluster-i1',
    declaredHostCount: 3,
    latchEpoch: 2,
    formedHostIds: Object.freeze(['h1', 'h2', 'h3']),
  });

  // 1. SQLSTATE mapping for FORMATION_PENDING is 57P03 (CANNOT_CONNECT_NOW):
  assert.equal(
    resolveFailureSqlState({errorCode: QUERY_ERROR_CODE.FORMATION_PENDING}),
    PG_ERROR_CODE.CANNOT_CONNECT_NOW,
  );
  assert.equal(PG_ERROR_CODE.CANNOT_CONNECT_NOW, '57P03');

  // 2. While FORMING or UNAVAILABLE:
  //    - SELECT and transaction control are admitted
  //    - IN_PROCESS_OWNER system-table DML is admitted (CLIENT system-table DML
  //      is still refused with SYSTEM_TABLE_WRITE_REFUSED)
  //    - User-table DML and all DDL are refused with FORMATION_PENDING for BOTH
  //      CLIENT and IN_PROCESS_OWNER ingress!
  for (const preFormed of [forming, unavailable]) {
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('SELECT * FROM orders WHERE id = 1'),
        {[CLIENT_STATEMENT_INGRESS]: true},
        preFormed,
      ),
      null,
      'user SELECT is admitted before FORMED',
    );
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('SELECT * FROM nodes'),
        {[CLIENT_STATEMENT_INGRESS]: true},
        preFormed,
      ),
      null,
      'system SELECT is admitted before FORMED',
    );
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('BEGIN'),
        {[CLIENT_STATEMENT_INGRESS]: true},
        preFormed,
      ),
      null,
      'BEGIN is admitted before FORMED',
    );
    assert.equal(
      resolveClientStatementRefusal(
        parseSql('UPDATE nodes SET status = \'active\' WHERE node_id = \'n1\''),
        {},
        preFormed,
      ),
      null,
      'in-process owner system-table DML is admitted before FORMED',
    );
    const clientSystemWrite = resolveClientStatementRefusal(
      parseSql('UPDATE nodes SET status = \'active\' WHERE node_id = \'n1\''),
      {[CLIENT_STATEMENT_INGRESS]: true},
      preFormed,
    );
    assert.equal(
      clientSystemWrite?.errorCode,
      QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
      'client system-table DML is still refused with SYSTEM_TABLE_WRITE_REFUSED',
    );

    for (const sql of [
      'CREATE TABLE orders (id INTEGER PRIMARY KEY, total INTEGER)',
      'ALTER TABLE orders ADD COLUMN note TEXT',
      'CREATE INDEX idx_orders_total ON orders (total)',
      'DROP INDEX idx_orders_total',
      'DROP TABLE orders',
      'INSERT INTO orders (id, total) VALUES (1, 100)',
      'UPDATE orders SET total = 200 WHERE id = 1',
      'DELETE FROM orders WHERE id = 1',
    ]) {
      for (const options of [{[CLIENT_STATEMENT_INGRESS]: true}, {}]) {
        const refusal = resolveClientStatementRefusal(
          parseSql(sql),
          options,
          preFormed,
        );
        assert.notEqual(refusal, null, `${sql} must be refused before FORMED`);
        assert.equal(refusal.success, false);
        assert.equal(refusal.errorCode, QUERY_ERROR_CODE.FORMATION_PENDING);
        assert.equal(refusal.retryable, true);
        assert.deepEqual(refusal.formation, preFormed);
      }
    }
  }

  // 3. Once FORMED: user writes and DDL are admitted:
  for (const sql of [
    'CREATE TABLE orders (id INTEGER PRIMARY KEY, total INTEGER)',
    'INSERT INTO orders (id, total) VALUES (1, 100)',
    'UPDATE orders SET total = 200 WHERE id = 1',
    'DELETE FROM orders WHERE id = 1',
  ]) {
    assert.equal(
      resolveClientStatementRefusal(
        parseSql(sql),
        {[CLIENT_STATEMENT_INGRESS]: true},
        formed,
      ),
      null,
    );
  }

  // 4. BackupRestoreOwner.restoreFromBackup refuses with FORMATION_PENDING before FORMED:
  let currentFormation = forming;
  const backupOwner = new BackupRestoreOwner({
    storageAdapter: {
      read: async () => {
        throw new Error('storage read must not run while FORMATION_PENDING');
      },
      write: async () => {},
      has: () => false,
    },
    exportPartitionSnapshots: () => [],
    hydratePartitionSnapshots: () => {},
    getFormation: () => currentFormation,
  });
  await assert.rejects(
    () => backupOwner.restoreFromBackup({destinationUri: 'memory://bkp/1'}),
    (err) =>
      err.code === 'FORMATION_PENDING' &&
      err.errorCode === 'FORMATION_PENDING' &&
      err.retryable === true &&
      err.formation === forming,
  );
  assert.equal(backupOwner.isRestoreInProgress(), false);
  assert.equal(backupOwner.isRestoreAborted(), false);

  // 5. ManagementV1Owner exposes cluster.formation and declarationConfigDiffers:
  const mgmt = new ManagementV1Owner({
    clusterId: 'cluster-i1',
    getFormation: () => currentFormation,
    getConfiguredDeclaredHostCount: () => 5,
  });
  const factsForming = mgmt.getClusterFacts();
  assert.equal(factsForming.facts.cluster.identity, 'cluster-i1');
  assert.equal(
    factsForming.facts.cluster.formation.state,
    PLACEMENT_FORMATION_STATE.FORMING,
  );
  assert.deepEqual(
    factsForming.facts.cluster.formation.declarationConfigDiffers,
    {durable: 3, configured: 5},
  );

  currentFormation = formed;
  const factsFormed = mgmt.getClusterFacts();
  assert.equal(
    factsFormed.facts.cluster.formation.state,
    PLACEMENT_FORMATION_STATE.FORMED,
  );
});
