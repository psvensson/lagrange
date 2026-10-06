import {
  ReplicaHandler as ProductionReplicaHandler,
} from '../../src/node/replica-handler.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {scenarioStampingReplicaHandler} from
  './replica-handler-bootstrap-stamps.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../test-helpers/lifecycle-state-store.js';

const ScenarioStampingReplicaHandler =
  scenarioStampingReplicaHandler(ProductionReplicaHandler);

function buildOwnerPathGateway(options, operationRows, lifecycleGateway) {
  const matches = (row, where) => Object.entries(where).every(
    ([field, value]) => row?.[field] === value,
  );
  return {
    async readAuthoritativeRows(tableName, sql, params = []) {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return {success: true, rows: [{
          node_id: options.nodeId,
          boot_incarnation: 1,
        }]};
      }
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        const rows = sql.includes('WHERE operation_id = ?') ?
          [operationRows.get(params[0])].filter(Boolean) :
          [...operationRows.values()].filter(
            (row) => row.target_node_id === params[0] &&
              row.create_admission_state !== null,
          );
        return {success: true, rows: rows.map((row) => ({...row}))};
      }
      return lifecycleGateway.readAuthoritativeRows(tableName, sql, params);
    },
    async updateSystemTableRow(tableName, where, data) {
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        const row = operationRows.get(where.operation_id);
        const applied = Boolean(row && matches(row, where));
        if (applied) Object.assign(row, data);
        return {
          success: true,
          outcome: applied ? 'applied' : 'observed_state_changed',
          partitionResult: {affectedRows: applied ? 1 : 0},
        };
      }
      return lifecycleGateway.submitMutation({
        operation: 'update', tableName, whereClause: where, data,
      });
    },
    submitMutation: lifecycleGateway.submitMutation,
  };
}

class OwnerPathReplicaHandler extends ScenarioStampingReplicaHandler {
  constructor(options = {}) {
    const operationRows = new Map();
    const lifecycleGateway = createLifecycleControlPlaneGatewayForCache(
      options.systemTableCache,
    );
    const gateway = buildOwnerPathGateway(
      options,
      operationRows,
      lifecycleGateway,
    );
    super({...options, controlPlaneSystemTableGateway: gateway});
    this.ownerPathOperationRows = operationRows;
  }

  prepareOwnerPathCreatePayload(payload) {
    const operationId = payload[ReplicaOperationField.OPERATION_ID];
    const operationType =
      payload[ReplicaOperationField.OPERATION_TYPE] || OperationType.ADD;
    const partitionId = payload[ReplicaOperationField.PARTITION_ID];
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    let row = this.ownerPathOperationRows.get(operationId);
    if (!row) {
      const updatedAt = Date.now();
      row = {
        operation_id: operationId,
        type: operationType,
        entity_type: 'partition',
        entity_id: partitionId,
        partition_id: partitionId,
        replica_id: replicaId,
        target_node_id: this.nodeId,
        workflow_step: 'SENDING',
        updated_at: updatedAt,
        completed_at: null,
        create_admission_state: null,
        create_admission_token: null,
        create_admission_replica_created_at: null,
        create_admission_attempt_token: null,
        create_admission_previous_attempt_token: null,
        create_admission_attempt_seq: null,
        create_admission_workflow_updated_at: null,
        create_admission_owner_incarnation: null,
      };
      this.ownerPathOperationRows.set(operationId, row);
    }
    const admissionToken = row.create_admission_token ||
      buildReplicaCreateAdmissionToken({
        operationId,
        replicaId,
        targetNodeId: this.nodeId,
        workflowUpdatedAt: row.updated_at,
      });
    return {
      ...payload,
      [ReplicaOperationField.OPERATION_TYPE]: operationType,
      [ReplicaOperationField.ENTITY_TYPE]: 'partition',
      [ReplicaOperationField.ENTITY_ID]: partitionId,
      [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
      [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]:
        row.updated_at,
      [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
        row.create_admission_attempt_token ||
        buildReplicaCreateAttemptToken(admissionToken, 1),
      [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]:
        row.create_admission_attempt_seq || 1,
    };
  }

  handleMessage(envelope) {
    const payload = envelope?.payload;
    return super.handleMessage(
      payload?.type === ReplicaOperationMessageType.CREATE_REPLICA ?
        {...envelope, payload: this.prepareOwnerPathCreatePayload(payload)} :
        envelope,
    );
  }
}

export {OwnerPathReplicaHandler};
