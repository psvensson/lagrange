// W-FENCE (founding WP-V, placement P6, latch rev. 3 point B): the release
// version fence is one cluster format revision owned by the support-envelope
// owner, and it fails closed everywhere a node enters a cluster or a seed
// reopens its founding declaration.
//   - a new seed records the revision in its original allocation;
//   - a joiner carrying the revision is admitted, and the admission response
//     carries the admitting node's revision;
//   - a joiner without the claim, or with another revision, is refused typed
//     OUTSIDE_SUPPORT_ENVELOPE before the admission claim, the takeover
//     decision or any assignment, and a joiner refuses an admitting node of
//     another (or no) revision before it applies the response;
//   - a seed reopened on a retained allocation without the revision, or with
//     another one, is refused typed ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED
//     by the startup decision and by the preparation, before any founder opens;
//   - in-place upgrade and downgrade admit only a pair certified by an
//     envelope of this build's revision; without one they are refused.
// The real owners run: BootstrapService preparation over a real data
// directory, the BootstrapAPI request handler over HTTP inject, the joiner's
// ContactSeedPhase and the rolling-upgrade owner.
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {reserveBootIncarnation} from '../../src/bootstrap/boot-incarnation-owner.js';
import {resolveAutoRejoinStartupDecision} from '../../src/bootstrap/rejoin-hints.js';
import {readDurableServicesIdentitySnapshot} from
  '../../src/bootstrap/rejoin-hints-durable-evidence.js';
import {
  AUTO_REJOIN_DECISION_STATE, FORCE_NEW_CLUSTER_ENV,
  MEMBERSHIP_OWNER_OUTCOME_TYPE, STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {ContactSeedPhase} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {resolveStartupJoinDecision} from '../../src/entrypoint-runtime-join-decision.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {
  CLUSTER_FORMAT_REVISION, CLUSTER_FORMAT_REVISION_FIELD,
  SUPPORT_ENVELOPE_REASON_CODE,
  SupportEnvelopeOwner, assertCurrentClusterFormatDeclaration,
  buildSupportEnvelopeRecord, clusterFormatRevisionClaim,
  computeSupportEnvelopeDigest, evaluateRollbackEligibility,
  resolveJoinSupportEnvelopeConflict, validateMixedVersionNodeAdmission,
  validateSupportEnvelopeRecord, validateVersionPairAdmission,
} from '../../src/bootstrap/owners/support-envelope-owner.js';
import {RollingUpgradeOwner} from '../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {L4_ROLLING_UPGRADE_REASON_CODE} from
  '../../src/bootstrap/owners/management-v1-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {RaftRsPreparationCustody} from '../../src/raft/raft-rs-preparation-custody.js';
