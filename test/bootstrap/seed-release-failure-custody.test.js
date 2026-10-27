// Actual native seed startup and retained-directory restart. This measures
// cleanup/retry custody and the first existing admission frontier, not
// automatic partial-seed recovery, public process reentry or startup latency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import Database from 'better-sqlite3';

import {BOOTSTRAP_CLEANUP_STEP, BOOTSTRAP_PHASE, CLEANUP_RESULT} from
  '../../src/bootstrap/bootstrap-constants.js';
import {DURABLE_EVIDENCE_STATE, MEMBERSHIP_OWNER_REASON} from
  '../../src/bootstrap/rejoin-hints-constants.js';
import {
  ORIGINAL_ALLOCATION,
  ORIGINAL_ALLOCATION_REASON,
} from '../../src/raft/raft-rs-original-allocation-constants.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {CONTROL_PARTITION, SEED_RELEASE_BUDGET_MS,
  withSeedReleaseFailureCustody} from
  '../test-helpers/seed-release-failure-custody-fixture.js';

const SEED_TEST_TIMEOUT_MS = 90000;
const FAILURE_PREFIX = 'Seed participant release failed: ';

function errorIncludes(error, expected) {
  if (error === expected) return true;
  if (error?.cause && errorIncludes(error.cause, expected)) return true;
  return Array.isArray(error?.errors) &&
    error.errors.some((nested) => errorIncludes(nested, expected));
}

function belongsToSelectedAttempt(request, selected) {
  return request.partitionId === selected.request.partitionId &&
    request.release?.releaseId === selected.request.release.releaseId &&
    isDeepStrictEqual(request.attempt, selected.request.attempt);
}

function assertSelectedAttemptDeliveries(host) {
  const selected = host.selected;
  const freshIntents = host.deliveries.filter(({request}) =>
    request.action === ACTION.RELEASE && request.trigger === TRIGGER.FRESH_SEED);
  assert.ok(freshIntents.length >= 2,
    'the real fresh seed delivered control and dependent RELEASE intents');
  assert.ok(freshIntents.every(({request}) =>
    request.deadlineAtMs === selected.request.deadlineAtMs),
  'fresh-seed intents, including nested control, retain the original shared deadline');
  assert.ok(freshIntents.includes(selected.seedIntent));
  const attemptDeliveries = host.deliveries.filter(({request}) =>
    belongsToSelectedAttempt(request, selected));
  assert.equal(attemptDeliveries.filter(({request}) =>
    request.action === ACTION.ENABLE).length, 1);
  assert.equal(attemptDeliveries.some(({request}) =>
    [ACTION.OBSERVE_APPLIED_POSITION, ACTION.RESUME].includes(request.action)), false,
  'the selected expired attempt cannot dispatch applied observation or RESUME');
  assert.ok(freshIntents.some(({request, answer}) =>
    request.partitionId === CONTROL_PARTITION && answer?.outcome === OUTCOME.CUT_OVER),
  'the actual fresh-seed control cohort completed its release first');
  assert.equal(selected.seedIntent.answer?.missingFact, MISSING.RELEASE_DEADLINE);
  assert.equal(selected.seedIntent.answer?.phase, ACTION.OBSERVE_APPLIED_POSITION,
    'the selected fresh-seed refusal follows real ENABLE and precedes observation dispatch');
}

