// Native control, schema and placement-ledger Raft groups. The fixture supplies
// committed ADD records for formation only. No retirement is planted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {SQL_TRANSACTIONS_SCHEMA, SCHEMA_OPERATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA}
  from '../../src/bootstrap/system-table-schemas-constants.js';
import {classifyPlacementClass} from '../../src/bootstrap/system-partition-classification.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {readPartitionReplicaMembership} from '../../src/partition/partition-service-raft-membership-administration.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME, PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {NODE, placementStatement} from './placement-admission-fixture.js';

const budgetMs = 15000;
const nodes = [NODE.A, NODE.B, NODE.C];
const leaderOf = (group) => group.services.find((service) =>
  !service.isShutdown && service.raft.readStatus().role === RAFT_ROLE.LEADER);

test('a live ledger quorum needs control release to authorize new retirement after founder loss',
  {timeout: 120000}, async (t) => {
    const transport = createLoopbackTransport();
    const groups = [];
    const handlers = new Map();
    t.after(async () => {
      try {
        for (const handler of handlers.values()) {
          await handler.participantReleaseRecovery.shutdown();
          handler.unregisterFromRouter(transport);
        }
      } finally {
        const disposed = await Promise.allSettled(groups.map((group) => group.dispose()));
        const errors = disposed.filter((answer) => answer.status === 'rejected');
        if (errors.length) throw new AggregateError(errors.map((answer) => answer.reason));
      }
    });
    for (const schema of [SQL_TRANSACTIONS_SCHEMA, SCHEMA_OPERATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA]) {
      const partitionId = schema.tableName + '-p1';
      const members = nodes.map((node, i) => [partitionId + '-r' + (i + 1), node]);
      groups.push(await formAdmittedGroup({partitionId, members, transport, budgetMs,
        tempPrefix: 'retirement-interlock-', serviceOptions: {
          tableId: schema.tableName, tableName: schema.tableName, schema}}));
    }
    const [control, schemaGroup, ledger] = groups;
    for (const [i, nodeId] of nodes.entries()) {
      const service = control.services[i];
      const handler = new ReplicaHandler({nodeId, ownerIncarnation: 1,
        systemTableCache: service.systemTableCache, messageRouter: transport,
        timeSource: new VirtualTimeSource({startMs: 1000}),
        dataDir: path.dirname(control.dbFileOf([service.replicaId, nodeId])),
        createPartitionService: (options) => new PartitionService(options),
        cdcIntegrationService: {sqlQueryEngine: {queryExecutor: {bootstrapTopologySnapshotOwner: {
          resolveCanonicalPartitionLeaderNodeId: () => leaderOf(control)?.nodeId,
        }}}}});
      handlers.set(nodeId, handler);
      handler.registerWithRouter(transport);
      for (const group of groups) {
        const member = group.services[i];
        handler.localServices.set(member.replicaId, member);
      }
    }
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured');
    const release = (group) => {
      const leader = leaderOf(group);
      const handler = handlers.get(leader.nodeId);
      return handler.participantReleaseRecovery.releaseOperator({partitionId: leader.partitionId,
        targetBuildDigest: build.digest, deadlineAtMs: handler.timeSource.now() + budgetMs});
    };
    for (const group of groups) {
      assert.equal(leaderOf(group), group.services[0]);
      const answer = await release(group);
      assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
    }
    const lost = handlers.get(NODE.A);
    await lost.participantReleaseRecovery.shutdown();
    lost.unregisterFromRouter(transport);
    handlers.delete(NODE.A);
    await Promise.all(groups.map((group) => group.services[0].shutdown()));
    for (const group of groups) {
      assert.ok(await group.waitFor(async () => {
        const leader = leaderOf(group);
        if (!leader) return false;
        const responses = await Promise.all(group.services.slice(1).map((member) =>
          readPartitionReplicaMembership(member, group.services[0].replicaId)));
        return responses.every((answer) => answer.gateOpen && answer.state === 'voter' &&
          answer.leaderReplicaId === leader.replicaId && answer.term === leader.raft.readStatus().term &&
          answer.voterReplicaIds.length === 3);
      }), 'both survivors confirm their leader and their retained dead voter');
    }
    for (const group of [schemaGroup, ledger]) {
      const answer = await release(group);
      assert.equal(answer.missingFact, MISSING.CURRENT_CONTROL_OWNER, JSON.stringify(answer));
      assert.equal(answer.controlNodeId, leaderOf(control).nodeId);
      assert.equal(answer.controlMissingFact, MISSING.REPLICA_RELEASE_REPLY);
      assert.equal(answer.controlPhase, ACTION.INSPECT);
      assert.equal(answer.inspectNodeId, NODE.A);
      assert.equal(answer.inspectReplicaId, control.services[0].replicaId);
    }
    const ledgerLeader = leaderOf(ledger);
    for (const group of [control, schemaGroup]) {
      const dead = group.services[0];
      const readRows = () => ledgerLeader.db.prepare(
        'SELECT operation_id FROM replica_operations WHERE partition_id = ?').all(dead.partitionId);
      assert.deepEqual(readRows(), []);
      const answer = await requestPlacementAdmission(ledgerLeader, {
        entryId: 'replace-' + dead.replicaId, body: placementStatement({partitionId: dead.partitionId,
          placementClass: classifyPlacementClass(dead.partitionId),
          type: OperationType.REPLACE, source: NODE.B, target: NODE.D, sourceReplicaId: dead.replicaId})});
      assert.equal(answer.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED,
        JSON.stringify(answer));
      assert.deepEqual(readRows(), [], 'the refused request created no retirement authority');
    }
  });