import {ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {initializeTestEnvironment} from './bootstrap-api-test-fixtures.js';

const NODE_ID = 'release-fence-seed';
const NODE_ADDRESS = 'http://127.0.0.1:18091';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const JOINER_NODE_ADDRESS = 'ws://localhost:9090';
const SEED_API_NODE_ID = 'seed-node-1';
const CONTACT_CANDIDATE = 'http://seed-live:8080';
const OTHER_REVISION = CLUSTER_FORMAT_REVISION + 1;
const LAYOUT_UNSUPPORTED =
  SUPPORT_ENVELOPE_REASON_CODE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED;
const OUTSIDE = SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE;

// ---------------------------------------------------------------- seed side

async function seedFixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-version-fence-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const services = [];
  const controller = new AbortController();
  const entries = [];
  const threadManager = new ServiceThreadManager();
  const nodeService = new NodeService({threadManager});
  t.after(async () => {
    setActualCoreEntryObserver(null);
    for (const service of services.reverse()) await service.shutdown();
    await nodeService.shutdown();
    await threadManager.shutdown();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    storage: {dataDir}, logging: {level: 'fatal'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const dataDirectoryManager = new DataDirectoryManager();
  dataDirectoryManager.initialize();
  threadManager.initialize({minThreads: 1, maxThreads: 1});
  nodeService.initialize({nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
    autoTransitionLifecycle: false});
  setActualCoreEntryObserver((entry) => entries.push(entry));
  const decide = () => resolveAutoRejoinStartupDecision({dataDir,
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS});
  const createService = async () => {
    const bootIncarnation = await reserveBootIncarnation(dataDir);
    const decision = await decide();
    const service = new BootstrapService({nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
      hostId: LOCAL_MACHINE_HOST_ID, bootIncarnation, nodeService, dataDirectoryManager,
      dataDirectoryProcessOwner: directoryOwner, startupAbortSignal: controller.signal,
      membershipOwnerOutcome: decision.membershipOwnerOutcome,
      startupServicesAdmission: await readDurableServicesIdentitySnapshot(dataDir)});
    services.push(service);
    service.messageRouter = new MessageRouter({nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS, bootIncarnation});
    service.transport = service.messageRouter;
    service.systemTableCache = nodeService.getSystemTableCache();
    return service;
  };
  return {dataDir, entries, decide, createService};
}

function retainedDeclaration(dataDir) {
  const anchor = originalSeedAnchor(dataDir);
  const db = new Database(anchor.dbPath, {readonly: true, fileMustExist: true});
  try {
    return db.prepare(`SELECT ${COLUMN.DECLARATION} FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND replica_identity = ?`)
      .get(anchor.groupId, anchor.replicaId)[COLUMN.DECLARATION];
  } finally {
    db.close();
  }
}

// Every founder row's retained declaration, keyed by replica id.
function founderDeclarations(declaration) {
  return new Map(declaration.members.map((member) => {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      return [member.replicaId, db.prepare(`SELECT ${COLUMN.DECLARATION}
        FROM ${REPLICA_LIFECYCLE_TABLE} WHERE replica_identity = ?`)
        .get(member.replicaId)[COLUMN.DECLARATION]];
    } finally {
      db.close();
    }
  }));
}

// Turn the retained founding into one of another release: rewrite every
// founder's declaration as the given revision claim (absent when null).
function rewriteRetainedRevision(declaration, revision) {
  const {[CLUSTER_FORMAT_REVISION_FIELD]: _current, ...rest} = declaration;
  const retained = revision === null ? rest :
    {...rest, [CLUSTER_FORMAT_REVISION_FIELD]: revision};
  for (const member of declaration.members) {
    const db = new Database(member.dbPath, {fileMustExist: true});
    try {
      db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET ${COLUMN.DECLARATION} = ?
        WHERE ${COLUMN.DECLARATION} = ?`)
        .run(JSON.stringify(retained), JSON.stringify(declaration));
    } finally {
      db.close();
    }
  }
}

// The same data directory started with operator environment overrides.
function startupJoinOptions(dataDir, env = {}) {
  const values = new Map([[CONFIG_KEY.NODE_ID, NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, '127.0.0.1'], [CONFIG_KEY.NODE_REST_API_PORT, 18091],
    [CONFIG_KEY.NODE_WS_PORT, 18093]]);
  return {cliArgs: {}, env,
    config: {get: (key) => (values.has(key) ? values.get(key) : null)},
    dataDirectoryManager: {getDataDir: () => dataDir},
    logger: {info() {}}, probePeerAddress: async () => false};
}

function explicitSeedOptions(dataDir) {
  return startupJoinOptions(dataDir, {[ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: 'peer-a:8080'});
}

function forceNewClusterOptions(dataDir) {
  return startupJoinOptions(dataDir, {[FORCE_NEW_CLUSTER_ENV]: '1'});
}

function corruptAnchorDeclaration(dataDir) {
  const anchor = originalSeedAnchor(dataDir);
  const db = new Database(anchor.dbPath, {fileMustExist: true});
  try {
    db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET ${COLUMN.DECLARATION} = '{}'
      WHERE group_id = ? AND replica_identity = ?`).run(anchor.groupId, anchor.replicaId);
  } finally {
    db.close();
  }
}

// Measure every database the preparation acquires while one call runs.
async function recordPreparationOpens(t, run) {
  const opens = [];
  const original = RaftRsPreparationCustody.prototype.open;
  RaftRsPreparationCustody.prototype.open = function recordOpen(member, options = {}) {
    opens.push({replicaId: member.replicaId, readonly: options.readonly === true});
    return original.call(this, member, options);
  };
  t.after(() => {
    RaftRsPreparationCustody.prototype.open = original;
  });
  try {
    await run();
  } finally {
    RaftRsPreparationCustody.prototype.open = original;
  }
  return opens;
}

test('W-FENCE: a new seed records this build\'s cluster format revision in ' +
  'every founder of its original allocation', async (t) => {
  const f = await seedFixture(t);
  const service = await f.createService();
  await service.prepareOriginalSeedAttempt();
  const declaration = JSON.parse(retainedDeclaration(f.dataDir));
  assert.equal(declaration[CLUSTER_FORMAT_REVISION_FIELD], CLUSTER_FORMAT_REVISION);
  assert.ok(Number.isSafeInteger(CLUSTER_FORMAT_REVISION) && CLUSTER_FORMAT_REVISION > 0);
  for (const [replicaId, retained] of founderDeclarations(declaration)) {
    assert.equal(JSON.parse(retained)[CLUSTER_FORMAT_REVISION_FIELD],
      CLUSTER_FORMAT_REVISION, `${replicaId} retains the revision`);
  }
  assert.deepEqual(f.entries, [], 'founding the declaration enters no native core');
});

for (const [label, revision] of [['without the revision', null],
  ['of another revision', OTHER_REVISION]]) {
  test(`W-FENCE: a seed reopened on a retained allocation ${label} is refused ` +
    'typed before any founder opens', async (t) => {
    const f = await seedFixture(t);
    const first = await f.createService();
    await first.prepareOriginalSeedAttempt();
    await first.shutdown();
    const declaration = JSON.parse(retainedDeclaration(f.dataDir));
    rewriteRetainedRevision(declaration, revision);
    const before = founderDeclarations(declaration);

    const decision = await f.decide();
    assert.equal(decision.mode, 'fail', 'the startup decision refuses to start');
    const forcedDecision = await resolveAutoRejoinStartupDecision({dataDir: f.dataDir,
      nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, forceNewCluster: true});
    assert.equal(forcedDecision.state,
      AUTO_REJOIN_DECISION_STATE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED,
      'forceNewCluster does not override the release version fence');
    for (const options of [explicitSeedOptions(f.dataDir), forceNewClusterOptions(f.dataDir)]) {
      await assert.rejects(resolveStartupJoinDecision(options),
        (error) => error.reason === LAYOUT_UNSUPPORTED &&
          error.code === MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
        'neither SEED_NODE_ADDRESS nor LAGRANGE_FORCE_NEW_CLUSTER=1 overrides the refusal');
    }
    assert.equal(decision.state,
      AUTO_REJOIN_DECISION_STATE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED);
    assert.equal(decision.membershipOwnerOutcome.outcomeType,
      MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP);
    assert.equal(decision.membershipOwnerOutcome.reasonCode, LAYOUT_UNSUPPORTED);

    const later = await f.createService();
    const opens = await recordPreparationOpens(t, () => assert.rejects(
      later.prepareOriginalSeedAttempt(),
      (error) => error.code === LAYOUT_UNSUPPORTED &&
        error.retainedClusterFormatRevision === revision &&
        error.clusterFormatRevision === CLUSTER_FORMAT_REVISION));
    assert.deepEqual(opens, [{replicaId: originalSeedAnchor(f.dataDir).replicaId,
      readonly: true}], 'only the declaration read touches a founder, read-only');
    assert.deepEqual(later.originalAllocationPreparation.observeResources(), []);
    assert.deepEqual(founderDeclarations(declaration), before,
      'the refusal writes nothing');
    assert.deepEqual(f.entries, [], 'no native core is entered');
  });
}

test('W-FENCE control: a retained allocation of this revision passes the ' +
  'fence and reaches the existing retained-history inspection', async (t) => {
  const f = await seedFixture(t);
  const first = await f.createService();
  await first.prepareOriginalSeedAttempt();
  await first.shutdown();
  const decision = await f.decide();
  assert.notEqual(decision.state,
    AUTO_REJOIN_DECISION_STATE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED);
  const later = await f.createService();
  const opens = await recordPreparationOpens(t, () => assert.rejects(
    later.prepareOriginalSeedAttempt(),
    (error) => error.code !== LAYOUT_UNSUPPORTED));
  assert.ok(opens.length > 1, 'past the fence the retained founders are inspected');

  // Control: corrupting candidate 0 while surviving founders carry this build's
  // revision still classifies as unreadable_durable_evidence.
  corruptAnchorDeclaration(f.dataDir);
  const corruptedCurrent = await f.decide();
  assert.equal(corruptedCurrent.state,
    AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE);
});

for (const [label, revision] of [['without the revision', null],
  ['of another revision', OTHER_REVISION]]) {
  test(`W-FENCE (F1): an unreadable anchor founder never hides surviving founders ${label}`,
    async (t) => {
      const f = await seedFixture(t);
      const first = await f.createService();
      await first.prepareOriginalSeedAttempt();
      await first.shutdown();
      const declaration = JSON.parse(retainedDeclaration(f.dataDir));
      rewriteRetainedRevision(declaration, revision);
      corruptAnchorDeclaration(f.dataDir);

      for (const forceNewCluster of [false, true]) {
        const decision = await resolveAutoRejoinStartupDecision({
          dataDir: f.dataDir, nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, forceNewCluster});
        assert.equal(decision.mode, 'fail');
        assert.equal(decision.state,
          AUTO_REJOIN_DECISION_STATE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED);
        assert.equal(decision.membershipOwnerOutcome.reasonCode, LAYOUT_UNSUPPORTED);
      }
      for (const options of [explicitSeedOptions(f.dataDir), forceNewClusterOptions(f.dataDir)]) {
        await assert.rejects(resolveStartupJoinDecision(options),
          (error) => error.reason === LAYOUT_UNSUPPORTED &&
            error.code === MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP);
      }
    });
}

// ---------------------------------------------------------------- join side

function admittingSeedCache() {
  return {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [{node_id: SEED_API_NODE_ID, node_address: 'ws://localhost:8080'}];
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{partition_id: 'p1', table_name: 'nodes', leader_node_id: SEED_API_NODE_ID}];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {service_id: 'partition-leader', service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1', node_id: SEED_API_NODE_ID,
            address: `${SEED_API_NODE_ID}/partition/partition-leader`,
            raft_role: RAFT_ROLE.LEADER, status: SERVICE_STATUS.ACTIVE},
          {service_id: 'message-group-leader', service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1', node_id: SEED_API_NODE_ID,
            address: `${SEED_API_NODE_ID}/message-group/message-group-leader`,
            raft_role: RAFT_ROLE.LEADER, status: SERVICE_STATUS.ACTIVE},
        ];
      }
      if (tableName === TABLES.TABLES) return [{table_id: 't1', table_name: 'nodes'}];
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{group_id: 'mg1', leader_node_id: SEED_API_NODE_ID}];
      }
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

