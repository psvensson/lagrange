// Witness for the critical-spread-transition-authority-carry quest (C1 of
// design-critical-spread-transition-authority.md).
//
// SCOPE. The cure-policy owner mints ONE exact-transition authorization for
// exactly the PRIORITY_OVER_TARGET_SPREAD_CURE condition, the two planner
// cure sites attach it to the move they re-type, and a binding owner decodes
// and evaluates it fail-closed. This file is the owner-level witness for the
// mint, the condition discrimination, the decode table and the evaluation
// reason codes. The end-to-end row carriage is
// spread-cure-transition-authorization-row.test.js; the learner-side
// statement is test/partition/learner-promotion-count-check-inputs.test.js.
//
// Raw node:test so the anchored receipt runner selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_AUTHORIZATION_BINDING_STATE,
  SPREAD_CURE_AUTHORIZATION_OUTCOME,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  evaluateSpreadCureTransitionAuthorization,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  authorizeSpreadCureTransition,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  applyOverTargetCapAddRetention,
  applyPrioritySpreadDrainCure,
  applyPrioritySpreadExpandCure,
} from '../../src/rebalancer/move-planner-priority-spread-cure.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const CRITICAL_PARTITION_ID = 'sql_transactions-p1';
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const ORDINARY_PARTITION_ID = 'tbl-users-p1';
const DESTINATION_NODE_ID = 'node-2';
const DESTINATION_REPLICA_ID = `${CRITICAL_PARTITION_ID}-r5`;
const OPERATION_ID = 'op-08b39435';
const OBSERVED_EPOCH = 4;
const DECLARED_REPLICATION_FACTOR = 3;
const PARTITION_ROW = Object.freeze({
  partition_id: CRITICAL_PARTITION_ID,
  replica_count: DECLARED_REPLICATION_FACTOR,
});
const AUTHORIZATION_KEY = OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION;
const MOVE_FIELD = SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD;
const BINDING_STATE = SPREAD_CURE_AUTHORIZATION_BINDING_STATE;
const IMPACT_CONTRACTS_URL = new URL(
  '../../test/shards/impact-contracts.json', import.meta.url);
const COUPLED_PAIR_ID = 'spread-cure-transition-authorization';
const CONTRACT_ID = 'spread-cure-transition-authorization';
const MINT_ENDPOINT_ID = 'cure-authorization-mint';
const CONSUMER_ENDPOINT_ID = 'cure-authorization-consumer';
const RAW_DESCRIPTION_BUDGET_BYTES = 200;
const HUGE_STRING_LENGTH = 100000;

// The 09-16 shape: four voters on two nodes, target three, one candidate ADD
// onto the missing third node.
function overTargetEvidence(overrides = {}) {
  return {
    partitionId: CRITICAL_PARTITION_ID,
    inFlightReplaceCount: 0,
    addMoveCount: 1,
    voterReplicaCount: 4,
    activeDistinctNodeCount: 2,
    targetReplicaCount: 3,
    targetDistinctNodeCount: 3,
    ...overrides,
  };
}

function mintContext(overrides = {}) {
  return {
    destinationNodeId: DESTINATION_NODE_ID,
    // A RESOLVER, not a row: the policy owner calls it only after its own
    // condition has held, so a plan that mints nothing reads nothing.
    resolvePartitionRow: () => PARTITION_ROW,
    observedMembershipEpoch: OBSERVED_EPOCH,
    ...overrides,
  };
}

function validAuthorization(overrides = {}) {
  return {
    intent: SPREAD_CURE_TRANSITION_INTENT,
    desiredReplicationFactor: DECLARED_REPLICATION_FACTOR,
    observedMembershipEpoch: OBSERVED_EPOCH,
    observedVoterCount: 4,
    authorizedResultingVoterCount: 5,
    destinationNodeId: DESTINATION_NODE_ID,
    destinationReplicaId: DESTINATION_REPLICA_ID,
    operationId: OPERATION_ID,
    ...overrides,
  };
}

// The production entry point: a replica_operations row, whose steps history
// is the durable JSON string the coordinator wrote.
function decodeRow(operationRow) {
  return decodeSpreadCureTransitionAuthorizationFromOperationRow(operationRow);
}

function decodeStepsHistory(stepsHistory) {
  return decodeRow({steps_history: stepsHistory});
}

function decodeValue(value) {
  return decodeStepsHistory(
    [{step: 'PENDING', timestamp: 0, [AUTHORIZATION_KEY]: value}]);
}

