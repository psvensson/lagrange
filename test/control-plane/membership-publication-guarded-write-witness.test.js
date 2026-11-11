// The membership publication row is changed only as a function of its stored
// revision (design: solve/epics/operation-integrity-and-reliable-formation/
// publication-acknowledgement-design-2026-11-11.md; owner ruling 2026-11-11:
// option B, and a node acknowledges only for itself).
//
// Each witness is one of the confirmed losses of the whole-row unconditional
// rewrite, driven from the production entry points (the coordinator's
// acknowledgement, the owner's reconcile) over the real replicated
// publications table: a lone rs-raft leader behind the production engine,
// the CDC routed write path and the control-plane gateway. The gate, the
// lost answer and the unavailable read are injected at each coordinator's
// gateway seam. Mutants: dropping the revision predicate from the owner's
// update turns (a) and (c) red; keying the acknowledgement lane by
// publication alone turns the lane witness red.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  MEMBER_NODE_IDS,
  PUBLICATIONS,
  PUBLICATION_ID,
  captureDeliveredStatements,
  changeDataOf,
  coordinatorOver,
  durableRow,
  newPublicationCandidate,
  ownerCoordinatorOver,
  publicationRow,
  refreshCandidate,
  withPublicationSurface,
} from './membership-publication-guarded-write-fixture.js';
import {
  PUBLICATION_WRITE_OUTCOME,
  PUBLICATION_WRITE_UNKNOWN_REASON,
} from '../../src/control-plane/owners/control-plane-publication-change.js';
import {
  MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL,
} from '../../src/control-plane/membership-publication-row-changes.js';
import {
  MEMBERSHIP_PUBLICATION_WRITE_REFUSAL,
} from '../../src/control-plane/membership-publication-coordinator-persist.js';
import {
  MEMBERSHIP_PUBLICATION_WRITE_HOLD,
} from '../../src/control-plane/membership-publication-reconcile-write.js';
import {
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
} from '../../src/control-plane/membership-publication-row-contract.js';

const TEST_TIMEOUT_MS = 60000;
const {COMMITTED, ALREADY_APPLIED, UNCHANGED, REFUSED, UNKNOWN} =
  PUBLICATION_WRITE_OUTCOME;
const PRIORITY_REQUIRED_DISTINCT_NODES = 3;
const PRIORITY_SUMMARY = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: PRIORITY_REQUIRED_DISTINCT_NODES,
});

// Holds one coordinator between its read and its first write until the
// witness releases it: `reached` resolves when the write is about to be
// submitted, `release()` lets it go.
function holdFirstWrite(control) {
  let release = null;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const reached = new Promise((resolve) => {
    control.beforeWrite = async () => {
      control.beforeWrite = null;
      resolve();
      await released;
    };
  });
  return {reached, release};
}

function lostAnswer() {
  const error = new Error('answer lost after the partition applied the write');
  error.code = 'ROUTER_MESSAGE_TIMEOUT';
  return error;
}

async function seedPublication(gateway, overrides = {}) {
  const answer = await gateway.insertSystemTableRow(PUBLICATIONS,
    publicationRow({publication_revision: 1, ...overrides}));
  assert.notEqual(answer?.success, false, 'setup: the publication is seeded');
}

function workflowStepOf(coordinator) {
  return coordinator.workflowCoordinator.getWorkflowByOwnerKey(
    coordinator.buildOwnerKey())?.step ?? null;
}

test('lane: one process acknowledging two nodes at once records both ' +
  '(a call for another node never joins a running one)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    await seedPublication(gateway);
    const {coordinator} = coordinatorOver(gateway, 'node-1');
    const outcomes = await Promise.all([
      coordinator.acknowledgePublication(PUBLICATION_ID, 'node-2'),
      coordinator.acknowledgePublication(PUBLICATION_ID, 'node-3'),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.outcome),
      [COMMITTED, COMMITTED], 'each call ran its own change');
    assert.deepEqual(durableRow(surface).acknowledged_node_ids.sort(),
      ['node-2', 'node-3'],
      'both acknowledgements ran: neither joined the other\'s call');
  });
});

