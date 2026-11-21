/**
 * Independent publication owners submit through CDC and the publications
 * partition's actual statement admission, outcome ledger and file-backed
 * apply. The fixture controls proposal timing and drops one caller reply.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {CONTROL_PLANE_PUBLICATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {TABLES} from '../../src/constants/index.js';
import {isControlPlanePublicationsWriteLeader} from
  '../../src/control-plane/control-plane-publications-leadership.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {buildMembershipPublicationRow, buildPublicationMetadataRefreshRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {FORMATION_PUBLICATION_ID} from
  '../../src/control-plane/membership-publication-formation-record.js';
import {MEMBERSHIP_LIFECYCLE_STATE, MEMBERSHIP_MEMBER_STATE} from
  '../../src/control-plane/membership-lifecycle-constants.js';
import {MEMBERSHIP_PUBLICATION_STATUS as STATUS, MEMBERSHIP_PUBLICATION_WORKFLOW_STEP} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {WORKFLOW_TRANSITION_FIELD} from '../../src/workflow/workflow-constants.js';
import {deriveParticipantEntryId} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {
  applyCommitted, clearFixtureSingletons, resetFixtureSingletons, settleTicks,
  shutdownAll, startLeader, statementState, temporaryDbPath, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const TABLE = TABLES.CONTROL_PLANE_PUBLICATIONS;
const PARTITION_ID = `${TABLE}-p1`;
const NODES = Object.freeze(['node-a', 'node-b']);
const WRITER_TIME = 20_000;
const SELECT_ROW = `SELECT * FROM ${TABLE} WHERE publication_id = ?`;

function publicationRow(epoch, nodes, nowMs) {
  return buildMembershipPublicationRow({
    nowMs,
    candidate: {
      publicationEpoch: epoch, publisherNodeId: NODES[0],
      sourceTopologyEpoch: epoch, sourceSnapshotVersion: epoch,
      publishedActiveNodeIds: nodes, requiredAckNodeIds: nodes,
      acknowledgedNodeIds: [],
    },
  });
}

function createPublicationWriter(leader, nodeId, nowMs) {
  const cdc = new CDCIntegrationService({
    nodeId,
    partitionServicesProvider: new Map([[PARTITION_ID, leader]]),
  });
  cdc.initialize();
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId, cdcIntegrationService: cdc,
    }),
  });
  const coordinator = new MembershipPublicationCoordinator({
    nodeId, now: () => nowMs, controlPlanePublicationsOwner: owner,
    resolveIsControlPlanePublicationsWriteLeader: () =>
      isControlPlanePublicationsWriteLeader(null, nodeId, cdc),
  });
  return {cdc, owner, coordinator};
}

async function openPublicationsLedger(dbPath) {
  const {leader} = await startLeader({
    tableName: TABLE, schema: CONTROL_PLANE_PUBLICATIONS_SCHEMA, dbPath,
  }, PARTITION_ID);
  const applied = [];
  leader.controllablePort.setProposeHandler(async (command) => {
    assert.equal(applyCommitted(leader, command), null, 'the real partition applies the proposal');
    applied.push(command);
  });
  return {leader, applied};
}

function holdFirstAcknowledgement(leader) {
  const release = Promise.withResolvers();
  const execute = leader.executeQuery.bind(leader);
  const record = {request: null, replay: null, release: release.resolve};
  leader.executeQuery = async (sql, params, options) => {
    if (!options?.idempotencyKey || record.request) {
      return execute(sql, params, options);
    }
    record.request = {sql, params, options};
    await release.promise;
    const original = await execute(sql, params, options);
    assert.equal(original.success, true, 'the original proposal committed before reply loss');
    // The answer is lost between application and the owning writer. Deliver
    // the same statement a second time with its original participant key.
    record.replay = await execute(sql, params, options);
    return record.replay;
  };
  return record;
}

function readDurablePublication(ledger, id) {
  return normalizeControlPlanePublicationRow(ledger.db.prepare(SELECT_ROW).get(id));
}

async function exerciseAcknowledgementOrder({slowNode, fastNode, successor}) {
  const {directory, dbPath} = temporaryDbPath();
  let leader;
  let reopened;
  let slowWriter;
  let fastWriter;
  let held;
  let pending;
  try {
    const ledger = await openPublicationsLedger(dbPath);
    leader = ledger.leader;
    slowWriter = createPublicationWriter(leader, slowNode, WRITER_TIME);
    fastWriter = createPublicationWriter(leader, fastNode, WRITER_TIME + 10);
    const original = publicationRow(3, NODES, WRITER_TIME - 10);
    const publicationId = original.publication_id;
    await slowWriter.coordinator.persistPublicationBirth(original);
    assert.equal(readDurablePublication(leader, publicationId).status, STATUS.OPEN);

    held = holdFirstAcknowledgement(leader);
    pending = track(slowWriter.coordinator.acknowledgePublication(publicationId, slowNode));
    await settleTicks();
    assert.ok(held.request, `the first owner reached the held write after its reads: ${JSON.stringify(pending.value)}`);
    const slowEntryId = deriveParticipantEntryId(held.request.options.idempotencyKey, PARTITION_ID);
    assert.equal(held.request.options.entryId, slowEntryId);
    assert.equal(ledger.applied.some((entry) => entry.entryId === slowEntryId), false);

    const fast = await fastWriter.coordinator.acknowledgePublication(publicationId, fastNode);
    assert.deepEqual(normalizeControlPlanePublicationRow(fast).acknowledgedNodeIds, [fastNode]);
    assert.deepEqual(readDurablePublication(leader, publicationId).acknowledgedNodeIds,
      [fastNode], 'the other coordinator confirmed its actual durable ACK first');

    let nextId;
    if (successor) {
      const next = publicationRow(4, [fastNode, successor], WRITER_TIME + 30);
      nextId = next.publication_id;
      await fastWriter.coordinator.persistPublicationBirth(next);
      await fastWriter.coordinator.acknowledgePublication(nextId, fastNode);
      const preimage = await fastWriter.owner.getPublication(publicationId);
      await fastWriter.owner.upsertPublication({
        ...preimage, status: STATUS.SUPERSEDED, updated_at: WRITER_TIME + 30,
      }, {expectedPublicationRow: preimage});
      assert.equal(readDurablePublication(leader, publicationId).status, STATUS.SUPERSEDED);
    }

    held.release();
    const slow = await pending.promise;
    assert.equal(held.replay?.success, true, 'the exact retransmission recovers its committed result');
    assert.equal(ledger.applied.filter((entry) => entry.entryId === slowEntryId).length, 1,
      'identical content and participant identity cannot re-apply');
    assert.equal(statementState(leader, slowEntryId), 'settled');
    assert.equal(held.replay.changes, 0, 'the replay of the stale CAS changes no row');
    if (!successor) {
      const rebased = ledger.applied.at(-1);
      assert.notEqual(rebased.entryId, slowEntryId, 'the changed preimage has a distinct entry');
      assert.equal(rebased.params.includes(JSON.stringify(NODES)), true,
        'the rebased update carries the same-revision ACK union');
      const committed = ledger.applied.length;
      const unchanged = await slowWriter.coordinator
        .acknowledgePublication(publicationId, slowNode);
      assert.deepEqual(normalizeControlPlanePublicationRow(unchanged).acknowledgedNodeIds, NODES);
      assert.equal(ledger.applied.length, committed, 'an already confirmed ACK needs no new write');
    }
    const settled = readDurablePublication(leader, publicationId);
    await shutdownAll(leader);
    leader = null;
    ({leader: reopened} = await openPublicationsLedger(dbPath));
    assert.deepEqual(readDurablePublication(reopened, publicationId), settled,
      'the durable result survives native reopen');

    if (successor) {
      const newer = readDurablePublication(reopened, nextId);
      assert.deepEqual(newer.publishedActiveNodeIds, [fastNode, successor].sort());
      assert.deepEqual(newer.acknowledgedNodeIds, [fastNode]);
      assert.equal(newer.status, STATUS.ACK_PENDING, 'an old ACK cannot satisfy the newer revision');
      assert.equal(settled.status, STATUS.SUPERSEDED, 'the retired publication cannot reopen');
    } else {
      assert.deepEqual(settled.acknowledgedNodeIds, NODES,
        'both independently confirmed acknowledgments survive arbitrary apply order');
      assert.equal(settled.status, STATUS.PUBLISHED);
      assert.equal(settled.membershipLifecycleSummary.lifecycleState,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE);
      for (const nodeId of NODES) {
        assert.equal(settled.membershipLifecycleSummary.memberStatesByNodeId[nodeId],
          MEMBERSHIP_MEMBER_STATE.SERVING);
      }
      assert.equal(settled.transitionHistory.filter(({state}) => state === STATUS.PUBLISHED).length,
        1, 'the union persists one genuine final-ACK closure');
      assert.equal(settled.transitionHistory.at(-1).state, STATUS.PUBLISHED);
      assert.deepEqual(normalizeControlPlanePublicationRow(slow).acknowledgedNodeIds, NODES,
        'the delayed owner returns the confirmed union');
    }
  } finally {
    held?.release();
    await Promise.allSettled(pending ? [pending.promise] : []);
    slowWriter?.cdc.markShuttingDown();
    fastWriter?.cdc.markShuttingDown();
    try {
      await shutdownAll(leader, reopened);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
}

for (const [slowNode, fastNode] of [NODES, [...NODES].reverse()]) {
  test(`the publications ledger retains ${fastNode}'s confirmed ACK when ${slowNode} applies late`,
    () => exerciseAcknowledgementOrder({slowNode, fastNode}));
}

test('a late old-publication ACK has no authority to reopen a superseded revision',
  () => exerciseAcknowledgementOrder({
    slowNode: NODES[0], fastNode: NODES[1], successor: 'node-c',
  }));

test('native publication confirmation resolves a lost final answer and refuses unavailable readback',
  async () => {
    const {directory, dbPath} = temporaryDbPath();
    let leader;
    let writer;
    try {
      const ledger = await openPublicationsLedger(dbPath);
      leader = ledger.leader;
      writer = createPublicationWriter(leader, NODES[0], WRITER_TIME);
      const first = publicationRow(3, NODES, WRITER_TIME - 10);
      const second = publicationRow(4, NODES, WRITER_TIME - 10);
      for (const row of [first, second]) {
        await writer.coordinator.persistPublicationBirth(row);
      }
      const write = writer.owner.upsertPublication.bind(writer.owner);
      writer.owner.upsertPublication = async (...args) => {
        await write(...args);
        throw Object.assign(new Error('lost the last committed reply'), {deferRetry: true});
      };
      const firstAck = await writer.coordinator.acknowledgePublication(
        first.publication_id, NODES[0], {publicationWriteMaxAttempts: 1});
      assert.deepEqual(normalizeControlPlanePublicationRow(firstAck).acknowledgedNodeIds,
        [NODES[0]], 'the final committed attempt is resolved by actual SQLite readback');

      let loseReadback = false;
      const read = writer.owner.getPublication.bind(writer.owner);
      writer.owner.getPublication = async (...args) => {
        if (loseReadback) {
          throw Object.assign(new Error('publication read authority unavailable'), {deferRetry: true});
        }
        return read(...args);
      };
      writer.owner.upsertPublication = async (...args) => {
        const result = await write(...args);
        loseReadback = true;
        return result;
      };
      await assert.rejects(
        writer.coordinator.acknowledgePublication(second.publication_id, NODES[0]),
        {code: 'PUBLICATION_WRITE_UNCONFIRMED', deferRetry: true},
        'the owner has no successful answer while confirmation is unavailable');
      assert.deepEqual(readDurablePublication(leader, second.publication_id).acknowledgedNodeIds,
        [NODES[0]], 'the committed effect survives unavailability at its consumer');

      loseReadback = false;
      const writes = ledger.applied.length;
      const settled = await writer.coordinator
        .acknowledgePublication(second.publication_id, NODES[0]);
      assert.deepEqual(normalizeControlPlanePublicationRow(settled).acknowledgedNodeIds,
        [NODES[0]]);
      assert.equal(ledger.applied.length, writes, 'a subsequent read reconstructs the exact ACK');
      await assert.rejects(write({...second, publication_id: FORMATION_PUBLICATION_ID}, {
        expectedPublicationRow: null,
      }), {code: 'INVALID_PUBLICATION_MUTATION'});
      assert.equal(leader.db.prepare(SELECT_ROW).get(FORMATION_PUBLICATION_ID), undefined,
        'ordinary publication writes cannot create the formation latch row');
    } finally {
      writer?.cdc.markShuttingDown();
      try {
        await shutdownAll(leader);
      } finally {
        fs.rmSync(directory, {recursive: true, force: true});
      }
    }
  });

async function withPublicationLedger(exercise) {
  const {directory, dbPath} = temporaryDbPath();
  let leader;
  let writer;
  try {
    const ledger = await openPublicationsLedger(dbPath);
    leader = ledger.leader;
    writer = createPublicationWriter(leader, NODES[0], WRITER_TIME);
    await exercise(ledger, writer);
  } finally {
    writer?.cdc.markShuttingDown();
    try {
      await shutdownAll(leader);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
}

async function racePublicationReconcile(ledger, writer, row, options, update) {
  const {leader} = ledger;
  const publicationId = row.publication_id;
  const held = holdFirstAcknowledgement(leader);
  const pending = track(writer.coordinator.reconcileClusterMembership(options));
  try {
    await settleTicks();
    assert.ok(held.request, `owner reached the held update: ${JSON.stringify(pending.value)}`);
    const current = await writer.owner.getPublication(publicationId);
    const mutation = await writer.owner.upsertPublication({...current, ...update}, {
      expectedPublicationRow: current,
    });
    assert.equal(mutation.partitionResult.affectedRows, 1, 'the competing write changes the row');
    held.release();
    return await pending.promise;
  } finally {
    held.release();
    await Promise.allSettled([pending.promise]);
  }
}

test('a refused lifecycle-summary-only reconcile keeps its obligation until native confirmation',
  () => withPublicationLedger(async (ledger, writer) => {
    const row = buildPublicationMetadataRefreshRow({
      publicationRow: publicationRow(3, NODES, WRITER_TIME - 10),
      nowMs: WRITER_TIME - 10,
    });
    await writer.coordinator.persistPublicationBirth(row);
    const baseline = readDurablePublication(ledger.leader, row.publication_id);
    const requested = {...baseline.membershipLifecycleSummary, locallyEligibleNodeIds: NODES};
    writer.coordinator.deriveClusterMembershipCandidate = async () => ({
      ...baseline, changed: false, membershipLifecycleSummaryChanged: true,
      membershipLifecycleSummary: requested,
    });
    const options = {
      latestPublicationRow: row, latestPublishedPublicationRow: row, publicationWriteMaxAttempts: 1,
    };
    await assert.rejects(racePublicationReconcile(ledger, writer, row, options, {
      reason_code: 'concurrently committed metadata',
    }), {code: 'PUBLICATION_WRITE_UNCONFIRMED'});
    assert.deepEqual(readDurablePublication(ledger.leader, row.publication_id)
      .membershipLifecycleSummary.locallyEligibleNodeIds, []);
    const result = await writer.coordinator.reconcileClusterMembership(options);
    assert.deepEqual(result.publicationRow.membershipLifecycleSummary.locallyEligibleNodeIds,
      NODES);
    assert.deepEqual(readDurablePublication(ledger.leader, row.publication_id)
      .membershipLifecycleSummary.locallyEligibleNodeIds, NODES);
  }));

test('an adopted supersession does not open the reconciliation workflow',
  () => withPublicationLedger(async (ledger, writer) => {
    const row = publicationRow(3, NODES, WRITER_TIME - 10);
    await writer.coordinator.persistPublicationBirth(row);
    const baseline = readDurablePublication(ledger.leader, row.publication_id);
    writer.coordinator.deriveClusterMembershipCandidate = async () => ({
      ...baseline, changed: true,
    });
    const result = await racePublicationReconcile(ledger, writer, row, {
      latestPublicationRow: row, latestPublishedPublicationRow: row,
    }, {
      status: STATUS.SUPERSEDED, updated_at: WRITER_TIME + 10, closed_at: WRITER_TIME + 10,
    });
    assert.equal(result.publicationRow.status, STATUS.SUPERSEDED);
    const workflow = writer.coordinator.workflowCoordinator
      .getWorkflowByOwnerKey(writer.coordinator.buildOwnerKey());
    assert.notEqual(workflow.step, MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN);
    const stages = workflow.transitionHistory.map((entry) =>
      entry[WORKFLOW_TRANSITION_FIELD.NEXT_STEP]);
    assert.equal(stages.includes(MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN), false);
    const fresh = publicationRow(4, NODES, WRITER_TIME);
    const freshCandidate = normalizeControlPlanePublicationRow(fresh);
    writer.coordinator.deriveClusterMembershipCandidate = async () => ({
      ...freshCandidate, changed: true,
    });
    const healthy = await writer.coordinator.reconcileClusterMembership({
      latestPublicationRow: row, latestPublishedPublicationRow: row,
    });
    assert.equal(healthy.publicationRow.publicationId, fresh.publication_id);
    assert.equal(healthy.publicationRow.status, STATUS.OPEN);
    assert.equal(writer.coordinator.workflowCoordinator
      .getWorkflowByOwnerKey(writer.coordinator.buildOwnerKey()).step,
    MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN);
  }));

test('explicit publication identity cannot be rebound to another revision or cohort',
  () => withPublicationLedger(async (ledger, writer) => {
    const explicit = {...publicationRow(3, NODES, WRITER_TIME - 10),
      publication_id: 'explicit-membership-publication'};
    const ordinary = await writer.coordinator.persistPublicationBirth(explicit);
    assert.equal(ordinary.publication_id, explicit.publication_id);
    const writes = ledger.applied.length;
    const different = publicationRow(4, [NODES[1], 'node-c'], WRITER_TIME);
    await assert.rejects(writer.coordinator.persistPublicationBirth({
      ...different, publication_id: explicit.publication_id,
    }), {code: 'PUBLICATION_REVISION_MISMATCH'});
    assert.equal(ledger.applied.length, writes);
    assert.deepEqual(readDurablePublication(ledger.leader, explicit.publication_id)
      .publishedActiveNodeIds, NODES);
    const next = await writer.coordinator.persistPublicationBirth(different);
    assert.equal(next.publication_id, different.publication_id);
  }));

const ACK_CLOCK = WRITER_TIME + 10;
const RECOVERY_SOURCE = 'committed_recovery_snapshot';

function installLifecycleRefresh(writer, row, placementNodeIds = [NODES[1]]) {
  const previous = normalizeControlPlanePublicationRow(row);
  const projection = {
    ...previous.membershipLifecycleSummary,
    locallyEligibleNodeIds: NODES,
    formationPlacementNodeIds: placementNodeIds,
    recoveryActiveNodeSource: RECOVERY_SOURCE,
  };
  writer.coordinator.deriveClusterMembershipCandidate = async () => ({
    ...previous, changed: false, membershipLifecycleSummaryChanged: true,
    membershipLifecycleSummary: projection,
  });
  return () => writer.coordinator.reconcileClusterMembership({
    latestPublicationRow: row, latestPublishedPublicationRow: row,
  });
}

function assertAckAndLifecycleRefresh(row) {
  assert.deepEqual(row.acknowledgedNodeIds, [NODES[1]]);
  assert.deepEqual(row.membershipLifecycleSummary.locallyEligibleNodeIds, NODES);
  assert.deepEqual(row.membershipLifecycleSummary.formationPlacementNodeIds, [NODES[1]]);
  assert.equal(row.membershipLifecycleSummary.recoveryActiveNodeSource, RECOVERY_SOURCE);
}

for (const order of ['ack-late', 'refresh-late', 'serial']) {
  test(`publication ACK and lifecycle refresh preserve both effects in ${order} order`,
    () => withPublicationLedger(async (ledger, metadataWriter) => {
      const {leader} = ledger;
      const ackWriter = createPublicationWriter(leader, NODES[1], ACK_CLOCK);
      let held;
      let pending;
      try {
        const row = buildPublicationMetadataRefreshRow({
          publicationRow: publicationRow(3, NODES, WRITER_TIME - 10),
          nowMs: WRITER_TIME - 10,
        });
        await metadataWriter.coordinator.persistPublicationBirth(row);
        const acknowledge = () => ackWriter.coordinator
          .acknowledgePublication(row.publication_id, NODES[1]);
        const refresh = installLifecycleRefresh(metadataWriter, row);
        if (order === 'serial') {
          await refresh();
          await acknowledge();
        } else {
          const ackLate = order === 'ack-late';
          held = holdFirstAcknowledgement(leader);
          pending = track((ackLate ? acknowledge : refresh)());
          await settleTicks();
          assert.ok(held.request, `the first CAS reached native routing: ${JSON.stringify(pending.value)}`);
          await (ackLate ? refresh : acknowledge)();
          const first = readDurablePublication(leader, row.publication_id);
          assert.deepEqual(first.acknowledgedNodeIds, ackLate ? [] : [NODES[1]]);
          assert.deepEqual(first.membershipLifecycleSummary.formationPlacementNodeIds,
            ackLate ? [NODES[1]] : []);
          held.release();
          await pending.promise;
          assert.equal(held.replay.changes, 0, 'the held statement actually loses the CAS');
        }
        assertAckAndLifecycleRefresh(readDurablePublication(leader, row.publication_id));
      } finally {
        held?.release();
        await Promise.allSettled(pending ? [pending.promise] : []);
        ackWriter.cdc.markShuttingDown();
      }
    }));
}

for (const order of ['visible-before-read', 'committed-during-cas']) {
  test(`a stale lifecycle refresh defers when a different refresh is ${order}`,
    () => withPublicationLedger(async (ledger, staleWriter) => {
      const {leader} = ledger;
      const currentWriter = createPublicationWriter(leader, NODES[1], ACK_CLOCK);
      const row = publicationRow(3, NODES, WRITER_TIME - 10);
      const publicationId = row.publication_id;
      let held;
      let pending;
      try {
        await staleWriter.coordinator.persistPublicationBirth(row);
        const staleRefresh = installLifecycleRefresh(staleWriter, row, [NODES[0]]);
        const currentRefresh = installLifecycleRefresh(currentWriter, row, [NODES[1]]);
        if (order === 'committed-during-cas') {
          held = holdFirstAcknowledgement(leader);
          pending = track(staleRefresh());
          await settleTicks();
          assert.ok(held.request, 'the stale refresh reached its first native proposal');
        }
        await currentRefresh();
        const winner = leader.db.prepare(SELECT_ROW).get(publicationId);
        assert.deepEqual(normalizeControlPlanePublicationRow(winner)
          .membershipLifecycleSummary.formationPlacementNodeIds, [NODES[1]]);
        const appliedWithWinner = ledger.applied.length;
        held?.release();
        await assert.rejects(pending ? pending.promise : staleRefresh(),
          {code: 'PUBLICATION_WRITE_UNCONFIRMED', deferRetry: true});
        assert.deepEqual(leader.db.prepare(SELECT_ROW).get(publicationId), winner);
        assert.equal(ledger.applied.length, appliedWithWinner + (held ? 1 : 0),
          'the losing CAS can settle zero rows but cannot submit a stale metadata proposal');
        if (held) assert.equal(held.replay.changes, 0);

        const rederivedRefresh = installLifecycleRefresh(staleWriter, winner, NODES);
        await rederivedRefresh();
        assert.deepEqual(readDurablePublication(leader, publicationId)
          .membershipLifecycleSummary.formationPlacementNodeIds, NODES);
      } finally {
        held?.release();
        await Promise.allSettled(pending ? [pending.promise] : []);
        currentWriter.cdc.markShuttingDown();
      }
    }));
}