// The owner-level evaluation, WITH an epoch supplied: the membership fence
// is this owner's, and it is proven here. The carry stage's guard supplies
// none and gets the third outcome instead (the rows below pin both).
function evaluateWith(overrides = {}) {
  return evaluateSpreadCureTransitionAuthorization({
    binding: decodeValue(validAuthorization()),
    operationId: OPERATION_ID,
    localNodeId: DESTINATION_NODE_ID,
    localReplicaId: DESTINATION_REPLICA_ID,
    partitionDesiredReplicationFactor: DECLARED_REPLICATION_FACTOR,
    partitionMembershipEpoch: OBSERVED_EPOCH,
    votersAfterPromotion: 5,
    ...overrides,
  });
}

function activeReplica(replicaId, nodeId) {
  return {replica_id: replicaId, node_id: nodeId, status: ReplicaStatus.ACTIVE};
}

function overTargetRetentionOptions(overrides = {}) {
  return {
    partitionId: CRITICAL_PARTITION_ID,
    activePlacementReplicas: [
      activeReplica('r1', 'node-0'), activeReplica('r2', 'node-0'),
      activeReplica('r3', 'node-1'), activeReplica('r4', 'node-1'),
    ],
    addMoves: [{type: REBALANCER_MOVE_TYPE.ADD, nodeId: DESTINATION_NODE_ID}],
    inFlightReplaceCount: 0,
    surplusVoterCount: 4,
    targetNodeIds: ['node-0', 'node-1', DESTINATION_NODE_ID],
    targetReplicaCount: 3,
    resolvePartitionRow: () => PARTITION_ROW,
    observedMembershipEpoch: OBSERVED_EPOCH,
    ...overrides,
  };
}

// At target (3 voters on 2 nodes) with a selectable REPLACE source: the
// PRIORITY_EXPAND_FOR_SPREAD row, one state later than the over-target row.
function atTargetExpandOptions(overrides = {}) {
  return {
    partitionId: CRITICAL_PARTITION_ID,
    activePlacementReplicas: [
      activeReplica('r1', 'node-0'), activeReplica('r2', 'node-0'),
      activeReplica('r3', 'node-1'),
    ],
    addMoves: [{type: REBALANCER_MOVE_TYPE.ADD, nodeId: DESTINATION_NODE_ID}],
    candidateRemoves: [{
      type: REBALANCER_MOVE_TYPE.REMOVE, nodeId: 'node-0', replicaId: 'r2',
    }],
    deficitEffectiveCount: 3,
    inFlightReplaceCount: 0,
    inventory: {accounting: {occupiedCount: 3}},
    naturalReplaceCount: 1,
    replaceCount: 1,
    surplusVoterCount: 3,
    targetNodeIds: ['node-0', 'node-1', DESTINATION_NODE_ID],
    targetReplicaCount: 3,
    resolvePartitionRow: () => PARTITION_ROW,
    observedMembershipEpoch: OBSERVED_EPOCH,
    ...overrides,
  };
}

function overTargetExpandOptions(overrides = {}) {
  return atTargetExpandOptions({
    activePlacementReplicas: [
      activeReplica('r1', 'node-0'), activeReplica('r2', 'node-0'),
      activeReplica('r3', 'node-1'), activeReplica('r4', 'node-1'),
    ],
    inventory: {accounting: {occupiedCount: 4}},
    surplusVoterCount: 4,
    ...overrides,
  });
}

const SOURCE_ROOT = new URL('../../src/', import.meta.url).pathname;
const JAVASCRIPT_EXTENSION = '.js';
const SOURCE_PREFIX = 'src/';

// Every production file that names one identifier, as repository-relative
// paths, sorted. A structural census, not a behaviour: it answers "who can
// possibly touch this" for a field that must reach exactly four sites.
function sourceFilesNaming(identifier) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.name.endsWith(JAVASCRIPT_EXTENSION)) continue;
      if (readFileSync(absolute, 'utf8').includes(identifier)) {
        found.push(SOURCE_PREFIX + path.relative(SOURCE_ROOT, absolute));
      }
    }
  };
  walk(SOURCE_ROOT);
  return found.sort();
}

