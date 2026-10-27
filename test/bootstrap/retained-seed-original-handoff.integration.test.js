// Quest retained-seed-original-handoff witness.
// A cold restart of an original seed interrupted after ENABLE (participant
// release) and before SERVICES / cluster_id registration completes the
// original handoff and exits with HANDOFF_COMPLETE_SERVING_DEFERRED while
// keeping public serving admission closed and releasing all resources cleanly.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {BOOTSTRAP_DEFAULT} from '../../src/bootstrap/bootstrap-constants.js';
import {MEMBERSHIP_OWNER_REASON} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  ORIGINAL_ALLOCATION as STATE,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN,
  ORIGINAL_ALLOCATION_REASON as REASON,
  isOriginalAllocationHold,
} from '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {CONTROL_PARTITION} from '../test-helpers/retained-seed-public-observer.js';
import {
  cleanupTestEnvironment,
  createRetainedSeedBootstrapService,
  initializeTestEnvironment,
} from '../integration/helpers/cluster-test-helpers.js';
import {SEED_RETAINED_EFFECT_STATE} from
  '../../src/bootstrap/seed-retained-effects-constants.js';
import {
  RIGHT_COLUMNS,
  readIssuedDeclaration,
  readOwnerRights,
} from '../test-helpers/original-allocation-durable-reader.js';
import {openOriginalSeedReplica} from '../test-helpers/open-original-seed-replica.js';

const CHILD = new URL('../test-helpers/retained-seed-public-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449965';
const HOST_ADDRESS = 'http://127.0.0.1:18080';
const TEST_TIMEOUT_MS = 180000;
const HANDOFF_COMPLETE_CODE = STATE.DEFERRED;
const EXPECTED_FOUNDER_COUNT = 141;
const EXPECTED_PARTITION_COHORT_COUNT = 46;
const allocator = createPortAllocator(import.meta.url);

const retainedDirs = [];
after(() => {
  for (const {directories, passed} of retainedDirs) {
    if (passed()) {
      for (const dir of directories) {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }
  }
});

function childAttempt(mode, directory, ports) {
  const child = fork(CHILD, [mode, directory, NODE_ID, JSON.stringify(ports)],
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
    child.once('close', () => reject(new Error(`public child ${mode} exited before report`)));
  });
  return {child, closed, report, outputPath};
}

async function finishAttempt(attempt) {
  try {
    const report = await attempt.report;
    assert.equal(report.kind, 'public-startup-settled');
    assert.notEqual(report.pid, process.pid);
    if (attempt.child.connected) attempt.child.send('exit-after-observation');
    assert.deepEqual(await attempt.closed, {code: 0, signal: null});
    return {report, outputPath: attempt.outputPath};
  } finally {
    if (attempt.child.exitCode === null && attempt.child.signalCode === null) {
      attempt.child.kill('SIGKILL');
    }
    await attempt.closed;
  }
}

function assertCleanupObserved(report) {
  assert.equal(report.cleanupError, null);
  assert.equal(report.startupError?.name === 'AggregateError', false,
    'public unwind must retain any cleanup error instead of using process exit as proof');
  assert.deepEqual(report.observation.observerErrors, []);
  assert.ok(report.observation.databases.length > 0, 'actual native databases must engage');
  assert.ok(report.observation.databases.every((db) => db.closed === true),
    'all captured original native database owners must close before child termination');
}

function assertActualExpiry(report) {
  const observed = report.observation;
  assert.equal(report.returnedRuntime, false);
  assert.equal(observed.bootstrapObserved, true);
  assert.equal(observed.budgetMs, BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs);
  assert.equal(observed.budgetMs, 30000, 'public baseline budget remains the real30s default');
  assert.equal(observed.startupServicesAdmission.empty, true);
  assert.equal(observed.membershipOwnerOutcome.reasonCode, MEMBERSHIP_OWNER_REASON.FRESH_SEED);
  const selected = observed.selected;
  assert.ok(selected, 'actual cold public startup must reach registered non-control ENABLE');
  assert.equal(selected.before, null);
  assert.equal(selected.answer.outcome, OUTCOME.OBSERVED);
  assert.deepEqual(selected.answer.origin, selected.after);
  assert.ok(selected.after.originIndex > 0 && selected.after.originTerm > 0);
  assert.ok(selected.settledAtMs < selected.request.deadlineAtMs);
  assert.equal(selected.forcedAtMs, selected.request.deadlineAtMs);
  assert.equal(selected.nativeClockUnchanged, true);
  assert.equal(selected.nodeClockUnchanged, true);
  assert.equal(selected.admissionAfterEnable.state, ADMISSION.CLOSED);
  assert.equal(selected.selectedOuter.answer.missingFact, MISSING.RELEASE_DEADLINE);
  assert.equal(selected.selectedOuter.answer.phase, ACTION.OBSERVE_APPLIED_POSITION);
  assert.ok(selected.freshIntents.every(({request}) =>
    request.deadlineAtMs === selected.request.deadlineAtMs));
  assert.ok(selected.freshIntents.some(({request, answer}) =>
    request.partitionId === CONTROL_PARTITION && answer?.outcome === OUTCOME.CUT_OVER));
  assert.equal(selected.selectedAttempt.filter(({request}) =>
    request.action === ACTION.ENABLE).length, 1);
  assert.equal(selected.selectedAttempt.some(({request}) =>
    [ACTION.OBSERVE_APPLIED_POSITION, ACTION.RESUME].includes(request.action)), false);
  assertCleanupObserved(report);
  return selected;
}

function readOrigin(dbPath) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return readPartitionWriteOrigin(db);
  } finally {
    db.close();
  }
}

