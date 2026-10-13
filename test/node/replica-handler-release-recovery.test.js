// The release continuation and final OPEN mutation use the actual handler,
// tracked-service registry, participant facts owner and pause/resume owner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, test} from 'node:test';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-release-facts.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {
  participantReleaseAdmissionOf,
  raiseParticipantCutoverPause,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createInProcessMockTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {
  clearFixtureSingletons,
  resetFixtureSingletons,
  startLeader,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function currentReleaseOf(facts) {
  return releaseIdentityOf({
    partitionId: facts.partitionId,
    targetBuildDigest: facts.buildDigest,
    configurationKey: facts.membership.configurationKey,
    membershipGenerationIndex: facts.membership.membershipGenerationIndex,
  });
}

function retainFailure(current, next, message) {
  return current === null ? next : new AggregateError([current, next], message);
}

async function settleOwnerTurns() {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

function recoveryService({partitionId, replicaId, readStatus, timeSource, db = null}) {
  const service = new EventEmitter();
  Object.assign(service, {partitionId, replicaId, initialized: true, isShutdown: false,
    timeSource, db, raft: {readStatus}, async shutdown() {
      this.isShutdown = true;
    }});
  return service;
}

function heldStatus(replicaId, partitionId, retryAfterMs, onRetryRead) {
  const status = {outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    recoveryRequired: true, role: null, reason: 'runtime recovery held',
    phase: 'durable-record-read', groupId: partitionId,
    replicaIdentity: replicaId, failure: {reason: 'storage unavailable'}};
  Object.defineProperty(status, 'retryAfterMs', {enumerable: true, get() {
    onRetryRead();
    if (retryAfterMs instanceof Error) throw retryAfterMs;
    return retryAfterMs;
  }});
  return status;
}

function coreStatus(role, overrides = {}) {
  return {outcome: RAFT_OPERATION_OUTCOME.CORE_OK, role, ...overrides};
}

function leaderWithoutOriginDb() {
  return {prepare: () => ({get: () =>
    ({generation: 0, origin_index: null, origin_term: null})})};
}

function ownerLogger(reports) {
  const ignore = () => {};
  return {debug: ignore, warn: ignore, error: ignore, info(message, fields) {
    if (message === PARTICIPANT_RELEASE_LOG) reports.push(fields);
  }};
}

async function withRecoveryHandler(measure, suppliedTimeSource = null) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-recovery-cadence-'));
  const timeSource = suppliedTimeSource ?? new VirtualTimeSource();
  const handler = new ReplicaHandler({nodeId: 'release-recovery-node', ownerIncarnation: 1,
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
    cdcIntegrationService: {}, createPartitionService: () => null,
    messageRouter: createInProcessMockTransport(), dataDir: directory, timeSource});
  const reports = [];
  handler.logger = ownerLogger(reports);
  let failure = null;
  try {
    await measure({handler, timeSource, reports});
  } catch (error) {
    failure = error;
  }
  try {
    await handler.shutdown();
  } catch (error) {
    failure = retainFailure(failure, error, 'release recovery assertion and cleanup failed');
  }
  try {
    fs.rmSync(directory, {recursive: true, force: true});
  } catch (error) {
    failure = retainFailure(failure, error, 'release recovery artifact cleanup failed');
  }
  if (failure !== null) throw failure;
}

async function currentResumeRequest(handler, service) {
  raiseParticipantCutoverPause(service);
  const facts = await readParticipantReleaseFacts(handler, service);
  assert.equal(facts.outcome, OUTCOME.OBSERVED, JSON.stringify(facts));
  const release = currentReleaseOf(facts);
  assert.notEqual(release, null);
  return {release, census: [facts]};
}

function deferCommittedMembership(service) {
  const original = service.controllablePort.committedMembershipHandler;
  assert.equal(typeof original, 'function');
  const started = Promise.withResolvers();
  const continuation = Promise.withResolvers();
  service.controllablePort.committedMembershipHandler = async (...args) => {
    started.resolve();
    await continuation.promise;
    return original(...args);
  };
  return {started: started.promise, release: continuation.resolve};
}

async function withActualHandler(measure) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-recovery-owner-'));
  const transport = createInProcessMockTransport();
  const {leader} = await startLeader();
  const handler = new ReplicaHandler({
    nodeId: leader.nodeId,
    ownerIncarnation: 1,
    systemTableCache: leader.systemTableCache,
    cdcIntegrationService: {},
    createPartitionService: () => leader,
    messageRouter: transport,
    dataDir: directory,
    timeSource: new VirtualTimeSource({startMs: leader.timeSource.now()}),
  });
  handler.localServices.set(leader.replicaId, leader);
  let failure = null;
  try {
    await measure({handler, leader});
  } catch (error) {
    failure = error;
  }
  try {
    await handler.shutdown();
  } catch (error) {
    failure = retainFailure(failure, error, 'release lifecycle assertion and cleanup failed');
  }
  try {
    fs.rmSync(directory, {recursive: true, force: true});
  } catch (error) {
    failure = retainFailure(failure, error, 'release lifecycle assertion and artifact cleanup failed');
  }
  if (failure !== null) throw failure;
}

