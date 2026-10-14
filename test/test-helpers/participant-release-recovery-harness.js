// Exact recovery-owner test doubles and exception custody reused by the R suite.
// The methods are moved byte-for-byte from replica-handler-release-recovery.test.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {PARTICIPANT_RELEASE_LOG} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createInProcessMockTransport} from './replica-handler-identity-fixture.js';

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

export {coreStatus, heldStatus, leaderWithoutOriginDb,
  recoveryService, retainDescriptorRestorations, retainFailure,
  settleOwnerTurns, withRecoveryHandler};