function assertDirectoryReacquired(directory) {
  const owner = acquireDataDirectoryProcessOwner(directory);
  owner.release();
}

function readSystemTableRows(declaration, tableName, orderBy) {
  const members = declaration.members.filter((member) => member.tableName === tableName);
  let best = [];
  for (const member of members) {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all();
      if (rows.length > best.length) best = rows;
    } finally {
      db.close();
    }
  }
  return best;
}

function readPartitionCohortOrigins(declaration) {
  const byGroup = new Map();
  for (const member of declaration.members) {
    if (!member.tableName) continue;
    const origin = readOrigin(member.dbPath);
    if (origin && !byGroup.has(member.groupId)) {
      byGroup.set(member.groupId, origin);
    }
  }
  return byGroup;
}

function restoreDirectorySnapshot(sourceDir, targetDir) {
  fs.rmSync(targetDir, {recursive: true, force: true});
  fs.cpSync(sourceDir, targetDir, {recursive: true});
}

const SHARED_CACHE_ENV = 'RETAINED_SEED_SHARED_CACHE_DIR';

function resolveObservationDirectories(outcomes) {
  const sharedCacheDir = process.env[SHARED_CACHE_ENV];
  if (typeof sharedCacheDir === 'string' && sharedCacheDir.length > 0) {
    const directory = path.join(sharedCacheDir, 'work-dir');
    const postEnableBackup = path.join(sharedCacheDir, 'enable-snap');
    const postHandoffBackup = path.join(sharedCacheDir, 'handoff-snap');
    const metaPath = path.join(sharedCacheDir, 'observation.json');
    fs.mkdirSync(directory, {recursive: true});
    fs.mkdirSync(postEnableBackup, {recursive: true});
    fs.mkdirSync(postHandoffBackup, {recursive: true});
    return {directory, postEnableBackup, postHandoffBackup, metaPath};
  }
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'retained-seed-public-'));
  const postEnableBackup = fs.mkdtempSync(path.join(tmpdir(), 'retained-seed-enable-snap-'));
  const postHandoffBackup = fs.mkdtempSync(path.join(tmpdir(), 'retained-seed-handoff-snap-'));
  retainedDirs.push({
    directories: [directory, postEnableBackup, postHandoffBackup],
    passed: () => outcomes.size === 0,
  });
  return {directory, postEnableBackup, postHandoffBackup, metaPath: null};
}

