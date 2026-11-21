import {test} from '../../src/test-helpers/tap.js';
import {OWNER_CONTRACT_STATE} from '../../src/control-plane/owner-contract-outcome.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {createTimeoutBudget} from '../../src/control-plane/timeout-budget.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OPERATION_METADATA_KEY} from '../../src/rebalancer/replica-operation-progress.js';
import {buildRejectedProposedWriteAnswer} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {
  LEDGER_PARTITION_ID, NODE, admitOnLeader, commitLedgerStatement, ledgerRows,
  onLedgerLeader, placementStatement, stepLedgerRow,
} from '../partition/placement-admission-fixture.js';
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

for (const caseName of ['lost', 'refused', 'malformed', 'invalid', 'refused-lost']) {
  test(`schema job settles native FOUND from ledger evidence (${caseName})`, (t) =>
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
          if (caseName === 'invalid') {
            return requestPlacementAdmission(leader, {...message,
              body: {...message.body, moves: []}});
          }
          if ((caseName === 'refused' || caseName === 'refused-lost') &&
              messages.length === 1) {
            await requestPlacementAdmission(leader, {entryId: 'other-founder',
              body: {...message.body, foundingIntentId: 'different-job'}});
          }
          const native = await requestPlacementAdmission(leader, message);
          if (caseName === 'malformed' && messages.length === 1) return {};
          return (caseName === 'lost' || caseName === 'refused-lost') &&
            messages.length === 1 ? buildRejectedProposedWriteAnswer(new Error('ambiguous native reply'), {
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
        t.equal(messages[0]?.body.foundingIntentId,
          `${first.outcome.jobId}:${messages[0]?.body.partitionId}`,
          'SQL CREATE names its actual durable schema job');
        t.equal(dispatched.length, 0);
        if (['lost', 'malformed', 'refused-lost'].includes(caseName)) {
          const firstRows = ledgerRows(leader);
          t.equal(firstRows.length, 3);
          t.equal(gateway.rows.get(key)?.status, 'PENDING');
          t.equal(first.outcome.contractState, OWNER_CONTRACT_STATE.PENDING);
          const second = await query();
          t.equal(second.outcome.jobId, first.outcome.jobId);
          const expected = caseName === 'refused-lost' ? 'FAILED' : 'SUCCEEDED';
          t.equal(gateway.rows.get(key)?.status, expected);
          t.same(messages, [messages[0], messages[0]], 'real router redelivers the same command');
          if (caseName === 'refused-lost') t.same(dispatched, []);
          else {
            t.same(dispatched.map(({operationId}) => operationId).sort(),
              firstRows.map(({operation_id: operationId}) => operationId).sort());
          }
        } else {
          t.equal(gateway.rows.get(key)?.status, 'FAILED');
          if (caseName === 'invalid') t.same(ledgerRows(leader), []);
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
        const messages = [];
        const coordinator = remoteCoordinator(leader, async (_address, message) => {
          const answer = await requestPlacementAdmission(leader, message);
          if (message.body?.transitionKind === 'PLACEMENT') {
            messages.push({entryId: message.entryId, body: message.body});
            if (replay && messages.length === 1) {
              return buildRejectedProposedWriteAnswer(new Error('lost native child reply'), {
                partitionId: LEDGER_PARTITION_ID, entryId: message.entryId,
              });
            }
          }
          return answer;
        });
        const dispatched = recordNativeDispatch(engine, coordinator, ['serve-a']);
        const armed = [];
        coordinator.armCoordinatorCreatedOperationProgress = async (operation) => {
          armed.push(operation.operationId);
        };
        const partitionId = 'schema-expand-p1';
        const schemaJobId = 'schema-job-expand';
        let existing;
        if (replay) {
          await t.rejects(engine.provisionInitialTablePartition({
            partitionId, schemaJobId, replicaCount: 2,
          }));
          [existing] = ledgerRows(leader);
          t.ok(existing, 'the ambiguous reply hides a genuinely committed ADD');
          t.same(dispatched, []);
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
          t.same(rows.map(({operation_id: operationId}) => operationId), [existing?.operation_id]);
          t.same(armed, [existing?.operation_id], 'exact replay rearms its native operation owner');
          t.same(dispatched, [], 'Query cannot dispatch without its own topology hold');
          t.same(messages, [messages[0], messages[0]], 'an exact retained ADD bypasses the fresh guard');
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

async function seedLedgerBlocker(leader, proposed) {
  const entry = await admitOnLeader(leader, proposed, 'found-ledger-blocker',
    placementStatement({partitionId: LEDGER_PARTITION_ID, target: NODE.D}));
  return entry.answer.placementResult.operationIds[0];
}

for (const replyLost of [false, true]) {
  test(`committed transient FOUND needs a newer ledger commit (lost: ${replyLost})`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const blocker = await seedLedgerBlocker(leader, proposed);
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const gateway = createGateway();
        const {clock, cache, engine, readiness} = createServeRefreshFixture(t, gateway);
        await readiness.readServeEligibility();
        const sent = [];
        const coordinator = remoteCoordinator(leader, async (_address, message) => {
          const answer = await requestPlacementAdmission(leader, message);
          if (message.body?.transitionKind !== 'FOUND') return answer;
          sent.push(message.entryId);
          if (replyLost && sent.length === 1) {
            return buildRejectedProposedWriteAnswer(new Error('lost transient reply'),
              {partitionId: LEDGER_PARTITION_ID, entryId: message.entryId});
          }
          return answer;
        });
        recordNativeDispatch(engine, coordinator);
        const service = createService(gateway, [], {
          systemCache: cache, now: () => clock.now,
          schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
          schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
          partitionProvisioner: (context) => engine.provisionInitialTablePartition(context),
        });
        const query = createSchemaWireClient(t, service, gateway, engine);
        const first = await query();
        const key = `schema_operations:${first.outcome.jobId}`;
        t.equal(gateway.rows.get(key)?.status, 'PENDING');
        await query();
        t.equal(gateway.rows.get(key)?.status, 'PENDING');
        t.same(sent, [sent[0], sent[0]], 'same bytes may be read back while blocked');
        let retainedEntryId = sent[0];
        if (replyLost) {
          t.equal(stepLedgerRow(leader, blocker, WORKFLOW_STEP.SYNCING), null);
          await query();
          t.equal(gateway.rows.get(key)?.status, 'PENDING', 'a newer commit can still refuse');
          t.equal(sent[2], retainedEntryId);
          t.ok(sent[3] && sent[3] !== retainedEntryId);
          retainedEntryId = sent[3];
          await query();
          t.equal(sent[4], retainedEntryId, 'the new refusal waits without a self-retry loop');
        }
        const beforeClearing = sent.length;
        t.equal(stepLedgerRow(leader, blocker, WORKFLOW_STEP.ACTIVE), null);
        const settled = await query();
        t.equal(settled.outcome.jobId, first.outcome.jobId);
        t.equal(gateway.rows.get(key)?.status, 'SUCCEEDED');
        t.equal(sent[beforeClearing], retainedEntryId, 'the old committed refusal is read first');
        t.ok(sent[beforeClearing + 1] && sent[beforeClearing + 1] !== retainedEntryId,
          'the newer ledger commit permits one fresh entry');
        t.equal(sent.length, beforeClearing + 2);
      } finally {
        await stop();
      }
    }));
}

for (const stopReason of ['deadline', 'cancel']) {
  test(`fresh FOUND rechecks ${stopReason} after retained refusal resolution`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const blocker = await seedLedgerBlocker(leader, proposed);
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const {clock, engine, readiness} = createServeRefreshFixture(t, createGateway());
        await readiness.readServeEligibility();
        engine.nowFn = () => clock.now;
        const sent = [];
        const cancellationToken = new CancellationToken();
        const budget = createTimeoutBudget({configuredBudgetMs: 100, now: engine.nowFn});
        const coordinator = remoteCoordinator(leader, async (_address, message) => {
          const answer = await requestPlacementAdmission(leader, message);
          if (message.body?.transitionKind !== 'FOUND') return answer;
          sent.push(message.entryId);
          if (sent.length === 1) {
            return buildRejectedProposedWriteAnswer(new Error('initial reply lost'),
              {partitionId: LEDGER_PARTITION_ID, entryId: message.entryId});
          }
          if (stopReason === 'deadline') clock.now = budget.deadlineMs;
          else cancellationToken.cancel('founding cancelled during retained resolution');
          return answer;
        });
        const dispatched = recordNativeDispatch(engine, coordinator);
        const context = {partitionId: 'found-expiry-p1', schemaJobId: 'found-expiry-job', replicaCount: 3};
        await t.rejects(engine.provisionInitialTablePartition(context));
        t.equal(stepLedgerRow(leader, blocker, WORKFLOW_STEP.ACTIVE), null);
        await t.rejects(engine.provisionInitialTablePartition({
          ...context, timeoutBudget: budget, cancellationToken,
        }), stopReason === 'deadline' ? {code: 'TIMEOUT'} :
          {message: 'founding cancelled during retained resolution'});
        t.same(sent, [sent[0], sent[0]]);
        t.same(ledgerRows(leader).map(({operation_id: id}) => id), [blocker]);
        t.same(dispatched, []);
      } finally {
        await stop();
      }
    }));
}

