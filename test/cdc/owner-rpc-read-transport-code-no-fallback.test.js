// A transport failure returned by the requested owner lane is retained with
// its exact code. A plausible ordinary SQL answer cannot satisfy the read.
// This preserves the original D2 regression while removing its retired mode.
import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from
  '../../src/constants/transport.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';

const ROUTING_SNAPSHOT = Object.freeze({canonicalLeaderNodeId: 'node-seed',
  serviceRowCount: 2, routableServiceCount: 2, deniedByNodeId: Object.freeze({})});

beforeEach(() => {
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

async function readThroughOwner(ownerRpcFailure) {
  const sqlReads = [];
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        getPartitionRoutingSnapshot: () => ROUTING_SNAPSHOT,
        executeOnPartition: async () => ownerRpcFailure,
      },
      async executeQuery(sql, params, options) {
        sqlReads.push({sql, options});
        return {success: true, rows: [{node_id: 'n1'}]};
      },
    },
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();
  service.setMessageRouter({getQueryDataPlaneTransportReadiness: () =>
    ({ready: true, state: 'ready'})});
  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.NODES, 'SELECT * FROM nodes WHERE node_id = ?', ['n1'], {
      readAuthority: buildControlPlaneReadAuthority({
        authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_RPC_REQUIRED,
        localReadConsistency: 'local_leader'}),
      queryOptions: {timeoutMs: 1234}});
  service.markShuttingDown();
  return {result, sqlReads};
}

for (const [code, error] of [
  [ROUTER_CONNECTION_CLOSED_ERROR_CODE, ROUTER_ERROR_MSG.connectionClosed('node-seed')],
  [ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT],
]) {
  test(`${code} on the owner read is the caller's failure, never a SQL ` +
    'fallback read', async (t) => {
    const {result, sqlReads} = await readThroughOwner({success: false,
      error, errorCode: code, rows: []});
    t.equal(sqlReads.length, 0, 'no SQL fallback read was issued');
    t.equal(result.success, false, 'the read failed');
    t.equal(result.source, 'owner_rpc_lane', 'the answer retains its chosen owner');
    t.equal(result.errorCode, code, 'the transport code survives the authority boundary');
    t.equal(result.error, error, 'the original transport reason survives');
  });
}