async function admittingSeed(t) {
  initializeTestEnvironment();
  const api = new BootstrapAPI({seedNodeId: SEED_API_NODE_ID,
    seedNodeAddress: 'http://localhost:8080', wsPort: 9090,
    systemTableCache: admittingSeedCache(), messageGroupServices: new Map()});
  await api.initialize(0, {listen: false});
  t.after(() => api.shutdown());
  const effects = {admissionClaims: 0, takeoverDecisions: 0, assignments: 0};
  const claim = api.acquireBootstrapAdmission.bind(api);
  api.acquireBootstrapAdmission = (snapshot) => {
    effects.admissionClaims += 1;
    return claim(snapshot);
  };
  const assign = api.determineAndReserveMessageGroupAssignment.bind(api);
  api.determineAndReserveMessageGroupAssignment = (nodeId, options) => {
    effects.assignments += 1;
    return assign(nodeId, options);
  };
  const owner = api.bootstrapJoinAdmissionOwner;
  const takeover = owner.resolveTakeoverDecision.bind(owner);
  owner.resolveTakeoverDecision = (options) => {
    effects.takeoverDecisions += 1;
    return takeover(options);
  };
  const post = async (claimFields) => {
    const response = await api.getFastify().inject({method: 'POST', url: '/bootstrap',
      payload: {nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS, ...claimFields}});
    return {statusCode: response.statusCode, body: JSON.parse(response.body)};
  };
  return {post, effects};
}