test('the cure policy mints one exact transition authorization', () => {
  const authorization = authorizeSpreadCureTransition(
    overTargetEvidence(), mintContext());
  assert.ok(authorization, 'the over-target spread cure mints');
  assert.equal(Object.isFrozen(authorization), true, 'the record is frozen');
  assert.deepEqual(Object.keys(authorization).sort(), [
    'authorizedResultingVoterCount',
    'desiredReplicationFactor',
    'destinationNodeId',
    'intent',
    'observedMembershipEpoch',
    'observedVoterCount',
  ], 'the mint states exactly its six policy fields and nothing else');
  assert.equal(authorization.intent, SPREAD_CURE_TRANSITION_INTENT);
  assert.equal(authorization.intent, 'critical_spread_cure');
  assert.equal(authorization.observedVoterCount, 4);
  assert.equal(authorization.authorizedResultingVoterCount, 5,
    'the observed count plus one, never a blanket allowance');
  assert.equal(authorization.desiredReplicationFactor,
    DECLARED_REPLICATION_FACTOR);
  assert.equal(authorization.observedMembershipEpoch, OBSERVED_EPOCH);
  assert.equal(authorization.destinationNodeId, DESTINATION_NODE_ID);

  // Design 1.1's hazard: the RF is the partition row's own authority, NOT the
  // planner's state-dependent targetReplicaCount. A row declaring 5 while the
  // planner targets 3 must state 5.
  const rowDeclaringFive = authorizeSpreadCureTransition(
    overTargetEvidence(),
    mintContext({resolvePartitionRow: () => ({
      partition_id: CRITICAL_PARTITION_ID, replica_count: 5,
    })}));
  assert.equal(rowDeclaringFive.desiredReplicationFactor, 5,
    'the RF comes from resolveDesiredReplicationFactor, not targetState');

  // The authorized count follows the OBSERVED membership, not the target.
  const fiveVoters = authorizeSpreadCureTransition(
    overTargetEvidence({voterReplicaCount: 5}), mintContext());
  assert.equal(fiveVoters.observedVoterCount, 5);
  assert.equal(fiveVoters.authorizedResultingVoterCount, 6);

  // Fail closed: an unusable input mints nothing rather than a malformed
  // record. Each row is one unusable input.
  const unusable = [
    ['undeclared replication factor',
      mintContext({resolvePartitionRow: () => null})],
    ['replication factor of zero', mintContext({resolvePartitionRow: () => ({
      partition_id: CRITICAL_PARTITION_ID, replica_count: 0,
    })})],
    ['a partition-row resolver that throws',
      mintContext({resolvePartitionRow: () => {
        throw new Error('cache read failed');
      }})],
    ['no partition-row resolver at all',
      mintContext({resolvePartitionRow: undefined})],
    ['unreadable membership epoch',
      mintContext({observedMembershipEpoch: null})],
    ['non-integer membership epoch',
      mintContext({observedMembershipEpoch: 1.5})],
    ['negative membership epoch',
      mintContext({observedMembershipEpoch: -1})],
    ['absent destination node', mintContext({destinationNodeId: ''})],
    ['non-string destination node',
      mintContext({destinationNodeId: 7})],
    ['no context at all', undefined],
  ];
  for (const [name, context] of unusable) {
    assert.equal(authorizeSpreadCureTransition(overTargetEvidence(), context),
      null, `mints nothing on: ${name}`);
  }
  assert.equal(authorizeSpreadCureTransition(), null,
    'no evidence at all mints nothing');
});

