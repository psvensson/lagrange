// Actual native/SQLite SQL_TRANSACTIONS recipient with the original
// registered route. A controlled TimeSource crosses the same absolute
// deadline while a genuine native committed-membership read is in flight.
// No fake release answer, admission, origin, Raft status or membership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {createInProcessMockTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const CONTROL = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const REPLICA = 'post-await-expiry-sql-r1';
const NODE = 'post-await-expiry-node';
const CACHE = {getAll: () => [], get: () => null, filter: () => []};

function accumulateFailure(current, next, where) {
  return current === null ? next : new AggregateError([current, next], where);
}

function boundedPromise(promise, label) {
  let handle;
  const limited = new Promise((_resolve, reject) => {
    handle = setTimeout(() => reject(new Error(label + ': no real Raft gate')), 7000);
  });
  return Promise.race([promise, limited]).finally(() => clearTimeout(handle));
}

async function withRealControlRecipient(expireDuringFacts) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-post-await-'));
  const transport = createInProcessMockTransport();
  const options = {nodeId: NODE, partitionId: CONTROL, replicaId: REPLICA,
    replicaIds: [REPLICA], tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA,
    dbPath: path.join(directory, 'control.db'), systemTableCache: CACHE,
    deferElection: true};
  const create = (overrides) =>
    new PartitionService(withFoundingStamp({...options, ...overrides}));
  let handler = null;
  let service = null;
  let restoreTime = null;
  let restorePort = null;
  let restoreDelivery = null;
  let outstanding = null;
  const entered = Promise.withResolvers();
  const continueFacts = Promise.withResolvers();
  let failure = null;
  try {
    handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
      systemTableCache: CACHE, cdcIntegrationService: {},
      createPartitionService: create, messageRouter: transport, dataDir: directory});
    handler.registerWithRouter(transport);
    service = create();
    await service.initialize();
    handler.localServices.set(REPLICA, service);
    await service.raft.campaign();
    assert.equal(service.raft.readStatus().role, 'leader');
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    const initial = await handler.participantReleaseRecovery.releaseOperator({
      partitionId: CONTROL, targetBuildDigest: build.digest,
      deadlineAtMs: handler.timeSource.now() + 30000,
    });
    assert.equal(initial.outcome, OUTCOME.CUT_OVER,
      'real initial full release must install and apply the durable origin');
    const origin = readPartitionWriteOrigin(service.db);
    assert.notEqual(origin, null);
    assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN);

    const previousTimeSource = handler.timeSource;
    const clock = new VirtualTimeSource({startMs: previousTimeSource.now()});
    handler.timeSource = clock;
    restoreTime = () => {
      handler.timeSource = previousTimeSource;
    };
    const deadline = clock.now() + 1000;

    const originalPort = service.raft;
    const portDescriptor = Object.getOwnPropertyDescriptor(service, 'raft');
    assert.ok(portDescriptor, 'original native port is an owned service field');
    let armed = false;
    let intercepted = 0;
    const wrappedPort = Object.freeze({...originalPort,
      async readCommittedMembership(...args) {
        const result = await Reflect.apply(originalPort.readCommittedMembership,
          originalPort, args);
        if (armed && intercepted === 0) {
          intercepted += 1;
          entered.resolve();
          await continueFacts.promise;
        }
        return result;
      },
    });
    Object.defineProperty(service, 'raft',
      {...portDescriptor, value: wrappedPort});
    restorePort = () => Object.defineProperty(service, 'raft', portDescriptor);

    const priorDelivery = Object.getOwnPropertyDescriptor(transport, 'deliver');
    const originalDeliver = transport.deliver;
    transport.deliver = function(...args) {
      const request = args[1];
      if (request?.type === PARTICIPANT_RELEASE_TYPE &&
          request.partitionId === CONTROL && request.action === ACTION.RESUME) {
        armed = true;
      }
      return Reflect.apply(originalDeliver, this, args);
    };
    restoreDelivery = () => {
      if (priorDelivery === undefined) {
        if (!delete transport.deliver) {
          throw new Error('transport restoration refused');
        }
      } else {
        Object.defineProperty(transport, 'deliver', priorDelivery);
      }
    };

    outstanding = handler.participantReleaseRecovery.releaseOperator({
      partitionId: CONTROL, targetBuildDigest: build.digest,
      deadlineAtMs: deadline,
    });
    await boundedPromise(entered.promise, 'actual recipient RESUME membership read');
    assert.equal(intercepted, 1,
      'the original native committed-membership reader was in flight');
    assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED,
      'the second real release already paused admission before RESUME');
    if (expireDuringFacts) clock.advance(1001);
    assert.equal(clock.now() >= deadline, expireDuringFacts,
      'one original absolute recipient deadline is controlled by the fixture');
    continueFacts.resolve();
    const answer = await boundedPromise(outstanding, 'real release completion');
    assert.equal(intercepted, 1);
    assert.deepEqual(readPartitionWriteOrigin(service.db), origin,
      'no new release replaces the committed origin');
    if (expireDuringFacts) {
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED,
        'an expired actual RESUME must never authorize OPEN after awaited facts');
      assert.notEqual(answer.outcome, OUTCOME.CUT_OVER,
        'the expired second release cannot masquerade as successful admission');
    } else {
      assert.equal(answer.outcome, OUTCOME.CUT_OVER,
        'original in-budget RESUME still opens on fresh actual facts');
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN);
    }
  } catch (error) {
    failure = error;
  } finally {
    continueFacts.resolve();
    if (outstanding !== null) {
      try {
        await boundedPromise(outstanding, 'retire held real release');
      } catch (error) {
        failure = accumulateFailure(failure, error, 'release settlement');
      }
    }
    for (const [label, restore] of [
      ['delivery', restoreDelivery], ['port', restorePort], ['clock', restoreTime],
    ]) {
      if (restore === null) continue;
      try {
        restore();
      } catch (error) {
        failure = accumulateFailure(failure, error, label + ' restoration');
      }
    }
    try {
      await handler?.participantReleaseRecovery.shutdown();
    } catch (error) {
      failure = accumulateFailure(failure, error, 'recovery shutdown');
    }
    try {
      handler?.unregisterFromRouter(transport);
    } catch (error) {
      failure = accumulateFailure(failure, error, 'router cleanup');
    }
    try {
      await service?.shutdown();
    } catch (error) {
      failure = accumulateFailure(failure, error, 'service cleanup');
    }
    if (failure === null) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
  if (failure !== null) throw failure;
}

test('expired real recipient RESUME after awaited membership stays CLOSED',
  {timeout: 25000}, () => withRealControlRecipient(true));
test('in-budget real recipient RESUME after awaited membership opens normally',
  {timeout: 25000}, () => withRealControlRecipient(false));
