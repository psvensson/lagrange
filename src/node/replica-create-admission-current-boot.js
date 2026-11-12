/**
 * Current-boot authority read of the partition CREATE admission owner: the
 * NODES row that proves this process still holds the boot incarnation its
 * admissions bind. A refused or failed read keeps its cause; deciding what
 * the row means stays with the admission owner.
 */
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';

const READ_CURRENT_BOOT_SQL =
  'SELECT node_id, boot_incarnation FROM nodes WHERE node_id = ?';

function refusedReadCause(observation) {
  if (!observation || observation.success !== false || !observation.error) {
    return undefined;
  }
  return observation.error instanceof Error ?
    observation.error :
    new Error(String(observation.error));
}

/**
 * Read this node's current-boot row.
 * @param {Object} gateway - The control-plane system-table gateway.
 * @param {string} nodeId
 * @param {Object} readOptions - The owner's authoritative read options.
 * @return {Promise<{row: (Object|null), readCause: (Error|undefined)}>} The
 *   single row when the read succeeded with exactly one, and the cause of a
 *   refused or thrown read.
 */
async function readCurrentBootRow(gateway, nodeId, readOptions) {
  let observation = null;
  let readCause;
  try {
    observation = await readAuthoritativeControlPlaneRows(
      gateway, SYSTEM_TABLE_NAME.NODES, READ_CURRENT_BOOT_SQL,
      [nodeId], readOptions);
    readCause = refusedReadCause(observation);
  } catch (cause) {
    readCause = cause;
    observation = null;
  }
  const row = observation?.success === true &&
    Array.isArray(observation.rows) && observation.rows.length === 1 ?
    observation.rows[0] : null;
  return {row, readCause};
}

export {readCurrentBootRow};