function movePlacementProofToLaterStep(leader, rows, t) {
  for (const row of rows) {
    const steps = JSON.parse(row.steps_history);
    const key = OPERATION_METADATA_KEY.PLACEMENT_ADMISSION;
    steps.push({step: WORKFLOW_STEP.CREATING, [key]: steps[0][key]});
    delete steps[0][key];
    t.equal(commitLedgerStatement(leader, `move-proof-${row.operation_id}`,
      'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
      [JSON.stringify(steps), row.operation_id]), null);
  }
}

for (const caseName of [
  'same', 'unproved', 'mixed', 'incomplete', 'late-origin', 'late-materialization',
]) {
  test(`ALREADY_FOUNDED requires a complete exact founder cohort (${caseName})`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const {engine} = createServeRefreshFixture(t, createGateway());
        engine.rebalanceCoordinator = createCoordinatorWithLedger(leader);
        const input = {partitionId: 'proof-found-p1', targetNodeIds: ['serve-a', 'serve-b', 'serve-c'],
          context: {schemaJobId: 'proof-founder-job'}};
        const first = await engine.tryProvisionFoundingSetViaPlacementAdmission(input);
        const rows = ledgerRows(leader);
        t.equal(rows.length, 3);
        if (caseName === 'unproved' || caseName === 'mixed') {
          for (const row of caseName === 'mixed' ? rows.slice(1, 2) : rows) {
            const steps = JSON.parse(row.steps_history);
            if (caseName === 'unproved') {
              delete steps[0][OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
            } else {
              steps[0][OPERATION_METADATA_KEY.PLACEMENT_ADMISSION].foundingIntentId =
                'foreign-founder-job:proof-found-p1';
            }
            t.equal(commitLedgerStatement(leader, `record-${row.operation_id}`,
              'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
              [JSON.stringify(steps), row.operation_id]), null);
          }
        }
        if (caseName === 'incomplete') {
          t.equal(stepLedgerRow(leader, rows[2].operation_id, WORKFLOW_STEP.FAILED), null);
        }
        if (caseName === 'late-origin') {
          movePlacementProofToLaterStep(leader, rows, t);
        } else if (caseName === 'late-materialization') {
          const coordinator = engine.rebalanceCoordinator;
          const read = coordinator.materializePlacementAdmittedOperations.bind(coordinator);
          coordinator.materializePlacementAdmittedOperations = (options) => {
            movePlacementProofToLaterStep(leader, rows, t);
            return read(options);
          };
        }
        if (caseName === 'same') {
          engine.rebalanceCoordinator = createCoordinatorWithLedger(leader);
        }
        const adoption = engine.tryProvisionFoundingSetViaPlacementAdmission(input);
        if (caseName === 'same') {
          const result = await adoption;
          t.same(result.operations.map(({operationId}) => operationId),
            first.operations.map(({operationId}) => operationId));
          t.same(result.createdOperations, []);
        } else {
          await t.rejects(adoption, {code: 'ALREADY_FOUNDED'});
        }
        t.equal(ledgerRows(leader).length, 3, 'existing founders always block duplicates');
      } finally {
        await stop();
      }
    }));
}

