// @ts-nocheck
import {
  CONSISTENCY_MISMATCH_KIND,
  CONSISTENCY_VERDICT,
} from './constants.js';

const ZERO = 0;
const ONE = 1;

function normalizeNodeId(snapshot, fallbackIndex) {
  if (typeof snapshot?.nodeId === 'string' && snapshot.nodeId.length > ZERO) {
    return snapshot.nodeId;
  }
  return 'snapshot-node-' + String(fallbackIndex + ONE);
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value))
    .filter((value) => value.length > ZERO)
    .sort();
}

function normalizeSnapshot(snapshot, fallbackIndex) {
  return {
    nodeId: normalizeNodeId(snapshot, fallbackIndex),
    partitions: normalizeStringArray(snapshot?.partitions),
    leaders: snapshot?.leaders && typeof snapshot.leaders === 'object' ?
      {...snapshot.leaders} :
      {},
    replicaRoleDiagnostics:
      snapshot?.replicaRoleDiagnostics &&
        typeof snapshot.replicaRoleDiagnostics === 'object' ?
        {...snapshot.replicaRoleDiagnostics} :
        {},
    replicaOperations: snapshot?.replicaOperations &&
      typeof snapshot.replicaOperations === 'object' ?
      {
        inFlightCount: Number.isInteger(snapshot.replicaOperations.inFlightCount) ?
          snapshot.replicaOperations.inFlightCount :
          ZERO,
        statusHistogram:
          snapshot.replicaOperations.statusHistogram &&
            typeof snapshot.replicaOperations.statusHistogram === 'object' ?
            {...snapshot.replicaOperations.statusHistogram} :
            {},
      } :
      {
        inFlightCount: ZERO,
        statusHistogram: {},
      },
  };
}

function arraySetEquals(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = ZERO; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

class ConsistencyEvaluatorV2 {
  evaluate(options = {}) {
    const reachableNodeIds = Array.isArray(options.reachableNodeIds) ?
      options.reachableNodeIds.map((value) => String(value)) :
      [];
    const snapshots = Array.isArray(options.snapshots) ?
      options.snapshots.map((snapshot, index) =>
        normalizeSnapshot(snapshot, index)) :
      [];

    const coverage = {
      reachableNodes: reachableNodeIds.length,
      snapshotNodes: snapshots.length,
    };
    const mismatches = [];
    const evidenceWarnings = [];

    if (coverage.snapshotNodes === ZERO) {
      evidenceWarnings.push('no snapshots were available for consistency evaluation');
    }

    if (coverage.reachableNodes > coverage.snapshotNodes) {
      evidenceWarnings.push(
        'snapshot coverage below reachable nodes: snapshots=' +
          coverage.snapshotNodes +
          ' reachable=' +
          coverage.reachableNodes,
      );
    }

    if (coverage.snapshotNodes < 2) {
      evidenceWarnings.push('at least two snapshots are required for distributed comparison');
    }

    this._collectPartitionSetMismatches(snapshots, mismatches);
    this._collectLeaderMismatches(snapshots, mismatches);
    this._collectReplicaRoleMismatches(snapshots, mismatches);
    this._collectReplicaOperationMismatches(snapshots, mismatches);

    if (mismatches.length > ZERO) {
      return {
        verdict: CONSISTENCY_VERDICT.INCONSISTENT,
        hardFailure: true,
        coverage,
        mismatches,
        evidenceWarnings,
      };
    }

    if (evidenceWarnings.length > ZERO) {
      return {
        verdict: CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE,
        hardFailure: false,
        coverage,
        mismatches,
        evidenceWarnings,
      };
    }

    return {
      verdict: CONSISTENCY_VERDICT.CONSISTENT,
      hardFailure: false,
      coverage,
      mismatches,
      evidenceWarnings,
    };
  }

  _collectPartitionSetMismatches(snapshots, mismatches) {
    if (snapshots.length < 2) {
      return;
    }

    const byNode = {};
    for (const snapshot of snapshots) {
      byNode[snapshot.nodeId] = [...snapshot.partitions];
    }

    const expected = snapshots[ZERO].partitions;
    for (const snapshot of snapshots) {
      if (!arraySetEquals(snapshot.partitions, expected)) {
        mismatches.push({
          kind: CONSISTENCY_MISMATCH_KIND.PARTITION_SET,
          byNode,
        });
        return;
      }
    }
  }

  _collectLeaderMismatches(snapshots, mismatches) {
    if (snapshots.length < 2) {
      return;
    }

    const partitionIds = new Set();
    for (const snapshot of snapshots) {
      for (const partitionId of Object.keys(snapshot.leaders || {})) {
        partitionIds.add(partitionId);
      }
    }

    for (const partitionId of partitionIds) {
      const byNode = {};
      const distinctLeaders = new Set();
      let hasEmptyLeader = false;
      for (const snapshot of snapshots) {
        const leader = String(snapshot.leaders?.[partitionId] || '');
        byNode[snapshot.nodeId] = leader;
        if (leader.length > ZERO) {
          distinctLeaders.add(leader);
        } else {
          hasEmptyLeader = true;
        }
      }
      const hasConflict = distinctLeaders.size > ONE ||
        (distinctLeaders.size === ONE && hasEmptyLeader);
      if (hasConflict) {
        mismatches.push({
          kind: CONSISTENCY_MISMATCH_KIND.LEADER,
          partitionId,
          byNode,
        });
      }
    }
  }

  _collectReplicaRoleMismatches(snapshots, mismatches) {
    if (snapshots.length < 2) {
      return;
    }

    const partitionIds = new Set();
    for (const snapshot of snapshots) {
      for (const partitionId of Object.keys(snapshot.replicaRoleDiagnostics || {})) {
        partitionIds.add(partitionId);
      }
    }

    for (const partitionId of partitionIds) {
      const byNode = {};
      let hasInconsistency = false;
      for (const snapshot of snapshots) {
        const diagnostic = snapshot.replicaRoleDiagnostics?.[partitionId];
        const normalizedDiagnostic = {
          canonicalLeaderNodeId:
            typeof diagnostic?.canonicalLeaderNodeId === 'string' &&
              diagnostic.canonicalLeaderNodeId.length > ZERO ?
              diagnostic.canonicalLeaderNodeId :
              '',
          inconsistentReplicaRoles: Boolean(diagnostic?.inconsistentReplicaRoles),
          replicaLeaderNodeIds: normalizeStringArray(diagnostic?.replicaLeaderNodeIds),
          source:
            typeof diagnostic?.source === 'string' && diagnostic.source.length > ZERO ?
              diagnostic.source :
              '',
        };
        if (normalizedDiagnostic.inconsistentReplicaRoles) {
          hasInconsistency = true;
        }
        byNode[snapshot.nodeId] = normalizedDiagnostic;
      }

      if (hasInconsistency) {
        mismatches.push({
          kind: CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE,
          partitionId,
          byNode,
        });
      }
    }
  }

  _collectReplicaOperationMismatches(snapshots, mismatches) {
    if (snapshots.length < 2) {
      return;
    }

    const byNode = {};
    const distinctCounts = new Set();
    for (const snapshot of snapshots) {
      const inFlightCount = Number(snapshot.replicaOperations?.inFlightCount || ZERO);
      byNode[snapshot.nodeId] = inFlightCount;
      distinctCounts.add(inFlightCount);
    }

    if (distinctCounts.size > ONE) {
      mismatches.push({
        kind: CONSISTENCY_MISMATCH_KIND.REPLICA_OPERATION,
        field: 'inFlightCount',
        byNode,
      });
    }
  }
}

export {ConsistencyEvaluatorV2};
