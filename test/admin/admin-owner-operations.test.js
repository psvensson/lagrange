/**
 * Admin owner operations: each semantic admin operation invokes the
 * existing authoritative owner (its validation, its gateway write, its
 * outcome), issues no SQL, and answers a named outcome.
 */
import Fastify from 'fastify';
import {test} from '../../src/test-helpers/tap.js';
import {
  ADMIN_OWNER_OPERATION_ERROR_CODE,
  ADMIN_OWNER_OPERATION_OUTCOME,
  ADMIN_OWNER_OPERATION_PATH,
  AdminOwnerOperations,
  registerAdminOwnerOperationRoutes,
} from '../../src/admin/admin-owner-operations.js';
import {DynamicConfigService} from
  '../../src/config/dynamic-config-service.js';
import {CONFIG_ERROR_CODE} from '../../src/config/config-constants.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {POLICY_ERROR_CODE} from '../../src/policy/policy-constants.js';
import {NodesOwner} from '../../src/control-plane/owners/nodes-owner.js';
import {submitLocalNodeDrainIntent} from
  '../../src/node/local-node-drain.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const SERVING_NODE_ID = 'node-a';
const OTHER_NODE_ID = 'node-b';
const LOG_LEVEL_KEY = 'logging.level';
const TABLE_ID = 'tbl-orders';

/**
 * A recording control-plane gateway: every owner write and read is
 * captured; executeQuery (raw SQL) is never expected.
 * @param {Object} [rowsByTable]
 * @return {Object}
 */
function createRecordingGateway(rowsByTable = {}) {
  const gateway = {
    submittedMutations: [],
    deletedRows: [],
    rawSql: [],
    async submitMutation(mutation, options) {
      gateway.submittedMutations.push({mutation, options});
      return {success: true, outcome: 'applied', affectedRows: 1};
    },
    async readRows(tableName) {
      return {success: true, rows: rowsByTable[tableName] || []};
    },
    async readAuthoritativeRows(tableName) {
      return {success: true, rows: rowsByTable[tableName] || []};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      gateway.deletedRows.push({tableName, whereClause});
      return {success: true, outcome: 'applied', affectedRows: 1};
    },
    async executeQuery(sql) {
      gateway.rawSql.push(sql);
      throw new Error('raw SQL is not an owner operation');
    },
  };
  return gateway;
}

test('config set invokes DynamicConfigService.set through the gateway',
  async (t) => {
    const gateway = createRecordingGateway();
    const owner = new DynamicConfigService({
      controlPlaneSystemTableGateway: gateway,
      nodeId: SERVING_NODE_ID,
    });
    await owner.initialize();
    const operations = new AdminOwnerOperations({
      getDynamicConfigService: () => owner,
    }, SERVING_NODE_ID);

    const result = await operations.setConfig(LOG_LEVEL_KEY, {value: 'warn'});
    t.equal(result.statusCode, 200);
    t.equal(result.body.outcome, ADMIN_OWNER_OPERATION_OUTCOME.APPLIED);
    t.equal(result.body.key, LOG_LEVEL_KEY);
    t.equal(gateway.submittedMutations.length, 1,
      'one owner mutation through the gateway');
    t.equal(gateway.submittedMutations[0].mutation.tableName, 'config');
    t.equal(gateway.submittedMutations[0].mutation.row.config_key,
      LOG_LEVEL_KEY);
    t.equal(gateway.rawSql.length, 0, 'no raw SQL');

    const invalid = await operations.setConfig(LOG_LEVEL_KEY,
      {value: 'not-a-level'});
    t.equal(invalid.statusCode, 400);
    t.equal(invalid.body.outcome, ADMIN_OWNER_OPERATION_OUTCOME.REFUSED);
    t.equal(invalid.body.errorCode, CONFIG_ERROR_CODE.VALUE_INVALID,
      'the owner validation refuses typed');
    t.equal(gateway.submittedMutations.length, 1, 'nothing written');

    const noKey = await operations.setConfig('', {value: 'warn'});
    t.equal(noKey.body.errorCode,
      ADMIN_OWNER_OPERATION_ERROR_CODE.CONFIG_KEY_REQUIRED);
  });

test('an absent owner answers OWNER_NOT_READY and never falls back',
  async (t) => {
    const operations = new AdminOwnerOperations({
      getDynamicConfigService: () => null,
      getTablePolicyService: () => null,
      getNodesOwner: () => null,
    }, SERVING_NODE_ID);
    for (const result of [
      await operations.setConfig(LOG_LEVEL_KEY, {value: 'warn'}),
      await operations.updateTablePolicy(TABLE_ID, {policy: {}}),
      await operations.removeNode(OTHER_NODE_ID),
    ]) {
      t.equal(result.statusCode, 503);
      t.equal(result.body.outcome,
        ADMIN_OWNER_OPERATION_OUTCOME.OWNER_NOT_READY);
      t.equal(result.body.errorCode,
        ADMIN_OWNER_OPERATION_ERROR_CODE.OWNER_NOT_READY);
    }
  });