test('current live resume opens once and a wrong release ID preserves that OPEN proof',
  async () => withActualHandler(async ({handler, leader}) => {
    const request = await currentResumeRequest(handler, leader);
    assert.equal(await resumeParticipantCutoverAdmission(handler, leader, request),
      OUTCOME.RESUMED);
    assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.OPEN);

    const mismatched = {...request,
      release: {...request.release, releaseId: 'different-release-id'}};
    assert.equal(await resumeParticipantCutoverAdmission(handler, leader, mismatched),
      OUTCOME.STALE);
    assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.OPEN,
      'a mismatched caller does not revoke a still-current OPEN proof');
  }));

test('shutdown reentered by the OPEN proof status read refuses idempotent resume',
  async () => withActualHandler(async ({handler, leader}) => {
    const request = await currentResumeRequest(handler, leader);
    assert.equal(await resumeParticipantCutoverAdmission(handler, leader, request),
      OUTCOME.RESUMED);
    const port = leader.controllablePort;
    const currentTerm = port.term;
    let shutdown = null;
    Object.defineProperty(port, 'term', {configurable: true, get() {
      shutdown ??= handler.shutdown();
      return currentTerm;
    }});

    assert.equal(await resumeParticipantCutoverAdmission(handler, leader, request),
      OUTCOME.STALE);
    assert.equal(handler.shuttingDown, true);
    assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED,
      'shutdown reentered by the owner read closes the stale OPEN proof');
    await shutdown;
  }));

test('handler shutdown begun during awaited release facts cannot reopen admission',
  async () => withActualHandler(async ({handler, leader}) => {
    const request = await currentResumeRequest(handler, leader);
    const membership = deferCommittedMembership(leader);

    const operationHold = Promise.withResolvers();
    handler.operationTasks.add(operationHold.promise);
    let shutdown = null;
    let failure = null;
    try {
      const resume = resumeParticipantCutoverAdmission(handler, leader, request);
      await membership.started;
      shutdown = handler.shutdown();
      assert.equal(handler.shuttingDown, true,
        'the actual handler lifecycle owns the shutdown fence');
      assert.equal(handler.localServices.get(leader.replicaId), leader,
        'shutdown retains the exact service while admitted work settles');

      membership.release();
      assert.equal(await resume, OUTCOME.STALE,
        'shutdown started during the facts await refuses the final resume');
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED,
        'the settling release task cannot reopen admission');
    } catch (error) {
      failure = error;
    } finally {
      membership.release();
      operationHold.resolve();
      handler.operationTasks.delete(operationHold.promise);
      if (shutdown !== null) {
        try {
          await shutdown;
        } catch (error) {
          failure = retainFailure(failure, error,
            'shutdown-race assertion and actual handler cleanup failed');
        }
      }
    }
    if (failure !== null) throw failure;
  }));

test('service shutdown begun during awaited release facts returns stale and stays closed',
  async () => withActualHandler(async ({handler, leader}) => {
    const request = await currentResumeRequest(handler, leader);
    const membership = deferCommittedMembership(leader);

    let shutdown = null;
    let failure = null;
    try {
      const resume = resumeParticipantCutoverAdmission(handler, leader, request);
      await membership.started;
      shutdown = leader.shutdown();
      assert.equal(leader.isShutdown, true,
        'the actual service lifecycle owns the shutdown fence');
      membership.release();
      assert.equal(await resume, OUTCOME.STALE);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
    } catch (error) {
      failure = error;
    } finally {
      membership.release();
      if (shutdown !== null) {
        try {
          await shutdown;
        } catch (error) {
          failure = retainFailure(failure, error,
            'service-shutdown assertion and actual service cleanup failed');
        }
      }
    }
    if (failure !== null) throw failure;
  }));