test('only the priority over-target spread cure mints an authorization', () => {
  // The policy owner itself: every condition that is not the over-target
  // spread cure mints nothing.
  const nonMinting = [
    ['ordinary user-table partition',
      overTargetEvidence({partitionId: ORDINARY_PARTITION_ID})],
    ['operation-ledger partition',
      overTargetEvidence({partitionId: LEDGER_PARTITION_ID})],
    ['at target, not over it', overTargetEvidence({voterReplicaCount: 3})],
    ['spread already satisfied',
      overTargetEvidence({activeDistinctNodeCount: 3})],
    ['a REPLACE already in flight',
      overTargetEvidence({inFlightReplaceCount: 1})],
    ['no candidate ADD at all', overTargetEvidence({addMoveCount: 0})],
    ['no declared target', overTargetEvidence({targetReplicaCount: 0})],
  ];
  for (const [name, evidence] of nonMinting) {
    assert.equal(authorizeSpreadCureTransition(evidence, mintContext()), null,
      `mints nothing for: ${name}`);
  }

  // Planner level, site 1: the over-creation cap's retention.
  const retained = overTargetRetentionOptions();
  const retentionDecision = applyOverTargetCapAddRetention(retained);
  assert.equal(retentionDecision.retainedSpreadCureAddCount, 1,
    'the cap retains the spread cure ADD unchanged');
  assert.equal(retained.addMoves[0][MOVE_FIELD].intent,
    SPREAD_CURE_TRANSITION_INTENT,
    'the retained ADD carries its authorization');
  assert.equal(retained.addMoves[0][MOVE_FIELD].destinationNodeId,
    DESTINATION_NODE_ID, 'for its own destination node');

  const ordinaryRetained = overTargetRetentionOptions({
    partitionId: ORDINARY_PARTITION_ID,
  });
  applyOverTargetCapAddRetention(ordinaryRetained);
  assert.equal(ordinaryRetained.addMoves.length, 0,
    'an ordinary partition keeps the fail-closed refuse-all floor');

  // Planner level, site 2: the expand cure's three fallbacks. Only the
  // over-target row mints.
  const atTarget = atTargetExpandOptions();
  applyPrioritySpreadExpandCure(atTarget);
  assert.equal(atTarget.addMoves[0].reason !== undefined, true,
    'the at-target expand cure still re-types its ADD');
  assert.equal(Object.hasOwn(atTarget.addMoves[0], MOVE_FIELD), false,
    'PRIORITY_EXPAND_FOR_SPREAD carries no authorization');

  const ledgerExpand = atTargetExpandOptions({
    partitionId: LEDGER_PARTITION_ID,
  });
  applyPrioritySpreadExpandCure(ledgerExpand);
  assert.equal(Object.hasOwn(ledgerExpand.addMoves[0], MOVE_FIELD), false,
    'LEDGER_EXPAND_FOR_SPREAD carries no authorization');

  const overTargetExpand = overTargetExpandOptions();
  applyPrioritySpreadExpandCure(overTargetExpand);
  assert.equal(overTargetExpand.addMoves[0][MOVE_FIELD].intent,
    SPREAD_CURE_TRANSITION_INTENT,
    'the over-target row of the expand site mints');

  // The surplus drain emits REMOVEs and never an authorization.
  const drain = {
    partitionId: CRITICAL_PARTITION_ID,
    activePlacementReplicas: [
      activeReplica('r1', 'node-0'), activeReplica('r2', 'node-1'),
      activeReplica('r3', 'node-2'), activeReplica('r4', 'node-2'),
    ],
    addMoves: [],
    candidateRemoves: [{
      type: REBALANCER_MOVE_TYPE.REMOVE, nodeId: 'node-2', replicaId: 'r4',
      standaloneSafe: true, prioritySpreadMonotonicSafe: true,
    }],
    inventory: {accounting: {occupiedCount: 4}},
    surplusVoterCount: 4,
    targetNodeIds: ['node-0', 'node-1', 'node-2'],
    targetReplicaCount: 3,
    resolvePartitionRow: () => PARTITION_ROW,
    observedMembershipEpoch: OBSERVED_EPOCH,
  };
  applyPrioritySpreadDrainCure(drain);
  for (const move of [...drain.addMoves, ...drain.candidateRemoves]) {
    assert.equal(Object.hasOwn(move, MOVE_FIELD), false,
      'a drain move never carries an authorization');
  }

  // The structural half: the whole production surface of the carrier. The
  // mint is called from exactly the two cure sites, and the field is written
  // or read in exactly these files - so no other move-producing path
  // (priority-recovery follow-up, provisioning, REPLACE pairing) can attach
  // one even by accident.
  assert.deepEqual(sourceFilesNaming('authorizeSpreadCureTransition'), [
    'src/rebalancer/move-planner-priority-spread-cure.js',
    'src/rebalancer/replica-placement-cure-policy.js',
  ], 'the mint has exactly two call sites, both inside the cure planner');
  assert.deepEqual(
    sourceFilesNaming('SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD'), [
      'src/rebalancer/move-planner-priority-spread-cure.js',
      'src/rebalancer/rebalance-coordinator-operation-creation.js',
      'src/rebalancer/spread-cure-transition-authorization.js',
      'src/rebalancer/unified-rebalancer-move-execution.js',
    ],
    'the move field is named by the attach, copy, stamp and owner sites only');
  assert.deepEqual(sourceFilesNaming(MOVE_FIELD), [
    'src/rebalancer/spread-cure-transition-authorization.js',
  ], 'the field name itself appears only in its owner: this quest adds no');
  // second decoder of the record - rowToOperation is untouched.
  assert.deepEqual(
    sourceFilesNaming(
      'decodeSpreadCureTransitionAuthorizationFromOperationRow'), [
      'src/partition/partition-service-learner-promotion-count-check-methods.js',
      'src/rebalancer/spread-cure-transition-authorization.js',
    ], 'the row decode has exactly one consumer: the guard');
  assert.deepEqual(
    sourceFilesNaming('evaluateSpreadCureTransitionAuthorization'), [
      'src/partition/partition-service-learner-promotion-count-check-methods.js',
      'src/rebalancer/spread-cure-transition-authorization.js',
    ], 'and so does the evaluation');
  assert.deepEqual(
    sourceFilesNaming('SPREAD_CURE_AUTHORIZATION_BINDING_STATE'), [
      'src/partition/learner-promotion-count-check-evidence.js',
      'src/rebalancer/spread-cure-transition-authorization.js',
    ], 'the binding state is read by the log renderer and nobody else');
  assert.deepEqual(
    sourceFilesNaming('SPREAD_CURE_PARTITION_EPOCH_NOT_READ'), [
      'src/partition/learner-promotion-count-check-evidence.js',
      'src/partition/partition-service-learner-promotion-count-check-methods.js',
      'src/rebalancer/spread-cure-transition-authorization.js',
    ], 'the not-read epoch literal is the guard\'s and its renderer\'s');

  // A real planner run: the REPLACE the pairing block mints is a fresh move
  // literal and never inherits the ADD's authorization.
  const currentReplicas = [
    activeReplica('r1', 'node-0'), activeReplica('r2', 'node-0'),
    activeReplica('r3', 'node-1'),
  ];
  const planner = new MovePlanner({
    entityId: CRITICAL_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes: () => [],
      getCurrentReplicas: () => currentReplicas,
      getHealthyReplicas: (replicas) =>
        replicas.filter((replica) => replica?.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [],
      getTopologyBlockingInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
      systemTableCache: {
        get: () => PARTITION_ROW,
        filter: () => [],
      },
    },
  });
  const moves = planner.calculateMoves(currentReplicas, {
    targetReplicaCount: 3,
    targetNodes: ['node-0', 'node-1', DESTINATION_NODE_ID],
    degraded: false,
  }, {membershipPublicationEpoch: OBSERVED_EPOCH});
  for (const move of moves) {
    if (move.type === REBALANCER_MOVE_TYPE.REPLACE ||
        move.type === REBALANCER_MOVE_TYPE.REMOVE) {
      assert.equal(Object.hasOwn(move, MOVE_FIELD), false,
        `a ${move.type} move carries no authorization`);
    }
  }
});

