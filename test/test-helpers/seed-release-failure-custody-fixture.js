// Actual seed startup, native groups and SQLite. Faults affect only the
// existing handler's clock after a real ENABLE answer and one exact DB close.
// The supplied directory is never owned by the virgin-seed helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {AddressManager} from '../../src/address/address-manager.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BOOTSTRAP_EVENT} from '../../src/bootstrap/bootstrap-constants.js';
import {resolveAutoRejoinStartupDecision} from '../../src/bootstrap/rejoin-hints.js';
import {readSeedStartupStorageAdmission} from
  '../../src/bootstrap/seed-startup-storage-admission.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/tables.js';
import {clearRegisteredControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-gateway-registry.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  createVirginSeedBootstrapService,
  getUniquePort,
  initializeTestEnvironment,
} from '../integration/helpers/cluster-test-helpers.js';

const SEED_RELEASE_BUDGET_MS = 3000;
const CONTROL_PARTITION = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = '550e8400-e29b-41d4-a716-446655449963';
const SEED_CONFIG = Object.freeze({
  leadershipWaitTimeoutMs: SEED_RELEASE_BUDGET_MS,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 100,
  replicaStaggerDelayMs: 20,
});

function substitute(host, owner, key, replacement) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  Object.defineProperty(owner, key,
    {configurable: true, writable: true, value: replacement});
  let restored = false;
  const restore = () => {
    if (restored) return;
    if (descriptor === undefined) {
      if (!delete owner[key]) throw new Error(`Cannot restore ${key}`);
    } else {
      Object.defineProperty(owner, key, descriptor);
    }
    restored = true;
  };
  host.restorations.push(restore);
  return restore;
}

function observeMethod(host, owner, key, label) {
  const original = owner[key];
  assert.equal(typeof original, 'function', `${label} is an actual acquired method`);
  substitute(host, owner, key, function(...args) {
    host.lifecycle.push({label, stage: 'called',
      cdcCurrent: host.bootstrap.cdcIntegrationService === host.cdc});
    const result = Reflect.apply(original, this, args);
    if (result && typeof result.then === 'function') {
      void result.then(() => host.lifecycle.push({label, stage: 'fulfilled',
        cdcCurrent: host.bootstrap.cdcIntegrationService === host.cdc}),
      (error) => host.lifecycle.push({label, stage: 'rejected', error}));
    }
    return result;
  });
}

function captureNativeDatabases(host, bootstrap) {
  for (const [kind, services] of [
    ['partition', bootstrap.partitionServices],
    ['message-group', bootstrap.messageGroupServices],
  ]) {
    for (const [replicaId, service] of services) {
      if (service.db === null || service.db === undefined ||
          host.nativeDatabases.some((entry) => entry.db === service.db)) continue;
      host.nativeDatabases.push({kind, replicaId, service, db: service.db,
        dbPath: service.dbPath, nodeId: bootstrap.nodeId});
    }
  }
}

function captureRegistrationOwners(host) {
  if (host.handler !== null) return;
  const bootstrap = host.bootstrap;
  captureNativeDatabases(host, bootstrap);
  assert.equal(host.nativeDatabases.length,
    bootstrap.partitionServices.size + bootstrap.messageGroupServices.size,
    'every already acquired native service has its exact captured database');
  host.handler = bootstrap.replicaHandler;
  host.cdc = bootstrap.cdcIntegrationService;
  host.engine = bootstrap.sqlQueryEngine ?? host.cdc?.sqlQueryEngine;
  assert.ok(host.handler && host.cdc && host.engine,
    'the actual registration checkpoint acquired its handler, CDC and engine');
  const source = host.handler.timeSource;
  const clock = {
    now: () => host.forcedAtMs ?? source.now(),
    setTimeout: (...args) => source.setTimeout(...args),
    clearTimeout: (...args) => source.clearTimeout(...args),
  };
  host.originalHandlerClock = source;
  substitute(host, host.handler, 'timeSource', clock);
  observeMethod(host, host.handler, 'shutdown', 'handler.shutdown');
  observeMethod(host, host.cdc, 'markShuttingDown', 'cdc.markShuttingDown');
  observeMethod(host, host.engine, 'shutdown', 'engine.shutdown');
}