test('(a) two coordinators acknowledging distinct nodes, the second held ' +
  'between its read and its write: both land, both are told COMMITTED',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    await seedPublication(gateway);
    const first = coordinatorOver(gateway, 'node-1');
    const second = coordinatorOver(gateway, 'node-2');
    // Acknowledger 2 has read; it writes only after acknowledger 1's whole
    // call (its write and any confirming read) is over.
    const held = holdFirstWrite(second.control);
    const secondAck = second.coordinator.acknowledgeMembershipPublicationForNode(
      'node-2', {publicationRows: [publicationRow()]});
    await held.reached;
    const firstOutcome =
      await first.coordinator.acknowledgeMembershipPublicationForNode(
        'node-1', {publicationRows: [publicationRow()]});
    held.release();
    const secondOutcome = await secondAck;
    assert.equal(firstOutcome.outcome, COMMITTED);
    assert.equal(secondOutcome.outcome, COMMITTED,
      'the held write missed, was re-applied to the durable row and landed');
    assert.equal(second.control.writes.length, 2,
      'acknowledger 2\'s stale write affected no row; its second landed');
    const row = durableRow(surface);
    assert.deepEqual(row.acknowledged_node_ids.sort(), ['node-1', 'node-2'],
      'acknowledger 1 is not overwritten by acknowledger 2\'s stale row');
    assert.equal(row.publication_revision, 3,
      'revisions 1 (admitted), 2 and 3: one per landed change');
    assert.deepEqual(secondOutcome.row.acknowledged_node_ids,
      ['node-1', 'node-2'], 'the caller is answered the durable row');
  });
});

test('(b) a node\'s own acknowledgement racing the owner\'s completion of ' +
  'another node\'s acknowledgement: both are recorded',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    await seedPublication(gateway);
    const seeded = publicationRow();
    // One process (the publication owner on node-1): it acknowledges for
    // itself while its reconcile completes node-2's acknowledgement (the
    // candidate's recovery-eligible answer).
    const owner = ownerCoordinatorOver(gateway, 'node-1', () =>
      refreshCandidate(seeded, {acknowledgedNodeIds: ['node-2']}));
    const held = holdFirstWrite(owner.control);
    const ownAck = owner.coordinator.acknowledgeMembershipPublicationForNode(
      'node-1', {publicationRows: [seeded]});
    await held.reached;
    const reconciled = await owner.coordinator.reconcileClusterMembership(
      {latestPublicationRow: seeded});
    held.release();
    const ownOutcome = await ownAck;
    assert.equal(reconciled.publicationWrite.outcome, COMMITTED);
    assert.equal(ownOutcome.outcome, COMMITTED);
    const row = durableRow(surface);
    assert.deepEqual(row.acknowledged_node_ids.sort(), ['node-1', 'node-2']);
    assert.equal(row.status, 'ACK_PENDING');
    assert.equal(row.publication_revision, 3);
  });
});

test('(c) a reconcile refresh computed before the final acknowledgement ' +
  'never returns PUBLISHED to ACK_PENDING', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    const preFinal = publicationRow({
      status: 'ACK_PENDING',
      acknowledged_node_ids: ['node-1', 'node-2'],
    });
    await seedPublication(gateway, preFinal);
    // The owner's refresh is derived from the pre-final row: status
    // ACK_PENDING, two acknowledgements, lifecycle publish_pending.
    const owner = ownerCoordinatorOver(gateway, 'node-1', () =>
      refreshCandidate(preFinal, {
        priorityPartitionSummary: PRIORITY_SUMMARY,
        membershipLifecycleSummary: {
          lifecycleState: 'publish_pending',
          publishedActiveNodeIds: [...MEMBER_NODE_IDS],
        },
      }));
    const final = coordinatorOver(gateway, 'node-3');
    const held = holdFirstWrite(owner.control);
    const refresh = owner.coordinator.reconcileClusterMembership(
      {latestPublicationRow: preFinal});
    await held.reached;
    const finalAck =
      await final.coordinator.acknowledgeMembershipPublicationForNode(
        'node-3', {publicationRows: [preFinal]});
    assert.equal(finalAck.outcome, COMMITTED);
    assert.equal(durableRow(surface).status, 'PUBLISHED',
      'setup: the row closed while the refresh was held');
    held.release();
    const refreshed = await refresh;
    const row = durableRow(surface);
    assert.equal(row.status, 'PUBLISHED', 'the row stayed closed');
    assert.deepEqual(row.acknowledged_node_ids.sort(), [...MEMBER_NODE_IDS],
      'no acknowledgement was dropped by the refresh');
    assert.equal(row.membership_lifecycle_summary.lifecycleState,
      'published_active',
      'the pre-final lifecycle state is not written over the closed row');
    assert.equal(row.priority_partition_summary?.requiredDistinctNodeCount,
      PRIORITY_REQUIRED_DISTINCT_NODES,
      'the refresh itself landed on the closed row');
    assert.equal(refreshed.publicationWrite.outcome, COMMITTED);
    assert.equal(refreshed.publicationRow.status, 'PUBLISHED',
      'the reconcile reports the durable row');
    assert.ok(row.published_at > 0 && row.closed_at > 0,
      'the closing timestamps survive the refresh');
  });
});