for (const caller of ['split', 'merge', 'missing-owner', 'missing-host']) {
  test(`FOUND uses the durable workflow and hosting owner (${caller})`, (t) =>
    onLedgerLeader(async (leader, proposed) => {
      const stop = attachAutoCommitLoop(leader, proposed);
      try {
        const {engine} = createServeRefreshFixture(t, createGateway());
        const coordinator = createCoordinatorWithLedger(leader);
        engine.rebalanceCoordinator = coordinator;
        const partitionId = 'workflow-child-p2';
        const partitionWorkflowId = `${caller}-tbl-users-v2`;
        if (caller === 'missing-host') coordinator.nodeId = '';
        const execution = engine.tryProvisionFoundingSetViaPlacementAdmission({
          partitionId, targetNodeIds: ['serve-a', 'serve-b'],
          context: caller === 'missing-owner' ? {} : {partitionWorkflowId},
        });
        if (caller.startsWith('missing')) {
          await t.rejects(execution, {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'});
          t.same(ledgerRows(leader), []);
        } else {
          const result = await execution;
          t.equal(result.provisioned, true);
          const rows = ledgerRows(leader);
          t.equal(rows.length, 2);
          for (const row of rows) {
            const [created] = JSON.parse(row.steps_history);
            t.equal(created.placementAdmission.foundingIntentId,
              `${partitionWorkflowId}:${partitionId}`);
            t.equal(row.source_node_id, coordinator.nodeId);
          }
        }
      } finally {
        await stop();
      }
    }));
}
