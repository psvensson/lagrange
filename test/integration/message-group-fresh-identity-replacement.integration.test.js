import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  registerMessageGroupTransportHandler,
  retireMessageGroupTransportHandler,
} from '../../src/bootstrap/shared/message-group-transport-handler.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  NODES_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  SERVICES_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  readMessageGroupCommittedMembership,
} from '../../src/message-group/message-group-consensus-port.js';
import {
  createMessageGroupLearnerJoinCapability,
  produceMessageGroupLearnerJoinDescriptor,
} from '../../src/message-group/message-group-learner-join.js';
import {
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  durableRecordBootstrap,
} from '../../src/raft/raft-committed-membership-stamp.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_TRANSITION_REASON as REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  proposeAuthorizedGroupLearner,
  proposeAuthorizedGroupPromotion,
  proposeAuthorizedGroupRemoval,
} from '../../src/raft/raft-rs-group-membership-admission.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from '../../src/rebalancer/replica-operation-insert-disposition.js';
import {
  recordedLearnerCreateBasis,
} from '../../src/rebalancer/replica-operation-message-group-membership-authorization.js';
import {
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME,
  MEMBERSHIP_OBLIGATION as OBLIGATION,
  MEMBERSHIP_PHASE as PHASE,
  encodeMembershipPermit,
} from '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {
  retireRemovedMessageGroupSourceReplica,
} from '../../src/rebalancer/replica-operation-message-group-removal.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const GROUP_ID = 'mg-1';
const CLUSTER_ID = 'fresh-mg-physical-cluster';
const LANE_KEY = `message-group:${GROUP_ID}`;
const SEED_NODE = 'node-seed';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const FOUNDERS = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];

function waitFor(predicate, boundMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - start >= boundMs) return resolve(Boolean(predicate()));
      setTimeout(poll, 10);
    };
    poll();
  });
}

function createControlPlaneStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
    db.exec(sql);
  }
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  db.exec(generateCreateTableSQL(SERVICES_SCHEMA));

  const execute = (sql, params = []) => {
    const statement = db.prepare(sql);
    if (statement.reader) {
      return {success: true, rows: statement.all(...params)};
    }
    const info = statement.run(...params);
    return {
      success: true,
      changes: info.changes,
      affectedRows: info.changes,
    };
  };

  const gateway = {
    executeQuery: async (sql, params) => execute(sql, params),
    readAuthoritativeRows: async (_table, sql, params) => execute(sql, params),
    readRows: async (_table, sql, params) => execute(sql, params),
    updateSystemTableRow: async (table, where, data) => {
      const whereKeys = Object.keys(where);
      const setKeys = Object.keys(data);
      const sql =
        `UPDATE ${table} SET ` +
        `${setKeys.map((key) => `${key} = ?`).join(', ')} WHERE ` +
        `${whereKeys.map((key) => `${key} IS ?`).join(' AND ')}`;
      const res = execute(sql, [
        ...setKeys.map((key) => data[key]),
        ...whereKeys.map((key) => where[key]),
      ]);
      return {
        success: true,
        outcome: res.affectedRows === 1 ? 'applied' : 'no_op',
        changes: res.affectedRows,
        affectedRows: res.affectedRows,
      };
    },
    deleteSystemTableRow: async (table, where) => {
      const whereKeys = Object.keys(where);
      const sql =
        `DELETE FROM ${table} WHERE ` +
        `${whereKeys.map((key) => `${key} = ?`).join(' AND ')}`;
      const res = execute(
        sql,
        whereKeys.map((key) => where[key]),
      );
      return {
        success: true,
        outcome: res.affectedRows === 1 ? 'applied' : 'no_op',
        changes: res.affectedRows,
        affectedRows: res.affectedRows,
      };
    },
  };

  return {db, execute, gateway};
}

async function transferCheckpointImage(senderRoot, descriptor, receiverRoot) {
  const {a, b} = createInProcWebSocketPair();
  const [served, received] = await Promise.all([
    serveSnapshotTransfer({
      socket: a,
      checkpointsRoot: senderRoot,
      generationIndex: descriptor.generationIndex,
      transferId: `transfer-${descriptor.generationIndex}`,
      chunkSizeBytes: 4096,
    }),
    receiveSnapshotTransfer({
      socket: b,
      checkpointsRoot: receiverRoot,
      expectedIdentity: descriptor.checkpointIdentity,
      chunkSizeBytes: 4096,
    }),
  ]);
  assert.equal(served.outcome, 'completed');
  assert.equal(received.outcome, 'completed');
}