let sharedObservation = null;
function observeRetainedSeed() {
  sharedObservation ??= (async () => {
    const outcomes = new Set();
    const {
      directory, postEnableBackup, postHandoffBackup, metaPath,
    } = resolveObservationDirectories(outcomes);
    if (metaPath && fs.existsSync(metaPath)) {
      const cached = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return {
        directory,
        postEnableBackup,
        postHandoffBackup,
        outcomes,
        ...cached,
        cohortOrigins: new Map(cached.cohortOrigins),
      };
    }
    const ports = allocator.getListenerPorts();
    const firstAttempt = await finishAttempt(childAttempt('initial', directory, ports));
    const first = firstAttempt.report;
    const selected = assertActualExpiry(first);
    assertDirectoryReacquired(directory);
    const originAfterFirst = readOrigin(selected.dbPath);
    const declaration = readIssuedDeclaration(directory);
    const rightsAfterFirst = readOwnerRights(declaration);
    restoreDirectorySnapshot(directory, postEnableBackup);

    const secondAttempt = await finishAttempt(childAttempt('restart', directory, ports));
    const second = secondAttempt.report;
    assertDirectoryReacquired(directory);
    const originAfterSecond = readOrigin(selected.dbPath);
    const rightsAfterSecond = readOwnerRights(declaration);
    const servicesRows = readSystemTableRows(declaration, 'services', 'service_id');
    const configRows = readSystemTableRows(declaration, 'config', 'config_key');
    const clusterIdRow = configRows.find((row) => row.config_key === 'cluster_id') ?? null;
    const cohortOrigins = readPartitionCohortOrigins(declaration);
    restoreDirectorySnapshot(directory, postHandoffBackup);

    const result = {
      first,
      second,
      selected,
      declaration,
      originAfterFirst,
      originAfterSecond,
      rightsAfterFirst,
      rightsAfterSecond,
      servicesRows,
      clusterIdRow,
    };
    if (metaPath) {
      fs.writeFileSync(metaPath, JSON.stringify({
        ...result,
        cohortOrigins: [...cohortOrigins.entries()],
      }));
    }
    return {
      directory,
      postEnableBackup,
      postHandoffBackup,
      outcomes,
      ...result,
      cohortOrigins,
    };
  })();
  return sharedObservation;
}

async function retainedObservation(t, receipt) {
  const observed = await observeRetainedSeed();
  observed.outcomes.add(receipt);
  t.diagnostic(JSON.stringify({
    receipt,
    firstPublicRestartError: observed.second.startupError,
    firstCreationRefusal: observed.second.observation.creationRefusals[0] ?? null,
    consumedStorage: observed.second.observation.startupServicesAdmission,
    consumedMembership: observed.second.observation.membershipOwnerOutcome,
  }));
  return observed;
}

function pass(observed, receipt) {
  observed.outcomes.delete(receipt);
}

