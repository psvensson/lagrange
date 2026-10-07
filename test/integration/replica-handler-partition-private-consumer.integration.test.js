/**
 * Supplemental local-only L0 witness for the
 * `partition-private-storage-operation-consumers` pair. A production
 * ReplicaHandler consumes a real initialized PartitionService registration.
 * The response must remain the normal committed-membership value while the
 * handler stops traversing the service's public `raft` property.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';

const NODE_ID = 'p5-replica-handler-node';
const PARTITION_ID = 'p5-replica-handler-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'p5_replica_handler_rows';
const TEST_TIMEOUT_MS = 30_000;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('scratch partition did not elect its single-voter leader');
}

function observePublicRaftReads(service) {
  let descriptorOwner = service;
  let descriptor = null;
  while (descriptorOwner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(descriptorOwner, 'raft');
    if (descriptor) break;
    descriptorOwner = Object.getPrototypeOf(descriptorOwner);
  }
  let readCount = 0;
  if (!descriptor) {
    return {count: () => readCount, exposed: false, restore() {}};
  }
  const wasOwn = descriptorOwner === service;
  if (wasOwn && descriptor.configurable !== true) {
    throw new Error('public raft property is not safely observable');
  }
  if (!wasOwn && !Object.isExtensible(service)) {
    throw new Error('inherited public raft property is not safely observable');
  }
  let dataValue = descriptor.value;
  const readOriginal = Object.hasOwn(descriptor, 'value') ?
    () => dataValue :
    () => descriptor.get?.call(service);
  Object.defineProperty(service, 'raft', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      readCount += 1;
      return readOriginal();
    },
    set(value) {
      if (Object.hasOwn(descriptor, 'value')) {
        if (descriptor.writable !== true) {
          throw new TypeError('Cannot assign to read only public raft property');
        }
        dataValue = value;
        return;
      }
      if (typeof descriptor.set !== 'function') {
        throw new TypeError('Cannot assign to getter only public raft property');
      }
      descriptor.set.call(service, value);
    },
  });
  return {
    count: () => readCount,
    exposed: true,
    restore() {
      if (wasOwn) {
        Object.defineProperty(service, 'raft', Object.hasOwn(descriptor, 'value') ?
          {...descriptor, value: dataValue} : descriptor);
      } else {
        delete service.raft;
      }
    },
  };
}

test('public raft read observer covers data, getter, prototype and absence',
  () => {
    const port = Object.freeze({kind: 'real-port-identity'});

    const dataService = {raft: port};
    const dataDescriptor = Object.getOwnPropertyDescriptor(dataService, 'raft');
    const dataReads = observePublicRaftReads(dataService);
    assert.equal(dataReads.exposed, true);
    assert.equal(dataService.raft, port);
    assert.equal(dataService.raft, port);
    assert.equal(dataReads.count(), 2);
    dataReads.restore();
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(dataService, 'raft'),
      dataDescriptor,
    );

    let getterReceiver = null;
    const getterService = {};
    Object.defineProperty(getterService, 'raft', {
      configurable: true,
      enumerable: true,
      get() {
        getterReceiver = this;
        return port;
      },
    });
    const getterDescriptor = Object.getOwnPropertyDescriptor(
      getterService,
      'raft',
    );
    const getterReads = observePublicRaftReads(getterService);
    assert.equal(getterService.raft, port);
    assert.equal(getterReceiver, getterService,
      'the original getter keeps its receiver');
    assert.equal(getterReads.count(), 1);
    getterReads.restore();
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(getterService, 'raft'),
      getterDescriptor,
    );

    const inheritedPrototype = {};
    Object.defineProperty(inheritedPrototype, 'raft', {
      configurable: true,
      enumerable: false,
      value: port,
      writable: true,
    });
    const inheritedDescriptor = Object.getOwnPropertyDescriptor(
      inheritedPrototype,
      'raft',
    );
    const inheritedService = Object.create(inheritedPrototype);
    const inheritedReads = observePublicRaftReads(inheritedService);
    assert.equal(inheritedService.raft, port);
    assert.equal(inheritedReads.count(), 1);
    inheritedReads.restore();
    assert.equal(Object.hasOwn(inheritedService, 'raft'), false);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(inheritedPrototype, 'raft'),
      inheritedDescriptor,
    );

    const ownedAnswer = Object.freeze({kind: 'owned-membership-answer'});
    const absentService = {
      readCommittedMembership: () => ownedAnswer,
    };
    const absentReads = observePublicRaftReads(absentService);
    assert.equal(absentReads.exposed, false);
    assert.equal(absentService.readCommittedMembership(), ownedAnswer);
    assert.equal(absentReads.count(), 0);
    absentReads.restore();
    assert.equal('raft' in absentService, false);

    const fixedService = {};
    Object.defineProperty(fixedService, 'raft', {
      configurable: false,
      value: port,
    });
    assert.throws(
      () => observePublicRaftReads(fixedService),
      /public raft property is not safely observable/u,
      'an unobservable public own alias fails explicitly',
    );

    const fixedInheritedService = Object.preventExtensions(
      Object.create(inheritedPrototype),
    );
    assert.throws(
      () => observePublicRaftReads(fixedInheritedService),
      /inherited public raft property is not safely observable/u,
      'an unshadowable inherited alias fails explicitly',
    );
  });

test('ReplicaHandler reads committed membership without traversing the ' +
  'PartitionService public raft property', {timeout: TEST_TIMEOUT_MS},
async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'p5-replica-handler-consumer-'),
  );
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath: path.join(directory, `${REPLICA_ID}.db`),
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  }));
  const handler = new ReplicaHandler({
    nodeId: NODE_ID,
    systemTableCache: {filter: () => []},
    cdcIntegrationService: {},
    replicaStateMachine: {},
    createPartitionService: async () => {
      throw new Error('the committed-membership read must not create a replica');
    },
  });
  let raftReads = null;
  try {
    await partition.initialize();
    await waitForLeader(partition);
    handler.registerExistingReplica({
      replicaId: REPLICA_ID,
      partitionId: PARTITION_ID,
      tableName: TABLE_NAME,
      service: {partitionId: PARTITION_ID, tableName: TABLE_NAME},
    });
    const tracked = handler.replaceLocalReplicaService(REPLICA_ID, partition);
    assert.equal(tracked.service, partition,
      'production replacement registration installs the initialized service');

    raftReads = observePublicRaftReads(partition);
    const response = await handler.handleReadCommittedMembership({
      [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    });

    assert.equal(response.status, ReplicaOperationResponseStatus.COMPLETED);
    assert.equal(response.partitionId, PARTITION_ID);
    assert.equal(response.nodeId, NODE_ID);
    assert.equal(
      response[ReplicaOperationField.MEMBERSHIP].kind,
      COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
      'the hosted leader returns the normal committed-membership answer',
    );
    const membership = response[ReplicaOperationField.MEMBERSHIP];
    assert.equal(Object.isFrozen(membership), true,
      'the operation-port answer remains frozen data');
    assert.equal(membership.voters.length, 1,
      'the response preserves the single-voter committed membership');
    assert.equal(
      membership.identities[membership.voters[0]],
      REPLICA_ID,
      'the committed peer identity resolves to the hosted replica',
    );
    assert.deepEqual(membership.votersOutgoing, []);
    assert.deepEqual(membership.learners, []);
    assert.equal(membership.gateOpen, true);
    assert.equal(Number.isInteger(membership.appliedIndex), true);
    assert.equal(raftReads.count(), 0,
      'ReplicaHandler must consume a frozen value or owned operation without ' +
      'reading PartitionService.raft');
  } finally {
    raftReads?.restore();
    handler.localServices.clear();
    handler.localReplicas.clear();
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
