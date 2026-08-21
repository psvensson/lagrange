import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {TABLES} from '../../src/constants/index.js';

const GATEWAY_REPLICA_OPERATION_ID = 'op-gateway-1';
const GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY =
  'replica-operation:op-gateway-1';

function registerControlPlaneSystemTableGatewayReadCoalescingTests() {
  test('ControlPlaneSystemTableGateway keeps leader-pinned operation reads ' +
    'separate from concurrent generic reads', async (t) => {
    let releaseGenericRead = null;
    let markGenericReadStarted = null;
    const genericReadStarted = new Promise((resolve) => {
      markGenericReadStarted = resolve;
    });
    const executions = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          _tableName,
          _sql,
          _params,
          options,
        ) {
          executions.push(options);
          if (
            options?.readAuthority?.leaderMode ===
              CONTROL_PLANE_READ_LEADER_MODE.PREFERRED
          ) {
            return {
              success: true,
              rows: [{operation_id: GATEWAY_REPLICA_OPERATION_ID}],
            };
          }
          markGenericReadStarted();
          await new Promise((resolve) => {
            releaseGenericRead = resolve;
          });
          return {success: true, rows: []};
        },
      },
    });
    const sql = 'SELECT * FROM replica_operations WHERE operation_id = ?';
    const genericRead = gateway.readRows(
      TABLES.REPLICA_OPERATIONS,
      sql,
      [GATEWAY_REPLICA_OPERATION_ID],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        coalescingKey: GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY,
      },
    );
    await genericReadStarted;
    const leaderPinnedRead = gateway.readRows(
      TABLES.REPLICA_OPERATIONS,
      sql,
      [GATEWAY_REPLICA_OPERATION_ID],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        coalescingKey: GATEWAY_REPLICA_OPERATION_READ_COALESCING_KEY,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      },
    );

    await Promise.resolve();
    releaseGenericRead();
    const [genericResult, leaderPinnedResult] = await Promise.all([
      genericRead,
      leaderPinnedRead,
    ]);

    t.equal(executions.length, 2,
      'different leader-routing requirements should execute independently');
    t.equal(
      executions[0]?.readAuthority?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.ANY,
      'the generic operation read should keep the unpinned default',
    );
    t.equal(
      executions[1]?.readAuthority?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      'the collision confirmation should execute with the leader pin',
    );
    t.equal(genericResult.rows.length, 0,
      'the generic read should retain its own empty observation');
    t.equal(leaderPinnedResult.rows.length, 1,
      'the leader-pinned read should retain the leader observation');
  });
}

export {registerControlPlaneSystemTableGatewayReadCoalescingTests};
