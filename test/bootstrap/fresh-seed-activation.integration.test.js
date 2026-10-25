// Quest fresh-seed-activation witness (owner decision 2, 2026-10-26).
// A legitimately admitted fresh seed completes protected activation, durably
// transfers its original registration and cluster-identity rights, and reaches
// normal service through the supported startup path.
//
// Positive receipts enter the actual public startLagrangeRuntime in genuinely
// new child processes (test/test-helpers/fresh-seed-activation-public-child.js):
// it composes the production data-directory owner, the startup membership and
// storage admissions, and prepareOriginalSeedAttempt itself. No grant,
// admission, phase or owner is replaced. Observation is passive. One shared
// observation (initial start, then a cold restart) feeds every positive test.
//
// Engaged negatives (review C2) build BootstrapService through the shared
// owner fixture createOwnedVirginSeedBootstrapService with the production
// data-directory owner. They discriminate an ordered decision from a mutant
// that deletes the continuation throw, and must hold on every head.
//
// Test names are the receipt selectors of
// scripts/quest-evidence/fresh-seed-activation.js: "R<n> ..." per receipt.
// R5 keeps the restart obligation visible. It is not a recovery claim.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {MEMBERSHIP_OWNER_OUTCOME_TYPE, MEMBERSHIP_OWNER_REASON,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT} from '../../src/bootstrap/rejoin-hints-constants.js';
import {originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapSystemTableWriter} from '../../src/bootstrap/system-table-writer.js';
import {originalSeedServiceRegistration} from '../../src/bootstrap/seed-original-registration.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {SERVICE_STATUS, CDC_OPERATION} from '../../src/constants/index.js';
import {buildSystemTableMutationSqlParts} from
  '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {commitDurably} from '../../src/raft/raft-rs-durable-store.js';
import {transitionOriginalRight} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {cleanupTestEnvironment, createOwnedVirginSeedBootstrapService,
  initializeTestEnvironment} from '../integration/helpers/cluster-test-helpers.js';
import {RIGHT_COLUMNS, declaredRightKeys, readIssuedDeclaration, readOwnerRights} from
  '../test-helpers/original-allocation-durable-reader.js';
import {openOriginalSeedReplica} from '../test-helpers/open-original-seed-replica.js';

const CHILD = new URL('../test-helpers/fresh-seed-activation-public-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449971';
const NEGATIVE_NODE_ID = '550e8400-e29b-41d4-a716-446655449972';
// The configured host: the runtime's node.address and every probe target.
const HOST = '127.0.0.1';
const TEST_TIMEOUT_MS = 240000;
const EXPECTED_SEQUENCE = Object.freeze([STATE.UNUSED, STATE.SUBMITTED, STATE.TRANSFERRED]);
const NATIVE_OPEN = 'create_node';
const CAMPAIGN = 'campaign';
const TICK = 'tick';
const READY_SURFACE = 'rest-readyz';
const allocator = createPortAllocator(import.meta.url);
const hold = (error) => error?.code === STATE.HOLD;

// --- the shared positive observation ---------------------------------------

const retained = [];
after(() => {
  for (const {directory, passed} of retained) {
    if (passed()) fs.rmSync(directory, {recursive: true, force: true});
  }
});

function childAttempt(mode, directory, ports) {
  const child = fork(CHILD, [mode, directory, NODE_ID, JSON.stringify(ports), HOST],
    {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  const outputPath = path.join(directory, `${mode}-child-output.log`);
  const output = fs.createWriteStream(outputPath);
  child.stdout.on('data', (chunk) => output.write(chunk));
  child.stderr.on('data', (chunk) => output.write(chunk));
  const closed = new Promise((resolve) => child.once('close', (code, signal) => {
    output.end(() => resolve({code, signal}));
  }));
  const report = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('message', resolve);
    child.once('close', () => reject(new Error(`fresh-seed child ${mode} exited before report`)));
  });
  return {child, closed, report, outputPath};
}

async function finishAttempt(attempt) {
  try {
    const report = await attempt.report;
    if (attempt.child.connected) attempt.child.send('exit-after-observation');
    return {report, exit: await attempt.closed, outputPath: attempt.outputPath};
  } finally {
    if (attempt.child.exitCode === null && attempt.child.signalCode === null) {
      attempt.child.kill('SIGKILL');
    }
    await attempt.closed;
  }
}

function readDurableRights(declaration, directory) {
  const owner = acquireDataDirectoryProcessOwner(directory);
  try {
    return readOwnerRights(declaration);
  } finally {
    owner.release();
  }
}

let observation = null;
function observeFreshSeed() {
  observation ??= (async () => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'fresh-seed-activation-'));
    const outcomes = new Set();
    retained.push({directory, passed: () => outcomes.size === 0});
    const ports = allocator.getListenerPorts();
    const first = await finishAttempt(childAttempt('initial', directory, ports));
    const declaration = first.report.observation.declaration;
    const transferred = declaration && first.report.returnedRuntime ?
      readDurableRights(declaration, directory) : null;
    // The restart runs only on data the first start served from.
    const second = transferred === null ? null :
      await finishAttempt(childAttempt('restart', directory, ports));
    const afterRestart = second === null ? null : readDurableRights(declaration, directory);
    return {directory, outcomes, first, second, declaration, transferred, afterRestart};
  })();
  return observation;
}

