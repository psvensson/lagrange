// The topology owner's synchronous observation of the existing routing plan.
// Re-observation may add a required group or replace its route; it cannot
// discharge a captured requirement merely because a projection omitted it.
//
// One plan per stamp (propagationPlanAtStamp): for each source the owner holds
// (in its propagationPlansAtStamp field) the frozen plan it last observed, with
// the stamp of every input that observation read, and answers that same plan
// while the stamp is unchanged. Each versioned component is exposed by the
// input's own owner: the cache's per-table mutation versions, the
// configuration revision and the latency tree's routing generation; the rest
// are the identities and plain values the observation reads. A component an
// owner does not expose reads as no version, which makes the stamp unknown,
// and an unknown stamp always observes anew. The plan never decides
// currentness: every identity and field check of the caller still runs.
import {TABLES} from '../constants/index.js';
import {deepFreeze} from '../utils/deep-freeze.js';
import {buildGroupedContext, buildSafeTargets} from './cdc-group-propagation-routing.js';
import {LATENCY_PROPAGATION_MODE} from './latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_REASON, CDC_MESSAGE_GROUP_REPLICA_SUFFIX} from
  './cdc-group-propagation-constants.js';

// Every system table the observation reads (cdc-group-propagation-routing.js).
const PLAN_TABLES = Object.freeze([TABLES.SERVICES, TABLES.NODES, TABLES.LATENCY_GROUPS,
  TABLES.MESSAGE_GROUPS]);
const UNKNOWN_STAMP = null;

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
      nodeId: owner.nodeId,
      latencyTreeService: owner.latencyTreeService,
      systemTableCache: owner.systemTableCache,
      messageGroupReplicaSuffix: owner.messageGroupReplicaSuffix ??
        CDC_MESSAGE_GROUP_REPLICA_SUFFIX});
  return {targets, fallbackReason, useGrouped, sourceMismatch};
}

function isOwnerVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function planStampOf(owner, source) {
  const {systemTableCache: cache, config, latencyTreeService: tree, messageRouter: router} =
    owner;
  const versions = [config?.getRevision?.(), tree?.getRoutingGeneration?.(),
    ...PLAN_TABLES.map((tableName) => cache?.getTableMutationVersion?.(tableName))];
  if (!versions.every(isOwnerVersion)) return UNKNOWN_STAMP;
  return [cache, config, tree, router, router?.deliver, owner.nodeId,
    owner.messageGroupReplicaSuffix, owner.propagationMode, source.groupId, ...versions];
}

function sameStamp(held, current) {
  return held.length === current.length &&
    held.every((component, index) => Object.is(component, current[index]));
}

function heldPlanOf(owner, source, stamp) {
  if (stamp === UNKNOWN_STAMP) return null;
  const held = owner.propagationPlansAtStamp?.get(source);
  return held !== undefined && sameStamp(held.stamp, stamp) ? held.plan : null;
}

function holdPlan(owner, source, plan) {
  // Stamped after the observation, whose only writes (refreshConfig) settle
  // owner.propagationMode from the configuration it reads.
  const stamp = planStampOf(owner, source);
  if (stamp === UNKNOWN_STAMP) return;
  owner.propagationPlansAtStamp?.set(source, {stamp, plan});
}

function propagationPlanAtStamp(owner, source) {
  const held = heldPlanOf(owner, source, planStampOf(owner, source));
  if (held !== null) return held;
  const plan = deepFreeze(captureDurablePropagationPlan(owner, source));
  holdPlan(owner, source, plan);
  return plan;
}

export {propagationPlanAtStamp};