test('drain submits the node-local one-way drain; a remote drain is refused',
  async (t) => {
    const drained = [];
    const bootstrapAPI = {
      markDraining(options) {
        drained.push(options);
        return {phase: 'degraded', reasons: [options.reasonCode]};
      },
    };
    const operations = new AdminOwnerOperations({
      submitLocalDrainIntent: (options) =>
        submitLocalNodeDrainIntent({bootstrapAPI}, options),
    }, SERVING_NODE_ID);

    const remote = await operations.drainNode(OTHER_NODE_ID, {});
    t.equal(remote.statusCode, 409);
    t.equal(remote.body.errorCode,
      ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_DRAIN_REMOTE_UNSUPPORTED);
    t.equal(drained.length, 0, 'no drain intent for another node');

    const local = await operations.drainNode(SERVING_NODE_ID, {});
    t.equal(local.statusCode, 200);
    t.equal(local.body.outcome, ADMIN_OWNER_OPERATION_OUTCOME.APPLIED);
    t.same(local.body.reasons, ['admin_drain']);
    t.equal(drained.length, 1, 'one drain intent on the serving node');
  });

test('the membership controller owns the drain where the branch built one',
  async (t) => {
    const intents = [];
    const controller = {
      submitDrainIntent(options) {
        intents.push(options);
        return {phase: 'draining', reasons: [options.reasonCode]};
      },
    };
    const bootstrapAPI = {
      markDraining() {
        t.fail('the controller owns the drain');
      },
    };
    const snapshot = await submitLocalNodeDrainIntent(
      {membershipLifecycleController: controller, bootstrapAPI},
      {drainDeadlineMs: 5, reasonCode: 'admin_drain'},
    );
    t.equal(intents.length, 1);
    t.equal(intents[0].drainDeadlineMs, 5);
    t.equal(snapshot.phase, 'draining');
  });

test('node remove deletes only a terminal row through NodesOwner',
  async (t) => {
    const gateway = createRecordingGateway({
      nodes: [{node_id: OTHER_NODE_ID, status: 'active'}],
    });
    const nodesOwner = new NodesOwner({
      controlPlaneSystemTableGateway: gateway,
    });
    const operations = new AdminOwnerOperations({
      getNodesOwner: () => nodesOwner,
    }, SERVING_NODE_ID);

    const live = await operations.removeNode(OTHER_NODE_ID);
    t.equal(live.statusCode, 409);
    t.equal(live.body.errorCode,
      ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_REMOVE_NODE_LIVE);
    t.equal(gateway.deletedRows.length, 0, 'a live node row is kept');

    const stoppedGateway = createRecordingGateway({
      nodes: [{node_id: OTHER_NODE_ID, status: 'stopped'}],
    });
    const stoppedOwner = new NodesOwner({
      controlPlaneSystemTableGateway: stoppedGateway,
    });
    const stopped = await new AdminOwnerOperations({
      getNodesOwner: () => stoppedOwner,
    }, SERVING_NODE_ID).removeNode(OTHER_NODE_ID);
    t.equal(stopped.statusCode, 200);
    t.equal(stoppedGateway.deletedRows.length, 1);
    t.same(stoppedGateway.deletedRows[0], {
      tableName: 'nodes',
      whereClause: {node_id: OTHER_NODE_ID},
    });
    t.equal(stoppedGateway.rawSql.length, 0, 'no raw SQL');

    const missingOwner = new NodesOwner({
      controlPlaneSystemTableGateway: createRecordingGateway(),
    });
    const missing = await new AdminOwnerOperations({
      getNodesOwner: () => missingOwner,
    }, SERVING_NODE_ID).removeNode(OTHER_NODE_ID);
    t.equal(missing.statusCode, 404);
    t.equal(missing.body.errorCode,
      ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_NOT_FOUND);
  });