test('the binding decodes present, absent and malformed and never throws',
  () => {
    const present = decodeValue(validAuthorization());
    assert.equal(present.state, BINDING_STATE.PRESENT);
    assert.equal(Object.isFrozen(present), true);
    assert.equal(Object.isFrozen(present.authorization), true);
    assert.deepEqual({...present.authorization}, validAuthorization());
    assert.equal(present.raw, null, 'a present binding describes no raw value');

    const absent = [
      ['no steps history at all', undefined],
      ['a null steps history', null],
      ['a non-array steps history', 'steps'],
      ['an empty steps history', []],
      ['no metadata key', [{step: 'PENDING', timestamp: 0}]],
      ['an explicit null value', undefined],
      ['an explicit undefined value', undefined],
    ];
    for (const [name, stepsHistory] of absent.slice(0, 5)) {
      const binding = decodeStepsHistory(stepsHistory);
      assert.equal(binding.state, BINDING_STATE.ABSENT, `absent on: ${name}`);
      assert.equal(binding.authorization, null);
      assert.equal(binding.raw, null);
    }
    for (const value of [null, undefined]) {
      assert.equal(decodeValue(value).state, BINDING_STATE.ABSENT,
        'an explicit null or undefined value is absent, never present');
    }

    const malformed = [
      ['non-object: string', 'authorized'],
      ['non-object: number', 5],
      ['non-object: boolean', true],
      ['non-object: array', [validAuthorization()]],
      ['a huge string', 'x'.repeat(HUGE_STRING_LENGTH)],
      ['unknown intent', validAuthorization({intent: 'something_else'})],
      ['extra junk', {...validAuthorization(), junk: 'extra'}],
      ['authorized below observed',
        validAuthorization({authorizedResultingVoterCount: 3})],
      ['authorized above the exact transition',
        validAuthorization({authorizedResultingVoterCount: 9})],
      // 2**53 + 1 === 2**53, so an "exact transition" can be a rounding
      // artefact unless the counts are SAFE integers.
      ['an unsafe observed count', validAuthorization({
        observedVoterCount: 2 ** 53,
        authorizedResultingVoterCount: 2 ** 53,
      })],
      ['an unsafe authorized count', validAuthorization({
        observedVoterCount: 2 ** 53 - 1,
        authorizedResultingVoterCount: 2 ** 53,
      })],
      ['a class instance carrying every field',
        Object.assign(new (class Authorization {})(), validAuthorization())],
      ['a null-prototype record with an extra symbol', (() => {
        const value = {...validAuthorization()};
        value[Symbol('extra')] = 1;
        return value;
      })()],
      ['a non-enumerable extra property', (() => {
        const value = {...validAuthorization()};
        Object.defineProperty(value, 'hidden', {value: 1, enumerable: false});
        return value;
      })()],
      ['a revoked Proxy', (() => {
        const revocable = Proxy.revocable({...validAuthorization()}, {});
        revocable.revoke();
        return revocable.proxy;
      })()],
      ['a Proxy whose traps throw', new Proxy({...validAuthorization()}, {
        ownKeys() {
          throw new Error('ownKeys trap');
        },
        getOwnPropertyDescriptor() {
          throw new Error('descriptor trap');
        },
      })],
    ];
    for (const field of Object.keys(validAuthorization())) {
      const missing = validAuthorization();
      delete missing[field];
      malformed.push([`missing ${field}`, missing]);
      malformed.push([`wrong type for ${field}`,
        validAuthorization({[field]: {nested: true}})]);
    }
    for (const numeric of [
      'desiredReplicationFactor', 'observedMembershipEpoch',
      'observedVoterCount', 'authorizedResultingVoterCount',
    ]) {
      malformed.push([`non-integer ${numeric}`,
        validAuthorization({[numeric]: 1.5})]);
      malformed.push([`negative ${numeric}`,
        validAuthorization({[numeric]: -1})]);
      malformed.push([`numeric string ${numeric}`,
        validAuthorization({[numeric]: '3'})]);
    }
    for (const [name, value] of malformed) {
      const binding = decodeValue(value);
      assert.equal(binding.state, BINDING_STATE.MALFORMED,
        `malformed on: ${name}`);
      assert.equal(binding.authorization, null,
        `a malformed value is never repaired into one: ${name}`);
      assert.equal(typeof binding.raw.type, 'string',
        `the malformed value is described by type: ${name}`);
      assert.equal(Number.isInteger(binding.raw.size), true,
        `and by a size: ${name}`);
      assert.ok(JSON.stringify(binding.raw).length <
        RAW_DESCRIPTION_BUDGET_BYTES,
      `the description is bounded, never the value: ${name}`);
    }
    // A Proxy whose GET trap throws still decodes, because the decode never
    // reads a property: it reads own DATA descriptors and copies the values
    // into a fresh frozen record. The hostile object never escapes, and its
    // trap is never run.
    let getTrapRuns = 0;
    const trapped = new Proxy({...validAuthorization()}, {
      get() {
        getTrapRuns += 1;
        throw new Error('get trap must never run');
      },
    });
    const trappedBinding = decodeValue(trapped);
    assert.equal(trappedBinding.state, BINDING_STATE.PRESENT);
    assert.equal(getTrapRuns, 0, 'no property was ever read off the value');
    assert.notEqual(trappedBinding.authorization, trapped,
      'the decoded record is a fresh object, never the value from the row');
    assert.equal(Object.isFrozen(trappedBinding.authorization), true);
    assert.deepEqual({...trappedBinding.authorization}, validAuthorization());

    const hugeBinding = decodeValue('x'.repeat(HUGE_STRING_LENGTH));
    assert.equal(hugeBinding.raw.type, 'string');
    assert.equal(hugeBinding.raw.size, HUGE_STRING_LENGTH,
      'the size is stated exactly; only the value is withheld');

    // Nothing above threw, and neither does a hostile shape.
    let accessorRuns = 0;
    const hostile = {
      get intent() {
        accessorRuns += 1;
        throw new Error('authorization getter must never be executed');
      },
    };
    assert.equal(decodeStepsHistory([{[AUTHORIZATION_KEY]: hostile}]).state,
      BINDING_STATE.MALFORMED,
      'an accessor-bearing value is malformed and its accessor is never run');
    assert.equal(accessorRuns, 0, 'the accessor was never executed');

    // The record rides on the FIRST steps-history entry and nowhere else. A
    // key on a later entry, on a prototype, or on a poisoned Object.prototype
    // is not this operation's authorization.
    assert.equal(decodeStepsHistory([
      {step: 'PENDING', timestamp: 0},
      {step: 'SENDING', [AUTHORIZATION_KEY]: validAuthorization()},
    ]).state, BINDING_STATE.ABSENT,
    'a record on a later steps-history entry is not read');
    const inherited = Object.create(
      {[AUTHORIZATION_KEY]: validAuthorization()});
    inherited.step = 'PENDING';
    assert.equal(decodeStepsHistory([inherited]).state, BINDING_STATE.ABSENT,
      'a record inherited from a prototype is not read');
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Object.prototype, AUTHORIZATION_KEY, {
      value: validAuthorization(), configurable: true, enumerable: false,
    });
    try {
      assert.equal(decodeStepsHistory([{step: 'PENDING', timestamp: 0}]).state,
        BINDING_STATE.ABSENT,
        'a poisoned Object.prototype cannot manufacture an authorization');
    } finally {
      delete Object.prototype[AUTHORIZATION_KEY];
    }

    // An own ACCESSOR where the record should be is malformed, not absent:
    // something is there, and running it is exactly what must not happen.
    let entryAccessorRuns = 0;
    const accessorEntry = {step: 'PENDING'};
    Object.defineProperty(accessorEntry, AUTHORIZATION_KEY, {
      enumerable: true,
      get() {
        entryAccessorRuns += 1;
        return validAuthorization();
      },
    });
    assert.equal(decodeStepsHistory([accessorEntry]).state,
      BINDING_STATE.MALFORMED,
      'an accessor in the metadata slot is malformed, never present');
    assert.equal(entryAccessorRuns, 0, 'and it was never executed');

    // Nothing the row can carry makes any entry point throw.
    for (const hostileRow of [
      undefined, null, 'row', 7, [], {steps_history: 7},
      {steps_history: '{not json'}, {steps_history: '[]'},
      new Proxy({}, {get() {
        throw new Error('row get trap');
      }}),
      (() => {
        const revocable = Proxy.revocable({steps_history: '[]'}, {});
        revocable.revoke();
        return revocable.proxy;
      })(),
    ]) {
      const binding = decodeRow(hostileRow);
      assert.equal(typeof binding.state, 'string',
        'every row shape decodes to a named state');
      assert.notEqual(binding.state, BINDING_STATE.PRESENT,
        'and none of them manufactures a present authorization');
    }

    // Both durable spellings of the same field reach the same record: the
    // row's JSON string, and the normalized in-memory array.
    const authorization = validAuthorization();
    const record = [{step: 'PENDING', [AUTHORIZATION_KEY]: authorization}];
    assert.deepEqual(
      {...decodeRow({steps_history: JSON.stringify(record)}).authorization},
      {...decodeRow({stepsHistory: record}).authorization},
      'the JSON string and the parsed array decode identically');
  });

