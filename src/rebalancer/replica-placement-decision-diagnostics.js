import {PLACEMENT_RESOURCE_COLUMNS} from '../diagnostics/placement-resource-sample.js';

const SAMPLE_FIELDS = Object.freeze([
  ...Object.keys(PLACEMENT_RESOURCE_COLUMNS), 'sampleId', 'sampledAtMs', 'bootIncarnation',
  'congestionEpochId', 'pressureSensorsComplete', 'availableMemoryBytes',
  'requiredMemoryReserveBytes', 'memoryHardConstrained', 'storageHardConstrained',
  'backpressured', 'congestionAttributed', 'congestionReason', 'initQueueDelayMs',
  'transferQueueDelayMs', 'writeLatencyMs', 'stageDurationMs', 'operationBytes',
]);

// One budget pass. Repeated candidate checks replace the source/class entry.
// An unexamined class has no check, including candidates excluded before the gate.
export function createPlacementDecisionDiagnostics(pass, evaluatedAtMs) {
  const nodes = Object.create(null);
  const node = (id) => nodes[id] ??= {source: null, target: null, copyChecks: Object.create(null)};
  const snapshot = {
    passSequence: pass.sequence, tenureTerm: pass.tenureTerm, evaluatedAtMs, nodes,
    lastCopyProposal: null,
  };
  return {
    snapshot,
    recordProposal(entryId, body, move) {
      snapshot.lastCopyProposal = {
        entryId, partitionId: body.partitionId, placementClass: body.placementClass,
        repair: body.repair, sourceNodeId: move.copySourceNodeId, targetNodeId: move.targetNodeId,
        kSrc: body.kSrc, kSrcForClass: body.kSrcForClass, kTgt: body.kTgt,
      };
    },
    recordWindow(nodeId, role, sample, demand, decision) {
      const inputs = sample ? Object.fromEntries(SAMPLE_FIELDS.filter((key) =>
        Object.hasOwn(sample, key)).map((key) => [key, sample[key]])) : null;
      const {action, reason, previousLimit, limit, hardAdmissionAllowed, observationState} = decision;
      node(nodeId)[role] = {
        sample: inputs, demand, action, reason, previousLimit, limit, hardAdmissionAllowed,
        observationState,
      };
    },
    recordAdmissionLimits(budgets) {
      for (const [nodeId, roles] of Object.entries(nodes)) {
        if (roles.source) roles.source.admissionLimit = budgets.sourceBudgetOf(nodeId);
        if (roles.target) roles.target.admissionLimit = budgets.targetBudgetOf(nodeId);
      }
    },
    recordCopyCheck(check) {
      const checks = node(check.sourceNodeId).copyChecks;
      const byRepair = checks[check.placementClass] ??= Object.create(null);
      byRepair[check.repair ? 'repair' : 'ordinary'] = check;
    },
  };
}
