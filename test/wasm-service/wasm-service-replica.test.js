import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  WasmServiceReplica,
  ENTRY_TYPE,
  MESSAGE_OP,
} from '../../src/wasm-service/wasm-service-replica.js';
import {SessionKVStore} from '../../src/wasm-service/session-kv-store.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {WASM_SERVICE_COMMAND_REFUSAL} from
  '../../src/wasm-service/wasm-service-committed-command-admission.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_DEFAULT,
  READ_CONSISTENCY_MODE,
} from '../../src/wasm-service/wasm-service-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from
  '../../src/logging/logging-service.js';
import {NodeService} from
  '../../src/node/node-service.js';
import {AddressManager} from
  '../../src/address/address-manager.js';
import {LeaderActivationScheduler} from '../../src/raft/leader-activation-scheduler.js';

/**
 * Initialize the singletons a WasmServiceReplica reads.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Tear down singletons.
 */
function cleanEnv() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Default options for creating a WasmServiceReplica in tests.
 * @param {Object} [overrides] - Option overrides.
 * @return {Object} Merged options.
 */
function defaultOpts(overrides = {}) {
  return {
    replicaId: 'wsr-1',
    nodeId: 'node-1',
    replicaIds: ['wsr-1'],
    transport: null,
    serviceDefinitionId: 'svc-def-1',
    dbPath: path.join(os.tmpdir(), 'wasm-service-replica-unit', 'unopened.db'),
    ...overrides,
  };
}

/**
 * A replica whose session KV store runs over a scratch connection: these
 * unit tests drive its message, apply and publication logic without opening
 * its consensus port (the raft-rs WASM group witness covers the port).
 * @param {Object} options - Replica options.
 * @return {WasmServiceReplica} The replica.
 */
function createReplica(options) {
  const replica = new WasmServiceReplica(options);
  replica.kvStore = new SessionKVStore(new Database(':memory:'));
  return replica;
}

const BASE64 = 'base64';

function committedRecord(command, index = 1) {
  return {command, index, term: 1, effects: []};
}

function kvSet(sessionId, key, text) {
  return {
    type: ENTRY_TYPE.KV_SET,
    sessionId,
    key,
    value: Buffer.from(text).toString(BASE64),
    valueEncoding: BASE64,
  };
}

function createWriteReadySystemTableCache() {
  const servicesPartitionId = INITIAL_PARTITION_IDS[TABLES.SERVICES];
  const records = {
    [TABLES.PARTITIONS]: [
      {
        [COLUMN.PARTITION_ID]: servicesPartitionId,
        [COLUMN.LEADER_NODE_ID]: 'node-1',
      },
    ],
    [TABLES.SERVICES]: [
      {
        [COLUMN.SERVICE_ID]: 'svc-services-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: servicesPartitionId,
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      },
    ],
  };

  return {
    get(tableName, key) {
      const keyField = tableName === TABLES.PARTITIONS ?
        COLUMN.PARTITION_ID :
        COLUMN.SERVICE_ID;
      const rows = records[tableName] || [];
      return rows.find((row) => row?.[keyField] === key) || null;
    },
    filter(tableName, predicate) {
      const rows = records[tableName] || [];
      return rows.filter(predicate);
    },
  };
}