test('the evaluation names each refusal reason', () => {
  const rows = [
    ['authorization_absent', {binding: decodeValue(null)}],
    ['authorization_absent', {binding: undefined}],
    ['authorization_malformed', {binding: decodeValue('junk')}],
    ['authorization_intent_unknown', {
      binding: Object.freeze({
        state: BINDING_STATE.PRESENT,
        authorization: Object.freeze(
          validAuthorization({intent: 'other_intent'})),
        raw: null,
      }),
    }],
    ['authorization_operation_mismatch', {operationId: 'op-other'}],
    ['authorization_operation_mismatch', {operationId: null}],
    ['authorization_destination_mismatch', {localNodeId: 'node-9'}],
    ['authorization_destination_mismatch', {
      localReplicaId: `${CRITICAL_PARTITION_ID}-r9`,
    }],
    ['authorization_desired_rf_mismatch', {
      partitionDesiredReplicationFactor: 5,
    }],
    ['authorization_desired_rf_mismatch', {
      partitionDesiredReplicationFactor: 0,
    }],
    ['authorization_membership_generation_stale', {
      partitionMembershipEpoch: OBSERVED_EPOCH + 1,
    }],
    ['authorization_honoured', {}],
    ['authorization_honoured', {
      partitionMembershipEpoch: OBSERVED_EPOCH - 1,
    }],
    ['authorization_honoured', {partitionMembershipEpoch: 0}],
    // The named THIRD outcome: no epoch supplied, so the fence was never
    // applied. It is neither a grant nor a refusal, and an unreadable epoch
    // is never coerced into epoch zero.
    ['authorization_membership_fence_not_evaluated', {
      partitionMembershipEpoch: undefined,
    }],
    ['authorization_membership_fence_not_evaluated', {
      partitionMembershipEpoch: null,
    }],
    ['authorization_membership_fence_not_evaluated', {
      partitionMembershipEpoch: -1,
    }],
    ['authorization_membership_fence_not_evaluated', {
      partitionMembershipEpoch: 1.5,
    }],
    ['authorization_membership_fence_not_evaluated', {
      partitionMembershipEpoch: '4',
    }],
  ];
  const OUTCOME_BY_REASON = {
    authorization_honoured: SPREAD_CURE_AUTHORIZATION_OUTCOME.HONOURED,
    authorization_membership_fence_not_evaluated:
      SPREAD_CURE_AUTHORIZATION_OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
  };
  for (const [reason, overrides] of rows) {
    const evaluation = evaluateWith(overrides);
    const where = JSON.stringify(Object.keys(overrides));
    assert.equal(evaluation.reason, reason, `reason mismatch on ${where}`);
    assert.equal(evaluation.honoured, reason === 'authorization_honoured',
      `honoured mismatch on ${reason} ${where}`);
    assert.equal(evaluation.outcome, OUTCOME_BY_REASON[reason] ??
      SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED,
    `outcome mismatch on ${reason} ${where}`);
    assert.equal(Object.isFrozen(evaluation), true);
  }
  // The three outcomes are three distinct names, and the third is not a
  // shade of the second.
  assert.equal(new Set(Object.values(SPREAD_CURE_AUTHORIZATION_OUTCOME)).size,
    3, 'three distinct outcome names');
  assert.notEqual(SPREAD_CURE_AUTHORIZATION_OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
    SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED);
  assert.notEqual(SPREAD_CURE_AUTHORIZATION_OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
    SPREAD_CURE_AUTHORIZATION_OUTCOME.HONOURED);

  // The bound is stated whenever an authorized count is readable, honoured or
  // not: the lab measures which refusals an enforced bound would flip.
  assert.equal(evaluateWith({}).authorizedResultingVoterCount, 5);
  assert.equal(evaluateWith({}).wouldBeWithinAuthorizedBound, true);
  assert.equal(evaluateWith({votersAfterPromotion: 6})
    .wouldBeWithinAuthorizedBound, false);
  assert.equal(evaluateWith({localNodeId: 'node-9'})
    .authorizedResultingVoterCount, 5,
  'a refused authorization still states the bound it carried');
  const absentEvaluation = evaluateWith({binding: decodeValue(null)});
  assert.equal(absentEvaluation.authorizedResultingVoterCount, null);
  assert.equal(absentEvaluation.wouldBeWithinAuthorizedBound, null,
    'no authorization means an explicit unavailable bound, not a false one');
  assert.equal(evaluateWith({votersAfterPromotion: null})
    .wouldBeWithinAuthorizedBound, null,
  'an unreadable promotion count means an explicit unavailable bound');

  // Nothing about the evaluation throws, whatever it is handed.
  for (const hostile of [undefined, null, 'x', 7, [], {binding: 'x'}]) {
    const evaluation = evaluateSpreadCureTransitionAuthorization(hostile);
    assert.equal(evaluation.honoured, false);
    assert.equal(typeof evaluation.reason, 'string');
  }
});