function selectedSeedIntent(host, request) {
  if (host.selected !== null || request.action !== ACTION.ENABLE ||
      request.partitionId === CONTROL_PARTITION) return null;
  return host.deliveries.findLast((record) => !record.settled &&
    record.request.action === ACTION.RELEASE &&
    record.request.trigger === TRIGGER.FRESH_SEED &&
    record.request.partitionId === request.partitionId &&
    record.request.deadlineAtMs === request.attempt?.deadlineAtMs &&
    record.request.targetBuildDigest === request.release?.targetBuildDigest) ?? null;
}

function beginSelectedEnable(host, request, seedIntent) {
  const service = host.handler.localServices.get(request.replicaId);
  assert.ok(service, 'the registered ENABLE names an actual hosted replica');
  host.selected = {request, seedIntent, service, db: service.db, dbPath: service.dbPath,
    before: readPartitionWriteOrigin(service.db), after: null,
    answer: null, settledAtMs: null, serviceClock: service.timeSource,
    nodeClock: host.bootstrap.nodeService.getTimeSource()};
}

function settleSelectedEnable(host, response) {
  const selected = host.selected;
  selected.answer = response.answer?.[PARTICIPANT_RELEASE_RESULT_FIELD];
  selected.after = readPartitionWriteOrigin(selected.db);
  selected.settledAtMs = host.originalHandlerClock.now();
  selected.admissionAfterEnable = participantReleaseAdmissionOf(selected.service);
  host.restoreClose = substitute(host, selected.db, 'close', function(...args) {
    host.closeCalls.push({db: this, args});
    throw host.closeFailure;
  });
  host.forcedAtMs = selected.request.deadlineAtMs;
  return response;
}

function deliverParticipant(host, router, original, args) {
  const request = args[1];
  captureRegistrationOwners(host);
  const record = {request, answer: null, error: null, settled: false};
  host.deliveries.push(record);
  const seedIntent = selectedSeedIntent(host, request);
  if (seedIntent !== null) beginSelectedEnable(host, request, seedIntent);
  const operation = Reflect.apply(original, router, args);
  return Promise.resolve(operation).then((response) => {
    record.answer = response.answer?.[PARTICIPANT_RELEASE_RESULT_FIELD];
    record.settled = true;
    if (seedIntent === null) return response;
    try {
      return settleSelectedEnable(host, response);
    } catch (error) {
      host.observerFailures.push(error);
      throw error;
    }
  }, (error) => {
    record.error = error;
    record.settled = true;
    throw error;
  });
}

function createFaultRouter(host, options) {
  const router = new MessageRouter(options);
  const original = router.deliver;
  substitute(host, router, 'deliver', function(...args) {
    if (args[1]?.type !== PARTICIPANT_RELEASE_TYPE) {
      return Reflect.apply(original, this, args);
    }
    return deliverParticipant(host, this, original, args);
  });
  return router;
}

function observeCreationRefusals(host, bootstrap) {
  for (const [owner, method] of [
    ['seedMessageGroupsPhase', 'createBootstrapMessageGroupReplica'],
    ['seedPartitionsPhase', 'createBootstrapPartitionReplica'],
  ]) {
    const phase = bootstrap[owner];
    const original = phase[method];
    substitute(host, phase, method, function(...args) {
      const retain = (error) => {
        captureNativeDatabases(host, bootstrap);
        host.creationRefusals.push({owner, method, error,
          phase: bootstrap.phase, definition: args[0]?.definition});
      };
      let operation;
      try {
        operation = Reflect.apply(original, this, args);
      } catch (error) {
        retain(error);
        throw error;
      }
      void operation.then(() => captureNativeDatabases(host, bootstrap), retain);
      return operation;
    });
  }
}

