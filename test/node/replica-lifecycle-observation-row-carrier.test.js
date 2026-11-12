/**
 * A successful point read proves absence with an empty row array. A malformed
 * singleton is unavailable evidence; it must not become absence or an empty
 * record. This is a carrier check, not validation of arbitrary field values.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {observeAuthoritativeReplicaLifecycle} from
  '../../src/node/replica-state-machine-lifecycle-observation.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const SERVICE_ROW = Object.freeze({
  service_id: 'carrier-service',
  replica_id: 'carrier-replica',
  group_id: 'carrier-group',
  partition_id: 'carrier-partition',
  node_id: 'carrier-node',
  service_type: SERVICE_TYPE.PARTITION,
  status: ReplicaStatus.ACTIVE,
  address: 'ws://carrier-node:7001',
  previous_state: ReplicaStatus.SYNCING,
  trigger_reason: 'original-activation',
  error_message: null,
  cleanup_token: null,
  create_attempt_token: 'carrier-create-attempt',
  created_at: 101,
  state_entered_at: 103,
  updated_at: 107,
});
const INVALID_SINGLETONS = [
  ['null', null],
  ['undefined', undefined],
  ['false', false],
  ['zero', 0],
  ['empty string', ''],
  ['nonempty string', 'foreign-row'],
  ['array', []],
];

test('malformed singleton carriers stay unavailable and a later owner read remains useful',
async (t) => {
  const calls = [];
  const alternateReads = {cache: 0, sql: 0};
  const readCache = () => {
    alternateReads.cache += 1;
    return [];
  };
  let rows = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: SERVICE_ROW.node_id,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        calls.push({
          tableName,
          params: [...params],
          mode: options.readAuthority.authoritativeReadMode,
          leaderMode: options.readAuthority.leaderMode,
        });
        return {success: true, rows};
      },
    },
    systemTableCache: {getAll: readCache, filter: readCache},
    sqlQueryEngine: {
      async executeQuery() {
        alternateReads.sql += 1;
        return {success: true, rows: []};
      },
    },
  });
  const reader = {getControlPlaneSystemTableGateway: () => gateway};
  for (const [label, value] of INVALID_SINGLETONS) {
    rows = [value];
    const observation = await observeAuthoritativeReplicaLifecycle(
      reader, SERVICE_ROW.service_id);
    t.deepEqual(observation, {available: false, row: null},
      `${label} singleton cannot supply an observation or prove absence`);
  }

  rows = [{...SERVICE_ROW}];
  const legitimate = await observeAuthoritativeReplicaLifecycle(
    reader, SERVICE_ROW.service_id);
  rows = [];
  const absent = await observeAuthoritativeReplicaLifecycle(reader, SERVICE_ROW.service_id);

  t.deepEqual(legitimate, {available: true, row: SERVICE_ROW},
    'the same owner can provide a useful legitimate row after malformed results');
  t.deepEqual(absent, {available: true, row: null},
    'a completed empty row array still proves absence');
  t.deepEqual(calls, Array.from({length: INVALID_SINGLETONS.length + 2}, () => ({
    tableName: TABLES.SERVICES,
    params: [SERVICE_ROW.service_id],
    mode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  })), 'every observation uses its own canonical owner read for the same subject');
  t.deepEqual(alternateReads, {cache: 0, sql: 0},
    'invalid results never select another read authority');
  t.equal(gateway.activeOwnerWorkCount(), 0, 'all gateway read work has completed');
});
