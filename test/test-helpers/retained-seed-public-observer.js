// Passive actual-entry observation plus one selected handler-clock expiry.
// No constructor, authority, native commit, listener or shutdown is replaced.
import {isDeepStrictEqual} from 'node:util';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BOOTSTRAP_EVENT} from '../../src/bootstrap/bootstrap-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {MessageRouter} from '../../src/transport/message-router.js';
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

const CONTROL_PARTITION = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];

function errorRecord(error) {
  if (error === null || error === undefined) return null;
  return {name: error.name, message: error.message, code: error.code,
    errorCode: error.errorCode, stack: error.stack,
    cause: errorRecord(error.cause),
    errors: Array.isArray(error.errors) ? error.errors.map(errorRecord) : null};
}

function substitute(restores, owner, key, value) {
  const prior = Object.getOwnPropertyDescriptor(owner, key);
  Object.defineProperty(owner, key, {configurable: true, writable: true, value});
  restores.push(() => {
    if (prior) Object.defineProperty(owner, key, prior);
    else if (!delete owner[key]) throw new Error(`Cannot restore ${key}`);
  });
}

function observe(host, work) {
  try {
    return work();
  } catch (error) {
    host.observerErrors.push(errorRecord(error));
    return null;
  }
}

function captureDatabases(host) {
  if (host.bootstrap === null) return;
  for (const [kind, services] of [
    ['partition', host.bootstrap.partitionServices],
    ['message-group', host.bootstrap.messageGroupServices],
  ]) {
    for (const [replicaId, service] of services) {
      if (!service.db || host.databases.some((entry) => entry.db === service.db)) continue;
      host.databases.push({kind, replicaId, db: service.db,
        dbPath: service.dbPath, nodeId: host.bootstrap.nodeId});
    }
  }
}

function watchCreation(host, key, method) {
  const owner = host.bootstrap[key];
  const original = owner[method];
  substitute(host.restores, owner, method, function(...args) {
    const failed = (error) => observe(host, () => {
      captureDatabases(host);
      host.creationRefusals.push({owner: key, method,
        phase: host.bootstrap.phase, definition: args[0]?.definition,
        error: errorRecord(error)});
    });
    let result;
    try {
      result = Reflect.apply(original, this, args);
    } catch (error) {
      failed(error);
      throw error;
    }
    void result.then(() => observe(host, () => captureDatabases(host)), failed);
    return result;
  });
}

function watchBootstrap(host) {
  const original = BootstrapService.prototype.bootstrap;
  substitute(host.restores, BootstrapService.prototype, 'bootstrap', function(...args) {
    observe(host, () => {
      host.bootstrap = this;
      this.on(BOOTSTRAP_EVENT.FAILED, (event) => host.failureEvents.push(event));
      watchCreation(host, 'seedMessageGroupsPhase', 'createBootstrapMessageGroupReplica');
      watchCreation(host, 'seedPartitionsPhase', 'createBootstrapPartitionReplica');
    });
    const result = Reflect.apply(original, this, args);
    void result.then((answer) => observe(host, () => {
      host.bootstrapResult = answer;
      captureDatabases(host);
    }), (error) => observe(host, () => {
      host.bootstrapError = errorRecord(error);
      captureDatabases(host);
    }));
    return result;
  });
}

function captureHandler(host) {
  if (host.handler !== null) return;
  captureDatabases(host);
  const handler = host.bootstrap.replicaHandler;
  if (!handler) throw new Error('actual release handler absent');
  host.handler = handler;
  host.originalClock = handler.timeSource;
  if (!host.expire) return;
  const clock = host.originalClock;
  substitute(host.restores, handler, 'timeSource', {
    now: () => host.forcedAtMs ?? clock.now(),
    setTimeout: (...args) => clock.setTimeout(...args),
    clearTimeout: (...args) => clock.clearTimeout(...args),
  });
}

function selectOuterIntent(host, request) {
  if (!host.expire || host.selected !== null ||
      request.action !== ACTION.ENABLE || request.partitionId === CONTROL_PARTITION) return null;
  return host.deliveries.findLast(({request: outer, settled}) => !settled &&
    outer.action === ACTION.RELEASE && outer.trigger === TRIGGER.FRESH_SEED &&
    outer.partitionId === request.partitionId &&
    outer.deadlineAtMs === request.attempt?.deadlineAtMs &&
    outer.targetBuildDigest === request.release?.targetBuildDigest) ?? null;
}

function selectEnable(host, request, outer) {
  const service = host.handler.localServices.get(request.replicaId);
  if (!service) throw new Error('registered ENABLE has no actual selected service');
  host.selected = {request, outer, service,
    db: service.db, dbPath: service.dbPath,
    before: readPartitionWriteOrigin(service.db),
    nodeClock: host.bootstrap.nodeService.getTimeSource(), serviceClock: service.timeSource};
}