test('R1 prospective original allocation persists exact cohort before first native effect',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R1');
    const {declaration, rightsAfterFirst} = observed;
    assert.ok(declaration, 'initial attempt issued a durable original allocation declaration');
    assert.equal(declaration.nodeId, NODE_ID);
    assert.equal(declaration.anchorReplicaId, 'services-p1-r1');
    assert.equal(declaration.members.length, EXPECTED_FOUNDER_COUNT);
    for (const member of declaration.members) {
      assert.equal(typeof member.incarnation, 'string');
      assert.ok(member.incarnation.length > 0);
      assert.ok(Number.isSafeInteger(member.createdAt) &&
        member.createdAt >= declaration.declaredAt);
      assert.equal(typeof member.createAttemptToken, 'string');
      const rights = rightsAfterFirst[member.replicaId];
      assert.equal(rights.native, HISTORY.ESTABLISHED);
      assert.equal(rights[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
      if (member.replicaId === declaration.anchorReplicaId) {
        assert.equal(rights[COLUMN.IDENTITY_RIGHT], STATE.UNUSED);
      } else {
        assert.equal(COLUMN.IDENTITY_RIGHT in rights, false);
      }
    }
    pass(observed, 'R1');
  });

test('R2 cold retained cohort validates all founders and unused publication rights before opening',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R2');
    const {second, rightsAfterFirst} = observed;
    assert.equal(Object.keys(rightsAfterFirst).length, EXPECTED_FOUNDER_COUNT);
    for (const rights of Object.values(rightsAfterFirst)) {
      assert.equal(rights.native, HISTORY.ESTABLISHED);
      assert.equal(rights[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
    }
    assert.equal(second.observation.membershipOwnerOutcome.reasonCode,
      MEMBERSHIP_OWNER_REASON.FRESH_SEED);
    assert.equal(second.observation.startupServicesAdmission.empty, false);
    assert.deepEqual(second.observation.startupServicesAdmission.rows, []);
    assert.deepEqual(second.observation.creationRefusals, []);
    assert.equal(second.observation.databases.length, EXPECTED_FOUNDER_COUNT);
    pass(observed, 'R2');
  });

test('R3 completed cohort advances to deferred elections and participant release',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R3');
    const {
      directory, postEnableBackup, declaration, selected,
      originAfterFirst, originAfterSecond, cohortOrigins,
    } = observed;
    assert.deepEqual(originAfterFirst, selected.after);
    assert.deepEqual(originAfterSecond, selected.after,
      'cold continuation preserves the original committed ENABLE origin');
    assert.equal(cohortOrigins.size, EXPECTED_PARTITION_COHORT_COUNT,
      'every system-table partition cohort completes participant release');
    for (const [groupId, origin] of cohortOrigins) {
      assert.ok(origin.originIndex > 0 && origin.originTerm > 0, `${groupId} origin committed`);
    }

    restoreDirectorySnapshot(postEnableBackup, directory);
    initializeTestEnvironment({nodeId: NODE_ID});
    const service = await createRetainedSeedBootstrapService({
      dataDir: directory,
      nodeId: NODE_ID,
      nodeAddress: HOST_ADDRESS,
    });
    try {
      await service.prepareOriginalSeedAttempt();
      assert.equal(service.originalAllocationPreparation.isColdRecovery(), true);
      await service.seedInfrastructurePhase.phaseInfrastructure();
      service.systemTableCache = service.nodeService.getSystemTableCache();
      await openOriginalSeedReplica(service, declaration, declaration.anchorReplicaId);
      assert.throws(() => service.assertOriginalSeedContinuation(), (error) =>
        isOriginalAllocationHold(error, REASON.CONTINUATION_UNAVAILABLE));
      await assert.rejects(
        () => service.seedPartitionsPhase.startDeferredBootstrapReplicaElections(),
        (error) => isOriginalAllocationHold(error, REASON.CONTINUATION_UNAVAILABLE),
      );
      await assert.rejects(
        () => service.seedRegistrationPhase.phaseRegistration(),
        (error) => isOriginalAllocationHold(error, REASON.CONTINUATION_UNAVAILABLE),
      );
    } finally {
      await service.shutdown();
      cleanupTestEnvironment();
    }
    pass(observed, 'R3');
  });

test('R4 release-completed cohort publishes exact original SERVICES and cluster_id',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R4');
    const {declaration, servicesRows, clusterIdRow, rightsAfterSecond} = observed;
    assert.equal(servicesRows.length, EXPECTED_FOUNDER_COUNT);
    for (const member of declaration.members) {
      const row = servicesRows.find((candidate) => candidate.service_id === member.replicaId);
      assert.ok(row, `SERVICES row present for ${member.replicaId}`);
      assert.equal(row.replica_id, member.replicaId);
      assert.equal(row.service_type, member.serviceType);
      assert.equal(row.node_id, declaration.nodeId);
      assert.equal(row.created_at, member.createdAt);
      assert.equal(row.create_attempt_token, member.createAttemptToken);
    }
    assert.ok(clusterIdRow, 'cluster_id row present in CONFIG');
    assert.equal(clusterIdRow.config_value, declaration.clusterId);
    assert.equal(clusterIdRow.default_value, declaration.clusterId);
    assert.equal(clusterIdRow.updated_by, declaration.nodeId);
    assert.equal(clusterIdRow.created_at, declaration.declaredAt);
    assert.equal(clusterIdRow.updated_at, declaration.declaredAt);
    for (const [replicaId, rights] of Object.entries(rightsAfterSecond)) {
      assert.equal(rights.native, HISTORY.ESTABLISHED, `${replicaId} established`);
      for (const column of RIGHT_COLUMNS) {
        if (column in rights) {
          assert.equal(rights[column], STATE.TRANSFERRED, `${replicaId} ${column} transferred`);
        }
      }
    }
    pass(observed, 'R4');
  });

test('R5 public admission remains closed across every retained continuation boundary',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R5');
    const {directory, postEnableBackup, first, second} = observed;
    assert.equal(first.returnedRuntime, false);
    assert.equal(second.returnedRuntime, false);
    assert.equal(second.startupError?.code, HANDOFF_COMPLETE_CODE);

    restoreDirectorySnapshot(postEnableBackup, directory);
    initializeTestEnvironment({nodeId: NODE_ID});
    const service = await createRetainedSeedBootstrapService({
      dataDir: directory,
      nodeId: NODE_ID,
      nodeAddress: HOST_ADDRESS,
    });
    try {
      await service.prepareOriginalSeedAttempt();
      await service.seedInfrastructurePhase.phaseInfrastructure();
      for (const invoke of [
        () => service.startWebSocketServer(),
        () => service.openExternalTransportAdmission(),
        () => service.completeSuccessfulBootstrap(),
      ]) {
        await assert.rejects(async () => invoke(), (error) =>
          isOriginalAllocationHold(error, REASON.CONTINUATION_UNAVAILABLE));
        assert.equal(service.messageRouter.server, null);
        assert.equal(service.messageRouter.isExternalAdmissionEnabled(), false);
      }
    } finally {
      await service.shutdown();
      cleanupTestEnvironment();
    }
    pass(observed, 'R5');
  });

