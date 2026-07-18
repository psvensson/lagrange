/**
 * Regression tests for the structural read-authority token (epic
 * formation-complexity-consolidation, O1 / quest
 * read-authority-structural-threading).
 *
 * Bug class: authority intent (leader pin, mode, consistency, readiness
 * dimension) traveled as optional booleans re-enumerated by hand at every
 * layer boundary; three 2026-07-18 incidents were drops of exactly this
 * shape. The token is built once at gateway read ingress, embedded in every
 * read coalescing identity, and threaded structurally through
 * requestOptions/executionOptions so intermediate layers cannot drop a field
 * they never enumerate.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  executeAuthoritativeOwnerRpcRead,
} from '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const SQL_TEXT = 'SELECT * FROM replica_operations WHERE operation_id = ?';

function createGateway() {
  return new ControlPlaneSystemTableGateway({
    nodeId: 'node-authority-token',
    cdcIntegrationService: null,
    sqlQueryEngine: null,
    systemTableCache: null,
    messageRouter: null,
  });
}

test('read coalescing identity distinguishes every authority field, ' +
  'including leader pin and observation scope, in both key forms',
async (t) => {
  const gateway = createGateway();
  const base = {};
  const variants = [
    {preferOwnerRpcReadLeader: true},
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    },
    {
      authoritativeObservationScope:
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
    },
  ];
  const baseKey =
    gateway.buildReadRequestKey(TABLE, SQL_TEXT, ['op-1'], base);
  for (const variant of variants) {
    const variantKey =
      gateway.buildReadRequestKey(TABLE, SQL_TEXT, ['op-1'], variant);
    t.not(
      variantKey,
      baseKey,
      `implicit key must differ for ${Object.keys(variant)[0]}`,
    );
    const explicitBase = gateway.buildReadRequestKey(
      TABLE, SQL_TEXT, ['op-1'], {...base, coalescingKey: 'shared'},
    );
    const explicitVariant = gateway.buildReadRequestKey(
      TABLE, SQL_TEXT, ['op-1'], {...variant, coalescingKey: 'shared'},
    );
    t.not(
      explicitVariant,
      explicitBase,
      `explicit key must differ for ${Object.keys(variant)[0]}`,
    );
  }
});

test('a pre-built token wins over conflicting field-level options, so an ' +
  'intermediate layer rebuilding options cannot weaken authority',
async (t) => {
  const token = buildControlPlaneReadAuthority({
    preferOwnerRpcReadLeader: true,
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  });
  const rebuilt = buildControlPlaneReadAuthority({
    readAuthority: token,
    // A layer that re-enumerated options and lost the boolean:
    preferOwnerRpcReadLeader: undefined,
  });
  t.equal(rebuilt, token, 'token passes through by identity');
  t.equal(rebuilt.preferOwnerRpcReadLeader, true, 'leader pin preserved');
});

test('CDC owner-RPC execution pins the partition leader from the token ' +
  'alone, with the legacy boolean entirely absent', async (t) => {
  const executeCalls = [];
  const service = {
    nodeId: 'node-authority-token',
    logger: {info: () => {}, warn: () => {}, error: () => {}},
    sqlQueryEngine: {
      queryExecutor: {
        executeOnPartition: async (
          partitionId, statement, params, isRead, preferLeader,
        ) => {
          executeCalls.push({partitionId, statement, params, preferLeader});
          return {success: true, rows: [{operation_id: 'op-1'}]};
        },
      },
    },
  };

  const tokenOnlyOptions = {
    readAuthority: buildControlPlaneReadAuthority({
      preferOwnerRpcReadLeader: true,
    }),
  };
  await executeAuthoritativeOwnerRpcRead(
    service, TABLE, SQL_TEXT, ['op-1'], tokenOnlyOptions, {},
  );
  t.equal(executeCalls.length, 1, 'owner-RPC read executed');
  t.equal(
    executeCalls[0].preferLeader,
    true,
    'leader pin honored from the structural token without the legacy field',
  );

  await executeAuthoritativeOwnerRpcRead(
    service, TABLE, SQL_TEXT, ['op-1'],
    {readAuthority: buildControlPlaneReadAuthority({})}, {},
  );
  t.equal(
    executeCalls[1].preferLeader,
    false,
    'default routing stays un-pinned when the token does not request it',
  );
});