test('the spread-cure transition authorization has a registered ' +
  'owner-interaction contract', () => {
  const manifest = JSON.parse(readFileSync(IMPACT_CONTRACTS_URL, 'utf8'));
  const contract = manifest.contracts[CONTRACT_ID];
  const pair = manifest.coupledPairs[COUPLED_PAIR_ID];
  assert.ok(contract, 'the typed contract is registered');
  assert.ok(pair, 'the coupled pair is registered');
  assert.equal(pair.contract, CONTRACT_ID,
    'the coupled pair points at the typed contract');
  const mint = pair.endpoints.find(
    (endpoint) => endpoint.id === MINT_ENDPOINT_ID);
  const consumer = pair.endpoints.find(
    (endpoint) => endpoint.id === CONSUMER_ENDPOINT_ID);
  assert.equal(pair.endpoints.length, 2,
    'mint and consumer stay separate endpoints');
  for (const owner of [
    'src/rebalancer/replica-placement-cure-policy.js',
    'src/rebalancer/move-planner-priority-spread-cure.js',
    'src/rebalancer/rebalance-coordinator-operation-creation.js',
  ]) {
    assert.ok(mint.owners.includes(owner), `mint endpoint owns ${owner}`);
  }
  for (const owner of [
    'src/rebalancer/spread-cure-transition-authorization.js',
    'src/partition/partition-service-learner-promotion-count-check-methods.js',
    'src/partition/learner-promotion-count-check-evidence.js',
  ]) {
    assert.ok(consumer.owners.includes(owner),
      `consumer endpoint owns ${owner}`);
  }
  assert.ok(pair.witnessTests.includes(
    'test/partition/learner-promotion-count-check-inputs.test.js'),
  'the learner-side witness is registered');
  assert.ok(pair.witnessTests.includes(
    'test/rebalancer/spread-cure-transition-authorization.test.js'),
  'the owner-level witness is registered');
});