test('R6 cold public partial seed preserves original ENABLE and reaches exact handoff frontier',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R6');
    const {first, second, selected, originAfterFirst, originAfterSecond} = observed;
    assert.deepEqual(originAfterFirst, selected.after);
    assert.notEqual(second.pid, first.pid, 'restart must enter in a genuinely cold process');
    assert.equal(second.returnedRuntime, false);
    assert.equal(second.cleanupError, null);
    assert.notEqual(second.startupError?.name, 'AggregateError',
      'a second-start cleanup failure is a prerequisite, not the handoff discriminator');
    assert.deepEqual(second.observation.observerErrors, []);
    assert.ok(second.observation.databases.every((db) => db.closed === true));
    assert.deepEqual(originAfterSecond, selected.after,
      'actual public refusal/recovery cannot erase the original committed origin');
    assert.equal(second.startupError?.code, HANDOFF_COMPLETE_CODE,
      'actual cold public entry must complete the bounded nonserving original handoff');
    pass(observed, 'R6');
  });

test('R7 transferred publication rights refuse original cold continuation',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R7');
    const {
      directory, postHandoffBackup, declaration, selected, rightsAfterSecond,
    } = observed;
    restoreDirectorySnapshot(postHandoffBackup, directory);
    initializeTestEnvironment({nodeId: NODE_ID});
    const service = await createRetainedSeedBootstrapService({
      dataDir: directory,
      nodeId: NODE_ID,
      nodeAddress: HOST_ADDRESS,
    });
    try {
      await assert.rejects(
        () => service.prepareOriginalSeedAttempt(),
        (error) => isOriginalAllocationHold(error, REASON.CLASSIFICATION_UNAVAILABLE) &&
          isOriginalAllocationHold(error.cause, REASON.SPENT),
      );
      assert.deepEqual(service.originalAllocationPreparation.observeResources(), []);
    } finally {
      await service.shutdown();
      cleanupTestEnvironment();
    }
    assertDirectoryReacquired(directory);
    assert.deepEqual(readOrigin(selected.dbPath), selected.after);
    assert.deepEqual(readOwnerRights(declaration), rightsAfterSecond);
    pass(observed, 'R7');
  });

test('R8 contrary or partial retained state fails closed without mutating origin',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const observed = await retainedObservation(t, 'R8');
    const {directory, postEnableBackup, declaration, selected} = observed;
    restoreDirectorySnapshot(postEnableBackup, directory);
    const targetMember = declaration.members.find((member) =>
      member.tableName === 'message_groups');
    const db = new Database(targetMember.dbPath, {fileMustExist: true});
    try {
      db.prepare(
        'INSERT INTO message_groups (group_id, group_name, replica_count, ' +
        'leader_node_id, policy, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('contrary-group', 'contrary', 3, NODE_ID, '{}', 1, 1);
    } finally {
      db.close();
    }

    initializeTestEnvironment({nodeId: NODE_ID});
    const contraryService = await createRetainedSeedBootstrapService({
      dataDir: directory,
      nodeId: NODE_ID,
      nodeAddress: HOST_ADDRESS,
    });
    try {
      await assert.rejects(
        () => contraryService.prepareOriginalSeedAttempt(),
        (error) => isOriginalAllocationHold(error, REASON.CLASSIFICATION_UNAVAILABLE) &&
          Array.isArray(error.detail) &&
          error.detail.some((entry) => entry.replicaId === targetMember.replicaId &&
            entry.state === SEED_RETAINED_EFFECT_STATE.CONTRARY),
      );
      assert.deepEqual(contraryService.originalAllocationPreparation.observeResources(), []);
    } finally {
      await contraryService.shutdown();
    }

    fs.rmSync(targetMember.dbPath, {force: true});
    const partialService = await createRetainedSeedBootstrapService({
      dataDir: directory,
      nodeId: NODE_ID,
      nodeAddress: HOST_ADDRESS,
    });
    try {
      await assert.rejects(
        () => partialService.prepareOriginalSeedAttempt(),
        (error) => isOriginalAllocationHold(error, REASON.CLASSIFICATION_UNAVAILABLE) &&
          isOriginalAllocationHold(error.cause, REASON.OBSERVATION),
      );
      assert.deepEqual(partialService.originalAllocationPreparation.observeResources(), []);
    } finally {
      await partialService.shutdown();
      cleanupTestEnvironment();
    }
    assertDirectoryReacquired(directory);
    assert.deepEqual(readOrigin(selected.dbPath), selected.after);
    pass(observed, 'R8');
  });
