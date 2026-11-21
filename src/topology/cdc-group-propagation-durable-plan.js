// The topology owner's synchronous observation of the existing routing plan.
// Re-observation may add a required group or replace its route; it cannot
// discharge a captured requirement merely because a projection omitted it.
//
// One plan per stamp (propagationPlanAtStamp): for each source the owner holds
// (in its propagationPlansAtStamp field) the frozen plan it last observed, with
// the stamp of every input that observation read, and answers that same plan
// while the stamp is unchanged. The stamp is the cache's version of every table
// in CDC_PROPAGATION_PLAN_TABLE (the one list the routing owner reads tables
// through), the configuration revision and the latency tree's routing
// generation, each a required capability validated when the service is wired
// (cdc-group-propagation-collaborators.js), plus the wired cache, tree and
// router and the values the observation reads that a re-wiring can change
// (nodeId, the replica suffix). Each input is read through its owner, never
// probed. A plan is held only when no input moved during its observation, and
// never under a version source that answers no version at read time (such an
// answer is never equal to itself). The plan never decides currentness: every
// identity and field check of the caller still runs.
import {deepFreeze} from '../utils/deep-freeze.js';
import {isOwnerVersion} from './cdc-group-propagation-collaborators.js';
import {buildGroupedContext, buildSafeTargets} from './cdc-group-propagation-routing.js';
import {LATENCY_PROPAGATION_MODE} from './latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_REASON, CDC_MESSAGE_GROUP_REPLICA_SUFFIX,
  CDC_PROPAGATION_PLAN_TABLE} from './cdc-group-propagation-constants.js';

const PLAN_TABLES = Object.freeze(Object.values(CDC_PROPAGATION_PLAN_TABLE));
// The stamp of a read at which a version source answered no version.
const UNHOLDABLE = null;

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

function planStampOf(owner) {
  const {systemTableCache: cache, latencyTreeService: tree} = owner;
  const versions = [owner.config.getRevision(), tree.getRoutingGeneration(),
    ...PLAN_TABLES.map((tableName) => cache.getTableMutationVersion(tableName))];
  if (!versions.every(isOwnerVersion)) return UNHOLDABLE;
  return [cache, tree, owner.messageRouter, owner.nodeId, owner.messageGroupReplicaSuffix,
    ...versions];
}

function sameStamp(held, current) {
  return held !== UNHOLDABLE && current !== UNHOLDABLE && held.length === current.length &&
    held.every((component, index) => Object.is(component, current[index]));
}

function propagationPlanAtStamp(owner, source) {
  const stamp = planStampOf(owner);
  const held = owner.propagationPlansAtStamp.get(source);
  if (held !== undefined && sameStamp(held.stamp, stamp)) return held.plan;
  const plan = deepFreeze(captureDurablePropagationPlan(owner, source));
  // Held only when no stamped input moved during the observation: a move (an
  // apply reached through a call the observation made) leaves the next read
  // to observe anew, instead of holding a plan read before the move under the
  // stamp after it. An unholdable stamp is equal to nothing.
  if (sameStamp(planStampOf(owner), stamp)) {
    owner.propagationPlansAtStamp.set(source, {stamp, plan});
  } else {
    owner.propagationPlansAtStamp.delete(source);
  }
  return plan;
}

export {propagationPlanAtStamp};
