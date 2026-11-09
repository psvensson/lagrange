/**
 * Replica admission from the committed replica operation (quest
 * replica-admission-from-committed-operation, evidence/transition.md §4a,
 * lead decision 2026-11-02 Option 1):
 *
 *   (a) a leader whose services cache holds NO row for the target admits it
 *       from an ADMIT_REPLICA request whose committed operation names it; the
 *       committed node is the operation's target node
 *   (b) a services row alone (no request, no committed operation) proposes
 *       nothing; a request whose committed operation is terminal is refused
 *       OPERATION_NOT_ADMITTING and proposes nothing
 *   (c) a replica that does not lead answers NOT_LEADER before any read
 *   (d) an unavailable authority answers AUTHORITY_UNAVAILABLE, typed, with
 *       a retry hint, and proposes nothing
 *   (e) a stale services row naming another node never changes the
 *       committed node: it is the operation's target node
 *   (f) static, over the parsed sources: the only producer of a partition
 *       admission is the request owner; no services-cache event reaches
 *       admitPartitionRaftPeer, and the one cache read on the admission path
 *       is the named refuse-only exemption groupRetiringRefusal
 *   (g) the target asks its leader with exactly {partitionId,
 *       replicaIdentity, operationId}; a NOT_LEADER / AUTHORITY_UNAVAILABLE
 *       answer leaves the request pending for the existing learner cadence,
 *       ALREADY_MEMBER / PROPOSED / IN_FLIGHT settle it
 *   (h) the request is idempotent: a repeat while the admission is applied
 *       answers ALREADY_MEMBER and proposes nothing more (R14)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import * as espree from 'espree';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  committedMembershipContext,
  encodeCommittedAdmissionContext,
} from '../../src/raft/raft-rs-committed-membership-context.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {redriveAcceptedAdmissionRequests} from
  '../../src/partition/partition-replica-admission.js';
import {settledTurn} from '../../src/raft/raft-rs-turn-answer.js';

const PARTITION_ID = 'sql_transactions-p1';
const LEADER_REPLICA = 'sql_transactions-p1-r1';
const TARGET_REPLICA = 'sql_transactions-p1-r4';
const STRANGER_REPLICA = 'sql_transactions-p1-r9';
const LEADER_NODE = 'node-1';
const TARGET_NODE = 'node-2';
const STALE_NODE = 'node-9';
const OPERATION_ID = 'c44b07a7-c09a-4925-9181-7729739b677a';
const ADMIT_REPLICA = 'ADMIT_REPLICA';
const OUTCOME = Object.freeze({
  NOT_LEADER: 'not_leader',
  OPERATION_NOT_ADMITTING: 'operation_not_admitting',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  ALREADY_MEMBER: 'already_member',
  IN_FLIGHT: 'in_flight',
  PROPOSED: 'proposed',
  REFUSED: 'refused',
});
const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const TEMP_PREFIX = 'replica-admission-operation-';
const SETTLE_TURNS = 5;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function partitionAddress(nodeId, replicaId) {
  return `${nodeId}/partition/${replicaId}`;
}

function createServicesCache(rows = []) {
  const services = new Map(rows.map((row) => [row.service_id, row]));
  const tableOf = (table) => table === TABLES.SERVICES ? services : new Map();
  return {
    rows: services,
    get: (table, key) => tableOf(table).get(key) || null,
    getAll: (table) => [...tableOf(table).values()],
    filter: (table, predicate) =>
      [...tableOf(table).values()].filter(predicate),
    subscribe: () => () => {},
  };
}

function syncingServiceRow(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    address: partitionAddress(nodeId, replicaId),
    status: 'syncing',
  };
}

function operationRow(overrides = {}) {
  return {
    operation_id: OPERATION_ID,
    type: 'ADD',
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: PARTITION_ID,
    partition_id: PARTITION_ID,
    replica_id: TARGET_REPLICA,
    target_node_id: TARGET_NODE,
    status: 'syncing',
    workflow_step: 'SYNCING',
    ...overrides,
  };
}

// The authoritative control-plane read, as the gateway answers it:
// {success: true, rows} or {success: false, error}.
function createGateway(answer) {
  const gateway = {
    reads: [],
    async readAuthoritativeRows(tableName, sql, params, options) {
      gateway.reads.push({tableName, sql, params, options});
      return typeof answer === 'function' ? answer(params) : answer;
    },
  };
  return gateway;
}

// A leader's port over a real durable identity registry. An admission is
// the port's own path: the committed admission context applied into the
// registry (raft-rs-operation-port.js normalizedConfChange).
function createLeaderPort({registry, role}) {
  const port = {
    role,
    registry,
    proposals: [],
    learners: new Set(),
    membershipReads: 0,
    proposeConfChange(change) {
      port.proposals.push(change);
      const peerId = port.registry.registerReplica(change.replicaIdentity);
      const context = committedMembershipContext({
        context: encodeCommittedAdmissionContext({
          replicaIdentity: change.replicaIdentity, peerId,
          nodeId: change.nodeId}),
        changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
          nodeId: peerId}]});
      port.registry.reserveCommittedReplica(context.replicaIdentity,
        context.peerId);
      port.registry.recordCommittedNodeId(context.replicaIdentity,
        context.nodeId);
      port.learners.add(change.replicaIdentity);
      // The port answers a named turn (raft-rs-turn-answer.js).
      return settledTurn(Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}));
    },
    readStatus() {
      return Object.freeze({
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        role: port.role,
        term: 2,
        commitIndex: 10,
        appliedIndex: 10,
        peers: [...port.learners].map((replicaIdentity) =>
          ({replicaIdentity})),
        followerProgress: {},
      });
    },
    subscribe: () => () => {},
  };
  return port;
}

function createLeader({cacheRows = [], role = RAFT_ROLE.LEADER,
  gateway = createGateway({success: true, rows: [operationRow()]})} = {}) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX)), 'replica.db');
  const registry = new RaftRsPeerIdentityRegistry(new Database(file));
  registry.registerReplica(LEADER_REPLICA);
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: 'sql_transactions',
    replicaId: LEADER_REPLICA,
    replicaIds: [LEADER_REPLICA],
    nodeId: LEADER_NODE,
    dbPath: ':memory:',
  }));
  const port = createLeaderPort({registry, role});
  partition.raft = port;
  partition.isLeader = role === RAFT_ROLE.LEADER;
  partition.systemTableCache = createServicesCache(cacheRows);
  partition.controlPlaneSystemTableGateway = gateway;
  return {partition, port, gateway};
}

function admitRequest(overrides = {}) {
  return {
    type: ADMIT_REPLICA,
    partitionId: PARTITION_ID,
    replicaIdentity: TARGET_REPLICA,
    operationId: OPERATION_ID,
    ...overrides,
  };
}

async function settle() {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function ask(partition, overrides = {}) {
  const answer = await partition.handleApplicationMessage(
    admitRequest(overrides));
  await settle();
  return answer;
}

test('(a) a leader with no services row for the target admits it from the ' +
  'committed operation, on the operation\'s target node', async (t) => {
  const {partition, port, gateway} = createLeader();
  const answer = await ask(partition);
  t.equal(answer?.admission?.outcome, OUTCOME.PROPOSED,
    'the committed operation admits the target without any cache row');
  t.same(port.proposals.map((change) => change.replicaIdentity),
    [TARGET_REPLICA], 'exactly one ADD is proposed, for the target');
  t.equal(port.registry.committedNodeIdOf(TARGET_REPLICA), TARGET_NODE,
    'the committed node is the operation\'s target node');
  t.same(gateway.reads.map((read) => read.params), [[OPERATION_ID]],
    'the decision read the committed operation by its id');
});

test('(b) a services row alone proposes nothing; a terminal operation is ' +
  'refused OPERATION_NOT_ADMITTING', async (t) => {
  const row = syncingServiceRow(STRANGER_REPLICA, TARGET_NODE);
  const {partition, port} = createLeader({cacheRows: [row],
    gateway: createGateway({success: true,
      rows: [operationRow({status: 'failed', workflow_step: 'FAILED'})]})});
  partition.handleSystemTableCacheChange(TABLES.SERVICES, 'insert', row);
  await settle();
  t.same(port.proposals, [],
    'a services row is discovery: it never proposes a vote');
  const answer = await ask(partition);
  t.equal(answer?.admission?.outcome, OUTCOME.OPERATION_NOT_ADMITTING,
    'a terminal operation admits nothing, typed');
  t.same(port.proposals, [], 'and proposes nothing');
});

test('(c) a replica that does not lead answers NOT_LEADER before any read',
  async (t) => {
    const {partition, port, gateway} = createLeader({role: RAFT_ROLE.FOLLOWER});
    const answer = await ask(partition);
    t.equal(answer?.admission?.outcome, OUTCOME.NOT_LEADER,
      'leadership is decided first');
    t.equal(gateway.reads.length, 0, 'no authority read precedes it');
    t.same(port.proposals, [], 'nothing is proposed');
  });

test('(d) an unavailable authority answers AUTHORITY_UNAVAILABLE, typed, ' +
  'and proposes nothing', async (t) => {
  const {partition, port} = createLeader({gateway: createGateway(
    {success: false, error: 'authoritative_row_source_unavailable',
      outcome: 'owner_not_ready'})});
  const answer = await ask(partition);
  t.equal(answer?.admission?.outcome, OUTCOME.AUTHORITY_UNAVAILABLE,
    'a failed read is typed unavailability, never a refusal of the operation');
  t.ok(Number.isSafeInteger(answer?.admission?.retryAfterMs) &&
    answer.admission.retryAfterMs > 0, 'it carries a retry hint');
  t.equal(answer?.admission?.reason, 'authoritative_row_source_unavailable',
    'it names the read\'s own reason');
  t.equal(answer?.admission?.readOutcome, 'owner_not_ready',
    'it carries the gateway\'s typed read outcome');
  t.same(port.proposals, [], 'nothing is proposed');
});

test('(e) a stale services row never changes the committed node',
  async (t) => {
    const {partition, port} = createLeader({
      cacheRows: [syncingServiceRow(TARGET_REPLICA, STALE_NODE)]});
    await settle();
    const answer = await ask(partition);
    t.equal(answer?.admission?.outcome, OUTCOME.PROPOSED,
      'the request admits the target');
    t.equal(port.registry.committedNodeIdOf(TARGET_REPLICA), TARGET_NODE,
      'the node comes from the committed operation, never from the row');
    t.notOk(port.proposals.some((change) => change.nodeId === STALE_NODE),
      'no proposal names the row\'s node');
  });

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (fs.statSync(file).isDirectory()) {
      files.push(...sourceFiles(file));
    } else if (file.endsWith('.js')) {
      files.push(file);
    }
  }
  return files;
}

function parse(file) {
  return espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest', sourceType: 'module', range: true});
}

// Every node of an AST, with its ancestor chain.
function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  const chain = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'range') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, chain);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, chain);
    }
  }
}

function calleeName(node) {
  if (node.type !== 'CallExpression') return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  if (node.callee.type === 'MemberExpression' &&
      node.callee.property.type === 'Identifier') {
    return node.callee.property.name;
  }
  return null;
}

function enclosingFunctionName(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    if (node.type === 'FunctionDeclaration' && node.id) return node.id.name;
    if (node.type === 'MethodDefinition' && node.key.type === 'Identifier') {
      return node.key.name;
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' &&
        /FunctionExpression$/.test(node.init?.type ?? '')) {
      return node.id.name;
    }
  }
  return '<module>';
}

function functionNodesNamed(ast, name) {
  const found = [];
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) {
      found.push(node);
    }
    if (node.type === 'MethodDefinition' && node.key?.name === name) {
      found.push(node);
    }
  });
  return found;
}

// A reference to the cache by property name, dotted or computed with a
// string key (service['systemTableCache']; attempt-1 verifier residual R3),
// or any identifier named systemTableCache.
function referencesCache(fnNode) {
  let reads = false;
  walk(fnNode, (node) => {
    if (node.type === 'MemberExpression') {
      const key = node.computed ?
        (node.property.type === 'Literal' ? node.property.value : null) :
        node.property.name;
      if (key === 'systemTableCache') reads = true;
    }
    if (node.type === 'Identifier' && node.name === 'systemTableCache') {
      reads = true;
    }
  });
  return reads;
}

test('(f) static: the request owner is the only producer of a partition ' +
  'admission and no services-cache event or cache read reaches it',
async (t) => {
  const asts = new Map(sourceFiles(SRC_ROOT).map((file) =>
    [file.slice(SRC_ROOT.length), parse(file)]));
  const callers = [];
  for (const [file, ast] of asts) {
    walk(ast, (node, ancestors) => {
      if (calleeName(node) === 'admitPartitionRaftPeer') {
        callers.push(`${file}#${enclosingFunctionName(ancestors)}`);
      }
    });
  }
  t.same(callers, ['partition/partition-replica-admission.js#' +
    'admissionAnswer'],
  'exactly one call site admits a partition peer: the request owner');
  const answerCallers = [];
  walk(asts.get('partition/partition-replica-admission.js'),
    (node, ancestors) => {
      if (calleeName(node) === 'admissionAnswer') {
        answerCallers.push(enclosingFunctionName(ancestors));
      }
    });
  t.same(answerCallers, ['admitFromCommittedOperation'],
    'and only the committed-operation decision reaches it');

  const ownerAst = asts.get('partition/partition-replica-admission.js');
  t.ok(ownerAst, 'the request owner module exists');
  if (ownerAst) {
    const owner = functionNodesNamed(ownerAst, 'admitFromCommittedOperation');
    t.equal(owner.length, 1, 'the owner function is declared once');
    t.notOk(referencesCache(ownerAst),
      'no function of the request owner module touches a services cache ' +
      '(no cache fallback on an unavailable authority)');
  }

  // The one exemption, explicit and reasoned (lead decision 2026-11-02,
  // R17 finding for the projection-authority census): groupRetiringRefusal
  // reads the cache, refuse-only, owned by the group-retirement owner. No
  // other function on the admission path reads it.
  const administration = asts.get(
    'partition/partition-service-raft-membership-administration.js');
  const admissionPath = ['admitPartitionRaftPeer',
    'reservePartitionRaftPeerIdentity', 'admissionGroupOf',
    'groupRetiringRefusal'];
  const cacheReaders = admissionPath.filter((name) =>
    functionNodesNamed(administration, name).some(referencesCache));
  t.same(cacheReaders, ['groupRetiringRefusal'],
    'the only cache read on the admission path is the refuse-only ' +
    'group-retiring fence (named exemption)');

  const reconcileReferences = [];
  for (const [file, ast] of asts) {
    walk(ast, (node) => {
      if (node.type === 'Identifier' &&
          /^reconcileRaftPeersFromCache(ForService)?$|^scheduleRaftPeerReconciliation$/
            .test(node.name)) {
        reconcileReferences.push(`${file}:${node.name}`);
      }
    });
  }
  t.same(reconcileReferences.filter((entry) =>
    entry.startsWith('partition/')), [],
  'the cache-row admission producer is gone from src/partition');

  const coreBase = asts.get('partition/partition-service-core-base.js');
  const cacheHandlers = functionNodesNamed(coreBase,
    'handleSystemTableCacheChange');
  t.equal(cacheHandlers.length, 1, 'one services-cache handler');
  const calls = [];
  walk(cacheHandlers[0], (node) => {
    const name = calleeName(node);
    if (name) calls.push(name);
  });
  t.notOk(calls.some((name) => /admit|reconcileRaftPeers|schedule.*Reconcil/
    .test(name)),
  `a services-cache event triggers no admission (calls: ${calls.join(',')})`);
});

// The committed-membership stamp a CREATE target is created from: the
// group leader's committed read at creation, naming that leader and every
// member's committed node (quest peer-and-leader-address-from-committed-
// configuration, attempt 2: the target asks the leader its stamp names).
const STAMP_MEMBERS = Object.freeze({
  [LEADER_REPLICA]: LEADER_NODE, 'sql_transactions-p1-r2': 'node-3'});
function committedCreationStamp(leaderId = LEADER_REPLICA) {
  const voters = Object.keys(STAMP_MEMBERS).map(deriveRaftRsPeerId).sort();
  return {kind: 'committed', voters, votersOutgoing: [], learners: [],
    learnersNext: [], appliedIndex: 5,
    configurationKey: raftRsConfStateKey({voters, votersOutgoing: [],
      learners: [], learnersNext: [], autoLeave: false}),
    membershipGenerationIndex: 1, commitIndex: 5, term: 2, leaderId,
    gateOpen: true,
    identities: Object.fromEntries(Object.keys(STAMP_MEMBERS).map((id) =>
      [deriveRaftRsPeerId(id), id])),
    nodeIds: Object.fromEntries(Object.entries(STAMP_MEMBERS).map(
      ([id, node]) => [deriveRaftRsPeerId(id), node]))};
}

// The target side: a learner partition service that recorded its SYNCING
// fact asks the leader its committed-membership stamp names to admit it.
function createTarget({answers}) {
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: 'sql_transactions',
    replicaId: TARGET_REPLICA,
    replicaIds: [TARGET_REPLICA],
    nodeId: TARGET_NODE,
    dbPath: ':memory:',
    bootstrapMembership: committedCreationStamp(),
  }));
  const sent = [];
  partition.transport = {
    async deliver(address, payload) {
      sent.push({address, payload});
      const admission = answers.shift();
      return buildDeliveryEnvelope({acknowledged: true}, {
        partitionId: PARTITION_ID, replicaIdentity: TARGET_REPLICA,
        operationId: OPERATION_ID, admission});
    },
  };
  return {partition, sent};
}

test('(g) the target asks its leader with exactly the committed operation ' +
  'and keeps the request until an admitting answer', async (t) => {
  const {partition, sent} = createTarget({answers: [
    {outcome: OUTCOME.NOT_LEADER, leaderId: LEADER_REPLICA},
    {outcome: OUTCOME.AUTHORITY_UNAVAILABLE, retryAfterMs: 100},
    {outcome: OUTCOME.PROPOSED},
    {outcome: OUTCOME.ALREADY_MEMBER}]});
  t.equal(typeof partition.requestReplicaAdmission, 'function',
    'the target owns an admission request');
  if (typeof partition.requestReplicaAdmission !== 'function') return;
  await partition.requestReplicaAdmission(OPERATION_ID);
  t.same(sent[0]?.payload, admitRequest(),
    'the request names partition, replica identity and operation only');
  t.equal(sent[0]?.address, partitionAddress(LEADER_NODE, LEADER_REPLICA),
    'it goes to the leader its committed-membership stamp names');
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'NOT_LEADER leaves it pending');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'AUTHORITY_UNAVAILABLE leaves it pending, never failed');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'an uncommitted PROPOSED answer keeps responsibility pending until committed');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'admitted',
    'committed membership (ALREADY_MEMBER) settles it');
  await partition.driveReplicaAdmission();
  t.equal(sent.length, 4, 'a settled request is not sent again');
});

test('(h) a repeated request is idempotent: ALREADY_MEMBER, no second ' +
  'proposal', async (t) => {
  const {partition, port} = createLeader();
  const first = await ask(partition);
  t.equal(first?.admission?.outcome, OUTCOME.PROPOSED, 'first admits');
  const again = await ask(partition);
  t.equal(again?.admission?.outcome, OUTCOME.ALREADY_MEMBER,
    'a repeat answers ALREADY_MEMBER');
  t.equal(port.proposals.length, 1, 'and proposes nothing more');
  t.equal(port.registry.committedNodeIdOf(TARGET_REPLICA), TARGET_NODE,
    'the committed node is unchanged');
  t.equal(deriveRaftRsPeerId(TARGET_REPLICA).length > 0, true,
    'the identity is reserved once');
});

// The target asks only once its SYNCING fact is committed (verifier N3: a
// replica whose port-opened fact is not durable steps nothing, so it must
// not be counted a member): in createReplicaAsync the request follows the
// SYNCING commit (recordReplicaIdentity) and precedes the voter-ready wait
// (the dead leader sync from a cached leader address is deleted, quest
// peer-and-leader-address-from-committed-configuration attempt 2). This is the one point at which a partition
// admission input first exists (Stream B2 binds its cleanup state to it).
test('(i) static: the target requests admission right after its SYNCING ' +
  'commit and before it waits to become a voter', async (t) => {
  const ast = parse(path.join(SRC_ROOT, 'node/replica-handler-create-methods.js'));
  const [create] = functionNodesNamed(ast, 'createReplicaAsync');
  t.ok(create, 'createReplicaAsync is declared');
  const order = [];
  walk(create, (node) => {
    const name = calleeName(node);
    if (['recordReplicaIdentity', 'requestReplicaAdmission', 'syncFromLeader',
      'waitForVoterReadyActivation'].includes(name)) {
      // syncFromLeader stays in the list so a reintroduced call is seen.
      order.push([node.range[0], name]);
    }
  });
  t.same(order.sort((a, b) => a[0] - b[0]).map(([, name]) => name),
    ['recordReplicaIdentity', 'requestReplicaAdmission',
      'waitForVoterReadyActivation'],
    'SYNCING commit, then the admission request, then the voter wait');
});

// A request answered NOT_ADMITTING must not be admitted on a row that names
// another replica, another partition, or by a node the request supplies.
test('(j) forged requests: another replica, another partition, or a ' +
  'request-supplied node never admit', async (t) => {
  const foreignTarget = createLeader({gateway: createGateway({success: true,
    rows: [operationRow({replica_id: STRANGER_REPLICA})]})});
  const asTarget = await ask(foreignTarget.partition);
  t.equal(asTarget?.admission?.outcome, OUTCOME.OPERATION_NOT_ADMITTING,
    'an operation naming another replica admits nothing');
  t.equal(asTarget?.admission?.reason, 'operation_target', 'named target');
  const foreignPartition = createLeader({gateway: createGateway({success: true,
    rows: [operationRow({partition_id: 'sql_transactions-p9'})]})});
  const asPartition = await ask(foreignPartition.partition);
  t.equal(asPartition?.admission?.outcome, OUTCOME.OPERATION_NOT_ADMITTING,
    'an operation of another partition admits nothing');
  t.equal(asPartition?.admission?.reason, 'operation_partition',
    'named partition');
  t.same([...foreignTarget.port.proposals, ...foreignPartition.port.proposals],
    [], 'no forged request reached the port');
  const supplied = createLeader();
  const answer = await ask(supplied.partition, {nodeId: STALE_NODE});
  t.equal(answer?.admission?.outcome, OUTCOME.PROPOSED, 'admitted');
  t.equal(supplied.port.registry.committedNodeIdOf(TARGET_REPLICA),
    TARGET_NODE, 'the committed node is the row\'s, never the request\'s');
});

test('(k) a terminal operation settles the request: no read on re-drive',
  async (t) => {
    const gateway = createGateway({success: true,
      rows: [operationRow({workflow_step: 'FAILED', status: 'failed'})]});
    const {partition} = createLeader({gateway});
    const answer = await ask(partition);
    t.equal(answer?.admission?.outcome, OUTCOME.OPERATION_NOT_ADMITTING,
      'the terminal operation refuses');
    const readsBefore = gateway.reads.length;
    redriveAcceptedAdmissionRequests(partition);
    await settle();
    t.equal(gateway.reads.length, readsBefore,
      'the settled request is not re-read on the next re-drive');
  });

// Attempt-1 verifier residual R1 (mutants N5/N6): a settled answer drops the
// request from the kept set, so the next re-drive reads nothing for it.
// A settled ALREADY_MEMBER request is not kept: when the member later
// leaves the configuration, a re-drive must not read or re-admit it from
// the old request (a kept one would, since it is no longer a member).
test('(n) an ALREADY_MEMBER answer settles the request: after the member ' +
  'leaves, a re-drive reads nothing and re-admits nothing', async (t) => {
  const {partition, port, gateway} = createLeader();
  await ask(partition);
  const again = await ask(partition);
  t.equal(again?.admission?.outcome, OUTCOME.ALREADY_MEMBER,
    'the repeat answers ALREADY_MEMBER');
  port.learners.delete(TARGET_REPLICA);
  const readsBefore = gateway.reads.length;
  const proposalsBefore = port.proposals.length;
  redriveAcceptedAdmissionRequests(partition);
  await settle();
  t.equal(gateway.reads.length, readsBefore,
    'the settled request is not re-read on the next re-drive');
  t.equal(port.proposals.length, proposalsBefore,
    'and the departed member is not re-admitted from it');
});

test('(o) a port-REFUSED answer settles the request: no read on re-drive',
  async (t) => {
    const {partition, port, gateway} = createLeader();
    port.proposeConfChange = (change) => {
      port.proposals.push(change);
      return settledTurn(Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        reason: 'refused_for_witness'}));
    };
    const answer = await ask(partition);
    t.equal(answer?.admission?.outcome, OUTCOME.REFUSED,
      'the port refusal answers REFUSED');
    const readsBefore = gateway.reads.length;
    redriveAcceptedAdmissionRequests(partition);
    await settle();
    t.equal(gateway.reads.length, readsBefore,
      'the settled request is not re-read on the next re-drive');
  });

test('(l) a replica keeps only well-formed requests of its own partition; ' +
  'misrouted or malformed ones cost no read when it gains leadership',
async (t) => {
  const gateway = createGateway({success: true, rows: [operationRow()]});
  const {partition, port} = createLeader({role: RAFT_ROLE.FOLLOWER, gateway});
  for (let index = 0; index < 50; index += 1) {
    const misrouted = await ask(partition, {partitionId: `other-p${index}`,
      replicaIdentity: `forged-${index}`});
    t.equal(misrouted?.admission?.outcome, 'request_invalid',
      'a request of another partition is refused');
  }
  const malformed = await ask(partition, {operationId: ''});
  t.equal(malformed?.admission?.reason, 'request_shape',
    'a malformed request is refused by shape');
  const kept = await ask(partition);
  t.equal(kept?.admission?.outcome, OUTCOME.NOT_LEADER,
    'a well-formed request of this partition is answered NOT_LEADER');
  port.role = RAFT_ROLE.LEADER;
  partition.isLeader = true;
  redriveAcceptedAdmissionRequests(partition);
  await settle();
  t.equal(gateway.reads.length, 1,
    'on leadership only the one kept request is read');
  t.same(port.proposals.map((change) => change.replicaIdentity),
    [TARGET_REPLICA], 'and only it is admitted');
});

test('(m) a NOT_LEADER answer moves the target to the committed member it ' +
  'names; a misrouted answer sends it back to its committed membership',
async (t) => {
  const NEW_LEADER = 'sql_transactions-p1-r2';
  const {partition, sent} = createTarget({answers: [
    {outcome: OUTCOME.NOT_LEADER, leaderId: NEW_LEADER},
    {outcome: OUTCOME.PROPOSED},
    {outcome: OUTCOME.ALREADY_MEMBER}]});
  await partition.requestReplicaAdmission(OPERATION_ID);
  t.equal(sent[0]?.address, partitionAddress(LEADER_NODE, LEADER_REPLICA),
    'the first send goes to the stamp leader');
  t.same({...partition.replicaAdmissionRequest?.leaderHint},
    {replicaIdentity: NEW_LEADER, address: partitionAddress('node-3', NEW_LEADER)},
    'the hint names a committed member and is followed at its committed node');
  t.equal(partition.leaderId, null, 'no cached leader id is seeded from a hint');
  await partition.driveReplicaAdmission();
  t.equal(sent[1]?.address, partitionAddress('node-3', NEW_LEADER),
    'the next send reaches the new leader within one cadence step');
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'PROPOSED keeps responsibility pending until committed');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'admitted', 'admitted');

  const stranger = createTarget({answers: [
    {outcome: OUTCOME.NOT_LEADER, leaderId: 'sql_transactions-p1-r9'}]});
  await stranger.partition.requestReplicaAdmission(OPERATION_ID);
  t.equal(stranger.partition.replicaAdmissionRequest?.leaderHint, null,
    'a hint naming a replica outside the committed configuration is ignored');
  t.equal(stranger.partition.replicaAdmissionRequest?.rereadStamp, true,
    'and the target reads its committed membership again on its next cadence');

  const misrouted = createTarget({answers: []});
  misrouted.partition.transport.deliver = async () => buildDeliveryEnvelope(
    {acknowledged: true}, {partitionId: 'other-p1',
      replicaIdentity: TARGET_REPLICA, operationId: OPERATION_ID,
      admission: {outcome: 'request_invalid', reason: 'partition_mismatch'}});
  await misrouted.partition.requestReplicaAdmission(OPERATION_ID);
  t.equal(misrouted.partition.replicaAdmissionRequest?.rereadStamp, true,
    'a response bound to another partition sends the target back to its ' +
    'committed membership');
  t.equal(misrouted.partition.replicaAdmissionRequest?.state, 'pending',
    'and the request stays pending');
});

test('(p) leadership change after uncommitted PROPOSED or IN_FLIGHT re-drives ' +
  'to the new leader until ALREADY_MEMBER or local committed ConfState settles it',
async (t) => {
  const NEW_LEADER = 'sql_transactions-p1-r2';
  const {partition, sent} = createTarget({answers: [
    {outcome: OUTCOME.PROPOSED},
    {outcome: OUTCOME.IN_FLIGHT},
    {outcome: OUTCOME.NOT_LEADER, leaderId: NEW_LEADER},
    {outcome: OUTCOME.PROPOSED},
    {outcome: OUTCOME.ALREADY_MEMBER}]});
  await partition.requestReplicaAdmission(OPERATION_ID);
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'PROPOSED from old leader does not settle the request before commit');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'IN_FLIGHT from old leader does not settle the request before commit');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'leadership change before commit leaves the request pending with new leader hint');
  t.same({...partition.replicaAdmissionRequest?.leaderHint},
    {replicaIdentity: NEW_LEADER, address: partitionAddress('node-3', NEW_LEADER)},
    'the target follows the new committed leader that was never asked before');
  await partition.driveReplicaAdmission();
  t.equal(sent[3]?.address, partitionAddress('node-3', NEW_LEADER),
    'the re-driven request is sent to the new leader');
  t.equal(partition.replicaAdmissionRequest?.state, 'pending',
    'the new leader proposal stays pending until committed');
  await partition.driveReplicaAdmission();
  t.equal(partition.replicaAdmissionRequest?.state, 'admitted',
    'ALREADY_MEMBER from the new leader settles the request');
});