async function ensureLeaderWithAppliedTerm(liveReplicas, preferredReplicaId = null) {
  assert.equal(
    await waitFor(() =>
      liveReplicas.some((service) => service.raft?.readStatus()?.role === RAFT_ROLE.LEADER),
    ),
    true,
    'live message-group replicas must elect a leader',
  );
  let leader = liveReplicas.find(
    (service) => service.raft?.readStatus()?.role === RAFT_ROLE.LEADER,
  );
  if (preferredReplicaId && leader.replicaId !== preferredReplicaId) {
    const preferred = liveReplicas.find(
      (service) => service.replicaId === preferredReplicaId,
    );
    assert.ok(preferred, `preferred leader ${preferredReplicaId} must be live`);
    assert.equal(
      leader.raft.transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: preferredReplicaId,
      }).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    assert.equal(
      await waitFor(
        () => preferred.raft?.readStatus()?.role === RAFT_ROLE.LEADER,
      ),
      true,
      `${preferredReplicaId} must become leader after named transfer`,
    );
    leader = preferred;
  }
  if (!leader.raft.readStatus().currentTermApplied) {
    await leader.applyCDCEvent(TABLES.NODES, 'INSERT', {
      id: `term-barrier-${leader.replicaId}-${Date.now()}`,
      address: '127.0.0.1:7999',
      status: 'active',
    });
  }
  assert.equal(
    await waitFor(() => leader.raft.readStatus().currentTermApplied === true),
    true,
    `${leader.replicaId} must have applied an entry in its current term`,
  );
  return leader;
}

