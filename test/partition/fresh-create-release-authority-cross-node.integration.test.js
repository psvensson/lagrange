// Production-bound witnesses, quest fresh-create-release-authority-from-committed-operation
// (red tests 1, 2, 3, 4, 6, 7, 8 of evidence/design-note.md; run
// fresh-create-b-5d7469476-20261102T113540Z, 11:41:55.388). A fresh founding
// group of the control partition (no write origin) with its GENESIS founders on
// separate nodes, real PartitionServices on the real raft-rs port, one real
// ReplicaHandler per node and JSON-encoded remote release delivery
// (fresh-create-release-authority-fixture.js). Today the answering leader
// cannot validate a founder's node-local token and answers
// OPERATOR_REQUIRED{fresh_storage_or_operator_authority}; the repair makes it
// read the committed founding create-operation row (conditions (a)-(d), NOT_LEADER
// first (f)). Negative controls keep legacy, join and forged identities refused.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {TABLES} from '../../src/constants/tables.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from
  '../../src/raft/raft-operation-port-constants.js';
import {admitPartitionRaftPeer, reservePartitionRaftPeerIdentity} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {waitForCondition} from './partition-service-test-support.js';
import {BUDGET_MS, PARTITION_ID, formFoundingGroup, founderOperationRow} from
  './fresh-create-release-authority-fixture.js';

const TEST_TIMEOUT_MS = 120000;
const OPERATOR_REQUIRED_FACT = 'fresh_storage_or_operator_authority';
const CREATE_ADMISSION_AUTHORITY = 'create_admission_authority';

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

async function releaseOutcome(group, index, evidence, budgetMs) {
  try {
    return {answer: await group.release(index, evidence, budgetMs), error: null};
  } catch (error) {
    return {answer: null, error};
  }
}

test('1: a non-leader founder of a fresh no-origin group releases through the ' +
  'leader on another node', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const group = await formFoundingGroup(t);
  const {answer, error} = await releaseOutcome(group, 1, await group.evidenceFor(1));
  assert.equal(error, null, `the non-leader founder's release failed: ${error?.message}`);
  assert.equal(answer.outcome, OUTCOME.CUT_OVER,
    'the leader on the other node released the fresh founding group');
});

test('2: a completed founding operation is no fresh authority (legacy no-origin)',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const group = await formFoundingGroup(t);
    const evidence = await group.evidenceFor(1);
    group.rows[1].completed_at = group.rows[1].created_at + 20;
    const {answer, error} = await releaseOutcome(group, 1, evidence, 4000);
    assert.equal(answer, null, 'never CUT_OVER');
    assert.match(String(error?.message), /release_operator_required/u,
      'the answering leader refuses typed OPERATOR_REQUIRED');
    assert.match(String(error?.message), new RegExp(OPERATOR_REQUIRED_FACT, 'u'));
  });

test('3: a join ADD (COMMITTED stamp, not GENESIS) is no fresh authority',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const group = await formFoundingGroup(t, {rowOverrides: {1: {stampKind: 'committed'}}});
    const {answer, error} = await releaseOutcome(group, 1, await group.evidenceFor(1), 4000);
    assert.equal(answer, null, 'never CUT_OVER');
    assert.match(String(error?.message), /release_operator_required/u);
  });

test('4a: the answering leader retries an unavailable authority read within the ' +
  'existing deadline', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const faults = {};
  const group = await formFoundingGroup(t, {faults});
  const evidence = await group.evidenceFor(1);
  faults[group.nodes[0]] = {refusals: 2};
  const {answer, error} = await releaseOutcome(group, 1, evidence);
  assert.equal(error, null, `release failed: ${error?.message}`);
  assert.equal(answer.outcome, OUTCOME.CUT_OVER);
  assert.equal(faults[group.nodes[0]].refused, 2,
    'the leader read its authority and was refused twice before it confirmed');
});

test('4b: an authority unavailable forever ends at the deadline with the typed ' +
  'unavailability, never OPERATOR_REQUIRED', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const faults = {};
  const group = await formFoundingGroup(t, {faults});
  const evidence = await group.evidenceFor(1);
  faults[group.nodes[0]] = {refusals: Infinity};
  const {answer, error} = await releaseOutcome(group, 1, evidence, 3000);
  assert.equal(answer, null);
  assert.match(String(error?.message), new RegExp(CREATE_ADMISSION_AUTHORITY, 'u'),
    'the final answer names the unavailable create-admission authority');
  assert.doesNotMatch(String(error?.message), /release_operator_required/u);
});

