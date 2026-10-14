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
import {RAFT_EVENT, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {
  participantReleaseAdmissionOf,
  raiseParticipantCutoverPause,
  readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_REASON,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createInProcessMockTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {replacePrototypeProperty} from '../helpers/hostile-intrinsics.js';
import {captureParticipantReleaseObservationTimer, lastObservationTimerHandle,
  observationTimerOwnedCount} from
  '../test-helpers/participant-release-observer-resource-fixture.js';
import {
  changeFixtureParticipantMembership,
  clearFixtureSingletons,
  deferFixtureParticipantMembership as deferCommittedMembership,
  fixtureParticipantObservationListenerCount as observationListenerCount,
  fixtureParticipantObservationRequest as currentObservationRequest,
  resetFixtureSingletons,
  sendRegisteredFixtureParticipantObservation as sendRegisteredObservation,
  settle,
  startLeader,
  track,
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

function retainDescriptorRestorations(failure, restorations, message) {
  let retained = failure;
  for (const {owner, field, descriptor} of restorations) {
    try {
      if (descriptor === undefined) {
        if (!delete owner[field]) throw new Error(`${String(field)} deletion refused`);
      } else {
        Object.defineProperty(owner, field, descriptor);
      }
    } catch (error) {
      retained = retainFailure(retained, error,
        `${message}: ${String(field)} restoration failed`);
    }
  }
  return retained;
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

function observationSubscriptionCount(service) {
  return [RAFT_EVENT.APPLIED_PROGRESS, RAFT_EVENT.TERM_CHANGE,
    RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.MEMBERSHIP_CHANGED]
    .reduce((count, eventName) => count +
      (service.controllablePort.listeners.get(eventName)?.size ?? 0), 0);
}

function flattenedErrors(error) {
  return error instanceof AggregateError ?
    error.errors.flatMap((nested) => flattenedErrors(nested)) : [error];
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

async function withActualHandler(measure, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-recovery-owner-'));
  const transport = createInProcessMockTransport();
  let leader = null;
  let handler = null;
  let timerCapture = null;
  let failure = null;
  try {
    ({leader} = await startLeader(options.leader));
    const handlerTimeSource = options.timeSource ??
      new VirtualTimeSource({startMs: leader.timeSource.now()});
    handler = new ReplicaHandler({
      nodeId: leader.nodeId,
      ownerIncarnation: 1,
      systemTableCache: leader.systemTableCache,
      cdcIntegrationService: {},
      createPartitionService: () => leader,
      messageRouter: transport,
      dataDir: directory,
      timeSource: handlerTimeSource,
    });
    handler.registerWithRouter(transport);
    handler.localServices.set(leader.replicaId, leader);
    timerCapture = captureParticipantReleaseObservationTimer(leader, handlerTimeSource);
    await measure({handler, leader, transport, timeSource: handlerTimeSource});
  } catch (error) {
    failure = error;
  }
  if (timerCapture !== null) {
    try {
      timerCapture.restore();
    } catch (error) {
      failure = retainFailure(failure, error,
        'observation timer capture and assertion cleanup failed');
    }
  }
  let shutdownFailed = false;
  if (handler !== null) {
    try {
      await handler.shutdown();
    } catch (error) {
      shutdownFailed = true;
      failure = retainFailure(failure, error,
        'release lifecycle assertion and handler cleanup failed');
    }
  }
  if (leader !== null) {
    try {
      await leader.shutdown();
    } catch (error) {
      shutdownFailed = true;
      failure = retainFailure(failure, error,
        'release lifecycle assertion and service cleanup failed');
    }
  }
  if (!shutdownFailed) {
    try {
      fs.rmSync(directory, {recursive: true, force: true});
    } catch (error) {
      failure = retainFailure(failure, error,
        'release lifecycle assertion and artifact cleanup failed');
    }
  } else if (failure !== null) {
    failure.retainedDirectory = directory;
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
      const resume = membership.trackSettlement('resume',
        resumeParticipantCutoverAdmission(handler, leader, request));
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
      failure = await membership.retire(failure,
        'shutdown-race assertion and membership gate cleanup failed');
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
      const resume = membership.trackSettlement('resume',
        resumeParticipantCutoverAdmission(handler, leader, request));
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
      failure = await membership.retire(failure,
        'service-shutdown assertion and membership gate cleanup failed');
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

test('handler shutdown cancels an applied-position observation before held facts release',
  async () => {
    await withActualHandler(async ({handler, leader, transport}) => {
      const request = await currentObservationRequest(handler, leader);
      const membership = deferCommittedMembership(leader);
      const timerBaseline = observationTimerOwnedCount(handler.timeSource);
      const observation = track(membership.trackSettlement('observation',
        sendRegisteredObservation(handler, transport, request)));
      await membership.started;
      let shutdown = null;
      let failure = null;
      try {
        assert.equal(observationListenerCount(leader), 1);
        assert.equal(observationTimerOwnedCount(handler.timeSource), timerBaseline + 1);
        shutdown = handler.shutdown();
        await settle();
        assert.equal(observation.settled, true,
          'handler shutdown settles the route while participant facts remain held');
        const answer = await observation.promise;
        assert.equal(answer.outcome, OUTCOME.STALE, JSON.stringify(answer));
        assert.equal(answer.partitionId, request.partitionId);
        assert.equal(answer.phase, request.action);
        assert.equal(answer.releaseId, request.release.releaseId);
        assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
        assert.equal(observationListenerCount(leader), 0);
        assert.equal(observationTimerOwnedCount(handler.timeSource), timerBaseline);
      } catch (error) {
        failure = error;
      } finally {
        failure = await membership.retire(failure,
          'observation cancellation and membership gate cleanup failed');
        if (shutdown !== null) {
          try {
            await shutdown;
          } catch (error) {
            failure = retainFailure(failure, error,
              'observation cancellation and handler shutdown failed');
          }
        }
      }
      if (failure !== null) throw failure;
    });

    await withActualHandler(async ({handler, leader, transport}) => {
      const request = await currentObservationRequest(handler, leader);
      const answer = await sendRegisteredObservation(handler, transport,
        request);
      assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.deepEqual(answer.generation, request.target);
      assert.equal(observationListenerCount(leader), 0,
        'an independent successor handler owns a fresh observation lifetime');
    });
  });

test('service shutdown entry wakes and cancels observation before held facts release',
  async () => withActualHandler(async ({handler, leader, transport}) => {
    const request = await currentObservationRequest(handler, leader);
    const membership = deferCommittedMembership(leader);
    const timerBaseline = observationTimerOwnedCount(handler.timeSource);
    const observation = track(membership.trackSettlement('observation',
      sendRegisteredObservation(handler, transport, request)));
    await membership.started;
    let shutdownEntry = null;
    leader.once(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, (identity) => {
      shutdownEntry = {isShutdown: leader.isShutdown,
        hasSettlement: leader.shutdownSettlement instanceof Promise, identity};
    });
    let shutdown = null;
    let failure = null;
    try {
      shutdown = leader.shutdown();
      assert.deepEqual(shutdownEntry, {isShutdown: true, hasSettlement: true,
        identity: {partitionId: leader.partitionId, replicaId: leader.replicaId}},
      'the entry wake follows installation of the actual lifecycle fence');
      await settle();
      assert.equal(observation.settled, true,
        'service shutdown settles the route while participant facts remain held');
      const answer = await observation.promise;
      assert.equal(answer.outcome, OUTCOME.STALE, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
      assert.equal(observationListenerCount(leader), 0);
      assert.equal(observationTimerOwnedCount(handler.timeSource), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = await membership.retire(failure,
        'observation cancellation and membership gate cleanup failed');
      if (shutdown !== null) {
        try {
          await shutdown;
        } catch (error) {
          failure = retainFailure(failure, error,
            'observation cancellation and service shutdown failed');
        }
      }
    }
    if (failure !== null) throw failure;
  }));

test('post-await term and generation changes keep applied-position observation stale',
  async () => {
    const controls = [
      {label: 'term', mutate(port) {
        port.term += 1;
        port.emitEvent(RAFT_EVENT.TERM_CHANGE, port.term);
      }},
      {label: 'runtime generation', mutate(port) {
        port.runtimeGeneration += 1;
      }},
      {label: 'lifecycle incarnation', mutate(port) {
        port.lifecycleIncarnation += 1;
      }},
      {label: 'current configuration', mutate(port, service) {
        const before = {configurationKey: port.configurationKey,
          membershipGenerationIndex: port.membershipGenerationIndex};
        const after = changeFixtureParticipantMembership(service);
        assert.notEqual(after.configurationKey, before.configurationKey);
        assert.equal(after.membershipGenerationIndex, port.committedIndex,
          'the changed ConfState retains the actual applied membership position');
        assert.equal(after.memberIds.length, 2);
        assert.equal(after.memberIds.includes(service.replicaId), true);
        port.emitEvent(RAFT_EVENT.MEMBERSHIP_CHANGED, {});
      }},
    ];
    for (const control of controls) {
      await withActualHandler(async ({handler, leader, transport}) => {
        const request = await currentObservationRequest(handler, leader);
        const membership = deferCommittedMembership(leader);
        const timerBaseline = observationTimerOwnedCount(handler.timeSource);
        const observation = membership.trackSettlement(`${control.label} observation`,
          sendRegisteredObservation(handler, transport, request));
        let failure = null;
        try {
          await membership.started;
          control.mutate(leader.controllablePort, leader);
          membership.release();
          const answer = await observation;
          assert.equal(answer.outcome, OUTCOME.STALE,
            `${control.label}: ${JSON.stringify(answer)}`);
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.phase, request.action);
          assert.equal(answer.releaseId, request.release.releaseId);
          assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
          assert.equal(observationListenerCount(leader), 0);
          assert.equal(observationTimerOwnedCount(handler.timeSource), timerBaseline);
        } catch (error) {
          failure = error;
        } finally {
          failure = await membership.retire(failure,
            `${control.label} assertion and membership gate cleanup failed`);
        }
        if (failure !== null) throw failure;
      });
    }
  });

test('follower reentry revalidates the latest generation after canonical facts',
  () => withActualHandler(async ({handler, leader, transport, timeSource}) => {
    const port = leader.controllablePort;
    port.setRole(RAFT_ROLE.FOLLOWER);
    port.setLeaderObservation('remote-leader-r2', 'remote-leader-address');
    const request = await currentObservationRequest(handler, leader);
    assert.equal(request.attempt.leaderReplicaId, 'remote-leader-r2');
    const membership = deferCommittedMembership(leader);
    const timerBaseline = observationTimerOwnedCount(timeSource);
    const descriptor = Object.getOwnPropertyDescriptor(port, 'runtimeGeneration');
    const capturedGeneration = descriptor.value;
    let generationReads = 0;
    Object.defineProperty(port, 'runtimeGeneration', {configurable: true, get() {
      generationReads += 1;
      return generationReads === 1 ? capturedGeneration : capturedGeneration + 1;
    }});
    let failure = null;
    try {
      const observation = membership.trackSettlement('follower reentry observation',
        sendRegisteredObservation(handler, transport, request));
      await membership.started;
      membership.release();
      const answer = await observation;
      assert.equal(answer.outcome, OUTCOME.STALE, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(membership.reads(), 1);
      assert.ok(generationReads >= 2,
        'facts N is fenced by a later current-context generation N+1 read');
      assert.equal(observationListenerCount(leader), 0);
      assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = retainDescriptorRestorations(failure,
        [{owner: port, field: 'runtimeGeneration', descriptor}],
        'follower reentry assertion');
      failure = await membership.retire(failure,
        'follower reentry assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));

test('dirty terminal membership refusal stays unavailable unless current lineage changes',
  async () => {
    for (const changedGeneration of [false, true]) {
      await withActualHandler(async ({handler, leader, transport, timeSource}) => {
        const request = await currentObservationRequest(handler, leader);
        const port = leader.controllablePort;
        const membershipDescriptor = Object.getOwnPropertyDescriptor(
          port, 'committedMembershipHandler');
        const refused = () => Object.freeze({kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
          reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE});
        port.committedMembershipHandler = refused;
        const membership = deferCommittedMembership(leader);
        const timerBaseline = observationTimerOwnedCount(timeSource);
        let failure = null;
        try {
          const observation = membership.trackSettlement('typed unavailable observation',
            sendRegisteredObservation(handler, transport, request));
          await membership.started;
          leader.controllablePort.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
          if (changedGeneration) port.runtimeGeneration += 1;
          membership.release();
          const answer = await observation;
          assert.equal(answer.outcome, changedGeneration ? OUTCOME.STALE : OUTCOME.UNAVAILABLE,
            JSON.stringify(answer));
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.phase, request.action);
          assert.equal(answer.releaseId, request.release.releaseId);
          if (!changedGeneration) {
            assert.equal(answer.missingFact, 'committed_membership_witness');
            assert.equal(answer.reason, COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE);
          }
          assert.equal(membership.reads(), 1,
            'a dirty terminal refusal is never relabelled as refreshable stale-applied facts');
          assert.equal(observationListenerCount(leader), 0);
          assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
        } catch (error) {
          failure = error;
        } finally {
          failure = await membership.retire(failure,
            'typed unavailable assertion and membership custody failed');
          if (port.committedMembershipHandler !== refused) {
            failure = retainFailure(failure,
              new Error('typed unavailable test lost membership owner'),
              'typed unavailable membership restoration failed');
          }
          failure = retainDescriptorRestorations(failure,
            [{owner: port, field: 'committedMembershipHandler',
              descriptor: membershipDescriptor}],
            'typed unavailable assertion');
        }
        if (failure !== null) throw failure;
      });
    }
  });


test('unreadable latest status or invalid latest generation never fabricates STALE',
  async () => {
    for (const latest of ['held-status', 'invalid-generation']) {
      await withActualHandler(async ({handler, leader, transport, timeSource}) => {
        const request = await currentObservationRequest(handler, leader);
        const port = leader.controllablePort;
        const membershipDescriptor = Object.getOwnPropertyDescriptor(
          port, 'committedMembershipHandler');
        const portDescriptor = Object.getOwnPropertyDescriptor(leader, 'raft');
        const originalPort = leader.raft;
        const refused = () => Object.freeze({
          kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
          reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE,
        });
        let statusReads = 0;
        const wrappedPort = Object.freeze({...originalPort,
          readStatus(...args) {
            const status = Reflect.apply(originalPort.readStatus, originalPort, args);
            statusReads += 1;
            if (statusReads === 1) return status;
            return latest === 'held-status' ?
              Object.freeze({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
                reason: 'current status unavailable'}) :
              Object.freeze({...status, runtimeGeneration: null});
          },
        });
        port.committedMembershipHandler = refused;
        Object.defineProperty(leader, 'raft', {...portDescriptor, value: wrappedPort});
        const membership = deferCommittedMembership(leader);
        const timerBaseline = observationTimerOwnedCount(timeSource);
        let failure = null;
        try {
          const observed = membership.trackSettlement(
            \`unreadable latest context: \${latest}\`,
            sendRegisteredObservation(handler, transport, request));
          await membership.started;
          membership.release();
          const answer = await observed;
          assert.equal(answer.outcome, OUTCOME.UNAVAILABLE,
            \`\${latest}: \${JSON.stringify(answer)}\`);
          assert.equal(answer.missingFact, 'committed_membership_witness');
          assert.equal(answer.reason, COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE);
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.phase, request.action);
          assert.equal(answer.releaseId, request.release.releaseId);
          assert.equal(statusReads, 2,
            'PA and R each consume their existing single current-status observation');
          assert.equal(membership.reads(), 1,
            'an unreadable current status never triggers a membership retry');
          assert.equal(observationListenerCount(leader), 0);
          assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
        } catch (error) {
          failure = error;
        } finally {
          failure = await membership.retire(failure,
            \`latest \${latest} status and membership custody failed\`);
          failure = retainDescriptorRestorations(failure, [
            {owner: leader, field: 'raft', descriptor: portDescriptor},
            {owner: port, field: 'committedMembershipHandler',
              descriptor: membershipDescriptor},
          ], \`latest \${latest} status assertion\`);
        }
        if (failure !== null) throw failure;
      });
    }
  });

test('ordinary membership refusal avoids OBS-only generation projection and mutation',
  async () => withActualHandler(async ({handler, leader}) => {
    const port = leader.controllablePort;
    const membershipDescriptor = Object.getOwnPropertyDescriptor(
      port, 'committedMembershipHandler');
    const portDescriptor = Object.getOwnPropertyDescriptor(leader, 'raft');
    const originalPort = leader.raft;
    let statusReads = 0;
    let generationReads = 0;
    const wrappedPort = Object.freeze({...originalPort,
      readStatus(...args) {
        statusReads += 1;
        const status = {...Reflect.apply(originalPort.readStatus, originalPort, args)};
        Object.defineProperty(status, 'runtimeGeneration', {enumerable: true,
          get() {
            generationReads += 1;
            throw new Error('ordinary refusal must not project generation');
          }});
        return status;
      },
    });
    const refused = () => Object.freeze({
      kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
      reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE,
    });
    const admissionBefore = participantReleaseAdmissionOf(leader);
    let failure = null;
    try {
      port.committedMembershipHandler = refused;
      Object.defineProperty(leader, 'raft', {...portDescriptor, value: wrappedPort});
      const result = await readParticipantReleaseFacts(handler, leader);
      assert.equal(result.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(result.missingFact, 'committed_membership_witness');
      assert.equal(result.reason, COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE);
      assert.equal(statusReads, 1, 'ordinary facts retain exactly one existing status read');
      assert.equal(generationReads, 0, 'ordinary refusal never reads generation');
      assert.equal(participantReleaseAdmissionOf(leader), admissionBefore,
        'ordinary refusal leaves admission lifetime unchanged');
    } catch (error) {
      failure = error;
    } finally {
      failure = retainDescriptorRestorations(failure, [
        {owner: leader, field: 'raft', descriptor: portDescriptor},
        {owner: port, field: 'committedMembershipHandler',
          descriptor: membershipDescriptor},
      ], 'ordinary refusal assertion');
    }
    if (failure !== null) throw failure;
  }));

test('registry replacement and deletion promptly retire old observers before held facts return',
  async () => {
    for (const mutation of ['replace', 'delete']) {
      await withActualHandler(async ({handler, leader, transport, timeSource}) => {
        const request = await currentObservationRequest(handler, leader);
        const membership = deferCommittedMembership(leader);
        const timerBaseline = observationTimerOwnedCount(timeSource);
        const oldObservation = track(membership.trackSettlement(`${mutation} observation`,
          sendRegisteredObservation(handler, transport, request)));
        await membership.started;
        let replacement = null;
        let failure = null;
        try {
          ({leader: replacement} = await startLeader());
          if (mutation === 'replace') {
            handler.replaceLocalReplicaService(leader.replicaId, replacement);
          } else {
            assert.equal(handler.localServices.delete(leader.replicaId), true);
          }
          await settle();
          assert.equal(oldObservation.settled, true,
            `${mutation} settles through the registered route while facts remain held`);
          const oldAnswer = await oldObservation.promise;
          assert.equal(oldAnswer.outcome, OUTCOME.STALE, JSON.stringify(oldAnswer));
          assert.equal(oldAnswer.partitionId, request.partitionId);
          assert.equal(oldAnswer.phase, request.action);
          assert.equal(oldAnswer.releaseId, request.release.releaseId);
          assert.equal(observationListenerCount(leader), 0);
          assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
          if (mutation === 'delete') {
            handler.localServices.set(leader.replicaId, replacement);
          }
          const successorRequest = await currentObservationRequest(handler, replacement);
          const successor = await sendRegisteredObservation(handler, transport,
            successorRequest);
          assert.equal(successor.outcome, OUTCOME.OBSERVED, JSON.stringify(successor));
          assert.deepEqual(successor.generation, successorRequest.target);
          assert.equal(handler.localServices.get(leader.replicaId), replacement);
        } catch (error) {
          failure = error;
        } finally {
          failure = await membership.retire(failure,
            `${mutation} observation and membership gate cleanup failed`);
          try {
            await leader.shutdown();
          } catch (error) {
            failure = retainFailure(failure, error,
              `${mutation} observation and old-service cleanup failed`);
          }
          if (replacement !== null &&
              handler.localServices.get(leader.replicaId) !== replacement) {
            try {
              await replacement.shutdown();
            } catch (error) {
              failure = retainFailure(failure, error,
                `${mutation} observation and successor cleanup failed`);
            }
          }
        }
        if (failure !== null) throw failure;
      });
    }
  });

test('synchronous acquisition cancellation retires late subscription and timer handles',
  async () => {
    for (const phase of ['subscription', 'timer']) {
      const clock = new VirtualTimeSource({startMs: 1000});
      await withActualHandler(async ({handler, leader, transport, timeSource}) => {
        const request = await currentObservationRequest(handler, leader);
        const membership = deferCommittedMembership(leader);
        const portDescriptor = Object.getOwnPropertyDescriptor(leader, 'raft');
        const actualPort = leader.raft;
        const registryBaseline = handler.localServices.serviceListeners.size;
        const serviceBaseline = leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED);
        const observedSubscriptions = [];
        let subscriptionAcquisitions = 0;
        let subscriptionReleases = 0;
        let timerAcquisitions = 0;
        let clearedTimer = null;
        let scheduledTimer = null;
        const wrappedPort = Object.freeze({...actualPort,
          subscribe(eventName, listener) {
            const unsubscribe = actualPort.subscribe(eventName, listener);
            observedSubscriptions.push({eventName, listener});
            subscriptionAcquisitions += 1;
            if (phase === 'subscription' && subscriptionAcquisitions === 1) {
              handler.localServices.delete(leader.replicaId);
            }
            return () => {
              subscriptionReleases += 1;
              if (phase === 'timer' && subscriptionAcquisitions === 4 &&
                  eventName === RAFT_EVENT.APPLIED_PROGRESS) unsubscribe();
              return unsubscribe();
            };
          }});
        Object.defineProperty(leader, 'raft', {...portDescriptor, value: wrappedPort});
        const setTimeoutDescriptor = Object.getOwnPropertyDescriptor(timeSource, 'setTimeout');
        const clearTimeoutDescriptor = Object.getOwnPropertyDescriptor(timeSource, 'clearTimeout');
        const actualSetTimeout = timeSource.setTimeout.bind(timeSource);
        const actualClearTimeout = timeSource.clearTimeout.bind(timeSource);
        timeSource.setTimeout = (callback, delay, ...args) => {
          const handle = actualSetTimeout(callback, delay, ...args);
          scheduledTimer = handle;
          timerAcquisitions += 1;
          if (phase === 'timer') handler.localServices.delete(leader.replicaId);
          return handle;
        };
        timeSource.clearTimeout = (handle) => {
          clearedTimer = handle;
          return actualClearTimeout(handle);
        };
        const timerBaseline = observationTimerOwnedCount(timeSource);
        let failure = null;
        try {
          const observation = track(membership.trackSettlement(`${phase} acquisition`,
            sendRegisteredObservation(handler, transport, request)));
          await settle();
          assert.equal(observation.settled, true,
            `${phase} cancellation settles without waiting for a facts read`);
          assert.equal((await observation.promise).outcome, OUTCOME.STALE);
          assert.equal(membership.reads(), 0);
          assert.equal(subscriptionAcquisitions, phase === 'subscription' ? 1 : 4);
          assert.equal(subscriptionReleases, subscriptionAcquisitions);
          assert.equal(timerAcquisitions, phase === 'timer' ? 1 : 0);
          assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
          assert.equal(observedSubscriptions.every(({eventName, listener}) =>
            leader.controllablePort.listeners.get(eventName)?.has(listener) !== true), true,
          'every exact acquired observation callback is unsubscribed');
          assert.equal(handler.localServices.serviceListeners.size, registryBaseline);
          assert.equal(leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED),
            serviceBaseline);
          if (phase === 'timer') {
            assert.notEqual(scheduledTimer, null);
            assert.equal(clearedTimer, scheduledTimer,
              'cleanup clears the exact observation acquisition');
          }
        } catch (error) {
          failure = error;
        } finally {
          failure = retainDescriptorRestorations(failure, [
            {owner: leader, field: 'raft', descriptor: portDescriptor},
            {owner: timeSource, field: 'setTimeout', descriptor: setTimeoutDescriptor},
            {owner: timeSource, field: 'clearTimeout', descriptor: clearTimeoutDescriptor},
          ], `${phase} acquisition assertion`);
          failure = await membership.retire(failure,
            `${phase} acquisition assertion and membership custody failed`);
        }
        if (failure !== null) throw failure;
      }, {timeSource: clock});
    }
  });

test('cleanup debt retains all seven acquired resources on the installing scheduler',
  () => {
    const clockA = new VirtualTimeSource({startMs: 1000});
    const clockB = new VirtualTimeSource({startMs: 2000});
    return withActualHandler(async ({handler, leader, transport, timeSource}) => {
      const request = await currentObservationRequest(handler, leader);
      const membership = deferCommittedMembership(leader);
      const portDescriptor = Object.getOwnPropertyDescriptor(leader, 'raft');
      const actualPort = leader.raft;
      const sentinels = Array.from({length: 7}, (_, index) => index === 6 ? null :
        new Error(`observation cleanup sentinel ${index + 1}`));
      const releaseCalls = Array(7).fill(0);
      const observerSubscriptions = new Set();
      let faultsEnabled = true;
      let reenteredCleanup = false;
      let timerHandle = null;
      const wrappedPort = Object.freeze({...actualPort,
        subscribe(eventName, listener) {
          const index = [RAFT_EVENT.APPLIED_PROGRESS, RAFT_EVENT.TERM_CHANGE,
            RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.MEMBERSHIP_CHANGED].indexOf(eventName);
          const unsubscribe = actualPort.subscribe(eventName, listener);
          observerSubscriptions.add(listener);
          return () => {
            releaseCalls[index] += 1;
            if (index === 0 && !reenteredCleanup) {
              reenteredCleanup = true;
              handler.localServices.set(leader.replicaId, leader);
              handler.localServices.delete(leader.replicaId);
            }
            if (faultsEnabled) throw sentinels[index];
            const result = unsubscribe();
            observerSubscriptions.delete(listener);
            return result;
          };
        }});
      Object.defineProperty(leader, 'raft', {...portDescriptor, value: wrappedPort});
      const registry = handler.localServices;
      const registrySubscribeDescriptor = Object.getOwnPropertyDescriptor(
        registry, 'subscribeServiceChanges');
      const actualRegistrySubscribe = registry.subscribeServiceChanges.bind(registry);
      registry.subscribeServiceChanges = (listener) => {
        const unsubscribe = actualRegistrySubscribe(listener);
        return () => {
          releaseCalls[4] += 1;
          if (faultsEnabled) throw sentinels[4];
          return unsubscribe();
        };
      };
      const offDescriptor = Object.getOwnPropertyDescriptor(leader, 'off');
      const actualOff = leader.off.bind(leader);
      leader.off = (eventName, listener) => {
        if (eventName === PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED) {
          releaseCalls[5] += 1;
          if (faultsEnabled) throw sentinels[5];
        }
        return actualOff(eventName, listener);
      };
      const clearDescriptor = Object.getOwnPropertyDescriptor(timeSource, 'clearTimeout');
      const actualClear = timeSource.clearTimeout.bind(timeSource);
      timeSource.clearTimeout = (handle) => {
        // Service recovery legitimately clears other handles on this clock.
        // Fault-inject and count only the observation owner's captured handle.
        if (handle !== lastObservationTimerHandle(timeSource)) {
          return actualClear(handle);
        }
        releaseCalls[6] += 1;
        assert.equal(handle, timerHandle, 'cleanup retains the exact A-owned timer handle');
        if (faultsEnabled) throw sentinels[6];
        return actualClear(handle);
      };
      const setDescriptor = Object.getOwnPropertyDescriptor(timeSource, 'setTimeout');
      const actualSet = timeSource.setTimeout.bind(timeSource);
      timeSource.setTimeout = (...args) => {
        const handle = actualSet(...args);
        if (handle === lastObservationTimerHandle(timeSource)) timerHandle = handle;
        return handle;
      };
      // The replacement clock also hosts recovery timers. Distinguish its
      // actual acquisitions from foreign observation-owned handles.
      const clockBSetDescriptor = Object.getOwnPropertyDescriptor(clockB, 'setTimeout');
      const clockBSet = clockB.setTimeout.bind(clockB);
      const clockBHandles = new Set();
      clockB.setTimeout = (...args) => {
        const handle = clockBSet(...args);
        clockBHandles.add(handle);
        return handle;
      };
      let clockBForeignClears = 0;
      const clockBClear = clockB.clearTimeout.bind(clockB);
      clockB.clearTimeout = (handle) => {
        if (!clockBHandles.has(handle)) clockBForeignClears += 1;
        return clockBClear(handle);
      };
      const timerBaseline = observationTimerOwnedCount(timeSource);
      const registryBaseline = registry.serviceListeners.size;
      const serviceBaseline = leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED);
      const clockBNowDescriptor = Object.getOwnPropertyDescriptor(clockB, 'now');
      const actualClockBNow = clockB.now.bind(clockB);
      let clockBReads = 0;
      clockB.now = () => {
        clockBReads += 1;
        return actualClockBNow();
      };
      let freshMembership = null;
      let arrayIteratorRestore = null;
      let shutdownDescriptor;
      let failure = null;
      try {
        const observation = track(membership.trackSettlement('cleanup-debt observation',
          sendRegisteredObservation(handler, transport, request)));
        await membership.started;
        assert.equal(observerSubscriptions.size, 4);
        assert.equal(registry.serviceListeners.size, registryBaseline + 1);
        assert.equal(leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED),
          serviceBaseline + 1);
        assert.equal(observationTimerOwnedCount(timeSource), timerBaseline + 1);

        handler.timeSource = clockB;
        clockB.advance(BOUND.REQUEST_TIMEOUT_MS * 2);
        const liveJoin = track(sendRegisteredObservation(handler, transport, request));
        await settle();
        assert.equal(liveJoin.settled, false,
          'a divergent current handler clock cannot expire the A-owned record');
        assert.equal(clockBReads, 0,
          'an exact join samples neither a replacement clock nor a new budget');
        assert.equal(observationTimerOwnedCount(timeSource), timerBaseline + 1);

        assert.equal(registry.delete(leader.replicaId), true);
        await settle();
        assert.equal(observation.settled, true);
        const answer = await observation.promise;
        assert.deepEqual(await liveJoin.promise, answer,
          'the live exact join retains the installing record and its terminal answer');
        assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
        assert.equal(answer.missingFact, 'replica_release_reply');
        assert.equal(answer.reason, PARTICIPANT_RELEASE_REASON.CLEANUP_INCOMPLETE);
        assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
        assert.deepEqual(releaseCalls.map((count) => count > 0), Array(7).fill(true),
          'every acquired resource is attempted despite independent failures');
        assert.equal(reenteredCleanup, true,
          'one owned release synchronously reenters the same lifecycle record');
        assert.equal(releaseCalls[0], 1,
          'a reentrant lifecycle callback cannot release the active slot twice');
        registry.set(leader.replicaId, leader);
        await settle();
        const callsBeforeJoin = [...releaseCalls];
        const readsBeforeJoin = membership.reads();

        const retainedJoin = track(sendRegisteredObservation(handler, transport, request));
        await settle();
        assert.equal(retainedJoin.settled, true);
        assert.deepEqual(await retainedJoin.promise, answer,
          'a retained-debt join keeps the stored terminal answer while cleanup still fails');
        assert.equal(membership.reads(), readsBeforeJoin);
        for (let index = 0; index < releaseCalls.length; index += 1) {
          assert.ok(releaseCalls[index] <= callsBeforeJoin[index] + 1,
            'a retained-debt join retries each resource at most once');
        }

        faultsEnabled = false;
        const callsBeforeDischarge = [...releaseCalls];
        const dischargeJoin = track(sendRegisteredObservation(handler, transport, request));
        await settle();
        assert.equal(dischargeJoin.settled, true);
        assert.deepEqual(await dischargeJoin.promise, answer,
          'the exact retained promise answers the join that discharges cleanup debt');
        assert.equal(membership.reads(), readsBeforeJoin,
          'cleanup discharge acquires no replacement facts owner');
        assert.equal(observerSubscriptions.size, 0);
        assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
        assert.equal(registry.serviceListeners.size, registryBaseline);
        assert.equal(leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED),
          serviceBaseline);
        assert.ok(releaseCalls.some((count, index) => count > callsBeforeDischarge[index]),
          'the discharge join retries retained resource releases');

        failure = await membership.retire(failure,
          'cleanup-debt first membership custody failed');
        handler.timeSource = timeSource;
        const freshRequest = await currentObservationRequest(handler, leader);
        freshMembership = deferCommittedMembership(leader);
        const fresh = track(freshMembership.trackSettlement('fresh cleanup-debt observation',
          sendRegisteredObservation(handler, transport, freshRequest)));
        await freshMembership.started;
        assert.equal(freshMembership.reads(), 1,
          'a later request creates a new observation after the clean record was removed');
        assert.equal(observerSubscriptions.size, 4);
        assert.equal(observationTimerOwnedCount(timeSource), timerBaseline + 1);
        faultsEnabled = true;
        assert.equal(registry.delete(leader.replicaId), true);
        await settle();
        assert.equal(fresh.settled, true);
        assert.equal((await fresh.promise).reason,
          PARTICIPANT_RELEASE_REASON.CLEANUP_INCOMPLETE);
        failure = await freshMembership.retire(failure,
          'cleanup-debt fresh membership custody failed');

        // Arm the hostile iterator only after the ordinary service shutdown has
        // completed. The final handler cancellation and AggregateError boundary
        // must retain the exact observation errors without ambient iteration.
        registry.set(leader.replicaId, leader);
        shutdownDescriptor = Object.getOwnPropertyDescriptor(leader, 'shutdown');
        const actualShutdown = leader.shutdown.bind(leader);
        leader.shutdown = async () => {
          const result = await actualShutdown();
          const actualIterator = Array.prototype[Symbol.iterator];
          const empty = [];
          arrayIteratorRestore = replacePrototypeProperty(
            Array.prototype, Symbol.iterator, function iterator() {
              let containsObservationError = false;
              for (let index = 0; index < this.length; index += 1) {
                if (sentinels.includes(this[index])) containsObservationError = true;
              }
              return containsObservationError ?
                Reflect.apply(actualIterator, empty, []) :
                Reflect.apply(actualIterator, this, []);
            });
          return result;
        };
        let shutdownError = null;
        try {
          await handler.shutdown();
        } catch (error) {
          shutdownError = error;
        } finally {
          if (arrayIteratorRestore !== null) {
            arrayIteratorRestore();
            arrayIteratorRestore = null;
          }
        }
        assert.ok(shutdownError instanceof AggregateError);
        const surfaced = flattenedErrors(shutdownError);
        for (let index = 0; index < sentinels.length; index += 1) {
          const sentinel = sentinels[index];
          assert.equal(surfaced.filter((error) => error === sentinel).length, 1,
            `handler shutdown retains resource ${index} first error exactly once`);
        }
        faultsEnabled = false;
        await handler.shutdown();
        assert.equal(clockBForeignClears, 0,
          'replacement scheduler only clears handles it actually acquired');
        assert.equal(observerSubscriptions.size, 0);
        assert.equal(observationTimerOwnedCount(timeSource), timerBaseline);
        assert.equal(registry.serviceListeners.size, 0,
          'handler shutdown retires the recovery subscriber as well as the observer');
        assert.equal(leader.listenerCount(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED),
          serviceBaseline);
      } catch (error) {
        failure = retainFailure(failure, error, 'cleanup-debt assertion failed');
      } finally {
        faultsEnabled = false;
        if (arrayIteratorRestore !== null) {
          try {
            arrayIteratorRestore();
          } catch (error) {
            failure = retainFailure(failure, error,
              'cleanup-debt Array iterator restoration failed');
          }
        }
        handler.timeSource = timeSource;
        failure = retainDescriptorRestorations(failure, [
          {owner: leader, field: 'raft', descriptor: portDescriptor},
          {owner: registry, field: 'subscribeServiceChanges',
            descriptor: registrySubscribeDescriptor},
          {owner: leader, field: 'off', descriptor: offDescriptor},
          {owner: leader, field: 'shutdown', descriptor: shutdownDescriptor},
          {owner: timeSource, field: 'clearTimeout', descriptor: clearDescriptor},
          {owner: timeSource, field: 'setTimeout', descriptor: setDescriptor},
          {owner: clockB, field: 'now', descriptor: clockBNowDescriptor},
          {owner: clockB, field: 'setTimeout', descriptor: clockBSetDescriptor},
        ], 'cleanup-debt assertion');
        // Restore the most recently installed membership gate first, so
        // cleanup after an earlier assertion cannot mask its own failure.
        if (freshMembership !== null) {
          failure = await freshMembership.retire(failure,
            'cleanup-debt final fresh membership custody failed');
        }
        failure = await membership.retire(failure,
          'cleanup-debt final membership custody failed');
      }
      if (failure !== null) throw failure;
    }, {timeSource: clockA});
  });

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
      const resume = membership.trackSettlement('resume',
        resumeParticipantCutoverAdmission(handler, leader, request));
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
      failure = await membership.retire(failure,
        'replacement-race assertion and membership gate cleanup failed');
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