test('W-FENCE: a joiner carrying this build\'s revision is admitted, and the ' +
  'admission carries the admitting node\'s revision', async (t) => {
  const seed = await admittingSeed(t);
  const admitted = await seed.post(clusterFormatRevisionClaim());
  assert.equal(admitted.statusCode, 200);
  assert.equal(admitted.body.success, true);
  assert.equal(admitted.body[CLUSTER_FORMAT_REVISION_FIELD], CLUSTER_FORMAT_REVISION);
  assert.deepEqual(seed.effects, {admissionClaims: 1, takeoverDecisions: 1, assignments: 1},
    'control: an admitted request reaches the admission claim, takeover and assignment');
});

for (const [label, claimFields, expectedPattern] of [
  ['without the claim', {}, /revision absent is outside/],
  ['with another revision', {[CLUSTER_FORMAT_REVISION_FIELD]: OTHER_REVISION},
    new RegExp(`revision ${OTHER_REVISION} is outside`)],
  ['with a string claim', {[CLUSTER_FORMAT_REVISION_FIELD]: String(CLUSTER_FORMAT_REVISION)},
    /revision "1" is outside/],
  ['with a non-coercible object claim',
    {[CLUSTER_FORMAT_REVISION_FIELD]: {toString: 1, valueOf: 1}},
    /revision non-integer \(object\) is outside/],
]) {
  test(`W-FENCE: a joiner ${label} is refused typed OUTSIDE_SUPPORT_ENVELOPE ` +
    'before any admission effect', async (t) => {
    const seed = await admittingSeed(t);
    const refused = await seed.post(claimFields);
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.body.code, OUTSIDE);
    assert.match(refused.body.error, expectedPattern);
    assert.deepEqual(seed.effects, {admissionClaims: 0, takeoverDecisions: 0, assignments: 0},
      'the fence fires before the admission claim, the takeover decision and assignment');
  });
}

