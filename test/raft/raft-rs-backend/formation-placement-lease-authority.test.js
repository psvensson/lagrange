import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NODE_STATE, STATE} from '../../../src/constants/index.js';
import {isOccupyingCopy, readPlacementCensus} from
  '../../../src/partition/partition-placement-admission-decision.js';
import {PLACEMENT_COPY_CAPACITY, PLACEMENT_TRIGGER} from
  '../../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../../src/rebalancer/replica-status.js';
import {ledgerRows} from '../../partition/placement-admission-fixture.js';
import {appliedStateOf, peerIdOf} from './founding-growth-test-support.js';
import {
  BOOT, SEED, SEED_REPLICA, TARGET, withPlacementLeaseAuthority,
} from './formation-placement-lease-authority-fixture.js';

function snapshot(context) {
  const {owner, nodes, ledger, cluster, initial} = context;
  const membership = appliedStateOf(cluster, SEED_REPLICA);
  assert.deepEqual(membership.voters, [cluster.raftPeerIdOf(SEED_REPLICA)]);
  const copies = readPlacementCensus(ledger.db).filter(isOccupyingCopy);
  assert.ok(copies.filter((copy) => copy.copySourceNodeId === SEED).length <=
    PLACEMENT_COPY_CAPACITY.K_SRC);
  assert.ok(copies.filter((copy) => copy.targetNodeId === TARGET).length <=
    PLACEMENT_COPY_CAPACITY.K_TGT);
  assert.equal(owner.placementResyncAdmissions, 0);
  return {
    node: nodes.nodeRow(), operations: ledgerRows(ledger),
    originalLearner: membership.learners.includes(
      peerIdOf(cluster, SEED_REPLICA, initial.replica_id)),
    mutations: nodes.mutations.slice(),
  };
}

function removals(observed) {
  return observed.operations.filter((operation) => operation.type === OperationType.REMOVE);
}

test('an expired lease skipped by the active lease owner retains the same committed learner',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {nodes, initial, clock} = context;
    const before = snapshot(context);
    assert.equal(before.operations[0].operation_id, initial.operation_id);
    assert.equal(before.originalLearner, true);
    nodes.goPastExpiry();
    assert.deepEqual(await nodes.sweep(STATE.CONNECTED), [], 'transport-connected owner skip');
    await context.observeCommittedPlacement();
    const skipped = snapshot(context);

    await nodes.renew();
    await context.observeCommittedPlacement();
    const renewed = snapshot(context);
    t.diagnostic(JSON.stringify({skipped, renewed}));

    assert.equal(skipped.node.status, NODE_STATE.ACTIVE);
    assert.equal(skipped.node.connection_state, STATE.READY);
    assert.equal(skipped.node.boot_incarnation, BOOT);
    assert.ok(skipped.node.ready_lease_expires_at < clock.now());
    assert.equal(skipped.originalLearner, true);
    assert.equal(skipped.mutations.length, 0, 'the real sweeper committed no disconnect');
    assert.equal(renewed.node.boot_incarnation, BOOT);
    assert.equal(renewed.originalLearner, true);
    assert.ok(renewed.node.ready_lease_expires_at > clock.now());
    assert.deepEqual(removals(skipped), [], 'expiry alone cannot admit a membership REMOVE');
    assert.deepEqual(renewed.operations.map((operation) => operation.operation_id),
      [initial.operation_id], 'same-incarnation renewal retains the original admitted ADD');
  }));

test('guarded disconnect and exact native learner retirement permit ordinary rejoin progress',
  async (t) => withPlacementLeaseAuthority(async (context) => {
    const {nodes, owner, initial, ledger, finishAdd, finishRemove} = context;
    const wakes = [];
    const notify = owner.notify.bind(owner);
    owner.notify = (trigger) => {
      wakes.push(trigger);
      return notify(trigger);
    };

    nodes.goPastExpiry();
    assert.deepEqual(await nodes.sweep(STATE.DISCONNECTED), [TARGET]);
    await context.observeCommittedPlacement();
    const disconnected = snapshot(context);
    assert.equal(disconnected.node.connection_state, STATE.DISCONNECTED);
    assert.equal(disconnected.node.ready_lease_expires_at, null);
    assert.equal(disconnected.node.boot_incarnation, BOOT);
    assert.equal(disconnected.mutations[0].affectedRows, 1);
    assert.equal(disconnected.originalLearner, true);
    const [removal] = removals(disconnected);
    assert.equal(removals(disconnected).length, 1);
    assert.equal(removal.replica_id, initial.replica_id);

    finishRemove(removal);
    await owner.awaitCurrentWorkIdle();
    const removed = snapshot(context);
    assert.equal(removed.originalLearner, false);
    assert.equal(removed.operations.length, 2, 'disconnected target remains ineligible: ' +
      JSON.stringify(removed.operations.map((row) =>
        [row.operation_id, row.type, row.replica_id, row.target_node_id])));

    const releaseAfter = wakes.length;
    await nodes.renew();
    await nodes.waitForCommittedTarget((row) =>
      row.boot_incarnation === BOOT && row.connection_state === STATE.READY);
    await owner.awaitCurrentWorkIdle();
    const replacement = ledgerRows(ledger).find((operation) =>
      operation.operation_id !== initial.operation_id && operation.type === OperationType.ADD);
    assert.ok(replacement);
    assert.equal(replacement.target_node_id, TARGET);
    assert.notEqual(replacement.replica_id, initial.replica_id);
    assert.ok(wakes.slice(releaseAfter).includes(PLACEMENT_TRIGGER.NODES_OR_FORMATION));
    finishAdd(replacement);
    await owner.awaitCurrentWorkIdle();
    const rejoined = snapshot(context);
    assert.equal(rejoined.operations.length, 3);
    assert.equal(rejoined.originalLearner, false);
    t.diagnostic(JSON.stringify({disconnected, removed, rejoined}));
  }));

async function testStaleDisconnect(t, replaceTarget) {
  await withPlacementLeaseAuthority(async (context) => {
    const {nodes} = context;
    const gate = nodes.holdDisconnect();
    nodes.goPastExpiry();
    const sweep = nodes.sweep(STATE.DISCONNECTED);
    try {
      await Promise.race([gate.entered.promise, sweep.then(() => {
        throw new Error('the active lease sweep never entered the guarded disconnect');
      })]);
      await replaceTarget(nodes);
    } finally {
      gate.release.resolve();
    }
    const expiredIds = await sweep;
    const observed = snapshot(context);
    const compare = observed.mutations.find((mutation) =>
      mutation.updates.connection_state === STATE.DISCONNECTED);
    t.diagnostic(JSON.stringify({expiredIds, compare, node: observed.node}));
    assert.deepEqual(expiredIds, [], 'an old observation cannot disconnect the new row');
    assert.equal(compare.affectedRows, 0);
    assert.equal(observed.node.connection_state, STATE.READY);
  });
}

test('same-incarnation renewal wins the actual held disconnect compare', (t) =>
  testStaleDisconnect(t, (nodes) => nodes.renew()));

test('a held disconnect compare cannot cross a newer boot with the same lease watermark', (t) =>
  testStaleDisconnect(t, (nodes) => nodes.publishNewBootAtSameWatermark()));