function holdLabel(error) {
  if (error === null || error === undefined) return 'none';
  return `${error.code ?? error.name}/${error.reason ?? error.message}`;
}

async function servedObservation(t, receipt) {
  const observed = await observeFreshSeed();
  observed.outcomes.add(receipt);
  const {report, exit, outputPath} = observed.first;
  t.diagnostic(JSON.stringify({receipt, returnedRuntime: report.returnedRuntime,
    startupError: report.startupError, cleanupError: report.cleanupError,
    service: report.service, rightSequences: report.observation.rightSequences,
    admission: report.observation.admission, samplingCost: report.observation.samplingCost,
    tcpConnections: report.observation.tcpConnections,
    probeOutcomes: report.observation.probeOutcomes,
    listeners: report.observation.listeners,
    observerErrors: report.observation.observerErrors, retained: observed.directory}));
  if (!report.returnedRuntime && !observed.outputReported) {
    observed.outputReported = true;
    t.diagnostic(fs.readFileSync(outputPath, 'utf8'));
  }
  assert.equal(report.kind, 'fresh-seed-startup-settled');
  assert.notEqual(report.pid, process.pid);
  assert.deepEqual(exit, {code: 0, signal: null});
  assert.equal(report.returnedRuntime, true,
    'a legitimately admitted fresh seed must reach service; startup refused ' +
    `${holdLabel(report.startupError)}`);
  assert.equal(report.cleanupError, null);
  assert.deepEqual(report.observation.observerErrors, []);
  assert.ok(observed.declaration, 'the live issuer prepared one exact allocation');
  return observed;
}

function pass(observed, receipt) {
  observed.outcomes.delete(receipt);
}

test('R1 protected activation happens only for openings admitted under the exact allocation',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await servedObservation(t, 'R1');
    const {declaration, first: {report}} = observed;
    const declaredGroups = [...new Set(declaration.members.map(({groupId}) => groupId))].sort();
    const startup = report.observation.coreEntries.filter((entry) => !entry.afterReturn);
    const opened = new Set();
    const activated = new Map();
    for (const entry of startup) {
      if (entry.operation === NATIVE_OPEN) opened.add(entry.groupId);
      if (entry.operation !== CAMPAIGN && entry.operation !== TICK) continue;
      assert.ok(declaredGroups.includes(entry.groupId),
        `startup activated ${entry.groupId}, which the exact allocation never admitted`);
      assert.ok(opened.has(entry.groupId),
        `${entry.groupId} entered native election scheduling before its admitted original opening`);
      activated.set(entry.groupId, entry.observationSequence);
    }
    assert.deepEqual([...opened].sort(), declaredGroups,
      'startup natively opens exactly the declared original groups');
    assert.deepEqual([...activated.keys()].sort(), declaredGroups,
      'every admitted original group activates; no other group activates during startup');
    const leaders = report.observation.nativeLeaders.filter((entry) => !entry.afterReturn);
    assert.deepEqual(leaders.map(({groupId}) => groupId).sort(), declaredGroups,
      'the native status owner observes a leader for every activated group');
    for (const leader of leaders) {
      const member = declaration.members.find(({replicaId}) => replicaId === leader.replicaId);
      assert.ok(member, 'native leader is an exact declared replica');
      assert.equal(leader.groupId, member.groupId);
      assert.equal(leader.incarnation, member.incarnation);
      assert.ok(leader.observationSequence > activated.get(leader.groupId),
        'native leadership follows admitted native election scheduling');
      assert.ok(leader.term > 0);
    }
    pass(observed, 'R1');
  });

