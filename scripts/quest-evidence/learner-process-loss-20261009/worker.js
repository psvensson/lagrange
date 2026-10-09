/** Test worker: actual native commit, canonical file-backed operation repository.
 * A parent SIGKILL, not a graceful close, separates issuance from recovery.
 * The node/metadata gateway is local fixture physics, not distributed SQL/RPC.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW} from
  './learner-operation-fixture.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {RAFT_OPERATION_PORT_REQUEST as FIELD} from '../../src/raft/raft-operation-port-request.js';
import {BOOTSTRAP_MEMBERSHIP_SOURCE, COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON} from '../../src/raft/raft-operation-port-constants.js';
import {PARTITION_TIMING} from '../raft/raft-rs-backend/partition-node-cluster.js';

refuseUnderProbe('learner process-loss worker');
const [mode, scratch, scenario] = process.argv.slice(2);
const noLog = {debug() {}, info() {}, warn() {}, error() {}};
const cleanup = [];
const life = {after: (callback) => cleanup.push(callback)};
const notify = (message) => new Promise((resolve, reject) => {
  process.send(message, (error) => error ? reject(error) : resolve());
});
function query(request) {
  const identity = JSON.parse(request.identity);
  const permit = JSON.parse(request.permit);
  return {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION, groupId: GROUP,
    action: {operationId: O, transitionIdentity: identity.transitionIdentity,
      permitSequence: permit.permitSequence, stage: permit.permitStage,
      replicaIdentity: TARGET, peerId: identity.targetPeerId}};
}
function ordinaryAndDebt(row) {
  const result = {...row};
  for (const key of ['message_group_membership_owner_claim', 'message_group_membership_phase',
    'message_group_membership_permit', 'message_group_learner_stamp']) delete result[key];
  return result;
}
async function pauseAtCut(f, native, cut) {
  assert.equal(f.db.inTransaction, false, 'operation row must be committed at the cut');
  const files = FOUNDERS.map((id) => ({id, file: f.cluster.replica(id).dbFile}));
  assert.equal(files.length, 3);
  const state = {kind: 'cut', cut, scenario, pid: process.pid, request: f.request,
    operationFile: f.db.name, nativeFiles: files, sourceReplica: f.leader,
    native, row: f.row(), proposalCount: f.proposalCount(), ownerNodeId: NODE,
    inTransaction: f.db.inTransaction};
  await notify(state);
  await new Promise(() => {});
}
async function writer() {
  const f = await fixture(life, {tempRoot: scratch});
  const proposed = await f.run();
  assert.equal(proposed.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
    f.cluster.node(id).readStatus().confState.learners.includes(deriveRaftRsPeerId(TARGET)))));
  const native = await f.port.readCommittedMembership(query(f.request));
  assert.equal(native.kind, 'committed-action', 'actual native origin must commit before cut');
  assert.equal(native.receipt.index, String(proposed.proposalIndex));
  assert.equal(f.row().message_group_learner_stamp, null);
  assert.equal(f.row().message_group_membership_phase, 'learner_proposal_in_flight');
  if (scenario === 'ordinary-failed') {
    const row = await f.repository.queryAuthoritativeOperationById(O);
    await f.repository.persistOperationUpdate({...row, status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED, updatedAt: NOW + 1, completedAt: NOW + 1},
    {confirmPersistence: false, disableSystemWriteSession: true, returnDisposition: true,
      expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
    assert.equal(f.row().workflow_step, WORKFLOW_STEP.FAILED);
  }
  if (scenario !== 'record-answer-lost') return pauseAtCut(f, native, 'native-committed-before-record');
  const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
  f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
    const result = await execute(sql, params, ...rest);
    if (sql.includes('message_group_learner_stamp = ?')) {
      assert.equal(f.row().message_group_membership_phase, 'learner_committed');
      assert.notEqual(f.row().message_group_learner_stamp, null);
      await pauseAtCut(f, native, 'operation-committed-before-answer');
    }
    return result;
  };
  await f.repository.recordMessageGroupLearnerOutcome(f.request,
    (request) => f.port.readCommittedMembership(request));
  assert.fail('writer returned without reaching its named interruption');
}
function openOperations(file, clock, nodeId) {
  const db = new Database(file, {fileMustExist: true});
  db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
  assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
  assert.equal(db.pragma('synchronous', {simple: true}), 2);
  life.after(() => db.close());
  let mutations = 0;
  const execute = (sql, params = []) => {
    const statement = db.prepare(sql);
    if (statement.reader) return {success: true, rows: statement.all(...params)};
    mutations += 1;
    return {success: true, affectedRows: statement.run(...params).changes};
  };
  const gateway = {executeQuery: async (sql, params) => execute(sql, params),
    readAuthoritativeRows: async (_table, sql, params) => execute(sql, params)};
  gateway.readRows = gateway.readAuthoritativeRows;
  const repository = new ReplicaOperationRepository({nodeId, membershipOwnerBootIncarnation: 1,
    timeSource: clock, controlPlaneSystemTableGateway: gateway, logger: noLog,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 0});
  return {db, repository, mutations: () => mutations,
    row: () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(O)};
}
function openNative(saved) {
  assert.ok(fs.statSync(saved.file).size > 0, 'recovery must use an existing native file');
  const db = new Database(saved.file, {fileMustExist: true});
  db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
  assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
  assert.equal(db.pragma('synchronous', {simple: true}), 2);
  let proposals = 0;
  setActualCoreEntryObserver(({operation}) => {
    if (operation === 'propose_conf_change_v2') proposals += 1;
  });
  const port = createRaftRsOperationPort({[FIELD.GROUP_ID]: GROUP,
    [FIELD.PEER_ID]: saved.id, [FIELD.PEER_ADDRESS]: `raft-rs://replica-${saved.id}`,
    [FIELD.BOOTSTRAP_PEER_IDS]: [],
    [FIELD.BOOTSTRAP_MEMBERSHIP]: {kind: BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD},
    [FIELD.IDENTITY_EXISTED]: true, [FIELD.JOINING_EXISTING_GROUP]: true,
    [FIELD.DURABLE_STORAGE]: db, [FIELD.TIMING]: PARTITION_TIMING,
    [FIELD.DEFER_ELECTION]: true, [FIELD.SEND_TO_PEER]: () => {},
    [FIELD.RESOLVE_PEER_ADDRESS]: (id) => `raft-rs://replica-${id}`,
    [FIELD.APPLY_COMMITTED_ENTRY]: () => assert.fail('read-only recovery must not apply new work'),
    [FIELD.SNAPSHOT_CATCHUP_NEEDED]: () => assert.fail('intact history needs no fabricated snapshot')});
  life.after(() => {port.close(); db.close();});
  return {port, proposals: () => proposals};
}
async function reader() {
  const cut = JSON.parse(fs.readFileSync(path.join(scratch, 'cut.json'), 'utf8'));
  assert.notEqual(process.pid, cut.pid, 'recovery must be a fresh operating-system process');
  const clock = new VirtualTimeSource({startMs: NOW});
  const f = openOperations(cut.operationFile, clock, SUCCESSOR);
  assert.deepEqual(f.row(), cut.row, 'durable row must survive actual SIGKILL unchanged');
  const claim = {operationId: O, identity: cut.request.identity,
    expectedClaim: cut.request.executionClaim};
  assert.equal((await f.repository.claimMessageGroupMembershipOwner(claim)).outcome, 'conflict',
    'different node cannot steal a still-live holder');
  assert.deepEqual(f.row(), cut.row, 'refused takeover must change nothing');
  const old = JSON.parse(claim.expectedClaim);
  clock.advance(old.expiresAt - clock.now() + 1);
  const adopted = await f.repository.claimMessageGroupMembershipOwner(claim);
  assert.equal(adopted.outcome, 'recorded', 'expired exact holder must be recoverable by its successor');
  const next = JSON.parse(adopted.claim);
  assert.equal(next.ownerNodeId, SUCCESSOR);
  assert.notEqual(next.ownerNodeId, old.ownerNodeId);
  assert.equal(next.generation, old.generation + 1);
  assert.equal(f.row().message_group_membership_permit, cut.row.message_group_membership_permit,
    'holder adoption must not refresh the original permit');
  let nativeReads = 0;
  const saved = cut.nativeFiles.find(({id}) => id !== cut.sourceReplica);
  const native = openNative(saved);
  const recovered = await native.port.readCommittedMembership(query(cut.request));
  assert.equal(recovered.kind, 'committed-action');
  assert.deepEqual(recovered.receipt, cut.native.receipt,
    'another replica must recover the original committed action without reissue');
  const read = (request) => {nativeReads += 1; return native.port.readCommittedMembership(request);};
  assert.equal((await f.repository.recordMessageGroupLearnerOutcome(cut.request, read)).outcome,
    'conflict', 'an old holder request cannot overwrite its successor');
  assert.equal(nativeReads, 0, 'stale holder must refuse before calling native evidence');
  const request = {...cut.request, executionClaim: adopted.claim};
  const recorded = await f.repository.recordMessageGroupLearnerOutcome(request, read);
  assert.equal(recorded.outcome, 'recorded', 'fresh holder must record the original action');
  const expected = {...JSON.parse(cut.request.permit), permitState: 'committed',
    proposalIndex: Number(cut.native.receipt.index)};
  assert.deepEqual(JSON.parse(f.row().message_group_membership_permit), expected);
  assert.equal(f.row().message_group_membership_phase, 'learner_committed');
  assert.deepEqual(ordinaryAndDebt(f.row()), ordinaryAndDebt(cut.row),
    'process recovery preserves ordinary history and every outstanding obligation');
  const readsBeforeReplay = nativeReads;
  const writesBeforeReplay = f.mutations();
  assert.equal((await f.repository.recordMessageGroupLearnerOutcome(request, read)).outcome, 'recorded');
  assert.equal(f.mutations(), writesBeforeReplay, 'exact replay must not write another row');
  assert.equal(nativeReads, readsBeforeReplay, 'exact replay must not reobserve or reissue');
  assert.equal(nativeReads, scenario === 'record-answer-lost' ? 0 : 1);
  assert.equal(native.proposals(), 0, 'process recovery must make zero native membership proposals');
  await notify({kind: 'recovered', scenario, pid: process.pid, writerPid: cut.pid,
    ownerNodeId: SUCCESSOR, previousOwner: old, holder: next, nativeReplica: saved.id,
    receipt: recovered.receipt, row: f.row(), nativeReads, proposals: native.proposals()});
}
async function main() {
  assert.ok(['pending', 'ordinary-failed', 'record-answer-lost'].includes(scenario));
  assert.ok(['writer', 'reader'].includes(mode));
  try {await (mode === 'writer' ? writer() : reader());}
  finally {
    for (const fn of cleanup.reverse()) await fn();
    process.disconnect?.();
  }
}
main().catch((error) => {console.error(error.stack); process.exitCode = 1;});