test('mg-1 survives physical seed storage loss from two distinct off-seed voters',
  {timeout: 45000}, async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: SEED_NODE},
      raft: {
        heartbeatIntervalMs: 20,
        electionTimeoutMinMs: 150,
        electionTimeoutMaxMs: 300,
      },
    });
    LoggingService.getInstance().initialize({level: 'error'});

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-seedloss-'));
    const seedStorage = path.join(root, SEED_NODE);
    const nodeBStorage = path.join(root, NODE_B);
    const nodeCStorage = path.join(root, NODE_C);
    fs.mkdirSync(seedStorage, {recursive: true});
    fs.mkdirSync(nodeBStorage, {recursive: true});
    fs.mkdirSync(nodeCStorage, {recursive: true});

    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: SEED_NODE,
      wsPort: 0,
    });
    await router.initialize({startServer: false});
    router.deliver = (address, envelope) => {
      const handler = router.getRegisteredHandler(address);
      if (typeof handler === 'function') {
        setImmediate(() => {
          Promise.resolve(handler(envelope, null, true)).catch(() => {});
        });
      }
      return undefined;
    };

    const cache = new SystemTableCache();
    const nodeService = {
      getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache,
    };

    const cpStore = createControlPlaneStore(
      path.join(root, 'control-plane.sqlite'),
    );
    const nowMs = 1_000_000;
    for (const nodeId of [SEED_NODE, NODE_B, NODE_C]) {
      cpStore.execute(
        'INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb, ' +
        'disk_gb, last_heartbeat, boot_incarnation, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nodeId, nodeId, 4, 1024, 20, nowMs, 1, nowMs],
      );
    }

    const serviceRowOwner = new MessageGroupServiceRowOwner({
      systemTableWriter: cpStore.gateway,
      now: () => nowMs,
    });

    const insertActiveServiceRow = ({replicaId, nodeId, createdAt, token}) => {
      const address = `${nodeId}/message-group/${replicaId}`;
      const built = MessageGroupServiceRowOwner.buildServiceRow({
        groupId: GROUP_ID,
        replicaId,
        nodeId,
        timestamp: createdAt,
        status: SERVICE_STATUS.ACTIVE,
        extraFields: {
          created_at: createdAt,
          state_entered_at: createdAt,
          updated_at: createdAt,
          create_attempt_token: token,
        },
      });
      const cols = Object.keys(built);
      cpStore.execute(
        `INSERT INTO services (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((col) => built[col]),
      );
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: replicaId,
        replica_id: replicaId,
        group_id: GROUP_ID,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: nodeId,
        status: SERVICE_STATUS.ACTIVE,
        address,
      });
    };

    for (let i = 0; i < FOUNDERS.length; i += 1) {
      insertActiveServiceRow({
        replicaId: FOUNDERS[i],
        nodeId: SEED_NODE,
        createdAt: 100 + i,
        token: `seed-attempt-${FOUNDERS[i]}`,
      });
    }

    const noLog = {debug() {}, info() {}, warn() {}, error() {}};
    const repositoryFor = (nodeId) =>
      new ReplicaOperationRepository({
        nodeId,
        membershipOwnerBootIncarnation: 1,
        timeSource: {now: () => nowMs},
        controlPlaneSystemTableGateway: cpStore.gateway,
        logger: noLog,
        systemTableCache: cache,
        cdcIntegrationService: {waitForCacheUpdate: async () => {}},
        authoritativeVisibilityTimeoutMs: 0,
        authoritativeVisibilityRetryDelayMs: 0,
      });
    const repository = repositoryFor(SEED_NODE);

    const peerAddresses = FOUNDERS.map(
      (replicaId) => `${SEED_NODE}/message-group/${replicaId}`,
    );
    const replicas = new Map();
    const liveReplicas = () => [...replicas.values()];

    try {
      for (const replicaId of FOUNDERS) {
        const service = new MessageGroupService({
          groupId: GROUP_ID,
          replicaId,
          nodeId: SEED_NODE,
          replicaIds: [...FOUNDERS],
          peerAddresses: [...peerAddresses],
          transport: router,
          nodeService,
          dbPath: path.join(seedStorage, `${replicaId}.db`),
          publishRoleMetadata: false,
          publishLeaderNodeMetadata: false,
        });
        registerMessageGroupTransportHandler(service, {
          messageRouter: router,
          address: service.unifiedAddress,
        });
        await service.initialize();
        replicas.set(replicaId, service);
      }
      for (const service of replicas.values()) {
        service.startElection();
      }

      await ensureLeaderWithAppliedTerm(liveReplicas());
      assert.deepEqual(
        fs.readdirSync(nodeBStorage),
        [],
        'base has no off-seed B4 artifact before R1',
      );
      assert.deepEqual(
        fs.readdirSync(nodeCStorage),
        [],
        'base has no off-seed C5 artifact before R2',
      );

      const executeSerialReplacement = async ({
        operationId,
        transitionIdentity,
        sourceReplicaId,
        sourceCreatedAt,
        sourceToken,
        targetReplicaId,
        targetNodeId,
        targetStorageDir,
        preferredRemovalLeaderId,
      }) => {
        const targetPeerId = deriveRaftRsPeerId(targetReplicaId);
        const targetAddress = `${targetNodeId}/message-group/${targetReplicaId}`;
        const identity = JSON.stringify({
          operationId,
          groupId: GROUP_ID,
          sourceReplicaId,
          sourceNodeId: SEED_NODE,
          sourceCreatedAt,
          sourceCreateAttemptToken: sourceToken,
          targetReplicaId,
          targetPeerId,
          targetNodeId,
          targetAddress,
          transitionIdentity,
          membershipLaneKey: LANE_KEY,
        });
        const sourceClaim = JSON.stringify({
          replicaId: sourceReplicaId,
          createdAt: sourceCreatedAt,
          stateEnteredAt: sourceCreatedAt,
          createAttemptToken: sourceToken,
        });

        const inserted = await repository.persistNewOperation(
          {
            operationId,
            type: OperationType.REPLACE,
            partitionId: GROUP_ID,
            entityId: GROUP_ID,
            entityType: SERVICE_TYPE.MESSAGE_GROUP,
            replicaId: targetReplicaId,
            sourceReplicaId,
            sourceNodeId: SEED_NODE,
            targetNodeId,
            status: ReplicaStatus.PENDING,
            workflowStep: WORKFLOW_STEP.PENDING,
            createdAt: nowMs,
            updatedAt: nowMs,
            completedAt: null,
            stepsHistory: [],
            membershipPublicationEpoch: 1,
            messageGroupMembershipLaneKey: LANE_KEY,
            messageGroupMembershipIdentity: identity,
            messageGroupMembershipPhase: PHASE.LEARNER_REQUESTED,
            messageGroupMembershipObligationState: OBLIGATION.INTENT_RECORDED,
            messageGroupMembershipOwnerClaim: null,
            messageGroupMembershipPermit: null,
            messageGroupLearnerStamp: null,
            messageGroupVoterStamp: null,
            messageGroupRemovalStamp: null,
            messageGroupSourceLifecycleClaim: sourceClaim,
          },
          {returnDisposition: true},
        );
        assert.equal(
          inserted.disposition,
          REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
        );

        const claimed = await repository.claimMessageGroupMembershipOwner({
          operationId,
          identity,
          expectedClaim: null,
        });
        assert.equal(claimed.outcome, OUTCOME.RECORDED);
        const holder = JSON.parse(claimed.claim);

        const leaderForAdd = await ensureLeaderWithAppliedTerm(liveReplicas());
        const addLeaderStatus = leaderForAdd.raft.readStatus();
        const learnerPermit = encodeMembershipPermit({
          version: 2,
          transitionIdentity,
          permitSequence: 1,
          permitStage: 'add-learner',
          permitState: 'in_flight',
          workflowOwnerNodeId: SEED_NODE,
          workflowOwnerFence: `${SEED_NODE}:1:${holder.generation}`,
          membershipLeaseExpiresAt: holder.expiresAt,
          proposerNodeId: SEED_NODE,
          proposerBootIncarnation: 1,
          destinationNodeId: leaderForAdd.nodeId,
          destinationBootIncarnation: 1,
          replicaLifecycleIncarnation: addLeaderStatus.lifecycleIncarnation,
          runtimeGeneration: addLeaderStatus.runtimeGeneration,
          leaderTerm: addLeaderStatus.term,
          leaderConfigurationStamp: {
            configurationKey: addLeaderStatus.configurationKey,
            membershipGenerationIndex: addLeaderStatus.membershipGenerationIndex,
          },
          proposalIndex: null,
          replicaIdentity: targetReplicaId,
          peerId: targetPeerId,
        });

        assert.equal(
          (
            await repository.authorizeMessageGroupLearner({
              operationId,
              identity,
              permit: learnerPermit,
            })
          ).outcome,
          OUTCOME.RECORDED,
        );

        const addProblemToken = buildReplicaCreateAttemptToken(
          buildReplicaCreateAdmissionToken({
            operationId,
            replicaId: targetReplicaId,
            targetNodeId,
            workflowUpdatedAt: nowMs + 10,
          }),
          1,
        );
        insertActiveServiceRow({
          replicaId: targetReplicaId,
          nodeId: targetNodeId,
          createdAt: nowMs + 10,
          token: addProblemToken,
        });

        const addRecipientRepo = repositoryFor(leaderForAdd.nodeId);
        const addProposed = await proposeAuthorizedGroupLearner(
          leaderForAdd.raft,
          {
            groupId: GROUP_ID,
            nodeId: leaderForAdd.nodeId,
            bootIncarnation: 1,
            localReplicaIdentity: leaderForAdd.replicaId,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
            peerAddress: targetAddress,
          },
          {
            operationId,
            identity,
            permit: learnerPermit,
            executionClaim: claimed.claim,
          },
          (req, receiver) =>
            addRecipientRepo.observeMessageGroupLearnerAuthorization(
              req,
              receiver,
            ),
          {
            nodeId: leaderForAdd.nodeId,
            bootIncarnation: 1,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
            isCurrent: () => true,
          },
        );
        assert.equal(addProposed.reason, REASON.PROPOSED);
        assert.equal(
          await waitFor(() =>
            liveReplicas().every((service) =>
              service.raft
                .readStatus()
                .confState.learners.map(String)
                .includes(targetPeerId),
            ),
          ),
          true,
          `every live replica must apply ADD_LEARNER for ${targetReplicaId}`,
        );

        const learnerRecorded = await repository.recordMessageGroupLearnerOutcome(
          {
            operationId,
            identity,
            permit: learnerPermit,
            executionClaim: claimed.claim,
          },
          (query) => leaderForAdd.raft.readCommittedMembership(query),
        );
        assert.equal(learnerRecorded.outcome, OUTCOME.RECORDED);

        // Advance operation to SENDING and claim ReplicaCreateAdmissionOwner on targetNodeId.
        const opRow = await repository.queryAuthoritativeOperationById(operationId);
        const sendingUpdatedAt = nowMs + 10;
        await repository.persistOperationUpdate(
          {
            ...opRow,
            workflowStep: WORKFLOW_STEP.SENDING,
            updatedAt: sendingUpdatedAt,
          },
          {
            confirmPersistence: false,
            disableSystemWriteSession: true,
            returnDisposition: true,
            expectedWorkflowStep: WORKFLOW_STEP.PENDING,
          },
        );

        const rowForCreateBasis =
          await repository.queryAuthoritativeOperationById(operationId);
        const basis = recordedLearnerCreateBasis(rowForCreateBasis);
        assert.ok(basis);

        const createAdmissionOwner = new ReplicaCreateAdmissionOwner({
          gateway: cpStore.gateway,
          nodeId: targetNodeId,
          ownerIncarnation: 1,
          now: () => sendingUpdatedAt,
        });
        const admissionToken = buildReplicaCreateAdmissionToken({
          operationId,
          replicaId: targetReplicaId,
          targetNodeId,
          workflowUpdatedAt: sendingUpdatedAt,
        });
        const attemptToken = buildReplicaCreateAttemptToken(admissionToken, 1);
        const admitted = await createAdmissionOwner.claim(
          {
            operationId,
            operationType: OperationType.REPLACE,
            entityType: SERVICE_TYPE.MESSAGE_GROUP,
            entityId: GROUP_ID,
            partitionId: GROUP_ID,
            replicaId: targetReplicaId,
            targetNodeId,
            admissionToken,
            attemptToken,
            attemptSeq: 1,
            workflowUpdatedAt: sendingUpdatedAt,
          },
          basis.where,
        );
        const createEvidence = await createAdmissionOwner.markMaterialized(
          admitted,
          {...basis.where, completed_at: null},
        );
        assert.ok(createEvidence);
        const physicalWorkerClaim =
          await createAdmissionOwner.claimPhysicalWorker(createEvidence);
        assert.ok(physicalWorkerClaim);

        let joinedLearnerService = null;
        const joinCapability = createMessageGroupLearnerJoinCapability({
          nodeId: targetNodeId,
          clusterId: CLUSTER_ID,
          messageRouter: router,
          dbPathOf: (_groupId, replicaId) =>
            path.join(targetStorageDir, `${replicaId}.db`),
          requestJoinDescriptor: async (request) => {
            const currentLeader = await ensureLeaderWithAppliedTerm(liveReplicas());
            const senderRoot = path.join(
              root,
              'leader-checkpoints',
              currentLeader.replicaId,
            );
            const produced = await produceMessageGroupLearnerJoinDescriptor(
              currentLeader,
              {checkpointsRoot: senderRoot, clusterId: CLUSTER_ID},
              {
                targetReplicaId: request.targetReplicaId,
                targetPeerId: request.targetPeerId,
              },
            );
            if (produced.descriptor) {
              await transferCheckpointImage(
                senderRoot,
                produced.descriptor,
                request.checkpointsRoot,
              );
            }
            return produced;
          },
          observeLeader: async () => {
            const currentLeader = await ensureLeaderWithAppliedTerm(liveReplicas());
            return {
              membership: readMessageGroupCommittedMembership(
                currentLeader,
                PURPOSE.BOOTSTRAP,
              ),
              status: currentLeader.raft.readStatus(),
            };
          },
          adoptLearner: (service) => {
            joinedLearnerService = service;
            replicas.set(targetReplicaId, service);
          },
          serviceOptions: {nodeService},
          catchUp: {timeoutMs: 6000, pollIntervalMs: 15},
        });

        const joinReport = await joinCapability({
          groupId: GROUP_ID,
          replicaId: targetReplicaId,
          nodeId: targetNodeId,
          createAdmissionOwner,
          createAdmissionEvidence: createEvidence,
          createPhysicalWorkerClaim: physicalWorkerClaim,
          createAdmissionBasis: {
            ...basis.where,
            completed_at: null,
            create_admission_state: CREATE_ADMISSION_STATE.MATERIALIZED,
          },
          messageGroupLearnerJoin: {
            identity: basis.identity,
            learnerStamp: basis.learnerStamp,
            committedPermit: basis.committedPermit,
            learnerOrigin: basis.learnerOrigin,
          },
        });
        assert.equal(joinReport.outcome, 'message_group_learner_running');
        assert.ok(joinedLearnerService);
        assert.equal(
          fs.existsSync(path.join(targetStorageDir, `${targetReplicaId}.db`)),
          true,
          `${targetReplicaId}.db must be materialized in ${targetStorageDir}`,
        );

        // Select and propose promotion of the caught-up learner to voter.
        const leaderForPromote = await ensureLeaderWithAppliedTerm(
          liveReplicas().filter((s) => s.replicaId !== targetReplicaId),
        );
        const promoteSelected = await repository.selectMessageGroupPromotion(
          {
            operationId,
            destinationNodeId: leaderForPromote.nodeId,
            destinationReplicaId: leaderForPromote.replicaId,
          },
          (query) => leaderForPromote.raft.readCommittedMembership(query),
          async () => ({
            membership: readMessageGroupCommittedMembership(
              leaderForPromote,
              PURPOSE.BOOTSTRAP,
            ),
            status: leaderForPromote.raft.readStatus(),
            own: readMessageGroupCommittedMembership(joinedLearnerService),
          }),
          () => true,
        );
        assert.equal(promoteSelected.outcome, OUTCOME.RECORDED);

        const rowForPromote = cpStore.db
          .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(operationId);
        const promoteRecipientRepo = repositoryFor(leaderForPromote.nodeId);
        const promoteProposed = await proposeAuthorizedGroupPromotion(
          leaderForPromote.raft,
          {
            groupId: GROUP_ID,
            nodeId: leaderForPromote.nodeId,
            bootIncarnation: 1,
            localReplicaIdentity: leaderForPromote.replicaId,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
          },
          {
            operationId,
            identity,
            permit: rowForPromote.message_group_membership_permit,
            executionClaim: rowForPromote.message_group_membership_owner_claim,
          },
          (req, receiver) =>
            promoteRecipientRepo.observeMessageGroupPromotionAuthorization(
              req,
              receiver,
            ),
          {
            nodeId: leaderForPromote.nodeId,
            bootIncarnation: 1,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
            isCurrent: () => true,
          },
          () => joinedLearnerService.raft.readStatus(),
        );
        assert.equal(promoteProposed.reason, REASON.PROPOSED);
        assert.equal(
          await waitFor(() =>
            liveReplicas().every((service) =>
              service.raft
                .readStatus()
                .confState.voters.map(String)
                .includes(targetPeerId),
            ),
          ),
          true,
          `${targetReplicaId} must be committed as a voter on all live replicas`,
        );

        const voterRecorded = await repository.recoverMessageGroupVoterOutcome(
          operationId,
          (query) => leaderForPromote.raft.readCommittedMembership(query),
          () => true,
        );
        assert.equal(voterRecorded.outcome, OUTCOME.RECORDED);

        joinedLearnerService.completeJoinConvergence();

        // Hand leadership to preferredRemovalLeaderId (never the source being removed)
        // and remove the source voter.
        const removalLeader = await ensureLeaderWithAppliedTerm(
          liveReplicas().filter((s) => s.replicaId !== sourceReplicaId),
          preferredRemovalLeaderId,
        );
        const removalSelected =
          await repository.selectMessageGroupSourceRemoval(
            {
              operationId,
              destinationNodeId: removalLeader.nodeId,
              destinationReplicaId: removalLeader.replicaId,
            },
            async () => ({
              sourceStatus: replicas.get(sourceReplicaId).raft.readStatus(),
              membership: await removalLeader.raft.readCommittedMembership({
                purpose: PURPOSE.BOOTSTRAP,
                groupId: GROUP_ID,
              }),
              status: removalLeader.raft.readStatus(),
            }),
            () => true,
          );
        assert.equal(removalSelected.outcome, OUTCOME.RECORDED);

        const rowForRemoval = cpStore.db
          .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(operationId);
        const removalRecipientRepo = repositoryFor(removalLeader.nodeId);
        const removalProposed = await proposeAuthorizedGroupRemoval(
          removalLeader.raft,
          {
            groupId: GROUP_ID,
            nodeId: removalLeader.nodeId,
            bootIncarnation: 1,
            localReplicaIdentity: removalLeader.replicaId,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
            peerAddress: `${SEED_NODE}/message-group/${sourceReplicaId}`,
          },
          {
            operationId,
            identity,
            permit: rowForRemoval.message_group_membership_permit,
            executionClaim: rowForRemoval.message_group_membership_owner_claim,
          },
          (req, receiver) =>
            removalRecipientRepo.observeMessageGroupRemovalAuthorization(
              req,
              receiver,
            ),
          {
            nodeId: removalLeader.nodeId,
            bootIncarnation: 1,
            senderNodeId: SEED_NODE,
            senderBootIncarnation: 1,
            isCurrent: () => true,
          },
        );
        assert.equal(removalProposed.reason, REASON.PROPOSED);

        const sourcePeerId = deriveRaftRsPeerId(sourceReplicaId);
        assert.equal(
          await waitFor(() =>
            liveReplicas().every(
              (service) =>
                !service.raft
                  .readStatus()
                  .confState.voters.map(String)
                  .includes(sourcePeerId),
            ),
          ),
          true,
          `${sourceReplicaId} must exit voters across all live replicas`,
        );

        const removalRecorded =
          await repository.recoverMessageGroupRemovalOutcome(
            operationId,
            (query) => removalLeader.raft.readCommittedMembership(query),
            () => true,
          );
        assert.equal(removalRecorded.outcome, OUTCOME.RECORDED);

        const sourceService = replicas.get(sourceReplicaId);
        await retireMessageGroupTransportHandler({
          messageGroup: sourceService,
          messageRouter: router,
          address: sourceService.unifiedAddress,
          replicaId: sourceReplicaId,
        });
        const retired = await retireRemovedMessageGroupSourceReplica({
          repository,
          operationId,
          sourceService,
          serviceRowOwner,
          dbPath: path.join(seedStorage, `${sourceReplicaId}.db`),
          backstopMs: 1000,
          pollMs: 10,
        });
        assert.equal(retired.outcome, 'retired');
        replicas.delete(sourceReplicaId);
        cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', {
          service_id: sourceReplicaId,
          replica_id: sourceReplicaId,
          group_id: GROUP_ID,
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: SEED_NODE,
        });
      };

      // R1: replace mg-1-r2 on node-seed with mg-1-r4 on node-b.
      await executeSerialReplacement({
        operationId: 'op-replace-mg-1-r2-r4',
        transitionIdentity: 'transition-r2-r4',
        sourceReplicaId: 'mg-1-r2',
        sourceCreatedAt: 101,
        sourceToken: 'seed-attempt-mg-1-r2',
        targetReplicaId: 'mg-1-r4',
        targetNodeId: NODE_B,
        targetStorageDir: nodeBStorage,
        preferredRemovalLeaderId: 'mg-1-r1',
      });

      // R2: replace mg-1-r3 on node-seed with mg-1-r5 on node-c, handing leadership off-seed to mg-1-r4.
      await executeSerialReplacement({
        operationId: 'op-replace-mg-1-r3-r5',
        transitionIdentity: 'transition-r3-r5',
        sourceReplicaId: 'mg-1-r3',
        sourceCreatedAt: 102,
        sourceToken: 'seed-attempt-mg-1-r3',
        targetReplicaId: 'mg-1-r5',
        targetNodeId: NODE_C,
        targetStorageDir: nodeCStorage,
        preferredRemovalLeaderId: 'mg-1-r4',
      });

      // Now shut down the sole remaining seed replica (mg-1-r1) and make seedStorage unavailable.
      const remainingSeedService = replicas.get('mg-1-r1');
      assert.ok(remainingSeedService);
      await retireMessageGroupTransportHandler({
        messageGroup: remainingSeedService,
        messageRouter: router,
        address: remainingSeedService.unifiedAddress,
        replicaId: 'mg-1-r1',
      });
      await remainingSeedService.shutdown();
      replicas.delete('mg-1-r1');
      fs.renameSync(seedStorage, `${seedStorage}.unavailable`);

      const b4 = path.join(nodeBStorage, 'mg-1-r4.db');
      const c5 = path.join(nodeCStorage, 'mg-1-r5.db');
      assert.equal(
        fs.existsSync(b4) && fs.existsSync(c5),
        true,
        'two serial production REPLACEs must leave real voter state on distinct off-seed storage before seed loss',
      );

      // Verify the two off-seed voters (mg-1-r4 on node-b and mg-1-r5 on node-c)
      // maintain 2/3 quorum and replicate CDC/cache updates after seed loss.
      const offSeedLeader = await ensureLeaderWithAppliedTerm(liveReplicas());
      assert.ok(
        ['mg-1-r4', 'mg-1-r5'].includes(offSeedLeader.replicaId),
        'off-seed voter leads at 2/3 quorum without the seed',
      );
      const postSeedLossRow = {
        id: 'node-after-seed-loss',
        address: '10.42.0.4:7000',
        status: 'active',
      };
      await offSeedLeader.applyCDCEvent(TABLES.NODES, 'INSERT', postSeedLossRow);
      for (const replicaId of ['mg-1-r4', 'mg-1-r5']) {
        const voter = replicas.get(replicaId);
        assert.equal(
          await waitFor(
            () =>
              voter.getWritableCache().get(TABLES.NODES, postSeedLossRow.id)
                ?.address === postSeedLossRow.address,
          ),
          true,
          `${replicaId} replicates and hydrates CDC cache state after seed storage loss`,
        );
      }

      // Close and reopen both off-seed voters from durable disk alone while seedStorage stays unavailable.
      for (const replicaId of ['mg-1-r4', 'mg-1-r5']) {
        const service = replicas.get(replicaId);
        await retireMessageGroupTransportHandler({
          messageGroup: service,
          messageRouter: router,
          address: service.unifiedAddress,
          replicaId,
        });
        await service.shutdown();
        replicas.delete(replicaId);
      }

      for (const [replicaId, nodeId, dbFile] of [
        ['mg-1-r4', NODE_B, b4],
        ['mg-1-r5', NODE_C, c5],
      ]) {
        const reopened = new MessageGroupService({
          groupId: GROUP_ID,
          replicaId,
          nodeId,
          replicaIds: ['mg-1-r1', 'mg-1-r4', 'mg-1-r5'],
          transport: router,
          nodeService,
          dbPath: dbFile,
          bootstrapMembership: durableRecordBootstrap(),
          publishRoleMetadata: false,
          publishLeaderNodeMetadata: false,
        });
        registerMessageGroupTransportHandler(reopened, {
          messageRouter: router,
          address: reopened.unifiedAddress,
        });
        await reopened.initialize();
        reopened.startElection();
        replicas.set(replicaId, reopened);
      }

      const reopenedLeader = await ensureLeaderWithAppliedTerm(liveReplicas());
      const postRestartRow = {
        id: 'node-after-offseed-restart',
        address: '10.42.0.5:7000',
        status: 'active',
      };
      await reopenedLeader.applyCDCEvent(TABLES.NODES, 'INSERT', postRestartRow);
      for (const replicaId of ['mg-1-r4', 'mg-1-r5']) {
        const voter = replicas.get(replicaId);
        assert.equal(
          await waitFor(
            () =>
              voter.getWritableCache().get(TABLES.NODES, postRestartRow.id)
                ?.address === postRestartRow.address,
          ),
          true,
          `${replicaId} commits and hydrates new CDC state after full off-seed restart`,
        );
        const durableDb = new Database(
          replicaId === 'mg-1-r4' ? b4 : c5,
          {readonly: true},
        );
        try {
          const entries = RaftRsDurableStore.readCommittedEntriesIn(
            durableDb,
            GROUP_ID,
          );
          assert.equal(
            entries.some(
              (entry) => entry.command?.data?.id === postRestartRow.id,
            ),
            true,
            `${replicaId} durable store retains post-restart committed entry`,
          );
        } finally {
          durableDb.close();
        }
      }
    } finally {
      for (const replica of replicas.values()) {
        await replica.shutdown().catch(() => {});
      }
      cpStore.db.close();
      await router.shutdown();
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
