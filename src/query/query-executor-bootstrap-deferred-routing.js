import {wasNodeRecordReadyWhenWritten} from
  '../node/node-readiness-policy.js';

const UNAVAILABLE_TRANSPORT_STATE = Object.freeze({connected: false});

function readNodeRow(readinessService, nodeId) {
  if (!nodeId || typeof readinessService?.getNodeRow !== 'function') {
    return null;
  }
  return readinessService.getNodeRow(nodeId);
}

function readNodeTransportState(readinessService, nodeId, nodeRow) {
  if (
    !nodeId ||
    typeof readinessService?.getNodeTransportState !== 'function'
  ) {
    return UNAVAILABLE_TRANSPORT_STATE;
  }
  return readinessService.getNodeTransportState(nodeId, nodeRow);
}

function isReadinessInternalRouteStructurallyReady(options = {}) {
  const nodeId = options.service?.node_id || options.service?.nodeId || null;
  const nodeRow = readNodeRow(options.readinessService, nodeId);
  if (!wasNodeRecordReadyWhenWritten(nodeRow, {requireActiveStatus: true})) {
    return false;
  }
  return readNodeTransportState(
    options.readinessService,
    nodeId,
    nodeRow,
  )?.connected === true;
}

export {
  isReadinessInternalRouteStructurallyReady,
};