async function restartRetainedSeed(host) {
  // This new local bootstrap lifetime consumes the real readers. It is not
  // public process-lock reentry or proof that retained startup can succeed.
  await host.bootstrap.nodeService.shutdown();
  const startupServicesAdmission = await readSeedStartupStorageAdmission(
    host.directory, (acquisition) => acquisition);
  const membership = await resolveAutoRejoinStartupDecision({
    dataDir: host.directory, nodeId: NODE_ID, nodeAddress: host.nodeAddress,
  });
  host.retained = {startupServicesAdmission, membership};
  assert.equal(membership.mode, 'seed',
    `the actual membership reader must select seed ingress: ${membership.state}`);
  const replacement = new BootstrapService({
    nodeId: NODE_ID, nodeAddress: host.nodeAddress, wsPort: host.wsPort,
    bootIncarnation: host.bootstrap.bootIncarnation + 1,
    nodeService: new NodeService(), config: SEED_CONFIG,
    dataDir: host.directory,
    dataDirectoryManager: host.bootstrap.dataDirectoryManager,
    startupServicesAdmission,
    membershipOwnerOutcome: membership.membershipOwnerOutcome,
  });
  host.replacement = replacement;
  observeCreationRefusals(host, replacement);
  host.restartResult = await replacement.bootstrap();
  return host.restartResult;
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation();
  } catch (error) {
    failures.push(new Error(`${label}: ${error.message}`, {cause: error}));
  }
}

async function closeFixture(host) {
  const failures = [];
  for (const restore of host.restorations.toReversed()) {
    await attemptCleanup(failures, 'restore witness substitution', restore);
  }
  // Cleanup-only escape from the baseline's cached top-level rejection.
  // This is the existing owner, never evidence that top-level retry worked.
  for (const bootstrap of [host.replacement, host.bootstrap]) {
    if (bootstrap === null) continue;
    captureNativeDatabases(host, bootstrap);
    await attemptCleanup(failures, 'existing seed cleanup owner',
      () => bootstrap.seedCleanupHandler.cleanup());
    await attemptCleanup(failures, 'node shutdown', () => bootstrap.nodeService.shutdown());
  }
  await attemptCleanup(failures, 'thread manager shutdown',
    () => ServiceThreadManager.getInstance().shutdown());
  await attemptCleanup(failures, 'logs shutdown', () => LogsTableService.getInstance().shutdown());
  await attemptCleanup(failures, 'logging shutdown', () => LoggingService.getInstance().shutdown());
  for (const entry of host.nativeDatabases) {
    if (entry.db.open === false) continue;
    failures.push(new Error('Native database close is unproven: ' +
      `${entry.kind} ${entry.nodeId}/${entry.replicaId} ${entry.dbPath}; ` +
      `retained directory ${host.directory}`));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `Fixture cleanup failed; retained ${host.directory}`);
  }
  LogsTableService.resetInstance();
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  clearRegisteredControlPlaneSystemTableGateway();
  fs.rmSync(host.directory, {recursive: true, force: true});
}

async function withSeedReleaseFailureCustody(measure) {
  const host = {
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'seed-release-custody-')),
    bootstrap: null, replacement: null, handler: null, selected: null,
    deliveries: [], restorations: [], lifecycle: [], closeCalls: [],
    observerFailures: [], creationRefusals: [], failureEvents: [],
    nativeDatabases: [],
    forcedAtMs: null, closeFailure: new Error('witness exact native close failure'),
  };
  let failure = null;
  try {
    initializeTestEnvironment({
      nodeId: NODE_ID, storage: {dataDir: host.directory},
      rebalancer: {periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100, stabilizationPeriodMs: 10000},
    });
    host.wsPort = getUniquePort();
    host.nodeAddress = `ws://localhost:${host.wsPort}`;
    host.bootstrap = await createVirginSeedBootstrapService({
      nodeId: NODE_ID, nodeAddress: host.nodeAddress, wsPort: host.wsPort,
      dataDir: host.directory, config: SEED_CONFIG,
      routerFactory: (options) => createFaultRouter(host, options),
    });
    host.bootstrap.on(BOOTSTRAP_EVENT.FAILED,
      (event) => host.failureEvents.push(event));
    host.result = await host.bootstrap.bootstrap();
    host.bootstrapLifecycle = [...host.lifecycle];
    host.restart = () => restartRetainedSeed(host);
    await measure(host);
  } catch (error) {
    failure = error;
  }
  try {
    await closeFixture(host);
  } catch (error) {
    failure = failure === null ? error :
      new AggregateError([failure, error], 'Seed witness and cleanup failures retained');
  }
  if (failure !== null) throw failure;
}

export {CONTROL_PARTITION, SEED_RELEASE_BUDGET_MS, withSeedReleaseFailureCustody};