test('R2 each original right moves UNUSED -> SUBMITTED -> TRANSFERRED durably and never resets',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await servedObservation(t, 'R2');
    const {declaration, transferred, first: {report}} = observed;
    const sequences = report.observation.rightSequences;
    assert.deepEqual(Object.keys(sequences).sort(), declaredRightKeys(declaration),
      'every declared SERVICES birth right and the anchor identity right is observed');
    for (const [key, sequence] of Object.entries(sequences)) {
      assert.deepEqual(sequence, EXPECTED_SEQUENCE,
        `${key} must move UNUSED -> SUBMITTED -> TRANSFERRED exactly once, never reset`);
    }
    assert.deepEqual(report.observation.rightsAtSettle, transferred,
      'the owner read at settle equals the durable read after the process released custody');
    for (const [replicaId, rights] of Object.entries(transferred)) {
      assert.equal(rights.native, HISTORY.ESTABLISHED, `${replicaId} established`);
      for (const column of RIGHT_COLUMNS) {
        if (column in rights) {
          assert.equal(rights[column], STATE.TRANSFERRED, `${replicaId} ${column} durable`);
        }
      }
    }
    pass(observed, 'R2');
  });

test('R3 public admission is closed until the handoff completes and open after',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await servedObservation(t, 'R3');
    const {report} = observed.first;
    const samples = report.observation.admission;
    for (const sample of samples) {
      assert.equal(sample.after, true,
        `${sample.surface} admitted a public request before the handoff completed`);
    }
    const ambiguous = samples.filter((sample) => sample.ambiguous);
    if (ambiguous.length > 0) t.diagnostic(`ambiguous admission brackets: ${JSON.stringify(ambiguous)}`);
    assert.equal(report.service.ready, true, 'public readiness opens after the handoff');
    assert.equal(report.service.transport, true, 'public WebSocket handshake opens after the handoff');
    assert.equal(report.observation.listeners.rest.port, report.ports.restApiPort);
    assert.equal(report.observation.listeners.transport.port, report.ports.transportWebSocketPort);
    assert.equal(report.observation.listeners.transport.address, HOST);
    assert.ok(report.observation.tcpConnections.length > 0);
    assert.ok(report.observation.tcpConnections.every((connection) =>
      connection.localAddress !== connection.remoteAddress && !connection.selfConnected),
    'external probe clients cannot self-connect at the runtime listener address');
    assert.ok(samples.some((sample) => sample.afterReturn && sample.surface === READY_SURFACE));
    assert.ok(samples.some((sample) => sample.afterReturn &&
      sample.surface === 'transport-websocket-handshake'));
    pass(observed, 'R3');
  });

test('R4 a write and a read succeed through public admission',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await servedObservation(t, 'R4');
    const {service} = observed.first.report;
    assert.equal(service.error, undefined, `public write/read failed: ${JSON.stringify(service.error)}`);
    assert.equal(service.write.affectedRows, 1);
    assert.deepEqual(service.read.rows, [{id: 'row-1', value: 'written-before-restart'}]);
    pass(observed, 'R4');
  });

test('R5 a restart on the same durable data serves or is held typed and resets no right',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await servedObservation(t, 'R5');
    const {report, exit} = observed.second;
    t.diagnostic(JSON.stringify({restart: report.returnedRuntime ? 'served' : 'held',
      startupError: report.startupError, service: report.service}));
    assert.deepEqual(exit, {code: 0, signal: null});
    assert.notEqual(report.pid, observed.first.report.pid, 'restart enters a cold process');
    assert.equal(report.cleanupError, null);
    assert.deepEqual(report.observation.observerErrors, []);
    if (report.returnedRuntime) {
      assert.deepEqual(report.service.read.rows,
        [{id: 'row-1', value: 'written-before-restart'}],
        'the restarted seed serves the pre-restart write');
    } else {
      const error = report.startupError;
      const membership = error.membershipOwnerOutcome;
      const membershipHeld = error.code === MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP &&
        error.reason === MEMBERSHIP_OWNER_REASON.SEED_RECOVERY_PROOF_MISSING &&
        membership?.semanticOwner === TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER &&
        membership.boundary === TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY &&
        membership.outcomeType === MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP &&
        membership.reasonCode === error.reason;
      assert.ok(hold(error) || membershipHeld,
        `an unserved restart must be an owner-named hold, got ${holdLabel(report.startupError)}`);
      assert.equal(typeof error.reason, 'string');
      assert.equal(report.observation.nativeEntryCount, 0, 'held restart enters no native core');
      assert.deepEqual(report.observation.admission, [], 'held restart admits no public request');
    }
    assert.deepEqual(observed.afterRestart, observed.transferred,
      'a restart never resets, re-arms or re-spends an original right');
    pass(observed, 'R5');
  });