test('6: a leadership change between attempts: the new leader decides from the ' +
  'same committed row', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const faults = {};
  const group = await formFoundingGroup(t, {founderCount: 3, faults});
  const evidence = await group.evidenceFor(1);
  faults[group.nodes[0]] = {refusals: 1, async onRefusal() {
    await group.services[0].raft.transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: group.founders[2]});
  }};
  const {answer, error} = await releaseOutcome(group, 1, evidence);
  assert.equal(error, null, `release failed: ${error?.message}`);
  assert.equal(answer.outcome, OUTCOME.CUT_OVER);
  assert.equal(group.services[2].raft.readStatus().role, 'leader',
    'the founder on the third node led when the release completed');
});

test('7: a forged request naming a foreign create identity is refused (the identity ' +
  'is a lookup key, never authority)', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const foreign = founderOperationRow({replicaId: 'other-p1-founder-b',
    nodeId: 'founder-node-b', founders: ['other-p1-founder-a', 'other-p1-founder-b'],
    founderNodes: {'other-p1-founder-a': 'founder-node-a',
      'other-p1-founder-b': 'founder-node-b'}, partitionId: 'other-p1'});
  const group = await formFoundingGroup(t, {extraRows: [foreign]});
  const build = await runtimeBuildProvenance();
  const delivery = await group.routers[group.nodes[1]].deliver(
    `${group.nodes[0]}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`, {
      type: PARTICIPANT_RELEASE_TYPE, action: ACTION.RELEASE, partitionId: PARTITION_ID,
      targetBuildDigest: build.digest, trigger: TRIGGER.FRESH_CREATE,
      deadlineAtMs: Date.now() + 4000,
      createAdmissionIdentity: {operationId: foreign.operation_id,
        replicaId: foreign.replica_id, partitionId: foreign.partition_id,
        targetNodeId: foreign.target_node_id,
        admissionToken: foreign.create_admission_token}},
    {targetNodeId: group.nodes[0]});
  const answer = deliveryAnswerOf(delivery)?.[PARTICIPANT_RELEASE_RESULT_FIELD];
  assert.equal(answer?.outcome, OUTCOME.OPERATOR_REQUIRED,
    `a foreign identity never authorizes (${JSON.stringify(answer)})`);
  assert.equal(answer?.missingFact, OPERATOR_REQUIRED_FACT);
});

test('8: a fresh group whose committed configuration gained a non-founder ' +
  'member still releases (the rejected condition (e))',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const group = await formFoundingGroup(t);
  const joiner = `${PARTITION_ID}-joiner-d`;
  const joinerAddress = `${group.nodes[1]}/partition/${joiner}`;
  const joinerService = new PartitionService({partitionId: PARTITION_ID,
    replicaId: joiner, replicaIds: [...group.founders, joiner],
    peerAddresses: [...group.founders.map(group.addressOf), joinerAddress],
    nodeId: group.nodes[1], tableId: TABLES.SQL_TRANSACTIONS,
    tableName: TABLES.SQL_TRANSACTIONS, schema: SQL_TRANSACTIONS_SCHEMA,
    systemTableCache: new SystemTableCache(), transport: group.transport,
    dbPath: `${group.directory}/${joiner}.sqlite`, deferElection: true,
    bootstrapMembership: genesisStamp([...group.founders, joiner],
      {...group.founderNodes, [joiner]: group.nodes[1]})});
  t.after(() => joinerService.shutdown().catch(() => {}));
  await joinerService.initialize();
  reservePartitionRaftPeerIdentity(group.services[0], joiner);
  const admission = admitPartitionRaftPeer(group.services[0],
    {replicaIdentity: joiner, peerAddress: joinerAddress});
  await (admission.settled ?? admission);
  joinerService.startElection?.();
  assert.equal(await waitForCondition(() => group.services[0].raft.readStatus()
    .peers.some((peer) => peer.replicaIdentity === joiner), BUDGET_MS), true,
  'setup: the committed configuration names the non-founder');
  group.handlers[1].replaceLocalReplicaService(joiner, joinerService);
  const {answer, error} = await releaseOutcome(group, 1, await group.evidenceFor(1));
  assert.equal(error, null, `release failed: ${error?.message}`);
  assert.equal(answer.outcome, OUTCOME.CUT_OVER);
});