function contactPhase(respond) {
  const state = {applied: [], authorities: [], posted: [], warnings: []};
  const phase = new ContactSeedPhase({
    nodeId: JOINER_NODE_ID,
    delegates: {
      getSeedNodeAddress: () => CONTACT_CANDIDATE,
      getSeedNodeAddresses: () => [CONTACT_CANDIDATE],
      getNodeAddress: () => JOINER_NODE_ADDRESS,
      getJoinStartupMode: () => STARTUP_JOIN_MODE.DURABLE_REJOIN,
      getLogger: () => ({debug() {}, info() {}, error() {},
        warn(message, fields) {
          state.warnings.push(fields);
        }}),
      getConfig: () => ({httpTimeoutMs: 1000, leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10, leadershipWaitMaxDelayMs: 20}),
      getNow: () => () => Date.now(),
      getSleep: () => async () => {},
      getRandom: () => () => 0,
      getHttpPostImpl: () => async (url, body) => {
        state.posted.push(body);
        return respond(body, state.posted.length);
      },
      setBootstrapResponse: (value) => {
        state.applied.push(value);
      },
      setSeedContactStartupAuthority: (authority) => {
        state.authorities.push(authority);
      },
      setSeedNodeId: () => {},
      getSeedNodeWsAddress: () => null,
      setSeedNodeWsAddress: () => {},
    },
  });
  return {phase, state};
}

const admittedResponse = (claimFields) => ({success: true, seedNodeId: SEED_API_NODE_ID,
  seedNodeWsAddress: 'ws://seed-live:8082', ...claimFields});

test('W-FENCE: the joiner carries its revision and applies an admission from ' +
  'a node of the same revision', async () => {
  const joiner = contactPhase(() => admittedResponse(clusterFormatRevisionClaim()));
  await joiner.phase.phaseContactSeed();
  assert.equal(joiner.state.posted[0][CLUSTER_FORMAT_REVISION_FIELD], CLUSTER_FORMAT_REVISION);
  assert.equal(joiner.state.applied.length, 1);
});

for (const [label, claimFields] of [['carries no revision', {}],
  ['is of another revision', {[CLUSTER_FORMAT_REVISION_FIELD]: OTHER_REVISION}]]) {
  test(`W-FENCE: a joiner refuses an admission from a node that ${label}, ` +
    'terminally and before applying it', async () => {
    const joiner = contactPhase(() => admittedResponse(claimFields));
    await assert.rejects(joiner.phase.phaseContactSeed(),
      /Peer cluster format revision .* is outside the support envelope/);
    assert.deepEqual(joiner.state.warnings.map(({code, statusCode}) => ({code, statusCode})),
      [{code: OUTSIDE, statusCode: 409}], 'the joiner classifies it as a terminal conflict');
    assert.equal(joiner.state.posted.length, 1, 'a terminal refusal is not retried');
    assert.deepEqual(joiner.state.applied, [], 'the response is never applied');
  });
}