// --- engaged negatives (in-process, shared owner fixture) ------------------

async function negativeSeed(t, {prepare}) {
  initializeTestEnvironment({nodeId: NEGATIVE_NODE_ID});
  const service = await createOwnedVirginSeedBootstrapService(t, {nodeId: NEGATIVE_NODE_ID,
    nodeAddress: `http://${HOST}:18091`, wsPort: allocator.getListenerPorts().transportWebSocketPort});
  t.after(() => cleanupTestEnvironment());
  const dataDir = service.dataDirectoryManager.getDataDir();
  if (prepare) {
    await service.prepareOriginalSeedAttempt();
    await service.seedInfrastructurePhase.phaseInfrastructure();
    service.systemTableCache = service.nodeService.getSystemTableCache();
  }
  return {dataDir, service};
}

function continuationEntries(service) {
  return [
    ['startDeferredBootstrapReplicaElections', () =>
      service.seedPartitionsPhase.startDeferredBootstrapReplicaElections()],
    ['phaseRegistration', () => service.seedRegistrationPhase.phaseRegistration()],
    ['ensureSystemTableWriter', () => service.seedRegistrationPhase.ensureSystemTableWriter()],
    ...admissionEntries(service),
  ];
}

function admissionEntries(service) {
  return [
    ['startWebSocketServer', () => service.startWebSocketServer()],
    ['openExternalTransportAdmission', () => service.openExternalTransportAdmission()],
    ['completeSuccessfulBootstrap', () => service.completeSuccessfulBootstrap()],
  ];
}

test('R1 negative: without a live original attempt (null opening mode) every continuation ' +
  'entry holds', async (t) => {
  const {dataDir, service} = await negativeSeed(t, {prepare: false});
  for (const [name, invoke] of continuationEntries(service)) {
    await assert.rejects(async () => invoke(), (error) =>
      hold(error) && error.reason === REASON.AUTHORITY, name);
  }
  assert.equal(fs.existsSync(originalSeedAnchor(dataDir).dbPath), false,
    'no original allocation is issued by any continuation entry');
  assert.equal(service.messageRouter, null);
});

test('R3 negative: with original rights untransferred every public admission entry holds',
  async (t) => {
    const {dataDir, service} = await negativeSeed(t, {prepare: true});
    const declaration = readIssuedDeclaration(dataDir);
    const before = readOwnerRights(declaration);
    assert.ok(Object.values(before).every((rights) =>
      rights[COLUMN.SERVICE_RIGHT] === STATE.UNUSED), 'the live attempt holds UNUSED rights');
    for (const [name, invoke] of admissionEntries(service)) {
      await assert.rejects(async () => invoke(), hold, name);
      assert.deepEqual(readOwnerRights(declaration), before, `${name} preserves every right`);
      assert.equal(service.messageRouter.server, null, `${name} opens no listener`);
      assert.equal(service.messageRouter.isExternalAdmissionEnabled(), false,
        `${name} opens no external admission`);
    }
    const api = new BootstrapAPI({seedNodeId: NEGATIVE_NODE_ID,
      assertOriginalSeedPublicAdmission: () => service.assertOriginalSeedPublicAdmission(),
      bootstrapStartupAdapter: service.bootstrapApiOwner,
      runtimeOwner: service.runtimeDependencyOwner});
    t.after(() => api.shutdown());
    // Substitute only a ready observation; the actual readiness owner and
    // API composition must still consume original admission and refuse it.
    t.mock.method(api.bootstrapReadinessOwner, 'evaluateReadinessSnapshotForProbe',
      async () => ({ready: true, reasons: [], timestamp: Date.now()}));
    let status;
    const response = await api.bootstrapReadinessOwner.handleReadinessProbeRequest({
      code(value) {
        status = value;
      },
    });
    assert.equal(status, 503);
    assert.equal(response.ready, false);
    assert.deepEqual(readOwnerRights(declaration), before);
  });

