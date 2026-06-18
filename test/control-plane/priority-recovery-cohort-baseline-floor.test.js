import {test} from '../../src/test-helpers/tap.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from '../../src/control-plane/active-node-publication-snapshots.js';

// Falsifier for census rank2 "cp-pub-01-readiness-exclude-empties-cohort".
//
// REGRESSION (8f5bc72a): resolvePriorityRecoveryActiveNodeCohort began running
// excludeUnavailableNodeIds over the published baseline using the union of
// admission-BLOCKED + readiness-EXCLUDED node ids. A just-restarted baseline node
// that is process+transport-alive (both retention-grace conjuncts held) but was
// excluded by strict-mode upstream is therefore stripped from the published active
// set (-> published_active_nodes_disagree), and if it is the last baseline node the
// cohort collapses to [] / source=none (-> publication_missing_active_node).
//
// FLOOR invariant (refined / safe direction): a published-baseline node is
// re-admitted ONLY when the projection recorded reason
// `grace_conditions_met_but_excluded` (live but strict-excluded = the regression).
// A baseline node excluded because it is genuinely transport-dead
// (`no_runtime_transport_evidence`) or stale (`stale_lease_and_heartbeat`) must
// STAY dropped — keeping a dead node in the published set inflates the
// remove-safety denominator (the dangerous direction). An admission-BLOCKED node
// must always remain droppable.

test('cp-pub-01 FLOOR: a live-but-strict-excluded published baseline node stays in the cohort',
  async (t) => {
    const cohort = resolvePriorityRecoveryActiveNodeCohort({
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      projectionDiagnostics: {
        // node-5 just restarted: readiness-excluded, but both liveness conjuncts
        // held (process+transport alive, fresh lease) — strict-mode excluded it.
        readinessExcludedNodeIds: ['node-5'],
        retentionGraceMisses: [
          {nodeId: 'node-5', reason: 'grace_conditions_met_but_excluded'},
        ],
      },
    });
    t.ok(
      cohort.activeNodeIds.includes('node-5'),
      'live-but-strict-excluded baseline node-5 must remain in the active cohort (FLOOR)',
    );
    t.same(
      [...cohort.activeNodeIds].sort(),
      ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      'no live published baseline node is trimmed on strict readiness-exclusion alone',
    );
  });

test('cp-pub-01 FLOOR: cohort does not collapse to NONE when the last baseline node is live-but-strict-excluded',
  async (t) => {
    const cohort = resolvePriorityRecoveryActiveNodeCohort({
      publishedActiveNodeIds: ['node-5'],
      projectionDiagnostics: {
        readinessExcludedNodeIds: ['node-5'],
        retentionGraceMisses: [
          {nodeId: 'node-5', reason: 'grace_conditions_met_but_excluded'},
        ],
      },
    });
    t.same(
      [...cohort.activeNodeIds],
      ['node-5'],
      'last live-but-strict-excluded baseline node is retained, cohort does not collapse',
    );
    t.not(
      cohort.source,
      'none',
      'cohort source must not collapse to NONE on strict readiness-exclusion of the baseline',
    );
  });

test('cp-pub-01 SAFETY: a transport-dead readiness-excluded baseline node is NOT floored',
  async (t) => {
    const cohort = resolvePriorityRecoveryActiveNodeCohort({
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      projectionDiagnostics: {
        readinessExcludedNodeIds: ['node-5'],
        // node-5 has no runtime transport evidence -> genuinely gone. Keeping it
        // would inflate the remove-safety denominator (dangerous direction).
        retentionGraceMisses: [
          {nodeId: 'node-5', reason: 'no_runtime_transport_evidence'},
        ],
      },
    });
    t.notOk(
      cohort.activeNodeIds.includes('node-5'),
      'transport-dead baseline node-5 must NOT be resurrected by the floor',
    );
  });

test('cp-pub-01 SAFETY: a stale-lease readiness-excluded baseline node is NOT floored',
  async (t) => {
    const cohort = resolvePriorityRecoveryActiveNodeCohort({
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      projectionDiagnostics: {
        readinessExcludedNodeIds: ['node-5'],
        retentionGraceMisses: [
          {nodeId: 'node-5', reason: 'stale_lease_and_heartbeat'},
        ],
      },
    });
    t.notOk(
      cohort.activeNodeIds.includes('node-5'),
      'stale-lease baseline node-5 must NOT be resurrected by the floor',
    );
  });

test('cp-pub-01 FLOOR (negative): a genuinely admission-BLOCKED baseline node is still droppable even with a grace miss',
  async (t) => {
    const cohort = resolvePriorityRecoveryActiveNodeCohort({
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      participationByNodeId: {
        'node-5': {
          nodeId: 'node-5',
          admissionState: 'blocked',
        },
      },
      projectionDiagnostics: {
        // Even if a grace miss is recorded, an admission-blocked node is fenced.
        retentionGraceMisses: [
          {nodeId: 'node-5', reason: 'grace_conditions_met_but_excluded'},
        ],
      },
    });
    t.notOk(
      cohort.activeNodeIds.includes('node-5'),
      'admission-blocked / fenced baseline node-5 must NOT be kept by the floor',
    );
    t.same(
      [...cohort.activeNodeIds].sort(),
      ['node-1', 'node-2', 'node-3', 'node-4'],
      'only the fenced node is removed; the floor does not protect a blocked node',
    );
  });