test('host-held recovery uses the fixed owner cadence and never reads retryAfterMs',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'held-cadence-p1';
    const replicaId = 'held-cadence-r1';
    const retryValues = [Number.MAX_SAFE_INTEGER, -1, 0.5,
      Number.MAX_SAFE_INTEGER + 1, Infinity, Object(7), new Proxy(Object(9), {}),
      new Error('retryAfterMs getter must remain unread')];
    let statusReads = 0;
    let retryFieldReads = 0;
    let service = null;
    service = recoveryService({partitionId, replicaId, timeSource, readStatus() {
      statusReads += 1;
      if (statusReads === 1) {
        service.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
          {partitionId, replicaId});
      }
      const value = retryValues[(statusReads - 1) % retryValues.length];
      return heldStatus(replicaId, partitionId, value, () => retryFieldReads += 1);
    }});
    handler.localServices.set(replicaId, service);

    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(statusReads, 1,
      'a synchronous consensus wake coalesces into the current held turn');
    assert.equal(timeSource.pendingTimerCount(), 1);
    timeSource.advance(BOUND.RECOVERY_RETRY_MS - 1);
    await settleOwnerTurns();
    assert.equal(statusReads, 1, 'the retained observation does not run before its due time');
    timeSource.advance(1);
    await settleOwnerTurns();
    assert.equal(statusReads, 2);
    for (let turn = 2; turn < retryValues.length; turn += 1) {
      timeSource.advance(BOUND.RECOVERY_RETRY_MS);
      await settleOwnerTurns();
      assert.equal(statusReads, turn + 1,
        'each continuously held turn waits for the fixed owner cadence');
      assert.equal(timeSource.pendingTimerCount(), 1,
        'one hosted partition retains one timer-backed observation debt');
    }
    assert.equal(retryFieldReads, 0,
      'the release owner does not inspect or coerce the runtime retry field');
    assert.equal(reports.length, 1,
      'one unchanged held signature is throttled for the existing report window');
    assert.deepEqual(reports[0], {
      partitionId,
      outcome: OUTCOME.UNAVAILABLE,
      missingFact: 'semantic_raft_status',
      reason: 'runtime recovery held',
      blockedGroupId: partitionId,
      blockedReplicaId: replicaId,
      recoveryPhase: 'durable-record-read',
      statusOutcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      failure: {reason: 'storage unavailable'},
    });

    while (timeSource.now() + BOUND.RECOVERY_RETRY_MS < BOUND.DRAIN_DEADLINE_MS) {
      timeSource.advance(BOUND.RECOVERY_RETRY_MS);
      await settleOwnerTurns();
    }
    assert.equal(reports.length, 1,
      'the same signature remains throttled before the report window expires');
    const untilRollover = BOUND.DRAIN_DEADLINE_MS - timeSource.now();
    timeSource.advance(untilRollover - 1);
    await settleOwnerTurns();
    assert.equal(reports.length, 1);
    timeSource.advance(1);
    await settleOwnerTurns();
    assert.equal(reports.length, 2,
      'a persistent hosted hold is reported again at the existing window boundary');
    assert.equal(statusReads,
      Math.floor(timeSource.now() / BOUND.RECOVERY_RETRY_MS) + 1,
      'the full held span performs only the initial read plus one read per owner cadence');
    assert.equal(retryFieldReads, 0,
      'the runtime retry field remains unread across the full report window');

    const beforeBurst = statusReads;
    for (let event = 0; event < 4; event += 1) {
      service.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
        {partitionId, replicaId});
    }
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(statusReads, beforeBurst + 1,
      'a real event burst advances one coalesced partition observation');
    assert.equal(timeSource.pendingTimerCount(), 1);
  }));