function expireAfterActualAnswer(host, response) {
  const selected = host.selected;
  selected.answer = response[PARTICIPANT_RELEASE_RESULT_FIELD];
  selected.after = readPartitionWriteOrigin(selected.db);
  selected.settledAtMs = host.originalClock.now();
  selected.admissionAfterEnable = participantReleaseAdmissionOf(selected.service);
  host.forcedAtMs = selected.request.deadlineAtMs;
  selected.nativeClockUnchanged = selected.service.timeSource === selected.serviceClock;
  selected.nodeClockUnchanged =
    host.bootstrap.nodeService.getTimeSource() === selected.nodeClock;
}

function deliverParticipant(host, router, original, args) {
  observe(host, () => captureHandler(host));
  const request = args[1];
  const record = {request, answer: null, error: null, settled: false};
  host.deliveries.push(record);
  const outer = selectOuterIntent(host, request);
  if (outer !== null) observe(host, () => selectEnable(host, request, outer));
  const operation = Reflect.apply(original, router, args);
  return Promise.resolve(operation).then((response) => {
    observe(host, () => {
      record.answer = response[PARTICIPANT_RELEASE_RESULT_FIELD];
      record.settled = true;
      if (outer !== null) expireAfterActualAnswer(host, response);
    });
    return response;
  }, (error) => {
    record.error = errorRecord(error);
    record.settled = true;
    throw error;
  });
}

function watchDelivery(host) {
  const original = MessageRouter.prototype.deliver;
  substitute(host.restores, MessageRouter.prototype, 'deliver', function(...args) {
    if (args[1]?.type !== PARTICIPANT_RELEASE_TYPE || host.bootstrap === null) {
      return Reflect.apply(original, this, args);
    }
    return deliverParticipant(host, this, original, args);
  });
}

function selectedSummary(host) {
  const selected = host.selected;
  if (!selected) return null;
  const sameAttempt = ({request}) => request.partitionId === selected.request.partitionId &&
    request.release?.releaseId === selected.request.release.releaseId &&
    isDeepStrictEqual(request.attempt, selected.request.attempt);
  const fresh = host.deliveries.filter(({request}) =>
    request.action === ACTION.RELEASE && request.trigger === TRIGGER.FRESH_SEED);
  return {request: selected.request, dbPath: selected.dbPath,
    before: selected.before, after: selected.after, answer: selected.answer,
    settledAtMs: selected.settledAtMs, forcedAtMs: host.forcedAtMs,
    admissionAfterEnable: selected.admissionAfterEnable,
    nativeClockUnchanged: selected.nativeClockUnchanged,
    nodeClockUnchanged: selected.nodeClockUnchanged,
    selectedOuter: selected.outer, freshIntents: fresh,
    selectedAttempt: host.deliveries.filter(sameAttempt)};
}

function createRetainedSeedPublicObserver({expire}) {
  const host = {expire, bootstrap: null, bootstrapResult: null, bootstrapError: null,
    handler: null, selected: null, originalClock: null, forcedAtMs: null,
    restores: [], databases: [], deliveries: [], creationRefusals: [],
    failureEvents: [], observerErrors: []};
  watchBootstrap(host);
  watchDelivery(host);
  return {
    errorRecord,
    snapshot() {
      observe(host, () => captureDatabases(host));
      return {bootstrapObserved: host.bootstrap !== null,
        bootIncarnation: host.bootstrap?.bootIncarnation,
        budgetMs: host.bootstrap?.config.leadershipWaitTimeoutMs,
        membershipOwnerOutcome: host.bootstrap?.membershipOwnerOutcome,
        startupServicesAdmission: host.bootstrap?.startupServicesAdmission,
        bootstrapResult: host.bootstrapResult === null ? null : {
          success: host.bootstrapResult.success, error: host.bootstrapResult.error,
          phase: host.bootstrapResult.phase, cleanup: host.bootstrapResult.cleanup,
        },
        bootstrapError: host.bootstrapError,
        failureEvents: host.failureEvents, creationRefusals: host.creationRefusals,
        observerErrors: host.observerErrors, selected: selectedSummary(host),
        databases: host.databases.map(({kind, replicaId, db, dbPath, nodeId}) =>
          ({kind, replicaId, dbPath, nodeId, closed: db.open === false})),
        deliveryCount: host.deliveries.length};
    },
    restore() {
      for (const restore of host.restores.toReversed()) observe(host, restore);
    },
  };
}

export {createRetainedSeedPublicObserver, CONTROL_PARTITION};