test('table policy invokes TablePolicyService.updateTablePolicy',
  async (t) => {
    const gateway = createRecordingGateway({
      tables: [{table_id: TABLE_ID, table_policies: '{}'}],
    });
    const owner = new TablePolicyService({
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: gateway,
    });
    owner.initialize();
    const operations = new AdminOwnerOperations({
      getTablePolicyService: () => owner,
    }, SERVING_NODE_ID);

    const result = await operations.updateTablePolicy(TABLE_ID,
      {policy: {splitStorageThreshold: 1024}});
    t.equal(result.statusCode, 200);
    t.equal(result.body.outcome, ADMIN_OWNER_OPERATION_OUTCOME.APPLIED);
    t.equal(result.body.policy.splitStorageThreshold, 1024);
    t.equal(gateway.submittedMutations.length, 1);
    const {mutation} = gateway.submittedMutations[0];
    t.equal(mutation.tableName, 'tables');
    t.same(mutation.whereClause, {table_id: TABLE_ID});
    t.same(JSON.parse(mutation.data.table_policies),
      {splitStorageThreshold: 1024});

    const invalid = await operations.updateTablePolicy(TABLE_ID,
      {policy: {replicaCount: 2}});
    t.equal(invalid.statusCode, 400);
    t.equal(invalid.body.errorCode, POLICY_ERROR_CODE.POLICY_INVALID);
    t.equal(gateway.submittedMutations.length, 1, 'nothing written');

    const noTable = await operations.updateTablePolicy('', {policy: {}});
    t.equal(noTable.body.errorCode, POLICY_ERROR_CODE.TABLE_ID_REQUIRED);
  });

test('the routes answer each operation over HTTP', async (t) => {
  const calls = [];
  const fastify = Fastify();
  registerAdminOwnerOperationRoutes(fastify, {
    setConfig: async (...args) => {
      calls.push(['setConfig', ...args]);
      return {statusCode: 200, body: {success: true}};
    },
    drainNode: async (...args) => {
      calls.push(['drainNode', ...args]);
      return {statusCode: 409, body: {success: false}};
    },
    removeNode: async (...args) => {
      calls.push(['removeNode', ...args]);
      return {statusCode: 404, body: {success: false}};
    },
    updateTablePolicy: async (...args) => {
      calls.push(['updateTablePolicy', ...args]);
      return {statusCode: 200, body: {success: true}};
    },
  });
  t.teardown(() => fastify.close());

  const config = await fastify.inject({method: 'PUT',
    url: ADMIN_OWNER_OPERATION_PATH.configByKey(LOG_LEVEL_KEY),
    payload: {value: 'warn'}});
  t.equal(config.statusCode, 200);
  const drain = await fastify.inject({method: 'POST',
    url: ADMIN_OWNER_OPERATION_PATH.nodeDrain(OTHER_NODE_ID), payload: {}});
  t.equal(drain.statusCode, 409);
  const remove = await fastify.inject({method: 'DELETE',
    url: ADMIN_OWNER_OPERATION_PATH.nodeById(OTHER_NODE_ID)});
  t.equal(remove.statusCode, 404);
  const policy = await fastify.inject({method: 'PATCH',
    url: ADMIN_OWNER_OPERATION_PATH.tablePolicy(TABLE_ID),
    payload: {policy: {a: 1}}});
  t.equal(policy.statusCode, 200);
  t.same(calls, [
    ['setConfig', LOG_LEVEL_KEY, {value: 'warn'}],
    ['drainNode', OTHER_NODE_ID, {}],
    ['removeNode', OTHER_NODE_ID],
    ['updateTablePolicy', TABLE_ID, {policy: {a: 1}}],
  ]);
});

test('the admin API serves the owner operations with its owner providers',
  async (t) => {
    const gateway = createRecordingGateway({
      tables: [{table_id: TABLE_ID, table_policies: '{}'}],
    });
    const owner = new TablePolicyService({
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: gateway,
    });
    owner.initialize();
    const api = new AdminWebSocketAPI({
      nodeId: SERVING_NODE_ID,
      sqlQueryEngine: {
        executeRequest: async () => t.fail('no SQL for an owner operation'),
      },
      adminOwnerProviders: {getTablePolicyService: () => owner},
    });
    await api.initialize(0, {listen: false});
    t.teardown(() => api.shutdown());

    const response = await api.getFastify().inject({
      method: 'PATCH',
      url: ADMIN_OWNER_OPERATION_PATH.tablePolicy(TABLE_ID),
      payload: {policy: {splitStorageThreshold: 2048}},
    });
    t.equal(response.statusCode, 200);
    t.equal(response.json().outcome, ADMIN_OWNER_OPERATION_OUTCOME.APPLIED);
    t.equal(gateway.submittedMutations.length, 1);

    const drain = await api.getFastify().inject({
      method: 'POST',
      url: ADMIN_OWNER_OPERATION_PATH.nodeDrain(OTHER_NODE_ID),
      payload: {},
    });
    t.equal(drain.json().errorCode,
      ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_DRAIN_REMOTE_UNSUPPORTED);
  });