test('ordered hosted observations prefer a leader and retain no earlier held debt',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'ordered-leader-p1';
    let heldReads = 0;
    let leaderReads = 0;
    let laterHeldReads = 0;
    const firstHeld = recoveryService({partitionId, replicaId: 'ordered-held-r1', timeSource,
      readStatus() {
        heldReads += 1;
        return heldStatus('ordered-held-r1', partitionId, 0, () => {
          throw new Error('retryAfterMs must remain unread');
        });
      }});
    const leader = recoveryService({partitionId, replicaId: 'ordered-leader-r2', timeSource,
      db: leaderWithoutOriginDb(), readStatus() {
        leaderReads += 1;
        return coreStatus(RAFT_ROLE.LEADER);
      }});
    const laterHeld = recoveryService({partitionId, replicaId: 'ordered-held-r3', timeSource,
      readStatus() {
        laterHeldReads += 1;
        return heldStatus('ordered-held-r3', partitionId, 0, () => {});
      }});
    handler.localServices.set(firstHeld.replicaId, firstHeld);
    handler.localServices.set(leader.replicaId, leader);
    handler.localServices.set(laterHeld.replicaId, laterHeld);

    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(heldReads, 1);
    assert.equal(leaderReads, 1);
    assert.equal(laterHeldReads, 0, 'the first actual leader ends the ordered observation');
    assert.equal(timeSource.pendingTimerCount(), 0,
      'an earlier held snapshot grants no timed debt after a current leader is found');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].outcome, OUTCOME.OPERATOR_REQUIRED);
    assert.equal(reports[0].missingFact, 'explicit_pre_origin_release_request');
  }));

test('no-leader observation gives canonical held status precedence over unavailable status',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'mixed-held-p1';
    let unavailableReads = 0;
    let heldReads = 0;
    const unavailable = recoveryService({partitionId, replicaId: 'mixed-unavailable-r1',
      timeSource, readStatus() {
        unavailableReads += 1;
        return null;
      }});
    const held = recoveryService({partitionId, replicaId: 'mixed-held-r2', timeSource,
      readStatus() {
        heldReads += 1;
        return heldStatus('mixed-held-r2', partitionId, 20000, () => {
          throw new Error('retryAfterMs must remain unread');
        });
      }});
    handler.localServices.set(unavailable.replicaId, unavailable);
    handler.localServices.set(held.replicaId, held);

    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(unavailableReads, 1);
    assert.equal(heldReads, 1);
    assert.equal(timeSource.pendingTimerCount(), 1,
      'one canonical held member retains one partition debt');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].blockedReplicaId, held.replicaId);
    assert.equal(reports[0].reason, 'runtime recovery held');
  }));

test('healthy nonleaders do not poll while malformed status is typed and event-driven',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    let followerReads = 0;
    let candidateReads = 0;
    let malformedReads = 0;
    let nullReads = 0;
    let uninitializedReads = 0;
    const follower = recoveryService({partitionId: 'healthy-p1', replicaId: 'healthy-r1',
      timeSource, readStatus() {
        followerReads += 1;
        return coreStatus(RAFT_ROLE.FOLLOWER);
      }});
    const candidate = recoveryService({partitionId: 'healthy-p1', replicaId: 'healthy-r2',
      timeSource, readStatus() {
        candidateReads += 1;
        return coreStatus(RAFT_ROLE.CANDIDATE);
      }});
    const malformed = recoveryService({partitionId: 'malformed-p1',
      replicaId: 'malformed-r1', timeSource, readStatus() {
        malformedReads += 1;
        return {outcome: 'unknown-semantic-status', role: null};
      }});
    const nullStatus = recoveryService({partitionId: 'null-status-p1',
      replicaId: 'null-status-r1', timeSource, readStatus() {
        nullReads += 1;
        return null;
      }});
    const uninitialized = recoveryService({partitionId: 'uninitialized-p1',
      replicaId: 'uninitialized-r1', timeSource, readStatus() {
        uninitializedReads += 1;
        return coreStatus(RAFT_ROLE.FOLLOWER);
      }});
    uninitialized.initialized = false;
    handler.localServices.set(follower.replicaId, follower);
    handler.localServices.set(candidate.replicaId, candidate);
    handler.localServices.set(malformed.replicaId, malformed);
    handler.localServices.set(nullStatus.replicaId, nullStatus);
    handler.localServices.set(uninitialized.replicaId, uninitialized);

    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(followerReads, 1);
    assert.equal(candidateReads, 1);
    assert.equal(malformedReads, 1);
    assert.equal(nullReads, 1);
    assert.equal(uninitializedReads, 0);
    assert.equal(timeSource.pendingTimerCount(), 0);
    assert.equal(reports.length, 3,
      'healthy nonleaders are silent and unavailable status remains visible');
    const reportByPartition = new Map(reports.map((report) => [report.partitionId, report]));
    assert.equal(reportByPartition.get(malformed.partitionId).statusOutcome,
      'unknown-semantic-status');
    assert.equal(reportByPartition.get(nullStatus.partitionId).statusOutcome, null);
    assert.equal(reportByPartition.get(uninitialized.partitionId).statusOutcome, null);
    for (const report of reportByPartition.values()) {
      assert.equal(report.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(report.missingFact, 'semantic_raft_status');
    }
  }));