describe('WasmServiceReplica', () => {
  beforeEach(() => {
    initEnv();
    LeaderActivationScheduler.resetSharedForTests();
  });

  afterEach(() => {
    LeaderActivationScheduler.resetSharedForTests();
    cleanEnv();
  });

  describe('class exports', () => {
    it('should export WasmServiceReplica', () => {
      assert.equal(typeof WasmServiceReplica, 'function');
    });

    it('should export ENTRY_TYPE constants', () => {
      assert.equal(ENTRY_TYPE.KV_SET, 'kv_set');
      assert.equal(ENTRY_TYPE.KV_DELETE, 'kv_delete');
      assert.equal(
        ENTRY_TYPE.KV_DELETE_SESSION, 'kv_delete_session',
      );
      assert.equal(ENTRY_TYPE.TIMER_STATE, 'timer_state');
    });

    it('should export MESSAGE_OP constants', () => {
      assert.equal(MESSAGE_OP.READ, 'read');
      assert.equal(MESSAGE_OP.WRITE, 'write');
    });
  });

  describe('constructor', () => {
    it('should set entityType to WASM_SERVICE', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(
        replica.entityType, SERVICE_TYPE.WASM_SERVICE,
      );
      replica.kvStore.close();
    });

    it('should store serviceDefinitionId', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(
        replica.serviceDefinitionId, 'svc-def-1',
      );
      replica.kvStore.close();
    });

    it('opens its kvStore only with its consensus port', () => {
      const replica = new WasmServiceReplica(defaultOpts());
      assert.equal(replica.kvStore, null);
      assert.equal(replica.raft, null);
      assert.equal(replica.db, null);
    });

    it('should initialize timerManager', () => {
      const replica = createReplica(defaultOpts());
      assert.notEqual(replica.timerManager, null);
      assert.strictEqual(replica.timerManager.replica, replica);
      replica.kvStore.close();
    });

    it('should initialize safetyInterval', () => {
      const replica = createReplica(defaultOpts());
      assert.notEqual(replica.safetyInterval, null);
      replica.kvStore.close();
    });

    it('should default wasmExecutor to null', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(replica.wasmExecutor, null);
      replica.kvStore.close();
    });

    it('should default portAllocation to null', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(replica.portAllocation, null);
      replica.kvStore.close();
    });

    it('should use default read consistency', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(
        replica.readConsistency,
        WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
      );
      replica.kvStore.close();
    });

    it('should accept custom read consistency', () => {
      const replica = createReplica(defaultOpts({
        readConsistency: READ_CONSISTENCY_MODE.EVENTUAL,
      }));
      assert.equal(
        replica.readConsistency,
        READ_CONSISTENCY_MODE.EVENTUAL,
      );
      replica.kvStore.close();
    });

    it('should use default write consistency', () => {
      const replica = createReplica(defaultOpts());
      assert.equal(
        replica.writeConsistency,
        WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
      );
      replica.kvStore.close();
    });
  });

  describe('proposeEntry', () => {
    it('should reject when raft is null', async () => {
      const replica = createReplica(defaultOpts());
      await assert.rejects(
        () => replica.proposeEntry({type: ENTRY_TYPE.KV_SET, key: 'k'}),
        {message: WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY},
      );
      replica.kvStore.close();
    });

    it('proposes the entry through its port with a base64 value',
      async () => {
        const replica = createReplica(defaultOpts());
        let received = null;
        replica.raft = {
          propose: async (command) => {
            received = command;
            return {outcome: RAFT_OPERATION_OUTCOME.CORE_OK};
          },
        };
        await replica.proposeEntry({
          type: ENTRY_TYPE.KV_SET, sessionId: 's', key: 'k',
          value: Buffer.from('v'),
        });
        assert.deepStrictEqual(received, kvSet('s', 'k', 'v'));
        replica.kvStore.close();
      });

    it('rejects a proposal its port refused', async () => {
      const replica = createReplica(defaultOpts());
      replica.raft = {
        propose: async () => ({
          outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
          reason: 'not-leader',
        }),
      };
      await assert.rejects(
        () => replica.proposeEntry({type: ENTRY_TYPE.KV_SET, key: 'k'}),
        {message: WASM_SERVICE_ERROR_MSG.PROPOSAL_REFUSED, reason: 'not-leader'},
      );
      replica.kvStore.close();
    });

    it('refuses an unknown command type before proposing', async () => {
      const replica = createReplica(defaultOpts());
      replica.raft = {};
      await assert.rejects(
        () => replica.proposeEntry({type: 'not_a_command'}),
        {reason: WASM_SERVICE_COMMAND_REFUSAL.UNKNOWN_TYPE, retryable: false},
      );
      await assert.rejects(
        () => replica.proposeEntry({key: 'untyped'}),
        {reason: WASM_SERVICE_COMMAND_REFUSAL.UNKNOWN_TYPE},
      );
      replica.kvStore.close();
    });
  });

  describe('applyCommittedEntry', () => {
    it('should apply KV_SET records to kvStore', () => {
      const replica = createReplica(defaultOpts());
      const result = replica.applyCommittedEntry(
        committedRecord(kvSet('sess-1', 'mykey', 'hello')));
      assert.equal(result.accepted, true);
      const val = replica.kvStore.get('sess-1', 'mykey');
      assert.deepStrictEqual(val, Buffer.from('hello'));
      replica.kvStore.close();
    });

    it('should apply KV_DELETE records to kvStore', () => {
      const replica = createReplica(defaultOpts());
      replica.kvStore.applySet(
        'sess-1', 'mykey', Buffer.from('data'),
      );
      replica.applyCommittedEntry(committedRecord({
        type: ENTRY_TYPE.KV_DELETE,
        sessionId: 'sess-1',
        key: 'mykey',
      }));
      const val = replica.kvStore.get('sess-1', 'mykey');
      assert.equal(val, null);
      replica.kvStore.close();
    });

    it('should apply KV_DELETE_SESSION records', () => {
      const replica = createReplica(defaultOpts());
      replica.kvStore.applySet(
        'sess-1', 'k1', Buffer.from('v1'),
      );
      replica.kvStore.applySet(
        'sess-1', 'k2', Buffer.from('v2'),
      );
      replica.applyCommittedEntry(committedRecord({
        type: ENTRY_TYPE.KV_DELETE_SESSION,
        sessionId: 'sess-1',
      }));
      const all = replica.kvStore.getAll('sess-1');
      assert.equal(all.size, 0);
      replica.kvStore.close();
    });

    it('fails a committed record whose type it never admits', () => {
      const replica = createReplica(defaultOpts());
      for (const command of [null, {foo: 'bar'}, {type: 'unknown_type'}]) {
        assert.throws(
          () => replica.applyCommittedEntry(committedRecord(command)),
          {message: new RegExp(
            WASM_SERVICE_ERROR_MSG.UNKNOWN_COMMITTED_COMMAND)},
        );
      }
      replica.kvStore.close();
    });

    it('advances the safety interval applied index from the record', () => {
      const replica = createReplica(defaultOpts());
      replica.applyCommittedEntry(committedRecord(kvSet('s1', 'k1', 'v1'), 42));
      assert.deepStrictEqual(
        replica.kvStore.get('s1', 'k1'), Buffer.from('v1'));
      assert.equal(
        replica.safetyInterval.localAppliedIndex, 42,
      );
      replica.kvStore.close();
    });
  });

  describe('onBecameLeader', () => {
    it('should reconstruct timers via timerManager',
      async () => {
        const replica = createReplica(defaultOpts());
        let reconstructCalled = false;
        replica.timerManager.reconstructTimers = async () => {
          reconstructCalled = true;
          return 0;
        };
        replica.onBecameLeader();
        // Allow the async reconstructTimers promise to settle
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(reconstructCalled, true);
        replica._stopSafetyBroadcasts();
        replica.kvStore.close();
      });

    it('should start safety interval broadcasts', () => {
      const replica = createReplica(defaultOpts());
      replica.timerManager.reconstructTimers = async () => 0;
      replica.onBecameLeader();
      assert.notEqual(replica._safetyBroadcastTimer, null);
      replica._stopSafetyBroadcasts();
      replica.kvStore.close();
    });
  });

  describe('onBecameFollower', () => {
    it('should stop all timers', () => {
      const replica = createReplica(defaultOpts());
      let stopAllCalled = false;
      replica.timerManager.stopAll = () => {
        stopAllCalled = true;
      };
      replica.onBecameFollower();
      assert.equal(stopAllCalled, true);
      replica.kvStore.close();
    });

    it('should stop safety broadcasts', () => {
      const replica = createReplica(defaultOpts());
      replica.timerManager.reconstructTimers = async () => 0;
      replica.onBecameLeader();
      assert.notEqual(replica._safetyBroadcastTimer, null);
      replica.onBecameFollower();
      assert.equal(replica._safetyBroadcastTimer, null);
      replica.kvStore.close();
    });
  });

  describe('handleMessage', () => {
    it('should route read operations via read router',
      async () => {
        const replica = createReplica(defaultOpts({
          readConsistency: READ_CONSISTENCY_MODE.EVENTUAL,
        }));
        replica.kvStore.applySet(
          'sess-1', 'key-1', Buffer.from('data'),
        );
        const result = await replica.handleMessage({
          payload: {
            operation: MESSAGE_OP.READ,
            sessionId: 'sess-1',
            key: 'key-1',
          },
        });
        // Eventual mode on any replica serves locally
        assert.equal(result.forwarded, false);
        assert.deepStrictEqual(
          result.value, Buffer.from('data'),
        );
        replica.kvStore.close();
      });

    it('should forward reads to leader in leader_only mode',
      async () => {
        const replica = createReplica(defaultOpts({
          readConsistency: READ_CONSISTENCY_MODE.LEADER_ONLY,
        }));
        replica.leaderId = 'wsr-leader';
        const result = await replica.handleMessage({
          payload: {
            operation: MESSAGE_OP.READ,
            sessionId: 'sess-1',
            key: 'key-1',
          },
        });
        assert.equal(result.forwarded, true);
        assert.equal(result.leaderId, 'wsr-leader');
        replica.kvStore.close();
      });

    it('should forward writes when not leader', async () => {
      const replica = createReplica(defaultOpts());
      replica.leaderId = 'wsr-leader';
      const result = await replica.handleMessage({
        payload: {
          operation: MESSAGE_OP.WRITE,
          sessionId: 'sess-1',
          key: 'key-1',
          value: Buffer.from('data'),
        },
      });
      assert.equal(result.forwarded, true);
      assert.equal(result.leaderId, 'wsr-leader');
      replica.kvStore.close();
    });

    it('should return error for unknown operations',
      async () => {
        const replica = createReplica(defaultOpts());
        const result = await replica.handleMessage({
          payload: {operation: 'unknown'},
        });
        assert.equal(
          result.error,
          WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY,
        );
        replica.kvStore.close();
      });
  });

  describe('flushRoleUpdate', () => {
    it('writes role updates through owner callback', async () => {
      let writePayload = null;
      const replica = createReplica(defaultOpts({
        systemTableCache: createWriteReadySystemTableCache(),
        roleUpdateWriter: async (payload) => {
          writePayload = payload;
        },
      }));
      replica.pendingRoleUpdate = RAFT_ROLE.LEADER;
      replica.persistedRole = RAFT_ROLE.FOLLOWER;

      await replica.flushRoleUpdate();

      assert.equal(writePayload.serviceId, 'wsr-1');
      assert.equal(writePayload.serviceDefinitionId, 'svc-def-1');
      assert.equal(writePayload.role, RAFT_ROLE.LEADER);
      assert.equal(replica.persistedRole, RAFT_ROLE.LEADER);
      assert.equal(replica.pendingRoleUpdate, null);
      replica.kvStore.close();
    });

    it('writes role updates through CDC owner when no callback',
      async () => {
        let updateArgs = null;
        const replica = createReplica(defaultOpts({
          systemTableCache: createWriteReadySystemTableCache(),
          cdcIntegrationService: {
            updateSystemTableRow: async (...args) => {
              updateArgs = args;
            },
          },
        }));
        replica.pendingRoleUpdate = RAFT_ROLE.LEADER;
        replica.persistedRole = RAFT_ROLE.FOLLOWER;

        await replica.flushRoleUpdate();

        assert.deepEqual(updateArgs[0], TABLES.SERVICES);
        assert.deepEqual(updateArgs[1], {
          [COLUMN.SERVICE_ID]: 'wsr-1',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
          [COLUMN.NODE_ID]: 'node-1',
        });
        assert.equal(updateArgs[2][COLUMN.RAFT_ROLE], RAFT_ROLE.LEADER);
        assert.deepEqual(
          updateArgs[3]?.expectedCacheFields,
          {[COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER},
        );
        assert.equal(replica.persistedRole, RAFT_ROLE.LEADER);
        assert.equal(replica.pendingRoleUpdate, null);
        replica.kvStore.close();
      });
  });

  describe('flushLeaderNodeUpdate', () => {
    it('writes leader updates through owner callback', async () => {
      let writePayload = null;
      const replica = createReplica(defaultOpts({
        systemTableCache: createWriteReadySystemTableCache(),
        leaderNodeUpdateWriter: async (payload) => {
          writePayload = payload;
        },
      }));
      replica.isLeader = true;
      replica.role = RAFT_ROLE.LEADER;
      replica.pendingLeaderNodeUpdate = 'node-1';
      replica.persistedLeaderNodeId = null;

      await replica.flushLeaderNodeUpdate();

      assert.equal(writePayload.serviceId, 'wsr-1');
      assert.equal(writePayload.serviceDefinitionId, 'svc-def-1');
      assert.equal(writePayload.leaderNodeId, 'node-1');
      assert.equal(replica.persistedLeaderNodeId, 'node-1');
      assert.equal(replica.pendingLeaderNodeUpdate, null);
      replica.kvStore.close();
    });

    it('writes leader updates through CDC owner when no callback',
      async () => {
        let updateArgs = null;
        const replica = createReplica(defaultOpts({
          systemTableCache: createWriteReadySystemTableCache(),
          cdcIntegrationService: {
            updateSystemTableRow: async (...args) => {
              updateArgs = args;
            },
          },
        }));
        replica.isLeader = true;
        replica.role = RAFT_ROLE.LEADER;
        replica.pendingLeaderNodeUpdate = 'node-2';
        replica.persistedLeaderNodeId = null;

        await replica.flushLeaderNodeUpdate();

        assert.deepEqual(updateArgs[0], TABLES.SERVICES);
        assert.deepEqual(updateArgs[1], {
          [COLUMN.SERVICE_ID]: 'wsr-1',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
          [COLUMN.NODE_ID]: 'node-1',
        });
        assert.equal(updateArgs[2][COLUMN.NODE_ID], 'node-2');
        assert.equal(updateArgs[2][COLUMN.RAFT_ROLE], RAFT_ROLE.LEADER);
        assert.deepEqual(
          updateArgs[3]?.expectedCacheFields,
          {
            [COLUMN.NODE_ID]: 'node-2',
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          },
        );
        assert.equal(replica.persistedLeaderNodeId, 'node-2');
        assert.equal(replica.pendingLeaderNodeUpdate, null);
        replica.kvStore.close();
      });

    it('clears pending update when replica is not leader',
      async () => {
        const replica = createReplica(defaultOpts({
          systemTableCache: createWriteReadySystemTableCache(),
        }));
        replica.isLeader = false;
        replica.pendingLeaderNodeUpdate = 'node-2';

        await replica.flushLeaderNodeUpdate();

        assert.equal(replica.pendingLeaderNodeUpdate, null);
        assert.equal(replica.persistedLeaderNodeId, null);
        replica.kvStore.close();
      });
  });

  describe('retry timers', () => {
    it('schedules role retry when services table is not write-ready',
      async () => {
        const replica = createReplica(defaultOpts({
          systemTableCache: {
            filter: () => [],
          },
        }));
        replica.pendingRoleUpdate = RAFT_ROLE.LEADER;
        replica.persistedRole = RAFT_ROLE.FOLLOWER;

        await replica.flushRoleUpdate();

        assert.notEqual(replica.roleUpdateRetryTimer, null);
        clearTimeout(replica.roleUpdateRetryTimer);
        replica.roleUpdateRetryTimer = null;
        replica.kvStore.close();
      });

    it('schedules leader retry when services table is not write-ready',
      async () => {
        const replica = createReplica(defaultOpts({
          systemTableCache: {
            filter: () => [],
          },
        }));
        replica.isLeader = true;
        replica.role = RAFT_ROLE.LEADER;
        replica.pendingLeaderNodeUpdate = 'node-2';

        await replica.flushLeaderNodeUpdate();

        assert.notEqual(replica.leaderNodeUpdateRetryTimer, null);
        clearTimeout(replica.leaderNodeUpdateRetryTimer);
        replica.leaderNodeUpdateRetryTimer = null;
        replica.kvStore.close();
      });
  });

  describe('shutdown', () => {
    it('should stop timers and close kvStore', async () => {
      const replica = createReplica(defaultOpts());
      replica.timerManager.reconstructTimers = async () => 0;
      replica.onBecameLeader();
      await replica.shutdown();
      assert.equal(replica.kvStore, null);
      assert.equal(replica._safetyBroadcastTimer, null);
      assert.equal(replica.timerManager.activeTimers.size, 0);
    });
  });
});
