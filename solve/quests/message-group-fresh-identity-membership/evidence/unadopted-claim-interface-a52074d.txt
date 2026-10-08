/**
 * FreshMG row-claim increment. Real repository + canonical schemas + file-backed
 * SQLite. The gateway substitutes for distributed SQL/Raft; no runtime
 * membership, transport or physical CREATE is enabled by this suite.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {REPLICA_OPERATIONS_SCHEMA, NODES_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {REPLICA_OPERATION_OWNER_LEASE_TTL_MS as WINDOW} from
  '../../src/rebalancer/replica-operation-owner-lease.js';

const OP = 'claim-operation';
const GROUP = 'mg-claim';
const SOURCE = 'mg-claim-r1';
const TARGET = 'mg-claim-r4';
const SOURCE_NODE = 'seed';
const CLAIM_COLUMN = 'message_group_membership_owner_claim';
const PERMIT_COLUMN = 'message_group_membership_permit';
const CLAIM_SQL = 'UPDATE replica_operations SET message_group_membership_owner_claim';
const START = 100000;
const HELD = 'held';
const CONFLICT = 'conflict';
const UNAVAILABLE = 'unavailable';
const INVALID = 'inconsistent';
const UNKNOWN = 'unknown';
const logger = {debug() {}, info() {}, warn() {}, error() {}};

function execute(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (stmt.reader) return {success: true, rows: stmt.all(...params)};
  const result = stmt.run(...params);
  return {success: true, affectedRows: result.changes, changes: result.changes};
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'membership-claim-'));
  const file = path.join(dir, 'operations.sqlite');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  const clients = [];
  t.after(() => {
    for (const c of clients) {c.repo.markShuttingDown(); c.connection.close();}
    db.close(); fs.rmSync(dir, {recursive: true, force: true});
  });
  for (const schema of [REPLICA_OPERATIONS_SCHEMA, NODES_SCHEMA]) {
    db.exec(generateCreateTableSQL(schema));
    for (const sql of generateCreateIndexSQL(schema)) db.exec(sql);
  }
  const columns = db.prepare('PRAGMA table_info(replica_operations)').all();
  assert.ok(columns.some((c) => c.name === CLAIM_COLUMN), 'canonical claim column is required');
  assert.ok(columns.some((c) => c.name === PERMIT_COLUMN), 'issued action must have its own column');
  const identity = {operationId: OP, groupId: GROUP,
    sourceReplicaId: SOURCE, sourceNodeId: SOURCE_NODE, sourceCreatedAt: 3,
    sourceCreateAttemptToken: 'source-attempt', targetReplicaId: TARGET,
    targetPeerId: deriveRaftRsPeerId(TARGET), targetNodeId: 'target',
    targetAddress: 'tcp://target:5000', transitionIdentity: 'claim-transition',
    membershipLaneKey: `message-group:${GROUP}`};
  db.prepare(`INSERT INTO replica_operations
    (operation_id, type, partition_id, entity_type, entity_id, replica_id,
     source_replica_id, source_node_id, target_node_id, status, workflow_step,
     created_at, updated_at, completed_at, lease_expires_at, steps_history,
     membership_publication_epoch, message_group_membership_lane_key,
     message_group_membership_phase, message_group_membership_obligation_state,
     message_group_membership_identity, message_group_source_lifecycle_claim)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(OP, OperationType.REPLACE, GROUP, SERVICE_TYPE.MESSAGE_GROUP, GROUP,
      TARGET, SOURCE, SOURCE_NODE, 'target', ReplicaStatus.PENDING, WORKFLOW_STEP.PENDING,
      START, START, START + WINDOW, '[]', 17, identity.membershipLaneKey,
      'learner_requested', 'intent_recorded', JSON.stringify(identity),
      JSON.stringify({replicaId: SOURCE, createdAt: 3, stateEnteredAt: 4,
        createAttemptToken: 'source-attempt'}));
  function boot(node, value) {
    const present = db.prepare('SELECT node_id FROM nodes WHERE node_id = ?').get(node);
    if (present) db.prepare('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?').run(value, node);
    else db.prepare(`INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb,
      disk_gb, last_heartbeat, created_at, boot_incarnation) VALUES (?, ?, 2, 1024, 10, ?, ?, ?)`)
      .run(node, `tcp://${node}:5000`, START, START, value);
  }
  function client(node = SOURCE_NODE, incarnation = 1, now = START) {
    boot(node, incarnation);
    const connection = new Database(file);
    const clock = new VirtualTimeSource({startMs: now});
    const hooks = {beforeWrite: null, afterWrite: null, read: null, writes: []};
    const gateway = {
      readAuthoritativeRows: async (table, sql, params, options) => {
        if (options.authoritativeReadMode === 'owner_rpc_required') {
          assert.equal(options.leaderMode, 'required');
        }
        const override = await hooks.read?.(table, sql, params);
        return override === undefined ? execute(connection, sql, params) : override;
      },
      executeQuery: async (sql, params) => {
        if (sql.startsWith(CLAIM_SQL)) {
          hooks.writes.push({sql, params});
          const override = await hooks.beforeWrite?.(sql, params);
          if (override !== undefined) return override;
          const answer = execute(connection, sql, params);
          return (await hooks.afterWrite?.(answer, sql, params)) ?? answer;
        }
        return execute(connection, sql, params);
      },
    };
    const repo = new ReplicaOperationRepository({nodeId: node,
      membershipOwnerBootIncarnation: incarnation, timeSource: clock,
      systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
      cdcIntegrationService: {waitForCacheUpdate: async () => {}},
      controlPlaneSystemTableGateway: gateway, logger,
      authoritativeVisibilityTimeoutMs: 0});
    clients.push({connection, repo});
    assert.equal(typeof repo.claimMessageGroupMembershipOwner, 'function', 'existing repo owns claim');
    return {repo, hooks, clock};
  }
  function row() {return db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(OP);}
  function patch(values) {
    const keys = Object.keys(values);
    db.prepare(`UPDATE replica_operations SET ${keys.map((k) => `${k} = ?`).join(', ')}
      WHERE operation_id = ?`).run(...keys.map((k) => values[k]), OP);
  }
  return {db, client, row, patch, boot, identity};
}
function barrier() {
  let release;
  let reached;
  const wait = new Promise((r) => {release = r;});
  const entered = new Promise((r) => {reached = r;});
  return {entered, release, stop: async () => {reached(); await wait;}};
}
function withoutClaim(row) {
  const result = {...row}; delete result[CLAIM_COLUMN]; return result;
}
async function owned(f) {
  const owner = f.client();
  const result = await owner.repo.claimMessageGroupMembershipOwner(OP);
  assert.equal(result.outcome, HELD);
  return owner;
}

test('claim comes from bound node/boot/time and renews without changing action', async (t) => {
  const f = fixture(t); const c = f.client(); const before = f.row();
  const result = await c.repo.claimMessageGroupMembershipOwner(OP,
    {ownerNodeId: 'forged', generation: 900, expiresAt: 1, now: 1});
  assert.equal(result.outcome, HELD);
  const claim = JSON.parse(f.row()[CLAIM_COLUMN]);
  assert.deepEqual(claim, {version: 1, operationId: OP,
    transitionIdentity: f.identity.transitionIdentity, ownerNodeId: SOURCE_NODE,
    ownerBootIncarnation: 1, generation: 1, expiresAt: START + WINDOW});
  assert.deepEqual(withoutClaim(f.row()), withoutClaim(before));
  c.clock.advance(1);
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).generation, 2);
  assert.equal((await c.repo.queryAuthoritativeOperationById(OP))
    .messageGroupMembershipOwnerClaim, f.row()[CLAIM_COLUMN]);
});

test('live structural-owner lease fences an initial remote claim', async (t) => {
  const f = fixture(t); const c = f.client('other');
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, CONFLICT);
  assert.equal(f.row()[CLAIM_COLUMN], null); assert.equal(c.hooks.writes.length, 0);
});

test('owner loss before initial claim: equal-deadline successors have one SQL winner', async (t) => {
  const f = fixture(t); f.patch({lease_expires_at: null});
  const a = f.client('a'); const b = f.client('b'); const gate = barrier();
  a.hooks.beforeWrite = gate.stop;
  const first = a.repo.claimMessageGroupMembershipOwner(OP); await gate.entered;
  assert.equal((await b.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  gate.release(); assert.equal((await first).outcome, CONFLICT);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).ownerNodeId, 'b');
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).generation, 1);
});

test('ordinary renewal defeats an orphan attempt that already read NULL claim', async (t) => {
  const f = fixture(t); f.patch({lease_expires_at: START - 1});
  const c = f.client('orphan'); const gate = barrier(); c.hooks.beforeWrite = gate.stop;
  const attempt = c.repo.claimMessageGroupMembershipOwner(OP); await gate.entered;
  f.patch({lease_expires_at: START + WINDOW}); gate.release();
  assert.equal((await attempt).outcome, CONFLICT); assert.equal(f.row()[CLAIM_COLUMN], null);
});

test('late structural owner cannot overwrite an initial successor winner', async (t) => {
  const f = fixture(t); const original = f.client(); const gate = barrier();
  original.hooks.beforeWrite = gate.stop;
  const late = original.repo.claimMessageGroupMembershipOwner(OP); await gate.entered;
  const next = f.client('successor', 1, START + WINDOW);
  assert.equal((await next.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  gate.release(); assert.equal((await late).outcome, CONFLICT);
});

test('live remote claim and same-node new boot are fenced until claim expiry', async (t) => {
  const f = fixture(t); await owned(f);
  const other = f.client('other');
  assert.equal((await other.repo.claimMessageGroupMembershipOwner(OP)).outcome, CONFLICT);
  const reboot = f.client(SOURCE_NODE, 2);
  assert.equal((await reboot.repo.claimMessageGroupMembershipOwner(OP)).outcome, CONFLICT);
  reboot.clock.advance(WINDOW);
  assert.equal((await reboot.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).ownerBootIncarnation, 2);
});

test('expired-holder competitors cannot both acquire the same generation', async (t) => {
  const f = fixture(t); await owned(f);
  const a = f.client('a', 1, START + WINDOW);
  const b = f.client('b', 1, START + WINDOW); const gate = barrier();
  a.hooks.beforeWrite = gate.stop;
  const first = a.repo.claimMessageGroupMembershipOwner(OP); await gate.entered;
  assert.equal((await b.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  gate.release(); assert.equal((await first).outcome, CONFLICT);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).generation, 2);
});

test('terminal debt transfers holder without rewriting action or ordinary row', async (t) => {
  const f = fixture(t); await owned(f);
  f.patch({status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
    completed_at: START + 1, message_group_membership_obligation_state: 'unknown',
    message_group_membership_phase: 'promotion_proposal_in_flight',
    [PERMIT_COLUMN]: JSON.stringify({stage: 'promote', immutableEvidence: 'original'}),
    message_group_learner_stamp: JSON.stringify({originalLearner: true})});
  const before = f.row(); const c = f.client('recovery', 1, START + WINDOW);
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  assert.deepEqual(withoutClaim(f.row()), withoutClaim(before));
  const operation = await c.repo.queryAuthoritativeOperationById(OP);
  assert.equal(c.repo.isOperationTerminal(operation), true);
  assert.equal(operation.messageGroupMembershipPermit, before[PERMIT_COLUMN]);
});

test('phase change racing successor CAS fences the stale holder update', async (t) => {
  const f = fixture(t); await owned(f);
  const c = f.client('next', 1, START + WINDOW); const gate = barrier();
  c.hooks.beforeWrite = gate.stop; const attempt = c.repo.claimMessageGroupMembershipOwner(OP);
  await gate.entered; const before = f.row()[CLAIM_COLUMN];
  f.patch({message_group_membership_phase: 'learner_proposal_in_flight',
    message_group_membership_obligation_state: 'unknown', [PERMIT_COLUMN]: '{"issued":true}'});
  gate.release(); assert.equal((await attempt).outcome, CONFLICT);
  assert.equal(f.row()[CLAIM_COLUMN], before);
});

test('lost write response resolves from the exact authoritative claim', async (t) => {
  const f = fixture(t); const c = f.client();
  c.hooks.afterWrite = () => ({success: false, unknownMutationOutcome: true,
    error: 'injected response loss'});
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).generation, 1);
});

test('unknown write and old row never grant; delayed losing SQL stays fenced', async (t) => {
  const f = fixture(t); f.patch({lease_expires_at: null}); const a = f.client('a');
  let delayed;
  a.hooks.beforeWrite = (sql, params) => {
    delayed = () => execute(f.db, sql, params);
    return {success: false, unknownMutationOutcome: true, error: 'delayed SQL'};
  };
  assert.equal((await a.repo.claimMessageGroupMembershipOwner(OP)).outcome, UNKNOWN);
  const b = f.client('b');
  assert.equal((await b.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
  assert.equal(delayed().affectedRows, 0);
  assert.equal(JSON.parse(f.row()[CLAIM_COLUMN]).ownerNodeId, 'b');
});

test('unavailable readback and changed boot after commit cannot grant', async (t) => {
  for (const fault of ['unavailable', 'changed-boot']) {
    await t.test(fault, async (t) => {
      const f = fixture(t); const c = f.client();
      c.hooks.afterWrite = () => {
        if (fault === 'changed-boot') f.boot(SOURCE_NODE, 2);
        else c.hooks.read = () => ({success: false, error: 'unavailable'});
      };
      assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, UNAVAILABLE);
      assert.notEqual(f.row()[CLAIM_COLUMN], null, 'write may commit without an actionable result');
    });
  }
});

test('expired readback cannot return a live claim', async (t) => {
  const f = fixture(t); const c = f.client();
  c.hooks.afterWrite = () => c.clock.advance(WINDOW);
  assert.notEqual((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, HELD);
});

test('null terminal claim, resolved debt and inconsistent identities fail closed', async (t) => {
  const mutations = [
    {status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED, completed_at: START},
    {message_group_membership_lane_key: null},
    {message_group_membership_obligation_state: 'resolved_absent'},
    {[PERMIT_COLUMN]: '{"unexpected":true}'},
    {message_group_learner_stamp: '{}'},
    {source_replica_id: 'some-other-source'},
    {message_group_source_lifecycle_claim: '{"replicaId":"wrong"}'},
    {[CLAIM_COLUMN]: '{"generation":1}'},
  ];
  for (const [i, mutation] of mutations.entries()) await t.test(String(i), async (t) => {
    const f = fixture(t); const c = f.client(); f.patch(mutation);
    const before = f.row(); const result = await c.repo.claimMessageGroupMembershipOwner(OP);
    assert.ok([INVALID, CONFLICT].includes(result.outcome));
    assert.deepEqual(f.row(), before); assert.equal(c.hooks.writes.length, 0);
  });
});

test('generation and clock overflow cannot wrap a holder claim', async (t) => {
  const f = fixture(t); const c = await owned(f);
  const previous = JSON.parse(f.row()[CLAIM_COLUMN]);
  f.patch({[CLAIM_COLUMN]: JSON.stringify({...previous, generation: Number.MAX_SAFE_INTEGER})});
  c.clock.advance(1);
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, INVALID);
  f.patch({[CLAIM_COLUMN]: null});
  const far = f.client('far', 1, Number.MAX_SAFE_INTEGER - 1);
  assert.equal((await far.repo.claimMessageGroupMembershipOwner(OP)).outcome, INVALID);
});

test('shutdown cannot claim', async (t) => {
  const f = fixture(t); const c = f.client(); c.repo.markShuttingDown();
  assert.equal((await c.repo.claimMessageGroupMembershipOwner(OP)).outcome, UNAVAILABLE);
  assert.equal(c.hooks.writes.length, 0);
});