test('release recovery caps running observations at four and drains the fifth in-lane',
  async () => withRecoveryHandler(async ({handler, timeSource}) => {
    const reads = new Map();
    for (let member = 0; member < 5; member += 1) {
      const partitionId = `concurrency-p${member}`;
      const replicaId = `concurrency-r${member}`;
      const service = recoveryService({partitionId, replicaId, timeSource, readStatus() {
        reads.set(replicaId, (reads.get(replicaId) ?? 0) + 1);
        return heldStatus(replicaId, partitionId, 0, () => {});
      }});
      handler.localServices.set(replicaId, service);
    }

    timeSource.advance(0);
    assert.equal([...reads.values()].reduce((sum, count) => sum + count, 0), 4,
      'the synchronous dispatch starts no more than four owner attempts');
    await settleOwnerTurns();
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal([...reads.values()].reduce((sum, count) => sum + count, 0), 5,
      'the same queue admits the fifth attempt after one owner slot settles');
    assert.equal(timeSource.pendingTimerCount(), 1,
      'all held partitions share the one existing recovery timer');
  }));

test('replacement before a held wake observes only the current registry object',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'replacement-p1';
    const replicaId = 'replacement-r1';
    let oldReads = 0;
    let replacementReads = 0;
    const oldService = recoveryService({partitionId, replicaId, timeSource, readStatus() {
      oldReads += 1;
      return heldStatus(replicaId, partitionId, 0, () => {});
    }});
    handler.localServices.set(replicaId, oldService);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(oldReads, 1);
    assert.equal(timeSource.pendingTimerCount(), 1);

    const replacement = recoveryService({partitionId, replicaId, timeSource, readStatus() {
      replacementReads += 1;
      return coreStatus(RAFT_ROLE.FOLLOWER);
    }});
    handler.localServices.set(replicaId, replacement);
    timeSource.advance(0);
    await settleOwnerTurns();
    timeSource.advance(BOUND.RECOVERY_RETRY_MS);
    await settleOwnerTurns();
    assert.equal(oldReads, 1, 'the removed object receives no retained wake');
    assert.equal(replacementReads, 1, 'the replacement event observes the current object once');
    assert.equal(timeSource.pendingTimerCount(), 0);
    assert.equal(reports.length, 1, 'the old held report does not grow after replacement');
  }));

test('last registry removal discharges its timer and a later registration reports afresh',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'last-removal-p1';
    const replicaId = 'last-removal-r1';
    let oldReads = 0;
    const oldService = recoveryService({partitionId, replicaId, timeSource, readStatus() {
      oldReads += 1;
      return heldStatus(replicaId, partitionId, 0, () => {});
    }});
    handler.localServices.set(replicaId, oldService);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(reports.length, 1);
    assert.equal(timeSource.pendingTimerCount(), 1);

    assert.equal(handler.localServices.delete(replicaId), true);
    assert.equal(timeSource.pendingTimerCount(), 0,
      'removing the last hosted service discharges its volatile wake');
    timeSource.advance(BOUND.RECOVERY_RETRY_MS);
    await settleOwnerTurns();
    assert.equal(oldReads, 1);

    const replacement = recoveryService({partitionId, replicaId, timeSource,
      readStatus: () => heldStatus(replicaId, partitionId, 0, () => {})});
    handler.localServices.set(replicaId, replacement);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(reports.length, 2,
      'a later current registration owns a fresh hosted-lifetime report');
  }));