test('(c) an ABANDONED row is never rewritten: a refresh and an ' +
  'acknowledgement are both refused by the row', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    const abandoned = publicationRow({status: 'ABANDONED', closed_at: 2000});
    await seedPublication(gateway, abandoned);
    const live = publicationRow();
    const owner = ownerCoordinatorOver(gateway, 'node-1', () =>
      refreshCandidate(live, {priorityPartitionSummary: PRIORITY_SUMMARY,
        acknowledgedNodeIds: [...MEMBER_NODE_IDS]}));
    // Both callers hold a live (stale) view of the row.
    const refreshed = await owner.coordinator.reconcileClusterMembership(
      {latestPublicationRow: live});
    const acknowledged = await owner.coordinator
      .acknowledgeMembershipPublicationForNode('node-1',
        {publicationRows: [live]});
    for (const outcome of [refreshed.publicationWrite, acknowledged]) {
      assert.equal(outcome.outcome, REFUSED);
      assert.equal(outcome.reason,
        MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.FINAL_ROW);
    }
    assert.equal(refreshed.publicationWriteHold,
      MEMBERSHIP_PUBLICATION_WRITE_HOLD.REFUSED_BY_ROW);
    assert.equal('publicationRow' in refreshed, false,
      'a refused write reports no row');
    assert.deepEqual(owner.requeues, [], 'a row\'s refusal is not retried');
    const row = durableRow(surface);
    assert.equal(row.status, 'ABANDONED');
    assert.equal(row.publication_revision, 1, 'nothing was written');
    assert.deepEqual(row.acknowledged_node_ids, []);
  });
});

test('(d) creation: the insert\'s answer lost and the durable owner ' +
  'unreadable is UNKNOWN - no OPEN, the reconcile holds and re-asks; the ' +
  'next authoritative read completes it', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    const candidate = newPublicationCandidate();
    const owner = ownerCoordinatorOver(gateway, 'node-1', () => candidate);
    owner.control.loseWriteAnswer = () => {
      owner.control.loseWriteAnswer = null;
      owner.control.readsUnavailable = true;
      return lostAnswer();
    };
    const held = await owner.coordinator.reconcileClusterMembership({});
    assert.equal(held.publicationWrite.outcome, UNKNOWN);
    assert.equal(held.publicationWrite.reason,
      PUBLICATION_WRITE_UNKNOWN_REASON.CONFIRMING_READ_UNAVAILABLE);
    assert.equal(typeof held.publicationWrite.writeKey, 'string');
    assert.equal(held.publicationWriteHold,
      MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER);
    assert.equal('publicationRow' in held, false,
      'no row is returned as persisted');
    assert.equal(workflowStepOf(owner.coordinator),
      MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.DERIVING,
      'the workflow did not advance to OPEN on an unconfirmed write');
    assert.equal(owner.requeues.length, 1, 'the held reconcile re-asks itself');
    assert.ok(owner.requeues[0].queueOptions.selfRequeue.delayMs > 0,
      'through the queue\'s declared delayed self-requeue, never at once');

    // The resumed work: the durable owner answers again.
    owner.control.readsUnavailable = false;
    const resumed = await owner.coordinator.reconcileClusterMembership({});
    assert.equal(resumed.publicationWrite.outcome, ALREADY_APPLIED,
      'the unanswered insert had applied: it is found, not repeated');
    assert.equal(workflowStepOf(owner.coordinator),
      MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN);
    const row = durableRow(surface, resumed.publicationRow.publicationId);
    assert.equal(row.publication_revision, 1, 'admitted once, at revision 1');
    assert.equal(row.status, 'OPEN');
    assert.equal(owner.requeues.length, 1, 'a landed write re-asks nothing');
  });
});

test('(d) acknowledgement: an unanswered write with the durable owner ' +
  'unreadable is UNKNOWN and still owed; the next authoritative read finds ' +
  'it applied exactly once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    await seedPublication(gateway);
    const node = coordinatorOver(gateway, 'node-2');
    node.control.loseWriteAnswer = () => {
      node.control.loseWriteAnswer = null;
      node.control.readsUnavailable = true;
      return lostAnswer();
    };
    const unknown =
      await node.coordinator.acknowledgeMembershipPublicationForNode(
        'node-2', {publicationRows: [publicationRow()]});
    assert.equal(unknown.outcome, UNKNOWN);
    assert.equal(unknown.publicationId, PUBLICATION_ID);
    assert.equal('row' in unknown, false);

    node.control.readsUnavailable = false;
    const resolved =
      await node.coordinator.acknowledgeMembershipPublicationForNode(
        'node-2', {publicationRows: [publicationRow()]});
    assert.equal(resolved.outcome, UNCHANGED,
      'the durable row already holds the acknowledgement');
    const row = durableRow(surface);
    assert.deepEqual(row.acknowledged_node_ids, ['node-2']);
    assert.equal(row.publication_revision, 2, 'applied exactly once');
    assert.equal(node.control.writes.length, 1);
  });
});

