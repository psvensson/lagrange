import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {COLUMN, SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {NodeLifecyclePublication} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';

const FIXTURE_BOOT_INCARNATION = 1;

function isAppliedWrite(result) {
  const affectedRows = Number(result?.partitionResult?.affectedRows);
  return result?.success !== false &&
    (!Number.isFinite(affectedRows) || affectedRows > 0);
}

/**
 * The real node lifecycle owner over the gateway under test. The fixture
 * stands in only for the durable NODES row the owner reads: it starts from
 * the cache row (or `authoritativeNodeRow`; null means the row is absent)
 * and reflects the owner's own CAS writes that the gateway under test
 * accepted. It never writes NODES itself.
 * @param {Object} options
 * @return {NodeLifecyclePublication}
 */
function createNodeLifecyclePublicationFixture(options = {}) {
  const gateway = options.controlPlaneSystemTableGateway;
  const bootIncarnation = Number.isSafeInteger(options.bootIncarnation) &&
    options.bootIncarnation > 0 ?
    options.bootIncarnation :
    FIXTURE_BOOT_INCARNATION;
  let durableRow;
  const readDurableRow = () => {
    if (durableRow === undefined) {
      durableRow = options.authoritativeNodeRow === null ? null : {
        [COLUMN.NODE_ID]: options.nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.LAST_HEARTBEAT]: 0,
        [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        [COLUMN.CREATED_AT]: 0,
        ...(options.systemTableCache?.get?.(
          SYSTEM_TABLE_NAME.NODES,
          options.nodeId,
        ) || {}),
        ...(options.authoritativeNodeRow || {}),
        [COLUMN.BOOT_INCARNATION]: bootIncarnation,
      };
    }
    return durableRow;
  };
  return new NodeLifecyclePublication({
    gateway: {
      readAuthoritativeRows: async () => {
        const row = readDurableRow();
        return {success: true, rows: row ? [{...row}] : []};
      },
      updateSystemTableRow: async (tableName, whereClause, row, writeOptions) => {
        const result = await gateway.updateSystemTableRow(
          tableName,
          whereClause,
          row,
          writeOptions,
        );
        if (readDurableRow() && isAppliedWrite(result)) {
          durableRow = {...durableRow, ...row};
        }
        return result;
      },
    },
    leaseAuthority: NodeReadyLeaseAuthority.fromConfiguration(),
    now: options.now,
  });
}

export {FIXTURE_BOOT_INCARNATION, createNodeLifecyclePublicationFixture};
