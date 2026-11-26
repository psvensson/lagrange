import {PLACEMENT_RESOURCE_COLUMNS} from '../diagnostics/placement-resource-sample.js';

const SAMPLE_FIELDS = Object.freeze([
  ...Object.keys(PLACEMENT_RESOURCE_COLUMNS), 'sampleId', 'sampledAtMs', 'bootIncarnation',
  'congestionEpochId', 'pressureSensorsComplete', 'availableMemoryBytes',
  'requiredMemoryReserveBytes', 'memoryHardConstrained', 'storageHardConstrained',
  'backpressured', 'congestionAttributed', 'congestionReason', 'initQueueDelayMs',
  'transferQueueDelayMs', 'writeLatencyMs', 'stageDurationMs', 'operationBytes',
]);

const MAX_PARTITIONS = 128;

// One budget pass. Repeated candidate checks replace the source/class entry.
// An unexamined class has no check, including candidates excluded before the gate.
export function createPlacementDecisionDiagnostics(pass, evaluatedAtMs) {
  const nodes = Object.create(null);
  const node = (id) => nodes[id] ??= {source: null, target: null, copyChecks: Object.create(null)};
  const partitions = Object.create(null);
  let retained = 0;
  const snapshot = {
    partitions, omittedPartitionCount: 0, orderedCount: 0, admissionExamined: 0, stopReason: null,
    passSequence: pass.sequence, tenureTerm: pass.tenureTerm, evaluatedAtMs, nodes,
    lastCopyProposal: null, activeCopies: [], omittedActiveCopyCount: 0,
  };
  return {
    snapshot,
    recordActiveCopy(row) {
      if (snapshot.activeCopies.length >= MAX_PARTITIONS) {
        snapshot.omittedActiveCopyCount++;
        return;
      }
      snapshot.activeCopies.push({partitionId: row.partitionId, operationId: row.operationId,
        sourceNodeId: row.copySourceNodeId, targetNodeId: row.targetNodeId,
        workflowStep: row.step});
    },
    observePartition(partitionId, disposition, busy) {
      if (retained >= MAX_PARTITIONS) {
        snapshot.omittedPartitionCount++;
        return;
      }
      retained++;
      partitions[partitionId] = {partitionId, disposition, busy, copyCheck: null};
    },
    recordEvaluation(partitionId, evaluation, formationReason) {
      const row = partitions[partitionId];
      if (!row) return;
      const {candidate, waiting} = evaluation;
      Object.assign(row, {
        disposition: formationReason ? 'formation_wait' :
          candidate ? 'admission_unexamined' : evaluation.state,
        reason: formationReason ?? waiting?.reason ?? null,
        placementClass: candidate?.placementClass ?? waiting?.placementClass ?? null,
        sourceNodeId: candidate?.move.copySourceNodeId ?? null,
        targetNodeId: candidate?.move.targetNodeId ?? null,
      });
    },
    disposition(partitionId, disposition, reason = null) {
      const row = partitions[partitionId];
      if (row) Object.assign(row, {disposition, reason});
    },
    recordProposal(entryId, body, move) {
      const partition = partitions[body.partitionId];
      if (partition) Object.assign(partition, {disposition: 'submitted', entryId});
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
      const partition = partitions[check.partitionId];
      if (partition) Object.assign(partition, {
        copyCheck: check, sourceNodeId: check.sourceNodeId, targetNodeId: check.targetNodeId,
        disposition: check.allowed ? 'capacity_allowed' : 'capacity_denied',
      });
      const checks = node(check.sourceNodeId).copyChecks;
      const byRepair = checks[check.placementClass] ??= Object.create(null);
      byRepair[check.repair ? 'repair' : 'ordinary'] = check;
    },
  };
}