test('(e) a node acknowledges only for itself: another node\'s ' +
  'acknowledgement is refused before any read or write',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface}) => {
    await seedPublication(gateway);
    const nodeY = coordinatorOver(gateway, 'node-1');
    const proxy =
      await nodeY.coordinator.acknowledgeMembershipPublicationForNode(
        'node-2', {publicationRows: [publicationRow()]});
    assert.equal(proxy.outcome, REFUSED);
    assert.equal(proxy.reason, MEMBERSHIP_PUBLICATION_WRITE_REFUSAL.NOT_SELF);
    assert.equal(nodeY.control.writes.length, 0);
    assert.equal(nodeY.control.reads, 0);
    assert.deepEqual(durableRow(surface).acknowledged_node_ids, []);
    assert.equal(durableRow(surface).publication_revision, 1);
  });
});

test('(f) revisions are the integers 1, 2, 3... with no gap or NULL after ' +
  'interleaved changes, and a change\'s CDC row is the whole durable row',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPublicationSurface(async ({gateway, surface, messageRouter}) => {
    const statements = captureDeliveredStatements(messageRouter);
    const candidate = newPublicationCandidate();
    const owner = ownerCoordinatorOver(gateway, 'node-1', () => candidate);
    const created = await owner.coordinator.reconcileClusterMembership({});
    assert.equal(created.publicationWrite.outcome, COMMITTED);
    const publicationId = created.publicationRow.publicationId;
    assert.equal(durableRow(surface, publicationId).publication_revision, 1,
      'admitted at revision 1');
    const admitted = publicationRow({publication_id: publicationId,
      publication_epoch: candidate.publicationEpoch});
    const nodes = MEMBER_NODE_IDS.map((nodeId) =>
      coordinatorOver(gateway, nodeId));
    const outcomes = await Promise.all(nodes.map(({coordinator}, index) =>
      coordinator.acknowledgeMembershipPublicationForNode(
        MEMBER_NODE_IDS[index], {publicationRows: [admitted]})));
    assert.deepEqual(outcomes.map((outcome) => outcome.outcome),
      [COMMITTED, COMMITTED, COMMITTED]);
    const row = durableRow(surface, publicationId);
    assert.equal(row.publication_revision, 4,
      'three landed changes after the admission');
    assert.equal(typeof row.publication_revision, 'number',
      'stored as an integer, never NULL (plain parameter, no SET expression)');
    assert.equal(row.status, 'PUBLISHED');
    const submittedRevisions = nodes.flatMap(({control}) => control.writes)
      .map((write) => write.args[2].publication_revision);
    assert.deepEqual([...new Set(submittedRevisions)].sort(), [2, 3, 4],
      'every submitted change named the next integer of the row it read');

    // The partial-column UPDATE reaches CDC subscribers as the whole durable
    // row: the partition derives the event's row from the stored row.
    const updates = statements.filter((statement) =>
      /^UPDATE /i.test(statement.sql ?? ''));
    assert.ok(updates.length >= 3, 'setup: the guarded updates were delivered');
    for (const statement of updates) {
      assert.match(statement.sql,
        /WHERE \(*publication_id = \?\)* AND \(*publication_revision = \?\)*$/,
        'the statement is guarded by the key and the revision');
      assert.deepEqual(
        [...statement.sql.matchAll(/publication_revision\s*=\s*(\S)/g)]
          .map((match) => match[1]),
        ['?', '?'],
        'the revision is set and compared as a plain parameter, never as ' +
        'an expression');
    }
    const lastUpdate = updates[updates.length - 1];
    const changeData = changeDataOf(surface, lastUpdate);
    assert.equal(changeData.publication_id, publicationId);
    for (const column of ['publication_kind', 'publication_epoch',
      'publisher_node_id', 'published_active_node_ids',
      'required_ack_node_ids', 'acknowledged_node_ids', 'status',
      'created_at', 'updated_at', 'transition_history',
      'publication_revision']) {
      assert.notEqual(changeData[column] ?? null, null,
        `the change data of a partial-column update carries ${column}`);
    }
  });
});
