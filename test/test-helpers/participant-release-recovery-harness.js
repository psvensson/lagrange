// Exact recovery-owner test doubles and exception custody reused by the R suite.
// The methods are moved byte-for-byte from replica-handler-release-recovery.test.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {
  raiseParticipantCutoverPause,
  readParticipantReleaseFacts,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_LOG,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createInProcessMockTransport} from './replica-handler-identity-fixture.js';
import {captureParticipantReleaseObservationTimer} from
  './participant-release-observer-resource-fixture.js';
import {PARTITION_ID, REPLICAS, startAdmittedLeader} from './participant-transaction-fixture.js';
import {createLifecycleServiceRow, createLifecycleStateStore} from './lifecycle-state-store.js';
import {assertDurableRejoinStorageAdmission} from
  '../../src/bootstrap/durable-rejoin-storage-admission.js';
import {createReplicaRuntimePublication, publishReplicaRuntime} from
  '../../src/node/replica-runtime-publication.js';
import {captureReplicaRuntimeObservation} from '../../src/node/replica-runtime-observation.js';

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

function currentReleaseOf(facts) {
  return releaseIdentityOf({
    partitionId: facts.partitionId,
    targetBuildDigest: facts.buildDigest,
    configurationKey: facts.membership.configurationKey,
    membershipGenerationIndex: facts.membership.membershipGenerationIndex,
  });
}

function flattenedErrors(error) {
  return error instanceof AggregateError ?
    error.errors.flatMap((nested) => flattenedErrors(nested)) : [error];
}

async function currentResumeRequest(handler, service) {
  raiseParticipantCutoverPause(service);
  const facts = await readParticipantReleaseFacts(handler, service);
  assert.equal(facts.outcome, OUTCOME.OBSERVED, JSON.stringify(facts));
  const release = currentReleaseOf(facts);
  assert.notEqual(release, null);
  return {release, census: [facts]};
}

async function releaseActualHandler({directory, leader, handler, timerCapture}, failure) {
  let retained = failure;
  if (timerCapture !== null) {
    try {
      timerCapture.restore();
    } catch (error) {
      retained = retainFailure(retained, error,
        'observation timer capture and assertion cleanup failed');
    }
  }
  let shutdownFailed = false;
  for (const [owner, message] of [
    [handler, 'release lifecycle assertion and handler cleanup failed'],
    [leader, 'release lifecycle assertion and service cleanup failed'],
  ]) {
    if (owner === null) continue;
    try {
      await owner.shutdown();
    } catch (error) {
      shutdownFailed = true;
      retained = retainFailure(retained, error, message);
    }
  }
  if (!shutdownFailed) {
    try {
      fs.rmSync(directory, {recursive: true, force: true});
    } catch (error) {
      retained = retainFailure(retained, error,
        'release lifecycle assertion and artifact cleanup failed');
    }
  } else if (retained !== null) {
    retained.retainedDirectory = directory;
  }
  return retained;
}

async function withActualHandler(measure, options = {}) {
  const acquired = {directory: fs.mkdtempSync(path.join(os.tmpdir(), 'release-recovery-owner-')),
    leader: null, handler: null, timerCapture: null};
  const transport = createInProcessMockTransport();
  let failure = null;
  try {
    const source = createLifecycleServiceRow({replicaId: REPLICAS[0],
      partitionId: options.leader?.partitionId ?? PARTITION_ID,
      nodeId: 'test-node', status: 'active', createdAt: 1, stateEnteredAt: 1});
    const store = createLifecycleStateStore({services: [source]});
    const systemTableCache = options.leader?.systemTableCache ?? store.cache;
    const handlerTimeSource = options.timeSource ??
      new VirtualTimeSource({startMs: Date.now()});
    const handler = new ReplicaHandler({
      nodeId: source.node_id,
      ownerIncarnation: 1,
      systemTableCache,
      controlPlaneSystemTableGateway: store.gateway,
      cdcIntegrationService: {},
      createPartitionService: () => { throw new Error('the release fixture performs no CREATE'); },
      messageRouter: transport,
      dataDir: acquired.directory,
      timeSource: handlerTimeSource,
    });
    acquired.handler = handler;
    handler.registerWithRouter(transport);
    const owner = handler.replicaStateMachine;
    const admitRestore = () => assertDurableRejoinStorageAdmission(owner, {
      restoringExistingReplica: true, replicaId: source.replica_id, lifecycleAuthority: source,
    });
    const restored = await admitRestore();
    const construction = {...options.leader, systemTableCache, transport,
      resolveHandlerRetirementLane: () => owner};
    const {leader} = await startAdmittedLeader({...construction,
      runtimePublication: createReplicaRuntimePublication(handler, restored.row,
        restored.admission)});
    acquired.leader = leader;
    publishReplicaRuntime(handler, {replicaId: source.replica_id, service: leader,
      sourceEvidence: restored.row, lifecycleOwner: owner});
    acquired.timerCapture = captureParticipantReleaseObservationTimer(leader, handlerTimeSource);
    const createReplacement = async () => {
      const expected = captureReplicaRuntimeObservation(handler, source.replica_id);
      const replacement = await startAdmittedLeader({...construction,
        runtimePublication: createReplicaRuntimePublication(handler, expected.sourceEvidence,
          expected.admission, expected.service)});
      return {...replacement, expected};
    };
    const restoreAfterDeletion = async () => {
      const admission = await admitRestore();
      const replacement = await startAdmittedLeader({...construction,
        runtimePublication: createReplicaRuntimePublication(handler, admission.row,
          admission.admission)});
      try {
        publishReplicaRuntime(handler, {replicaId: source.replica_id, service: replacement.leader,
          sourceEvidence: admission.row, lifecycleOwner: owner});
      } catch (error) {
        await handler.fenceFailedReplicaCreateRuntime(source.replica_id, source.partition_id,
          replacement.leader, error);
        throw error;
      }
      return replacement;
    };
    await measure({handler, leader, transport, timeSource: handlerTimeSource,
      createReplacement, restoreAfterDeletion});
  } catch (error) {
    failure = error;
  }
  failure = await releaseActualHandler(acquired, failure);
  if (failure !== null) throw failure;
}

export {coreStatus, currentResumeRequest, flattenedErrors,
  heldStatus, leaderWithoutOriginDb, recoveryService,
  retainDescriptorRestorations, retainFailure, settleOwnerTurns,
  withActualHandler, withRecoveryHandler};
