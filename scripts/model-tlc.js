#!/usr/bin/env node

// Phase B runner. Drives TLC over the ActiveGate TLA+ spec in both
// configurations and emits *.model.report.json evidence artifacts alongside
// the fast-check reports, so the Phase C summarizer treats both checkers
// uniformly.
//
// Inverted expectations:
//   route config -> EventuallyConverged must HOLD  (TLC exit 0).
//   stall config -> EventuallyConverged must FAIL  (TLC reports the
//                   oscillation as a liveness counterexample, exit != 0).
// The script exits 0 only when both expectations are met. TLC is fetched on
// demand if tools/tla2tools.jar is absent (override with TLA_TOOLS_JAR).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import https from 'node:https';

const JAR_PATH = process.env.TLA_TOOLS_JAR ||
  path.resolve('tools', 'tla2tools.jar');
const JAR_URL =
  'https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar';
const REPORTS_DIR = path.resolve('test-output', 'reports');
const META_ROOT = path.resolve('test-output', 'tlc');
const CONTRACT_EVIDENCE_DIR =
  path.resolve('architecture', 'contracts', 'evidence');

const CONFIGS = [
  {
    id: 'active-gate-route',
    mode: 'route',
    module: path.resolve('models', 'active-gate', 'ActiveGate.tla'),
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_route.cfg'),
    expectConverged: true,
    report: 'active-gate-tlc-route.model.report.json',
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
  },
  {
    id: 'active-gate-stall',
    mode: 'stall',
    module: path.resolve('models', 'active-gate', 'ActiveGate.tla'),
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_stall.cfg'),
    expectConverged: false,
    report: 'active-gate-tlc-stall.model.report.json',
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
    expectedFailurePattern: 'Temporal property EventuallyConverged was violated',
  },
  {
    id: 'readiness-handoff-route',
    mode: 'readiness-route',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_route.cfg'),
    expectConverged: true,
    report: 'readiness-handoff-tlc-route.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
  },
  {
    id: 'readiness-handoff-unsafe',
    mode: 'readiness-unsafe',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_unsafe.cfg'),
    expectConverged: false,
    report: 'readiness-handoff-tlc-unsafe.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
    expectedFailurePattern:
      'Invariant ReadyRequiresCanonicalServiceability is violated',
  },
  {
    id: 'readiness-handoff-lost-wake',
    mode: 'readiness-lost-wake',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_lost_wake.cfg'),
    expectConverged: false,
    report: 'readiness-handoff-tlc-lost-wake.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
    expectedFailurePattern:
      'Invariant DeferredOutcomeHasRecoverableWake is violated',
  },
  {
    id: 'coupled-admission-reconciled',
    mode: 'coupled-reconciled',
    module: path.resolve('models', 'readiness-starvation', 'CoupledAdmission.tla'),
    cfg: path.resolve('models', 'readiness-starvation', 'CoupledAdmission_fixed.cfg'),
    expectConverged: true,
    report: 'coupled-admission-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-coupled-admission-oscillation',
    owner: 'priority_recovery_admission_owner',
    boundary: 'coupled_invariant_admission',
  },
  {
    id: 'coupled-admission-oscillation',
    mode: 'coupled-oscillation',
    module: path.resolve('models', 'readiness-starvation', 'CoupledAdmission.tla'),
    cfg: path.resolve('models', 'readiness-starvation', 'CoupledAdmission_bug.cfg'),
    expectConverged: false,
    report: 'coupled-admission-tlc-oscillation.model.report.json',
    scenario: 'rolling-restart-coupled-admission-oscillation',
    owner: 'priority_recovery_admission_owner',
    boundary: 'coupled_invariant_admission',
    expectedFailurePattern: 'Temporal property EventuallySteady was violated',
  },
  {
    id: 'publication-convergence-reconciled',
    mode: 'publication-convergence-reconciled',
    module: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence.tla',
    ),
    cfg: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence_fixed.cfg',
    ),
    expectConverged: true,
    report: 'publication-convergence-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-publication-convergence',
    owner: 'membership_publication_owner',
    boundary: 'publication_convergence',
  },
  {
    id: 'publication-convergence-lost-wake',
    mode: 'publication-convergence-lost-wake',
    module: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence.tla',
    ),
    cfg: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence_bug.cfg',
    ),
    expectConverged: false,
    report: 'publication-convergence-tlc-lost-wake.model.report.json',
    scenario: 'rolling-restart-publication-convergence',
    owner: 'membership_publication_owner',
    boundary: 'publication_convergence',
    expectedFailurePattern: 'Temporal property EventuallySteady was violated',
  },
  {
    id: 'priority-spread-coverage-count-aware',
    mode: 'priority-spread-coverage-count-aware',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_fixed.cfg',
    ),
    expectConverged: true,
    report: 'priority-spread-coverage-tlc-count-aware.model.report.json',
    scenario: 'movielens-priority-spread-gap-coverage-authority-model',
    owner: 'priority_recovery_publication_closure_owner',
    boundary: 'numeric_spread_gap_operation_coverage',
  },
  {
    id: 'priority-spread-coverage-boolean-collapse',
    mode: 'priority-spread-coverage-boolean-collapse',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_bug.cfg',
    ),
    expectConverged: false,
    report: 'priority-spread-coverage-tlc-boolean-collapse.model.report.json',
    scenario: 'movielens-priority-spread-gap-coverage-counterexample',
    owner: 'priority_recovery_publication_closure_owner',
    boundary: 'numeric_spread_gap_operation_coverage',
    expectedFailurePattern:
      'Invariant PublicationRequiresCoveredSpread is violated',
  },
  {
    id: 'priority-spread-schema-admission-bypass',
    mode: 'priority-spread-schema-admission-bypass',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_schema_bypass.cfg',
    ),
    expectConverged: false,
    report: 'priority-spread-schema-admission-bypass.model.report.json',
    scenario: 'movielens-pre-schema-priority-spread-admission-counterexample',
    owner: 'movielens_pre_schema_admission_owner',
    boundary: 'published_priority_spread_summary_admission',
    expectedFailurePattern:
      'Invariant SchemaAdmissionRequiresCoveredSpread is violated',
  },
  {
    id: 'leadership-failback-reconciled',
    mode: 'leadership-failback-reconciled',
    module: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback.tla',
    ),
    cfg: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback_fixed.cfg',
    ),
    expectConverged: true,
    report: 'leadership-failback-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-leadership-failback',
    owner: 'membership_publication_owner',
    boundary: 'publication_write_leadership',
  },
  {
    id: 'leadership-failback-stranded',
    mode: 'leadership-failback-stranded',
    module: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback.tla',
    ),
    cfg: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback_bug.cfg',
    ),
    expectConverged: false,
    report: 'leadership-failback-tlc-stranded.model.report.json',
    scenario: 'rolling-restart-leadership-failback',
    owner: 'membership_publication_owner',
    boundary: 'publication_write_leadership',
    expectedFailurePattern: 'Temporal property EventuallyClosed was violated',
  },
  {
    id: 'ledger-selfmove-remint-idempotent',
    mode: 'ledger-selfmove-remint-idempotent',
    module: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint.tla',
    ),
    cfg: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint_fixed.cfg',
    ),
    expectConverged: true,
    report: 'ledger-selfmove-remint-tlc-idempotent.model.report.json',
    scenario: 'formation-ledger-self-move-blocks-cluster-ops',
    owner: 'rebalance_coordinator',
    boundary: 'ledger_self_move_serialization',
  },
  {
    id: 'ledger-selfmove-remint-flap',
    mode: 'ledger-selfmove-remint-flap',
    module: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint.tla',
    ),
    cfg: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint_bug.cfg',
    ),
    expectConverged: false,
    report: 'ledger-selfmove-remint-tlc-flap.model.report.json',
    scenario: 'formation-ledger-self-move-blocks-cluster-ops',
    owner: 'rebalance_coordinator',
    boundary: 'ledger_self_move_serialization',
    expectedFailurePattern: 'Temporal property EventuallySettled was violated',
  },
  {
    id: 'incremental-replace-spread-nonregression',
    mode: 'incremental-replace-spread-nonregression',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_fixed.cfg',
    ),
    expectConverged: true,
    report:
      'incremental-replace-spread-nonregression.model.report.json',
    scenario: 'movielens-incremental-replace-spread-nonregression-model',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
  },
  {
    id: 'incremental-replace-spread-final-target-deadlock',
    mode: 'incremental-replace-spread-final-target-deadlock',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_final_target_bug.cfg',
    ),
    expectConverged: false,
    report:
      'incremental-replace-spread-final-target-deadlock.model.report.json',
    scenario: 'movielens-incremental-replace-spread-final-target-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
    expectedFailurePattern:
      'Invariant OpenGapRetainsSerializedProgressOwner is violated',
  },
  {
    id: 'incremental-replace-spread-regression',
    mode: 'incremental-replace-spread-regression',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_regression_bug.cfg',
    ),
    expectConverged: false,
    report: 'incremental-replace-spread-regression.model.report.json',
    scenario: 'movielens-incremental-replace-spread-regression-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
    expectedFailurePattern: 'Invariant SpreadNeverRegresses is violated',
  },
  {
    id: 'local-leader-row-visibility-fixed',
    mode: 'local-leader-row-visibility-fixed',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_fixed.cfg',
    ),
    expectConverged: true,
    report: 'local-leader-row-visibility-fixed.model.report.json',
    scenario: 'movielens-local-leader-row-visibility-model',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
  },
  {
    id: 'local-leader-row-visibility-missing-seed',
    mode: 'local-leader-row-visibility-missing-seed',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_missing_seed_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-missing-seed.model.report.json',
    scenario: 'movielens-local-leader-row-visibility-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
    expectedFailurePattern:
      'Invariant LocalLeaderHasImmediateEvidence is violated',
  },
  {
    id: 'local-leader-row-visibility-stale-publish',
    mode: 'local-leader-row-visibility-stale-publish',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_stale_publish_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-stale-publish.model.report.json',
    scenario: 'movielens-local-leader-row-stale-publish-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
    expectedFailurePattern:
      'Invariant DemotedLeaderCannotAuthorizeRemoval is violated',
  },
  {
    id: 'local-leader-row-visibility-timestamp-bump',
    mode: 'local-leader-row-visibility-timestamp-bump',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_timestamp_bump_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-timestamp-bump.model.report.json',
    scenario: 'movielens-local-leader-row-timestamp-bump-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_projection_successor_lww_composition',
    expectedFailurePattern:
      'Invariant SuccessorPublicationWins is violated',
  },
  {
    id: 'local-leader-row-visibility-demoted-replay',
    mode: 'local-leader-row-visibility-demoted-replay',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_demoted_replay_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-demoted-replay.model.report.json',
    scenario: 'movielens-local-leader-row-demoted-replay-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'demotion_durable_self_replay_composition',
    expectedFailurePattern:
      'Invariant DemotedLeaderCannotAuthorizeRemoval is violated',
  },
  {
    id: 'exact-election-evidence-same-turn-fixed',
    mode: 'exact-election-evidence-same-turn-fixed',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_fixed.cfg',
    ),
    expectConverged: true,
    report: 'exact-election-evidence-same-turn-fixed.model.report.json',
    scenario: 'movielens-exact-election-evidence-same-turn-model',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'election_evidence_continuation_remove_safety_composition',
  },
  {
    id: 'exact-election-evidence-delayed-continuation',
    mode: 'exact-election-evidence-delayed-continuation',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_delayed_continuation_bug.cfg',
    ),
    expectConverged: false,
    report:
      'exact-election-evidence-delayed-continuation.model.report.json',
    scenario: 'movielens-exact-election-evidence-retarget-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'election_evidence_continuation_retry_expiry_composition',
    expectedFailurePattern:
      'Invariant ExactCompletedEvidenceCannotBeRetargeted is violated',
  },
  {
    id: 'exact-election-evidence-continuation-authority',
    mode: 'exact-election-evidence-continuation-authority',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_continuation_authority_bug.cfg',
    ),
    expectConverged: false,
    report:
      'exact-election-evidence-continuation-authority.model.report.json',
    scenario: 'movielens-exact-election-evidence-owner-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'continuation_remove_authorization_interlock_composition',
    expectedFailurePattern:
      'Invariant ContinuationCannotAuthorizeRemoval is violated',
  },
  {
    id: 'operation-ledger-terminal-hold-fixed',
    mode: 'operation-ledger-terminal-hold-fixed',
    module: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold_fixed.cfg',
    ),
    expectConverged: true,
    report: 'operation-ledger-terminal-hold-fixed.model.report.json',
    scenario: 'movielens-operation-ledger-terminal-hold-model',
    owner: 'operation_workflow_lifecycle_owner',
    boundary: 'ledger_self_move_hold_admission_snapshot_composition',
  },
  {
    id: 'operation-ledger-terminal-hold-timeout-release',
    mode: 'operation-ledger-terminal-hold-timeout-release',
    module: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold_timeout_release_bug.cfg',
    ),
    expectConverged: false,
    report:
      'operation-ledger-terminal-hold-timeout-release.model.report.json',
    scenario: 'movielens-operation-ledger-timeout-release-counterexample',
    owner: 'operation_workflow_lifecycle_owner',
    boundary: 'durable_timeout_serialization_release_composition',
    expectedFailurePattern:
      'Invariant SerializationHoldReleaseRequiresAuthoritativeTerminal is violated',
  },
  {
    id: 'authoritative-observation-watermark-fixed',
    mode: 'authoritative-observation-watermark-fixed',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_fixed.cfg',
    ),
    expectConverged: true,
    report: 'authoritative-observation-watermark-fixed.model.report.json',
    scenario: 'movielens-authoritative-observation-watermark-model',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'authoritative_observation_cache_freshness_admission_composition',
  },
  {
    id: 'authoritative-observation-watermark-mutation-only',
    mode: 'authoritative-observation-watermark-mutation-only',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_mutation_only_bug.cfg',
    ),
    expectConverged: false,
    report:
      'authoritative-observation-watermark-mutation-only.model.report.json',
    scenario: 'movielens-mutation-only-freshness-counterexample',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'mutation_watermark_snapshot_admission_composition',
    expectedFailurePattern:
      'Temporal property EventuallySchemaAdmitted was violated',
  },
  {
    id: 'local-leader-tenure-claim-tenure-bound',
    mode: 'local-leader-tenure-claim-tenure-bound',
    module: path.resolve(
      'models', 'local-leader-tenure-claim', 'LocalLeaderTenureClaim.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-tenure-claim',
      'LocalLeaderTenureClaim_tenure_bound.cfg',
    ),
    expectConverged: true,
    report: 'local-leader-tenure-claim-tenure-bound.model.report.json',
    scenario: 'local-leadership-tenure-bound-safety-evidence-model',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_leader_claim_safety_read_merge_composition',
  },
  {
    id: 'local-leader-tenure-claim-content-based',
    mode: 'local-leader-tenure-claim-content-based',
    module: path.resolve(
      'models', 'local-leader-tenure-claim', 'LocalLeaderTenureClaim.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-tenure-claim',
      'LocalLeaderTenureClaim_content_based_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-tenure-claim-content-based.model.report.json',
    scenario: 'local-leadership-content-based-fossil-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_leader_claim_safety_read_merge_composition',
    expectedFailurePattern:
      'Invariant MergeNeverTrustsDeadTenure is violated',
  },
  {
    id: 'authoritative-observation-watermark-exact-equality',
    mode: 'authoritative-observation-watermark-exact-equality',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_exact_equality_bug.cfg',
    ),
    expectConverged: false,
    report:
      'authoritative-observation-watermark-exact-equality.model.report.json',
    scenario: 'movielens-exact-equality-reconcile-counterexample',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'authoritative_observation_cache_freshness_admission_composition',
    expectedFailurePattern:
      'Temporal property EventuallySchemaAdmitted was violated',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (target, redirects) => {
      if (redirects > 5) {
        reject(new Error('too many redirects fetching tla2tools.jar'));
        return;
      }
      https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`unexpected status ${res.statusCode} fetching jar`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url, 0);
  });
}