test('W-FENCE (F2/F4): ContactSeedPhase fails terminally on a hostile object ' +
  'revision even after a prior 503 without mutating startupAuthority', async () => {
  const joiner = contactPhase((_body, attemptNumber) => {
    if (attemptNumber === 1) {
      return {success: false, statusCode: 503, code: 'BOOTSTRAP_NOT_READY',
        phase: 'seed_initializing', retryAfterMs: 10};
    }
    return admittedResponse({
      [CLUSTER_FORMAT_REVISION_FIELD]: {toString: 1, valueOf: 1},
      startupAuthority: {state: 'available', canonicalStartupNodeIds: [SEED_API_NODE_ID]},
    });
  });
  await assert.rejects(
    joiner.phase.phaseContactSeed(),
    (error) => error.deferRetry !== true &&
      /revision non-integer \(object\) is outside/.test(error.message),
    'the 409 fence refusal is terminal, never turned into deferRetry by the prior 503',
  );
  assert.equal(joiner.state.posted.length, 2, 'stops immediately on the fenced 200');
  assert.deepEqual(joiner.state.warnings.map(({code, statusCode}) => ({code, statusCode})),
    [{code: OUTSIDE, statusCode: 409}]);
  assert.deepEqual(joiner.state.authorities, [], 'startupAuthority from the fenced peer is dropped');
  assert.deepEqual(joiner.state.applied, [], 'the response is never applied');
});

test('W-FENCE (F2/F4): adversarial carriers, non-integers, inherited claims, ' +
  'and flipping getters fail closed with single-read safe diagnostics', () => {
  const inherited = Object.create({[CLUSTER_FORMAT_REVISION_FIELD]: CLUSTER_FORMAT_REVISION});
  const uncoercible = {toString: 1, valueOf: 1};
  const boxedOne = Object(CLUSTER_FORMAT_REVISION);
  const cases = [
    [inherited, /revision absent is outside/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: uncoercible}, /non-integer \(object\)/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: '1'}, /revision "1" is outside/, '1'],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: boxedOne}, /non-integer \(object\)/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: Number.NaN}, /revision NaN is outside/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: true}, /revision true is outside/, true],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: null}, /revision absent is outside/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: -0}, /revision -0 is outside/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: Number.POSITIVE_INFINITY},
      /revision Infinity is outside/, null],
    [{[CLUSTER_FORMAT_REVISION_FIELD]: 1n}, /non-integer \(bigint\)/, null],
  ];
  for (const [carrier, pattern, expectedDiagnostic] of cases) {
    const conflict = resolveJoinSupportEnvelopeConflict({
      nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS, carrier});
    assert.ok(conflict !== null);
    assert.equal(conflict.code, OUTSIDE);
    assert.match(conflict.error, pattern);
    assert.doesNotMatch(conflict.error, /cluster format revision 1 is outside/);
    assert.equal(conflict.peerClusterFormatRevision, expectedDiagnostic);
    assert.doesNotThrow(() => JSON.stringify(conflict));

    assert.throws(
      () => assertCurrentClusterFormatDeclaration(carrier),
      (error) => error.code === LAYOUT_UNSUPPORTED && pattern.test(error.message) &&
        error.retainedClusterFormatRevision === expectedDiagnostic &&
        typeof JSON.stringify(error) === 'string',
    );
  }

  // Flipping getters are read at most once on every boundary.
  const makeFlipping = (firstValue, laterValue, base = {}) => {
    let reads = 0;
    const target = {...base};
    Object.defineProperty(target, CLUSTER_FORMAT_REVISION_FIELD, {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? firstValue : laterValue;
      },
    });
    return {target, getReads: () => reads};
  };

  const flipJoinBadFirst = makeFlipping(OTHER_REVISION, CLUSTER_FORMAT_REVISION);
  const joinConflict = resolveJoinSupportEnvelopeConflict({
    nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS, carrier: flipJoinBadFirst.target});
  assert.equal(flipJoinBadFirst.getReads(), 1);
  assert.equal(joinConflict.peerClusterFormatRevision, OTHER_REVISION);
  assert.match(joinConflict.error, new RegExp(`revision ${OTHER_REVISION} is outside`));

  const flipJoinGoodFirst = makeFlipping(CLUSTER_FORMAT_REVISION, OTHER_REVISION);
  assert.equal(resolveJoinSupportEnvelopeConflict({
    nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS,
    carrier: flipJoinGoodFirst.target}), null);
  assert.equal(flipJoinGoodFirst.getReads(), 1);

  const flipDeclBadFirst = makeFlipping(OTHER_REVISION, CLUSTER_FORMAT_REVISION);
  assert.throws(() => assertCurrentClusterFormatDeclaration(flipDeclBadFirst.target),
    (error) => error.retainedClusterFormatRevision === OTHER_REVISION);
  assert.equal(flipDeclBadFirst.getReads(), 1);

  const flipDeclGoodFirst = makeFlipping(CLUSTER_FORMAT_REVISION, OTHER_REVISION);
  assertCurrentClusterFormatDeclaration(flipDeclGoodFirst.target);
  assert.equal(flipDeclGoodFirst.getReads(), 1);

  const validEnvelope = buildSupportEnvelopeRecord();
  const flipEnvGoodFirst = makeFlipping(CLUSTER_FORMAT_REVISION, OTHER_REVISION, validEnvelope);
  const summary = new SupportEnvelopeOwner({envelope: flipEnvGoodFirst.target})
    .getManagementSummary();
  assert.equal(flipEnvGoodFirst.getReads(), 1);
  assert.equal(summary.policyValid, true);
  assert.equal(summary.clusterFormatRevision, CLUSTER_FORMAT_REVISION);
});

