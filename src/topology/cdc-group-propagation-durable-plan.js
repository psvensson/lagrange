// The topology owner's synchronous observation of the existing routing plan.
// Re-observation may add a required group or replace its route; it cannot
// discharge a captured requirement merely because a projection omitted it.
import {buildGroupedContext, buildSafeTargets} from './cdc-group-propagation-routing.js';
import {LATENCY_PROPAGATION_MODE} from './latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_REASON, CDC_MESSAGE_GROUP_REPLICA_SUFFIX} from
  './cdc-group-propagation-constants.js';

function groupedSourceMismatch(grouped, sourceGroupId) {
  return grouped !== null && grouped.sourceGroupId !== null &&
    grouped.sourceGroupId !== sourceGroupId;
}

function captureDurablePropagationPlan(owner, source) {
  owner.refreshConfig();
  const isGroupedMode = owner.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED;
  const grouped = isGroupedMode ? buildGroupedContext(owner, source.groupId) : null;
  const sourceMismatch = groupedSourceMismatch(grouped, source.groupId);
  const fallbackReason = sourceMismatch ? CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH :
    grouped?.fallbackReason ?? (grouped === null ?
      CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE : null);
  const useGrouped = isGroupedMode && fallbackReason === null;
  const targets = isGroupedMode ? [...grouped.targets] :
    buildSafeTargets({sourceGroupId: source.groupId,
      latencyTreeService: owner.latencyTreeService,
      systemTableCache: owner.systemTableCache,
      messageGroupReplicaSuffix: owner.messageGroupReplicaSuffix ??
        CDC_MESSAGE_GROUP_REPLICA_SUFFIX});
  return {targets, fallbackReason, useGrouped, sourceMismatch};
}

export {captureDurablePropagationPlan};
