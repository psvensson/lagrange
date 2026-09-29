import {isPartitionCleanupServiceRow} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';

const LOCAL_STR_CRITICAL = 'critical';
const READ_RECOVERY_SERVICE_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const RECOVERY_CREATE_ERROR_CODE = Object.freeze({
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'SERVICE_IDENTITY_CONFLICT',
});

function recoveryCreateError(row, code, cause = null) {
  const error = new Error(`Replica recovery creation ${code}: ` +
    row.service_id);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !== RECOVERY_CREATE_ERROR_CODE.IDENTITY_CONFLICT;
  if (cause) error.cause = cause;
  return error;
}

function rowsMatchRecoveryCreation(observed, expected) {
  const fields = [
    'service_id',
    'service_type',
    'node_id',
    'partition_id',
    'group_id',
    'status',
    'created_at',
  ];
  return fields.every((field) => observed?.[field] === expected[field]);
}

async function insertRecoveryServiceRow(service, row) {
  const gateway = service.getControlPlaneSystemTableGateway();
  let result = null;
  let mutationError = null;
  try {
    result = await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      row,
    }, {
      allowCoalescing: false,
      coalescingKey: `services:${row.service_id}:recovery:${row.created_at}`,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: LOCAL_STR_CRITICAL,
    });
  } catch (error) {
    mutationError = error;
  }
  if (classifyControlPlaneMutationResult(result).applied) return row;
  let observation = null;
  try {
    observation = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.SERVICES,
      READ_RECOVERY_SERVICE_SQL,
      [row.service_id],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: LOCAL_STR_CRITICAL,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
    );
  } catch (_error) {
    observation = null;
  }
  const observed = observation?.success === true &&
    observation.rows?.length === 1 ? observation.rows[0] : null;
  if (rowsMatchRecoveryCreation(observed, row)) return observed;
  throw recoveryCreateError(
    row,
    isPartitionCleanupServiceRow(observed) ?
      RECOVERY_CREATE_ERROR_CODE.CLEANUP_IN_PROGRESS :
      observed ? RECOVERY_CREATE_ERROR_CODE.IDENTITY_CONFLICT :
        RECOVERY_CREATE_ERROR_CODE.CREATE_OWNER_DEFERRED,
    mutationError,
  );
}

export {insertRecoveryServiceRow};
