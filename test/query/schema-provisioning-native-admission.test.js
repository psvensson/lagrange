import {test} from '../../src/test-helpers/tap.js';
import {OWNER_CONTRACT_STATE} from '../../src/control-plane/owner-contract-outcome.js';
import {buildSchemaProvisioningChildIntent} from '../../src/query/schema-provisioning-child-intent.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {buildRejectedProposedWriteAnswer} from '../../src/partition/partition-write-kernel.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {LEDGER_PARTITION_ID, ledgerRows, onLedgerLeader} from
  '../partition/placement-admission-fixture.js';
import {attachAutoCommitLoop, createCoordinatorWithLedger} from
  '../partition/placement-create-with-ledger-fixture.js';
import {
  createGateway, createService, createSchemaWireClient, createServeRefreshFixture,
} from './schema-provisioning-job-test-support.js';

function remoteCoordinator(leader, sendToAddress) {
  return createCoordinatorWithLedger(leader, {
    registerLocalLeader: false,
    messageRouter: {sendToAddress},
    servicesRows: [{
      partition_id: LEDGER_PARTITION_ID,
      entity_id: LEDGER_PARTITION_ID,
      node_id: 'serve-b',
      replica_id: `${LEDGER_PARTITION_ID}-r1`,
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RAFT_ROLE.LEADER,
      service_address: `serve-b.partition.${LEDGER_PARTITION_ID}-r1`,
    }],
  });
}

function recordNativeDispatch(engine, coordinator, initialNodeIds = []) {
  const dispatched = [];
  engine.rebalanceCoordinator = coordinator;
  coordinator.workflowOwner = {
    async executeOperation(operation) {
      dispatched.push(operation);
      return {success: true};
    },
  };
  engine.getRoutablePartitionServiceNodeIds = () => [
    ...initialNodeIds, ...dispatched.map(({targetNodeId}) => targetNodeId),
  ];
  engine.waitForPartitionServiceMetadata = async () => {};
  engine.waitForMinimumRoutableReplicaMetadata = async () => {};
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  return dispatched;
}

for (const caseName of ['lost', 'refused', 'malformed']) {
  test(`schema job retains only typed ambiguous native FOUND (${caseName})`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const gateway = createGateway();
        const {clock, cache, engine, readiness} = createServeRefreshFixture(t, gateway);
        await readiness.readServeEligibility();
        const messages = [];
        const coordinator = remoteCoordinator(leader, async (_address, message) => {
          if (message.body?.transitionKind !== 'FOUND') {
            return requestPlacementAdmission(leader, message);
          }
          messages.push({entryId: message.entryId, body: message.body});
          if (caseName === 'malformed') return {};
          if (caseName === 'refused') {
            await requestPlacementAdmission(leader, {entryId: 'other-founder',
              body: {...message.body, foundingIntentId: 'different-job'}});
          }
          const native = await requestPlacementAdmission(leader, message);
          return caseName === 'lost' && messages.length === 1 ?
            buildRejectedProposedWriteAnswer(new Error('ambiguous native reply'), {
              partitionId: LEDGER_PARTITION_ID, entryId: message.entryId,
            }) : native;
        });
        const dispatched = recordNativeDispatch(engine, coordinator);
        const service = createService(gateway, [], {
          systemCache: cache, now: () => clock.now,
          schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
          schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
          partitionProvisioner: (context) => engine.provisionInitialTablePartition(context),
        });
        const query = createSchemaWireClient(t, service, gateway, engine);
        const first = await query();
        const key = `schema_operations:${first.outcome.jobId}`;
        t.equal(messages.length, 1);
        t.equal(dispatched.length, 0);
        if (caseName === 'lost') {
          const firstRows = ledgerRows(leader);
          t.equal(firstRows.length, 3);
          t.equal(gateway.rows.get(key)?.status, 'PENDING');
          t.equal(first.outcome.contractState, OWNER_CONTRACT_STATE.PENDING);
          const second = await query();
          t.equal(second.outcome.jobId, first.outcome.jobId);
          t.equal(gateway.rows.get(key)?.status, 'SUCCEEDED');
          t.same(messages, [messages[0], messages[0]], 'real router redelivers the same command');
          t.same(dispatched.map(({operationId}) => operationId).sort(),
            firstRows.map(({operation_id: operationId}) => operationId).sort());
        } else {
          t.equal(gateway.rows.get(key)?.status, 'FAILED');
          const second = await query();
          t.equal(second.outcome.jobId, first.outcome.jobId);
          t.equal(gateway.rows.get(key)?.status, 'FAILED');
          t.equal(messages.length, 1, 'committed or malformed refusal starts no new attempt');
        }
      } finally {
        await stop();
      }
    }));
}

for (const replay of [false, true]) {
  test(`discovered expansion fences a fresh ADD and keeps an exact replay (${replay})`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const {clock, state, readiness, engine} = createServeRefreshFixture(t, createGateway());
        state.nodes[1].ready_lease_expires_at = 1100;
        await readiness.readServeEligibility();
        const coordinator = createCoordinatorWithLedger(leader);
        const dispatched = recordNativeDispatch(engine, coordinator, ['serve-a']);
        const partitionId = 'schema-expand-p1';
        const schemaJobId = 'schema-job-expand';
        let existing;
        if (replay) {
          existing = await coordinator.createOperation({
            type: OperationType.ADD, partitionId, entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId, nodeId: 'serve-b',
            deferDispatchUntilBootstrapTopology: true,
            ...buildSchemaProvisioningChildIntent(schemaJobId, 'serve-b'),
          });
          coordinator.queryExistingInFlightOperation = () =>
            coordinator.repository.queryAuthoritativeOperationById(existing.operationId);
        }
        const result = await engine.provisionInitialTablePartition({
          partitionId, schemaJobId, replicaCount: 2,
          async assertProvisioningOwnership() {
            clock.now = 1200;
          },
        }).then(() => null, (error) => error);
        const rows = ledgerRows(leader);
        if (replay) {
          t.equal(result, null, 'the exact durable child remains available to its own custody');
          t.same(rows.map(({operation_id: operationId}) => operationId), [existing.operationId]);
          t.same(dispatched.map(({operationId}) => operationId), [existing.operationId]);
        } else {
          t.equal(result?.code, 'TABLE_PARTITION_PROVISIONING_RETRYABLE');
          t.same(rows, [], 'no CREATE is submitted for a newly stale target');
          t.same(dispatched, []);
        }
      } finally {
        await stop();
      }
    }));
}
