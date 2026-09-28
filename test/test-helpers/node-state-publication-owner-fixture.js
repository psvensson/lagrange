import {
  CONTROL_PLANE_MESSAGE_COMPLETION_FIELD,
  CONTROL_PLANE_MESSAGE_COMPLETION_KIND,
} from '../../src/control-plane/control-plane-constants.js';
import {COLUMN, SERVICE_STATUS, STATE, TABLES} from
  '../../src/constants/index.js';

function createNodeStatePublicationOwnerFixture(options = {}) {
  const gateway = options.controlPlaneSystemTableGateway;
  const nodeId = options.nodeId;
  const bootIncarnation = Number.isSafeInteger(options.bootIncarnation) &&
    options.bootIncarnation > 0 ? options.bootIncarnation : 1;
  return async (payload = {}) => {
    const row = {
      ...(payload.nodeRow || {}),
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.BOOT_INCARNATION]: bootIncarnation,
      [COLUMN.STATUS]: payload.state === STATE.READY ?
        SERVICE_STATUS.ACTIVE :
        payload.nodeRow?.[COLUMN.STATUS],
      [COLUMN.CONNECTION_STATE]: payload.state,
      [COLUMN.LAST_HEARTBEAT]: payload.heartbeatAt,
    };
    const result = await gateway.updateSystemTableRow(
      TABLES.NODES,
      {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.BOOT_INCARNATION]: bootIncarnation,
      },
      row,
      {skipCacheWait: true},
    );
    if (Number(result?.partitionResult?.affectedRows) === 0) {
      const error = new Error('NODE_ROW_MISSING');
      error.code = 'NODE_ROW_MISSING';
      throw error;
    }
    return {
      completionKind:
        CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION,
      completionCompleted: true,
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: row,
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_OBSERVED_AT_MS]:
        Number(payload.heartbeatAt),
    };
  };
}

export {createNodeStatePublicationOwnerFixture};