test('R2 negative: an unknown publication retains SUBMITTED; live exact readback never resubmits',
  async (t) => {
    const {dataDir, service} = await negativeSeed(t, {prepare: true});
    const declaration = readIssuedDeclaration(dataDir);
    const {member, replica: partition} = await openOriginalSeedReplica(
      service, declaration, declaration.anchorReplicaId);
    let inserts = 0;
    let readMode = 'unavailable';
    // This substitutes the SQL transport's effect/answer only. Row construction,
    // the original publication operation, SQLite commits, durable rights and
    // the native original opening are real owners. Replicated publication is
    // proved by the positive child; this fault witness proves lost-answer custody.
    const writer = new BootstrapSystemTableWriter({
      async insertSystemTableRow(table, row) {
        inserts += 1;
        assert.equal(readOwnerRights(declaration)[member.replicaId][COLUMN.SERVICE_RIGHT],
          STATE.SUBMITTED, 'the right is durably spent before the actual INSERT');
        const parts = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, row);
        commitDurably(partition.db, () => partition.db.prepare(
          `INSERT INTO ${table} (${parts.columns}) VALUES (${parts.placeholders})`).run(...parts.values));
        throw new Error('lost committed INSERT answer');
      },
      async readAuthoritativeRows(_table, sql, params, options) {
        assert.equal(options.readAuthority.localReadConsistency, 'local_leader');
        if (readMode === 'unavailable') throw new Error('read unavailable');
        const rows = readMode === 'absent' ? [] : partition.db.prepare(sql).all(...params);
        if (readMode === 'contrary') rows[0].create_attempt_token = 'different-birth';
        return {success: true, rows};
      },
    }, service.partitionServices);
    const rowOwner = new PartitionServiceRowOwner({systemTableWriter: writer});
    const originalRegistration = originalSeedServiceRegistration(
      service.originalAllocationPreparation, member.replicaId, writer);
    const register = (nodeId = declaration.nodeId) => rowOwner.registerReplica({
      partitionId: member.groupId, replicaId: member.replicaId, nodeId,
      service: partition, timestamp: declaration.declaredAt,
      status: SERVICE_STATUS.STOPPED, originalRegistration,
    });
    await assert.rejects(register('wrong-node'), (error) =>
      hold(error) && error.reason === REASON.IDENTITY);
    assert.equal(inserts, 0, 'a contrary identity consumes no original right');
    const refused = await Promise.allSettled([register(), register()]);
    for (const result of refused) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.reason, REASON.OBSERVATION);
    }
    for (const mode of ['absent', 'contrary']) {
      readMode = mode;
      await assert.rejects(register(), (error) =>
        hold(error) && error.reason === REASON.OBSERVATION);
      assert.equal(readOwnerRights(declaration)[member.replicaId][COLUMN.SERVICE_RIGHT],
        STATE.SUBMITTED);
      assert.equal(inserts, 1);
    }
    const submittedRole = partition.db.prepare('SELECT raft_role FROM services').get().raft_role;
    t.mock.method(partition, 'getRole', () => 'leader');
    readMode = 'exact';
    const registered = await register();
    assert.equal(registered.created_at, member.createdAt);
    assert.equal(registered.create_attempt_token, member.createAttemptToken);
    assert.equal(registered.raft_role, submittedRole,
      'a changed native role cannot replace the retained original publication row');
    await assert.rejects(register('changed-node-after-transfer'), (error) =>
      hold(error) && error.reason === REASON.IDENTITY);
    assert.equal(readOwnerRights(declaration)[member.replicaId][COLUMN.SERVICE_RIGHT],
      STATE.TRANSFERRED);
    await register();
    assert.equal(inserts, 1, 'neither concurrent nor repeated invocation re-arms the INSERT');
    assert.equal(partition.db.prepare('SELECT count(*) AS count FROM services').get().count, 1);
    assert.throws(() => service.assertOriginalSeedPublicAdmission(), hold,
      'one transferred right does not open public admission');

    // The lifecycle owner can expose a spent row without this preparation
    // retaining its submitting operation. Rejected calls must not manufacture
    // a retained invocation that lets a later call adopt that durable state.
    transitionOriginalRight({db: partition.db, member, right: COLUMN.IDENTITY_RIGHT,
      from: STATE.UNUSED, to: STATE.SUBMITTED});
    let unexpectedCallbacks = 0;
    const unknownPublication = () => service.originalAllocationPreparation.publishOriginalRight({
      replicaId: member.replicaId, right: COLUMN.IDENTITY_RIGHT, value: {unknown: true},
      submit: () => unexpectedCallbacks++, observe: () => {
        unexpectedCallbacks++;
        return true;
      },
    });
    for (let call = 0; call < 2; call++) {
      await assert.rejects(unknownPublication(), (error) =>
        hold(error) && error.reason === REASON.SPENT);
    }
    assert.equal(unexpectedCallbacks, 0);
    assert.equal(readOwnerRights(declaration)[member.replicaId][COLUMN.IDENTITY_RIGHT],
      STATE.SUBMITTED);
  });
