// P15 (placement-owner proof transfer, priority group 7): can the
// provisioner propose a placement ADD outside founding?
//
// Requirement (owner, binding; lead ruling 3): no duplicated placement work;
// the provisioner founds a partition, any placement beyond founding goes
// through the placement owner on the ledger leader.
//
// What is driven: the exact move the SQL provisioning path builds for a
// partition that already has routable replicas
// (SQLQueryEngineProvisioningAdmissionMethods.buildProvisioningCreateOperationMove,
// sql-query-engine-initial-partition-provisioning.js: the non-founding branch
// when routableNodeIdSet.size > 0), handed to RebalanceCoordinator.createOperation
// on a node whose ledger replica does not lead, as the provisioner does. The
// provisioning entry itself (DDL, schema job, target discovery) is not run:
// evidence ceiling = the coordinator's createOperation from the provisioner's
// move onwards.
//
// The same deficit is open for the placement owner: its admission is held at
// the boundary until the provisioner's call returns, so both actors' work for
// the one deficit is counted.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {createSQLQueryEngineProvisioningAdmissionMethods} from
  '../../src/query/sql-query-engine-provisioning-admission-methods.js';
import {
  LEDGER, THREE_NODES, admittedOperations, attemptOutcomeOf, holdNextAdmission,
  startThreeNodeLedger, transferReport, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const TARGET = 'orders-p1';
const OWNER_ENTRY_PREFIX = 'placement-owner:';

test('P15 the provisioner\'s ADD for a partition with routable replicas, beside the placement ' +
  'owner\'s pending admission for the same deficit: only the placement owner may propose ' +
  'placement beyond founding', (t) => withPlacementWorld({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]}, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1, , n3] = nodes;
  world.publishRow('partitions', {partition_id: LEDGER, leader_node_id: 'n1'});
  const held = holdNextAdmission(n1);
  await world.electLedger(n1);
  await held.reached.promise;
  // The engine's method table holds property descriptors.
  const provisioning = createSQLQueryEngineProvisioningAdmissionMethods();
  const move = provisioning.buildProvisioningCreateOperationMove.value.call(null, {
    partitionId: TARGET, targetNodeId: 'n3',
    childIntent: {operationIntentId: 'schema-job-1:n3', replicaIntentId: 'schema-job-1:n3:r'},
    parentWorkflowFenceToken: null}, null);
  let provisioned = null;
  let refusal = null;
  try {
    provisioned = await n3.coordinator.createOperation(move,
      {assertFreshCreationAllowed: () => {}});
  } catch (error) {
    refusal = {message: error?.message ?? String(error), code: error?.code ?? null,
      failureCode: error?.failureCode ?? null};
  }
  held.release.resolve();
  await world.idle();
  const report = transferReport(world, TARGET);
  t.diagnostic(JSON.stringify({provisioned: provisioned?.operationId ?? null, refusal,
    routes: world.routes, report}));
  const proposals = world.log.proposals.filter((proposal) => proposal.partitionId === TARGET);
  const provisionerProposals = proposals.filter((proposal) =>
    !proposal.entryId.startsWith(OWNER_ENTRY_PREFIX));
  const reachedLedger = provisionerProposals.length > 0 ||
    world.routes.some((route) => route.type === 'PLACEMENT_ADMIT');
  assert.ok(reachedLedger || provisioned !== null, 'anti-vacuity: the provisioner\'s call reached ' +
    `placement admission (refused before it: ${JSON.stringify(refusal)}); ` +
    `${JSON.stringify(report)}`);
  assert.equal(admittedOperations(world, n1, TARGET).length, 1,
    `one admitted operation for the deficit; ${JSON.stringify(report)}`);
  const ownerAttempt = n1.probe.admissionAttempts.find((attempt) => attempt.partitionId === TARGET);
  t.diagnostic(`placement owner attempt outcome: ${attemptOutcomeOf(ownerAttempt)}`);
  assert.deepEqual(provisionerProposals.map((proposal) => proposal.entryId), [],
    'ruling 3: no PLACEMENT-kind ADD proposed by the provisioning path beyond founding ' +
    `(provisioner proposals by node: ${JSON.stringify(provisionerProposals.map((proposal) =>
      proposal.nodeId))}); ${JSON.stringify(report)}`);
}));