// --------------------------------------------------- upgrade and downgrade

function envelopeOfRevision(revision, versionPair) {
  const record = buildSupportEnvelopeRecord({versionPair});
  const {envelopeDigest: _digest, ...base} = record;
  const other = {...base, [CLUSTER_FORMAT_REVISION_FIELD]: revision};
  return {...other, envelopeDigest: computeSupportEnvelopeDigest(other)};
}

test('W-FENCE: declarations do not authorize a release transition', () => {
  const pair = {sourceVersion: '0.4.1', targetVersion: '0.5.0'};
  const current = buildSupportEnvelopeRecord({versionPair: pair});
  const other = envelopeOfRevision(OTHER_REVISION, pair);
  const partial = {[CLUSTER_FORMAT_REVISION_FIELD]: CLUSTER_FORMAT_REVISION, versionPair: pair};
  const flat = {[CLUSTER_FORMAT_REVISION_FIELD]: CLUSTER_FORMAT_REVISION, ...pair};
  const digestTampered = {
    ...buildSupportEnvelopeRecord({versionPair: {sourceVersion: '0.4.1', targetVersion: '0.4.2'}}),
    versionPair: pair,
  };

  assert.equal(validateSupportEnvelopeRecord(current).policyValid, true);
  assert.equal(validateSupportEnvelopeRecord(other).reasonCode, OUTSIDE,
    'a validly digested envelope of another revision is outside');

  for (const envelope of [null, undefined, other]) {
    assert.equal(validateVersionPairAdmission(envelope, pair).reasonCode, OUTSIDE);
    assert.equal(evaluateRollbackEligibility(envelope,
      {targetVersion: pair.sourceVersion}).reasonCode, OUTSIDE);
  }

  const snapshot = {nodeIds: ['n1', 'n2', 'n3'], readyNodeIds: ['n1', 'n2', 'n3'],
    underReplicatedPartitionCount: 0, hasPartitionQuorum: true};
  const params = {targetVersion: pair.targetVersion};
  const ports = {currentVersion: pair.sourceVersion,
    onDrainNodeLeadership: () => {}, onTriggerNodeRestart: () => {}};

  for (const envelope of [undefined, current, other, partial, flat, digestTampered]) {
    assert.equal(validateSupportEnvelopeRecord(envelope).valid, false);
    assert.equal(validateVersionPairAdmission(envelope, pair).admitted, false);
    assert.equal(evaluateRollbackEligibility(envelope,
      {targetVersion: pair.sourceVersion}).eligible, false);
    assert.equal(validateMixedVersionNodeAdmission(envelope,
      {localVersion: pair.sourceVersion, peerVersion: pair.targetVersion}).admitted, false);

    const supportEnvelopeOwner = new SupportEnvelopeOwner({envelope});
    const owner = new RollingUpgradeOwner({...ports, supportEnvelopeOwner});
    assert.equal(owner.evaluatePreflight(params, snapshot).reasonCode,
      L4_ROLLING_UPGRADE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
    assert.equal(owner.executeRollback({targetVersion: pair.sourceVersion}).ok, false);
  }
});