function assertCommittedExpiryEngaged(host) {
  assert.deepEqual(host.observerFailures, []);
  assert.equal(host.bootstrap.config.leadershipWaitTimeoutMs, SEED_RELEASE_BUDGET_MS);
  assert.equal(host.bootstrap.startupServicesAdmission.empty, true,
    'the real initial storage reader proved virgin storage');
  assert.equal(host.bootstrap.membershipOwnerOutcome.reasonCode,
    MEMBERSHIP_OWNER_REASON.FRESH_SEED);
  assert.ok(host.selected, 'the first actual non-control ENABLE was delivered');
  const {request, service, db, before, after, answer, settledAtMs} = host.selected;
  assert.equal(before, null, 'the real native target had no origin before ENABLE');
  assert.equal(answer.outcome, OUTCOME.OBSERVED);
  assert.deepEqual(answer.origin, after,
    'the original ENABLE answer corresponds to the real applied SQLite origin');
  assert.ok(after.originIndex > 0 && after.originTerm > 0);
  assert.ok(settledAtMs < request.deadlineAtMs,
    'native ENABLE committed before the clock-only expiry treatment');
  assert.equal(host.forcedAtMs, request.deadlineAtMs);
  assert.equal(service.timeSource, host.selected.serviceClock);
  assert.equal(host.bootstrap.nodeService.getTimeSource(), host.selected.nodeClock,
    'the treatment changes only handler time; native and node clocks remain intact');
  assertSelectedAttemptDeliveries(host);
  assert.equal(host.selected.admissionAfterEnable.state, ADMISSION.CLOSED,
    'the selected ENABLE answer precedes any serving admission');
  assert.equal(service.isShutdown, true, 'failed startup has closed the old service lifetime');
  assert.equal(host.result.success, false);
  assert.ok(host.result.error.startsWith(FAILURE_PREFIX), host.result.error);
  const primary = JSON.parse(host.result.error.slice(FAILURE_PREFIX.length));
  assert.equal(primary.answer.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(primary.answer.missingFact, MISSING.RELEASE_DEADLINE);
  assert.ok(host.closeCalls.length > 0, 'real cleanup reached the injected native close');
  assert.equal(host.closeCalls.every((call) => call.db === db), true);
  assert.equal(db.open, true);
  assert.equal(service.db, db);
  assert.deepEqual(readPartitionWriteOrigin(db), after,
    'failed cleanup leaves the committed origin on the exact retained connection');
  assert.ok(host.nativeDatabases.some((entry) => entry.db === db));
  assert.ok(host.nativeDatabases.some((entry) => entry.kind === 'message-group'),
    'teardown retains the already acquired message-group DB identities too');
}

function assertRegistrationCleanup(host) {
  assert.equal(host.result.phase, BOOTSTRAP_PHASE.REGISTRATION,
    'acquisition and release belong to registration failure cleanup');
  assert.equal(host.result.cleanup?.outcome, CLEANUP_RESULT.ERROR,
    'the primary failure carries the failed native cleanup observation');
  assert.equal(Object.isFrozen(host.result.cleanup), true);
  assert.equal(Object.isFrozen(host.result.cleanup.stepResults), true);
  assert.equal(host.result.cleanup.stepResults[BOOTSTRAP_CLEANUP_STEP.REGISTRATION],
    CLEANUP_RESULT.ERROR);
  assert.equal(host.result.cleanup.stepResults[BOOTSTRAP_CLEANUP_STEP.PARTITIONS],
    CLEANUP_RESULT.ERROR);
  assert.equal(host.failureEvents.length, 1);
  assert.equal(host.failureEvents[0].error, host.result.error);
  assert.deepEqual(host.failureEvents[0].cleanup, host.result.cleanup);
  assert.equal(host.bootstrap.replicaHandler, host.handler);
  assert.equal(host.handler.pendingRuntimeShutdowns.has(host.selected.service), true);
  assert.equal(host.bootstrap.partitionServices.get(host.selected.service.replicaId),
    host.selected.service, 'the failing service map retains the exact database owner');
  const events = host.bootstrapLifecycle;
  const mark = events.findIndex((event) => event.label === 'cdc.markShuttingDown');
  const shutdown = events.findIndex((event) =>
    event.label === 'engine.shutdown' && event.stage === 'called');
  const settled = events.findIndex((event) =>
    event.label === 'engine.shutdown' && event.stage === 'fulfilled');
  assert.ok(mark >= 0 && shutdown > mark && settled > shutdown,
    'the actual CDC is marked before the acquired SQL engine finishes shutdown');
  assert.equal(events[settled].cdcCurrent, true,
    'registration retains the CDC reference until engine shutdown settles');
  assert.equal(host.bootstrap.sqlQueryEngine, null);
  assert.equal(host.bootstrap.cdcIntegrationService, null);
}

async function assertTopLevelRetry(host) {
  const before = host.closeCalls.length;
  await assert.rejects(host.bootstrap.shutdown(),
    (error) => errorIncludes(error, host.closeFailure),
    'actual top-level shutdown rejects while the native DB cannot close');
  assert.ok(host.closeCalls.length > before);
  assert.equal(host.selected.db.open, true);
  assert.equal(host.bootstrap.replicaHandler, host.handler);
  assert.equal(host.handler.pendingRuntimeShutdowns.has(host.selected.service), true);
  host.restoreClose();
  await host.bootstrap.shutdown();
  assert.equal(host.selected.db.open, false,
    'the same top-level owner retries the restored real native close');
  assert.equal(host.selected.service.db, null);
  assert.equal(host.handler.pendingRuntimeShutdowns.size, 0);
  assert.equal(host.bootstrap.replicaHandler, null);
  assert.equal(host.bootstrap.partitionServices.size, 0);
  assert.equal(fs.existsSync(host.directory), true,
    'successful cleanup does not delete durable seed storage');
}

function readRetainedOrigin(host) {
  assert.equal(host.selected.db.open, false,
    'independent retained-state evidence requires the real old connection closed');
  const db = new Database(host.selected.dbPath, {readonly: true, fileMustExist: true});
  try {
    return readPartitionWriteOrigin(db);
  } finally {
    db.close();
  }
}

async function assertRetainedRestartFrontier(host, t) {
  assert.deepEqual(readRetainedOrigin(host), host.selected.after);
  const result = await host.restart();
  assert.equal(host.retained.startupServicesAdmission.state, DURABLE_EVIDENCE_STATE.READABLE);
  assert.equal(host.retained.startupServicesAdmission.empty, false,
    'native retained state is not virgin storage despite missing SERVICES rows');
  assert.deepEqual(host.retained.startupServicesAdmission.rows, []);
  assert.equal(host.replacement.startupServicesAdmission,
    host.retained.startupServicesAdmission);
  assert.equal(host.replacement.membershipOwnerOutcome,
    host.retained.membership.membershipOwnerOutcome);
  assert.equal(result.success, false, 'actual retained startup must not invent permission');
  assert.deepEqual(host.creationRefusals, [],
    'retained cold recovery reopens the declared cohort without creation refusal');
  assert.equal(result.phase, BOOTSTRAP_PHASE.REGISTRATION);
  assert.equal(result.error, ORIGINAL_ALLOCATION.DEFERRED);
  assert.equal(result.cause?.code, ORIGINAL_ALLOCATION.DEFERRED);
  assert.equal(result.cause?.reason, ORIGINAL_ALLOCATION_REASON.SERVING_DEFERRED);
  assert.equal(host.replacement.replicaHandler, null,
    'serving-deferred handoff completion never exposes a live replica handler');
  assert.deepEqual(readRetainedOrigin(host), host.selected.after);
  t.diagnostic(JSON.stringify({
    code: result.cause?.code,
    reason: result.cause?.reason,
    phase: result.phase,
    membershipState: host.retained.membership.state,
    storageState: host.retained.startupServicesAdmission.state,
  }));
}

test('actual seed committed-origin expiry retains cleanup custody and restart refusal',
  {timeout: SEED_TEST_TIMEOUT_MS}, async (t) => {
    await withSeedReleaseFailureCustody(async (host) => {
      assertCommittedExpiryEngaged(host);
      t.diagnostic(JSON.stringify({nodeId: host.bootstrap.nodeId,
        partitionId: host.selected.service.partitionId,
        replicaId: host.selected.service.replicaId, dbPath: host.selected.dbPath,
        origin: host.selected.after, deadlineAtMs: host.selected.request.deadlineAtMs,
        budgetMs: SEED_RELEASE_BUDGET_MS, failure: host.result}));
      await t.test('registration failure observes every acquired cleanup owner',
        () => assertRegistrationCleanup(host));
      await t.test('BootstrapService.shutdown retries the same retained native close',
        () => assertTopLevelRetry(host));
      // Baseline may have failed the preceding assertion with its cached
      // rejection. This explicit existing-owner teardown is not retry proof.
      host.restoreClose();
      await host.bootstrap.seedCleanupHandler.cleanup();
      await t.test('retained origin reaches the actual startup admission frontier',
        (child) => assertRetainedRestartFrontier(host, child));
    });
  });