test('shutdown retained in the registry clears its report before current reentry',
  async () => withRecoveryHandler(async ({handler, timeSource, reports}) => {
    const partitionId = 'shutdown-retained-p1';
    const replicaId = 'shutdown-retained-r1';
    const oldService = recoveryService({partitionId, replicaId, timeSource,
      readStatus: () => heldStatus(replicaId, partitionId, 0, () => {})});
    handler.localServices.set(replicaId, oldService);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(reports.length, 1);
    assert.equal(timeSource.pendingTimerCount(), 1);

    await oldService.shutdown();
    assert.equal(handler.localServices.get(replicaId), oldService,
      'the lifecycle can be shut down while cleanup still retains registry custody');
    timeSource.advance(BOUND.RECOVERY_RETRY_MS);
    await settleOwnerTurns();
    assert.equal(timeSource.pendingTimerCount(), 0);

    const replacement = recoveryService({partitionId, replicaId, timeSource,
      readStatus: () => heldStatus(replicaId, partitionId, 0, () => {})});
    handler.localServices.set(replicaId, replacement);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(reports.length, 2,
      'a current service is not throttled by a stopped prior hosted lifetime');
  }));

test('timer registration failure is visible and claims no scheduled wake',
  async () => {
    const clock = new VirtualTimeSource();
    const timerFailure = new Error('timer registration refused');
    const failingTimeSource = {
      now: () => clock.now(),
      setTimeout: () => {
        throw timerFailure;
      },
      clearTimeout: (handle) => clock.clearTimeout(handle),
    };
    await withRecoveryHandler(async ({handler, reports}) => {
      const service = recoveryService({partitionId: 'timer-failure-p1',
        replicaId: 'timer-failure-r1', timeSource: failingTimeSource,
        readStatus: () => coreStatus(RAFT_ROLE.FOLLOWER)});
      assert.doesNotThrow(() => handler.localServices.set(service.replicaId, service));
      assert.equal(reports.length, 1);
      assert.equal(reports[0].outcome, OUTCOME.UNAVAILABLE);
      assert.equal(reports[0].missingFact, 'release_recovery_timer');
      assert.equal(reports[0].reason, timerFailure.message);
      assert.equal(clock.pendingTimerCount(), 0);
    }, failingTimeSource);
  });

test('direct recovery shutdown clears held debt and ignores later owner events',
  async () => withRecoveryHandler(async ({handler, timeSource}) => {
    const partitionId = 'stopped-p1';
    const replicaId = 'stopped-r1';
    let statusReads = 0;
    const service = recoveryService({partitionId, replicaId, timeSource, readStatus() {
      statusReads += 1;
      return heldStatus(replicaId, partitionId, 0, () => {});
    }});
    handler.localServices.set(replicaId, service);
    timeSource.advance(0);
    await settleOwnerTurns();
    assert.equal(statusReads, 1);
    assert.equal(timeSource.pendingTimerCount(), 1);

    await handler.participantReleaseRecovery.shutdown();
    assert.equal(timeSource.pendingTimerCount(), 0);
    service.emit(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, {partitionId, replicaId});
    timeSource.advance(BOUND.RECOVERY_RETRY_MS * 2);
    await settleOwnerTurns();
    assert.equal(statusReads, 1, 'a stopped owner retains no background obligation');
  }));

test('service replacement during awaited facts cannot reopen the stale object',
  async () => withActualHandler(async ({handler, leader}) => {
    const request = await currentResumeRequest(handler, leader);
    const membership = deferCommittedMembership(leader);
    let replacement = null;
    let failure = null;
    try {
      const resume = resumeParticipantCutoverAdmission(handler, leader, request);
      await membership.started;
      ({leader: replacement} = await startLeader());
      handler.localServices.set(leader.replicaId, replacement);
      membership.release();
      assert.equal(await resume, OUTCOME.STALE);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED,
        'the replaced service cannot receive the final OPEN mutation');
      assert.equal(handler.localServices.get(leader.replicaId), replacement);
    } catch (error) {
      failure = error;
    } finally {
      membership.release();
      if (handler.localServices.get(leader.replicaId) !== leader) {
        try {
          await leader.shutdown();
        } catch (error) {
          failure = retainFailure(failure, error,
            'replacement-race assertion and stale-service cleanup failed');
        }
      }
    }
    if (failure !== null) throw failure;
  }));
