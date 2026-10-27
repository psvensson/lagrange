/** Source retention, leadership handoff, quorum-absence lane release vs
 * source-own applied absence retirement, and exact-generation cleanup
 * (FreshMG 6.C slices C3 & C4).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_TRANSITION_REASON as REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
} from '../../src/raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {proposeAuthorizedGroupRemoval} from
  '../../src/raft/raft-rs-group-membership-admission.js';
import {
  MEMBERSHIP_PHASE as PHASE,
  MEMBERSHIP_OBLIGATION as OBLIGATION,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME,
} from '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {
  recordedRemovalFactIsValid,
  awaitMessageGroupSourceConsensusExit,
  retireRemovedMessageGroupSourceReplica,
} from '../../src/rebalancer/replica-operation-message-group-removal.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {SERVICES_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {FOUNDERS, NODE, O, SUCCESSOR} from
  '../test-helpers/learner-operation-fixture.js';
import {
  PERMIT_COLUMN,
  leaderOf,
  otherFounder,
  promotionWorld,
  votersEverywhere,
} from '../test-helpers/message-group-learner-promotion-fixture.js';

function createServicesOwner(root, nowFn) {
  const dbFile = path.join(root, 'services-owner.sqlite');
  const db = new Database(dbFile);
  db.exec(generateCreateTableSQL(SERVICES_SCHEMA));
  const systemTableWriter = {
    async readAuthoritativeRows(_table, sql, params = []) {
      const statement = db.prepare(sql);
      return {success: true, rows: statement.all(...params)};
    },
    async updateSystemTableRow(table, where, updates) {
      const whereKeys = Object.keys(where);
      const setKeys = Object.keys(updates);
      const sql = `UPDATE ${table} SET ` +
        `${setKeys.map((key) => `${key} = ?`).join(', ')} WHERE ` +
        `${whereKeys.map((key) => `${key} = ?`).join(' AND ')}`;
      const res = db.prepare(sql).run(
        ...setKeys.map((key) => updates[key]),
        ...whereKeys.map((key) => where[key]),
      );
      return {
        success: true,
        outcome: res.changes === 1 ? 'applied' : 'no_op',
        changes: res.changes,
        affectedRows: res.changes,
      };
    },
    async deleteSystemTableRow(table, where) {
      const whereKeys = Object.keys(where);
      const sql = `DELETE FROM ${table} WHERE ` +
        `${whereKeys.map((key) => `${key} = ?`).join(' AND ')}`;
      const res = db.prepare(sql).run(...whereKeys.map((key) => where[key]));
      return {
        success: true,
        outcome: res.changes === 1 ? 'applied' : 'no_op',
        changes: res.changes,
        affectedRows: res.changes,
      };
    },
  };
  const owner = new MessageGroupServiceRowOwner({
    systemTableWriter,
    now: nowFn,
  });
  return {
    db,
    owner,
    insertServiceRow({
      groupId,
      replicaId,
      nodeId,
      status = 'active',
      createdAt,
      stateEnteredAt,
      createAttemptToken,
    }) {
      const built = MessageGroupServiceRowOwner.buildServiceRow({
        groupId,
        replicaId,
        nodeId,
        timestamp: createdAt,
        status,
        extraFields: {
          created_at: createdAt,
          state_entered_at: stateEnteredAt,
          updated_at: stateEnteredAt,
          create_attempt_token: createAttemptToken,
        },
      });
      const cols = Object.keys(built);
      db.prepare(
        `INSERT INTO services (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ).run(...cols.map((col) => built[col]));
    },
    row(_groupId, replicaId) {
      return db.prepare(
        'SELECT * FROM services WHERE service_id = ?',
      ).get(replicaId) ?? null;
    },
    close() {
      db.close();
    },
  };
}

function observeLeaderOnCluster(f, destinationReplicaId, overrides = {}) {
  return async ({sourceReplicaId}) => {
    const sourceStatus = f.cluster.node(sourceReplicaId).readStatus();
    const status = f.cluster.node(destinationReplicaId).readStatus();
    const membership = await f.cluster.node(destinationReplicaId)
      .readCommittedMembership({purpose: PURPOSE.BOOTSTRAP});
    return {
      sourceStatus,
      status,
      membership,
      ...overrides,
    };
  };
}

async function advanceToVoterCommitted(fx) {
  const {f} = fx;
  assert.equal((await fx.select()).outcome, OUTCOME.RECORDED);
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  assert.equal(
    (await fx.recordVoter(otherFounder(f))).outcome,
    OUTCOME.RECORDED,
  );
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED);
}

function handoffFromSourceToSurvivor(f, sourceReplicaId) {
  const survivor = FOUNDERS.find((id) => id !== sourceReplicaId);
  const currentLeader = leaderOf(f);
  if (currentLeader !== survivor) {
    const beforeApplied = f.cluster.node(survivor).readStatus().appliedIndex;
    assert.equal(
      f.cluster.node(currentLeader).transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: survivor,
      }).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    f.cluster.tickers = [survivor];
    assert.ok(f.cluster.settle(() => {
      const status = f.cluster.node(survivor).readStatus();
      return status.role === RAFT_ROLE.LEADER &&
        status.appliedIndex > beforeApplied &&
        status.currentTermApplied === true;
    }));
  } else {
    const beforeCommit = f.cluster.node(survivor).readStatus().commitIndex;
    assert.equal(
      f.cluster.propose(survivor, {type: 'HANDOFF_NOOP'}).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    assert.ok(f.cluster.settle(() => {
      const status = f.cluster.node(survivor).readStatus();
      return status.commitIndex > beforeCommit &&
        status.currentTermApplied === true;
    }));
  }
  return survivor;
}

async function proposeAuthorizedSourceRemoval(f, leaderReplicaId, nodeId = SUCCESSOR) {
  const row = f.row();
  const identity = JSON.parse(row.message_group_membership_identity);
  const recipientRepo = f.repositoryFor(nodeId);
  const request = {
    operationId: O,
    identity: row.message_group_membership_identity,
    permit: row[PERMIT_COLUMN],
    executionClaim: row.message_group_membership_owner_claim,
  };
  return proposeAuthorizedGroupRemoval(
    f.cluster.node(leaderReplicaId),
    {
      groupId: identity.groupId,
      nodeId,
      bootIncarnation: 1,
      localReplicaIdentity: leaderReplicaId,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      peerAddress: f.cluster.addressOf(identity.sourceReplicaId),
    },
    request,
    (req, receiver) =>
      recipientRepo.observeMessageGroupRemovalAuthorization(req, receiver),
    {
      nodeId,
      bootIncarnation: 1,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      isCurrent: () => true,
    },
  );
}

test('source retention and leadership handoff fence: source removal is refused ' +
  'before VOTER_COMMITTED and while the source still leads or the surviving ' +
  'leader has not applied its own term; after handoff it authorizes and ' +
  'proposes RemoveNode(source)', {timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  const identity = JSON.parse(f.request.identity);
  const sourceReplicaId = identity.sourceReplicaId;
  const survivor = FOUNDERS.find((id) => id !== sourceReplicaId);

  // 1. Before VOTER_COMMITTED (still LEARNER_COMMITTED), source removal is CONFLICT.
  const premature = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: survivor,
    },
    observeLeaderOnCluster(f, survivor),
    () => true,
  );
  assert.equal(premature.outcome, OUTCOME.CONFLICT);
  assert.equal(f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED);

  // 2. Promote learner and record VOTER_COMMITTED.
  await advanceToVoterCommitted(fx);

  // 3. Ensure sourceReplicaId is the current leader so handoff is required.
  if (leaderOf(f) !== sourceReplicaId) {
    assert.equal(
      f.cluster.node(leaderOf(f)).transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: sourceReplicaId,
      }).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    f.cluster.tickers = [sourceReplicaId];
    assert.ok(f.cluster.settle(() =>
      f.cluster.node(sourceReplicaId).readStatus().role === RAFT_ROLE.LEADER));
  }

  // Routing source removal to the source itself is refused with HANDOFF_REQUIRED.
  const selfRouted = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: NODE,
      destinationReplicaId: sourceReplicaId,
    },
    observeLeaderOnCluster(f, sourceReplicaId),
    () => true,
  );
  assert.equal(selfRouted.outcome, OUTCOME.HANDOFF_REQUIRED);

  // Routing to a follower while the source still leads is also HANDOFF_REQUIRED.
  const whileSourceLeads = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: survivor,
    },
    observeLeaderOnCluster(f, survivor),
    () => true,
  );
  assert.equal(whileSourceLeads.outcome, OUTCOME.HANDOFF_REQUIRED);
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED);

  // 4. Transfer leadership off the source to the surviving voter.
  const handoffLeader = handoffFromSourceToSurvivor(f, sourceReplicaId);

  // If the new leader has not applied an entry of its own term, refuse HANDOFF_REQUIRED.
  const unappliedTerm = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: handoffLeader,
    },
    async (req) => {
      const obs = await observeLeaderOnCluster(f, handoffLeader)(req);
      return {...obs, status: {...obs.status, currentTermApplied: false}};
    },
    () => true,
  );
  assert.equal(unappliedTerm.outcome, OUTCOME.HANDOFF_REQUIRED);

  // 5. With handoff complete and own term applied, selectMessageGroupSourceRemoval succeeds.
  const voterPermit = fx.permit();
  const selected = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: handoffLeader,
    },
    observeLeaderOnCluster(f, handoffLeader),
    () => true,
  );
  assert.equal(selected.outcome, OUTCOME.RECORDED);
  assert.equal(
    f.row().message_group_membership_phase,
    PHASE.SOURCE_REMOVAL_IN_FLIGHT,
  );
  const removalPermit = fx.permit();
  assert.equal(removalPermit.permitSequence, voterPermit.permitSequence + 1);
  assert.equal(removalPermit.permitStage, 'remove');
  assert.equal(removalPermit.replicaIdentity, sourceReplicaId);
  assert.equal(removalPermit.peerId, deriveRaftRsPeerId(sourceReplicaId));

  // Idempotent replay of selectMessageGroupSourceRemoval writes nothing more.
  const replay = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: handoffLeader,
    },
    observeLeaderOnCluster(f, handoffLeader),
    () => true,
  );
  assert.equal(replay.outcome, OUTCOME.RECORDED);
  assert.deepEqual(fx.permit(), removalPermit);
});

test('quorum absence vs source-own applied absence: quorum removal releases ' +
  'the group membership lane while an isolated source stays open on BACKSTOP; ' +
  'healing the source applies its own removal, retires its port and deletes ' +
  'its exact-generation services row and SQLite files',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  await advanceToVoterCommitted(fx);

  const identity = JSON.parse(f.request.identity);
  const sourceReplicaId = identity.sourceReplicaId;
  const sourcePeerId = deriveRaftRsPeerId(sourceReplicaId);
  const handoffLeader = handoffFromSourceToSurvivor(f, sourceReplicaId);

  const selected = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: handoffLeader,
    },
    observeLeaderOnCluster(f, handoffLeader),
    () => true,
  );
  assert.equal(selected.outcome, OUTCOME.RECORDED);

  // Set up canonical services row and SQLite file matching the operation's source lifecycle claim.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-removal-fence-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const services = createServicesOwner(root, () => f.clock.now());
  t.after(() => services.close());
  const claim = JSON.parse(f.row().message_group_source_lifecycle_claim);
  services.insertServiceRow({
    groupId: identity.groupId,
    replicaId: sourceReplicaId,
    nodeId: identity.sourceNodeId,
    status: 'active',
    createdAt: claim.createdAt,
    stateEnteredAt: claim.stateEnteredAt,
    createAttemptToken: claim.createAttemptToken,
  });
  const sourceDbPath = path.join(root, `${sourceReplicaId}.db`);
  fs.writeFileSync(sourceDbPath, 'source-replica-sqlite-bytes');
  fs.writeFileSync(`${sourceDbPath}-wal`, 'source-replica-wal-bytes');

  let sourcePortStopped = false;
  const sourceService = {
    replicaId: sourceReplicaId,
    raft: f.cluster.node(sourceReplicaId),
    async shutdown() {
      sourcePortStopped = true;
    },
  };

  // Let the source replica append RemoveNode(source) to its log, but hold the
  // commit-advancing packet so the surviving quorum applies RemoveNode(source)
  // while the source has not yet applied its own removal.
  const sourceAddress = f.cluster.addressOf(sourceReplicaId);
  const heldPackets = [];
  let sourceMessagesSeen = 0;
  const previousSendFor = f.cluster.sendFor;
  f.cluster.sendFor = (fromId, toAddress, packet) => {
    if (toAddress === sourceAddress) {
      sourceMessagesSeen += 1;
      if (sourceMessagesSeen >= 2) {
        heldPackets.push(packet);
        return {outcome: 'delivered'};
      }
    }
    return previousSendFor ?
      previousSendFor(fromId, toAddress, packet) : undefined;
  };
  const proposed = await proposeAuthorizedSourceRemoval(f, handoffLeader);
  assert.equal(proposed.reason, REASON.PROPOSED, JSON.stringify(proposed));

  // Settle the surviving voters ({handoffLeader, other surviving founder, promoted target}).
  const survivingFounders = FOUNDERS.filter((id) => id !== sourceReplicaId);
  assert.equal(await fx.world.until(() => survivingFounders.every((id) =>
    !f.cluster.node(id).readStatus().confState.voters
      .map(String).includes(sourcePeerId))), true);

  // Verify the isolated source STILL names itself a voter in its own applied configuration!
  assert.equal(
    f.cluster.node(sourceReplicaId).readStatus().confState.voters
      .map(String).includes(sourcePeerId),
    true,
    'the isolated source has not yet applied its own RemoveNode',
  );

  // Record the committed removal stamp from the surviving leader (quorum absence).
  const removalPermit = fx.permit();
  const recorded = await f.repository.recoverMessageGroupRemovalOutcome(
    O,
    (query) => f.cluster.node(handoffLeader).readCommittedMembership(query),
    () => true,
  );
  assert.equal(recorded.outcome, OUTCOME.RECORDED);

  // Quorum absence immediately settles the membership obligation and releases the lane!
  const settledRow = f.row();
  assert.equal(settledRow.message_group_membership_phase, PHASE.SOURCE_REMOVED);
  assert.equal(
    settledRow.message_group_membership_obligation_state,
    OBLIGATION.SETTLED,
  );
  assert.equal(
    settledRow.message_group_membership_lane_key,
    null,
    'quorum absence releases the group membership lane without waiting for the lagging source',
  );
  const operationAfterRemoval =
    await f.repository.queryAuthoritativeOperationById(O);
  assert.equal(
    recordedRemovalFactIsValid(
      operationAfterRemoval,
      identity,
      operationAfterRemoval.messageGroupMembershipIdentity,
    ),
    true,
  );
  assert.equal(
    JSON.parse(settledRow[PERMIT_COLUMN]).proposalIndex,
    proposed.proposalIndex,
  );
  assert.equal(
    JSON.parse(settledRow[PERMIT_COLUMN]).permitSequence,
    removalPermit.permitSequence,
  );

  // While the source is still isolated, source-own exit hits BACKSTOP and NEVER stops the port
  // or deletes the services row or SQLite artifacts.
  const backstopAttempt = await retireRemovedMessageGroupSourceReplica({
    repository: f.repository,
    operationId: O,
    sourceService,
    serviceRowOwner: services.owner,
    dbPath: sourceDbPath,
    backstopMs: 30,
    pollMs: 5,
  });
  assert.equal(backstopAttempt.outcome, 'backstop_alarm');
  assert.equal(backstopAttempt.exit, REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP);
  assert.equal(backstopAttempt.stopped, false);
  assert.equal(backstopAttempt.deleted, false);
  assert.equal(sourcePortStopped, false, 'BACKSTOP never stops the source port');
  assert.notEqual(
    services.row(identity.groupId, sourceReplicaId),
    null,
    'BACKSTOP never deletes the services row',
  );
  assert.equal(
    fs.existsSync(sourceDbPath),
    true,
    'BACKSTOP never deletes the source SQLite file',
  );

  // Deliver the held replication packets to the source replica so it applies its own RemoveNode.
  f.cluster.sendFor = previousSendFor;
  for (const packet of heldPackets.splice(0)) {
    f.cluster.node(sourceReplicaId).step(packet);
  }
  assert.equal(await fx.world.until(() =>
    !f.cluster.node(sourceReplicaId).readStatus().confState.voters
      .map(String).includes(sourcePeerId)), true);

  const ownExit = await awaitMessageGroupSourceConsensusExit(sourceService, {
    replicaId: sourceReplicaId,
    backstopMs: 200,
    pollMs: 5,
  });
  assert.equal(ownExit.exit, REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED);

  // Now retireRemovedMessageGroupSourceReplica retires the port and cleans up the exact generation.
  const retired = await retireRemovedMessageGroupSourceReplica({
    repository: f.repository,
    operationId: O,
    sourceService,
    serviceRowOwner: services.owner,
    dbPath: sourceDbPath,
    backstopMs: 200,
    pollMs: 5,
  });
  assert.equal(retired.outcome, 'retired');
  assert.equal(retired.stopped, true);
  assert.equal(retired.deleted, true);
  assert.equal(retired.filesRemoved, true);
  assert.equal(sourcePortStopped, true);
  assert.equal(services.row(identity.groupId, sourceReplicaId), null);
  assert.equal(fs.existsSync(sourceDbPath), false);
  assert.equal(fs.existsSync(`${sourceDbPath}-wal`), false);
});

test('exact-generation DELETE fence and restart recovery: a reborn successor ' +
  'generation on the services row is never stopped or deleted by an older ' +
  'operation claim, and lost removal answers recover cleanly across reopen',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  await advanceToVoterCommitted(fx);

  const identity = JSON.parse(f.request.identity);
  const sourceReplicaId = identity.sourceReplicaId;
  const sourcePeerId = deriveRaftRsPeerId(sourceReplicaId);
  const handoffLeader = handoffFromSourceToSurvivor(f, sourceReplicaId);

  assert.equal(
    (await f.repository.selectMessageGroupSourceRemoval(
      {
        operationId: O,
        destinationNodeId: SUCCESSOR,
        destinationReplicaId: handoffLeader,
      },
      observeLeaderOnCluster(f, handoffLeader),
      () => true,
    )).outcome,
    OUTCOME.RECORDED,
  );
  const proposed = await proposeAuthorizedSourceRemoval(f, handoffLeader);
  assert.equal(proposed.reason, REASON.PROPOSED);
  assert.equal(await fx.world.until(() => FOUNDERS.every((id) =>
    !f.cluster.node(id).readStatus().confState.voters
      .map(String).includes(sourcePeerId))), true);

  // Reopen the operations database before recording the removal stamp to prove
  // restart recovery from durable state.
  const reopenedRepo = f.reopenOperations();
  const recorded = await reopenedRepo.recoverMessageGroupRemovalOutcome(
    O,
    (query) => f.cluster.node(handoffLeader).readCommittedMembership(query),
    () => true,
  );
  assert.equal(recorded.outcome, OUTCOME.RECORDED);
  // Second call after reopen is an exact replay without native reads.
  let extraReads = 0;
  const replay = await reopenedRepo.recoverMessageGroupRemovalOutcome(
    O,
    async () => {
      extraReads += 1;
      return null;
    },
    () => true,
  );
  assert.equal(replay.outcome, OUTCOME.RECORDED);
  assert.equal(extraReads, 0);

  // Register a NEWER generation in services (simulating a successor/reborn generation).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-generation-fence-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const services = createServicesOwner(root, () => f.clock.now());
  t.after(() => services.close());
  const claim = JSON.parse(f.row().message_group_source_lifecycle_claim);
  services.insertServiceRow({
    groupId: identity.groupId,
    replicaId: sourceReplicaId,
    nodeId: identity.sourceNodeId,
    status: 'active',
    createdAt: claim.createdAt + 1000,
    stateEnteredAt: claim.stateEnteredAt + 1000,
    createAttemptToken: 'successor-attempt-token',
  });
  const successorDbPath = path.join(root, `${sourceReplicaId}.db`);
  fs.writeFileSync(successorDbPath, 'successor-generation-bytes');

  let successorStopped = false;
  const successorService = {
    replicaId: sourceReplicaId,
    raft: f.cluster.node(sourceReplicaId),
    async shutdown() {
      successorStopped = true;
    },
  };

  const mismatched = await retireRemovedMessageGroupSourceReplica({
    repository: reopenedRepo,
    operationId: O,
    sourceService: successorService,
    serviceRowOwner: services.owner,
    dbPath: successorDbPath,
    backstopMs: 100,
    pollMs: 5,
  });
  assert.equal(mismatched.outcome, 'generation_mismatch');
  assert.equal(mismatched.stopped, false);
  assert.equal(mismatched.deleted, false);
  assert.equal(successorStopped, false);
  assert.equal(
    services.row(identity.groupId, sourceReplicaId)?.create_attempt_token,
    'successor-attempt-token',
  );
  assert.equal(fs.existsSync(successorDbPath), true);
});
