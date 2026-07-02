import {ADMISSION_DECISION} from './storage-capacity-constants.js';

function freezeStrings(values) {
  return Object.freeze(Array.isArray(values) ? [...values] : []);
}

function freezeProjectedUtilizationMap(entries) {
  if (!entries || typeof entries !== 'object') {
    return Object.freeze({});
  }
  return Object.freeze({...entries});
}

function buildStorageAdmissionResult(options) {
  const allowed = options.allowed === true;
  const decision = allowed ? ADMISSION_DECISION.ALLOW : ADMISSION_DECISION.DENY;
  const ineligibleNodes = Array.isArray(options.ineligibleNodes) ?
    options.ineligibleNodes.map((entry) => {
      return Object.freeze({
        ...entry,
        failedDimensions: freezeStrings(entry.failedDimensions),
        reasonCodes: freezeStrings(entry.reasonCodes),
        nodeSummary:
            entry?.nodeSummary && typeof entry.nodeSummary === 'object' ?
              Object.freeze({...entry.nodeSummary}) :
              null,
      });
    }) :
    [];
  const readinessSnapshots = options.readinessSnapshots ?
    Object.freeze({...options.readinessSnapshots}) :
    Object.freeze({});
  return Object.freeze({
    allowed,
    decisionType: options.decisionType,
    operationType: options.operationType,
    requiredReplicaCount: options.requiredReplicaCount,
    eligibleNodeIds: freezeStrings(options.eligibleNodeIds),
    ineligibleNodes: Object.freeze(ineligibleNodes),
    blockingReasons: freezeStrings(options.blockingReasons),
    decisionTimestamp: options.decisionTimestamp,
    projectedUtilizationByNodeId: freezeProjectedUtilizationMap(
      options.projectedUtilizationByNodeId,
    ),
    decision,
    reason: options.reason,
    projectedUtilization: options.projectedUtilization ?
      Object.freeze(options.projectedUtilization) :
      null,
    readinessSnapshots,
  });
}

export {buildStorageAdmissionResult};