async function ensureJar() {
  if (fs.existsSync(JAR_PATH)) return;
  fs.mkdirSync(path.dirname(JAR_PATH), {recursive: true});
  process.stderr.write(`Fetching tla2tools.jar -> ${JAR_PATH}\n`);
  await download(JAR_URL, JAR_PATH);
}

function runTlc(config) {
  const metadir = path.join(META_ROOT, config.id || config.mode);
  fs.mkdirSync(metadir, {recursive: true});
  const result = spawnSync('java', [
    '-cp', JAR_PATH,
    'tlc2.TLC',
    '-deadlock',
    '-metadir', metadir,
    '-config', config.cfg,
    config.module,
  ], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {exitCode: result.status, output};
}

function cleanTraceArtifacts(modulePath) {
  const dir = path.dirname(modulePath);
  for (const entry of fs.readdirSync(dir)) {
    if (/_TTrace_.*\.(tla|bin)$/.test(entry)) {
      fs.rmSync(path.join(dir, entry), {force: true});
    }
  }
}

function interpret(config, run) {
  const noError = /No error has been found/.test(run.output);
  const temporalViolated =
    /Temporal propert(?:y|ies)\b[\s\S]*violated/iu.test(run.output);
  const expectedFailureObserved = !config.expectConverged &&
    typeof config.expectedFailurePattern === 'string' &&
    run.output.includes(config.expectedFailurePattern);
  const converged = noError && !temporalViolated;
  const livenessHolds = converged;
  const expectationMet = config.expectConverged ?
    converged :
    !converged && expectedFailureObserved;
  return {
    converged,
    expectedFailureObserved,
    temporalViolated,
    livenessHolds,
    expectationMet,
  };
}

function buildTlcReport(config, run, verdict) {
  const tail = run.output.trim().split('\n').slice(-12).join('\n');
  return {
    schemaVersion: 'active-gate-model-report-v1',
    modelReport: true,
    source: 'tlc',
    mode: config.mode,
    scenario: config.scenario,
    owner: config.owner,
    boundary: config.boundary,
    module: path.relative(process.cwd(), config.module),
    config: path.relative(process.cwd(), config.cfg),
    converged: verdict.converged,
    residual: verdict.converged ? 0 : 1,
    frontierCount: verdict.converged ? 0 : 1,
    livenessHolds: verdict.livenessHolds,
    expectConverged: config.expectConverged,
    expectedFailurePattern: config.expectedFailurePattern || null,
    expectedFailureObserved: verdict.expectedFailureObserved,
    expectationMet: verdict.expectationMet,
    temporalViolated: verdict.temporalViolated,
    exitCode: run.exitCode,
    outputTail: tail,
  };
}

async function main() {
  await ensureJar();
  fs.mkdirSync(REPORTS_DIR, {recursive: true});

  let allMet = true;
  for (const config of CONFIGS) {
    const run = runTlc(config);
    cleanTraceArtifacts(config.module);
    const verdict = interpret(config, run);
    const report = buildTlcReport(config, run, verdict);
    const target = path.join(REPORTS_DIR, config.report);
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    // Contract records cite versioned evidence copies (system-contract
    // validation requires them in fresh checkouts); refresh any that exist
    // so a re-run can never leave stale evidence behind.
    const evidenceTarget = path.join(CONTRACT_EVIDENCE_DIR, config.report);
    if (fs.existsSync(evidenceTarget)) {
      fs.writeFileSync(evidenceTarget, `${JSON.stringify(report, null, 2)}\n`);
    }
    const rel = path.relative(process.cwd(), target);
    console.log(
      `  ${config.mode}: converged=${verdict.converged} ` +
      `expect=${config.expectConverged} met=${verdict.expectationMet} -> ${rel}`,
    );
    if (!verdict.expectationMet) allMet = false;
  }

  if (!allMet) {
    console.error('TLC expectations not met.');
    process.exit(1);
  }
  console.log('TLC confirms expected route and forbidden-shape outcomes.');
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
