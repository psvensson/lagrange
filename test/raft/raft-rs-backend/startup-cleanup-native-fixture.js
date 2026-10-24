// PR117: production initialization consumes the real runtime's opening refusal.
// No constructor is stubbed. A shared-core trap is injected through the existing
// native-call seam; the three service initializers and their cleanup are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from '../../../src/partition/partition-service-constants.js';
import {MessageGroupService} from '../../../src/message-group/message-group-service.js';
import {MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME} from '../../../src/message-group/constants.js';
import {WasmServiceReplica} from '../../../src/wasm-service/wasm-service-replica.js';
import {WASM_SERVICE_ERROR_MSG} from '../../../src/wasm-service/wasm-service-constants.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {genesisStamp} from '../../../src/raft/raft-committed-membership-stamp.js';
import {setCoreFaultInjector, setActualCoreEntryObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
import {RUNTIME_PHASE, RUNTIME_REASON} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {TEST_BOOT_INCARNATION} from '../../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'opening-refusal-node';
const EXISTING_GROUP = 'opening-refusal-survivor';
const EXISTING_REPLICA = 'opening-refusal-survivor-r1';
const KINDS = ['partition', 'message-group', 'wasm-service'];

async function createFixture(t) {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, raft: {
    heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300,
  }});
  LoggingService.getInstance().initialize({level: 'error'});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-opening-refusal-'));
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = new MessageRouter({nodeId: NODE_ID, wsPort: 0,
    bootIncarnation: TEST_BOOT_INCARNATION, timeSource: clock});
  await router.initialize({startServer: false});
  const survivor = new PartitionNodeCluster({partitionId: EXISTING_GROUP,
    replicaIds: [EXISTING_REPLICA], substrateFor: () => ({timeSource: clock})});
  const port = survivor.node(EXISTING_REPLICA);
  const services = [];
  const databases = [];
  const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  t.after(async () => {
    setCoreFaultInjector(null);
    // Release every fixture even when a negative arm loses an owner reference.
    // Failures are retained as diagnostics; the candidate must leave none.
    const cleanupErrors = [];
    const release = async (label, work) => {
      try {
        await work();
      } catch (error) {
        cleanupErrors.push({label, message: String(error?.message ?? error)});
      }
    };
    for (const service of services.reverse()) {
      const {raft, db, kvStore} = service;
      await release('service shutdown', () => service.shutdown());
      if (raft) await release('captured port', () => raft.close());
      if (kvStore) await release('captured borrowed KV', () => kvStore.close());
      if (db?.open) await release('captured DB', () => db.close());
    }
    await release('surviving native group', () => survivor.dispose());
    for (const database of databases) {
      if (database.open) await release('faulted DB', () => database.close());
    }
    await release('router', () => router.shutdown());
    setActualCoreEntryObserver(null);
    fs.rmSync(directory, {recursive: true, force: true});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    if (cleanupErrors.length) t.diagnostic(JSON.stringify({cleanupErrors}));
    assert.deepEqual(cleanupErrors, [], 'fixture teardown must finish without hidden cleanup errors');
  });
  assert.equal((await port.campaign()).outcome, OUTCOME.CORE_OK);
  assert.equal((await port.propose('before-opening-refusal')).outcome, OUTCOME.CORE_OK);
  const initial = port.readStatus();
  let traps = 0;
  const trap = async () => {
    setCoreFaultInjector((groupId, operation) => {
      if (groupId === EXISTING_GROUP && operation === 'propose') {
        setCoreFaultInjector(null); traps += 1;
        throw new globalThis.WebAssembly.RuntimeError('opening-refusal core-boundary trap');
      }
    });
    assert.equal((await port.propose('must-not-commit')).outcome, OUTCOME.CORE_FATAL);
    assert.equal(traps, 1, 'a real contained native fault must engage');
  };
  return {directory, clock, router, survivor, port, services, databases, entries, initial, trap};
}

function buildService(fixture, kind) {
  const id = `opening-${kind}`;
  const replicaId = `${id}-r1`;
  const options = {nodeId: NODE_ID, replicaId, replicaIds: [replicaId],
    dbPath: path.join(fixture.directory, `${id}.db`), transport: fixture.router,
    timeSource: fixture.clock, deferElection: true, systemTableCache: new SystemTableCache()};
  let service;
  if (kind === 'partition') {
    service = new PartitionService({...options, partitionId: id, tableId: `${id}-table`,
      tableName: 'opening_refusal_rows', bootstrapMembership: genesisStamp([replicaId])});
  } else if (kind === 'message-group') {
    service = new MessageGroupService({...options, groupId: id});
  } else {
    service = new WasmServiceReplica({...options, serviceDefinitionId: id});
  }
  fixture.services.push(service);
  return service;
}

function assertInitializationRefusal(kind, error, replicaId, shared = null) {
  assert.ok(error, 'initialization must refuse, not silently return');
  assert.equal(error.consensus?.outcome, OUTCOME.HOST_FAILURE);
  assert.equal(error.consensus.phase, shared?.phase ?? RUNTIME_PHASE.RUNTIME_REPLACEMENT);
  assert.equal(error.consensus.reason, shared?.reason ?? RUNTIME_REASON.REPLACEMENT_IN_PROGRESS);
  assert.equal(error.consensus.retryAfterMs, shared?.retryAfterMs ?? 0,
    'startup carries the original shared retry remainder without renewal');
  assert.equal(error.consensus.retryable, true);
  assert.equal(error.consensus.recoveryRequired, true);
  assert.equal(error.consensus.replicaIdentity, replicaId);
  assert.equal(Object.isFrozen(error.consensus), true, 'the owner answer is retained as immutable data');
  if (kind === 'partition') {
    assert.equal(error.code, PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
      'partition initialize must expose its existing typed refusal');
  } else if (kind === 'message-group') {
    assert.equal(error.code, MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
      'message-group initialize must expose its existing typed refusal');
  } else {
    assert.equal(error.message, WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED,
      'WASM initialize must expose its existing startup refusal');
    assert.equal(error.replicaId, replicaId);
  }
}


export {createFixture, buildService, assertInitializationRefusal, KINDS, EXISTING_GROUP,
  EXISTING_REPLICA};
