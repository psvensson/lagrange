import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE,
  CLUSTER_INCARNATION_FENCE_STATE,
  CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE,
  CLUSTER_INCARNATION_PEER_PROOF_STATE,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  MEMBERSHIP_EPOCH_VALUE_STATE,
} from '../../src/control-plane/membership-epoch-contract.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const THIS_REL_PATH = 'test/bootstrap/removed-formation-barrier-and-handoff-census.test.js';

const TREE_AGNOSTIC_REPRODUCER_FILES = new Set([
  THIS_REL_PATH,
  'test/convergence/dt-formation-joint-admission-release-liveness.test.js',
  'test/convergence/formation-joint-admission-rounds.js',
  'test/convergence/formation-joint-admission-scenario.js',
  'test/convergence/formation-joint-admission-world.js',
]);

const DELETED_PATH_PAIRS = Object.freeze([
  ['src/bootstrap', 'node-joining-operation-ledger-formation-readiness.js'],
  ['src/bootstrap', 'critical-placement-formation-observer.js'],
  ['src/control-plane', 'control-plane-readiness-formation-release-methods.js'],
  ['src/control-plane', 'formation-release-handoff-closure-owner.js'],
  ['src/control-plane', 'formation-release-handoff-contract.js'],
  ['src/control-plane', 'formation-release-handoff-evidence.js'],
  ['src/control-plane', 'formation-release-handoff-identity.js'],
  ['src/control-plane', 'formation-release-handoff-publication-coordinator.js'],
  ['src/control-plane', 'formation-release-handoff-publication.js'],
  ['src/control-plane', 'startup-authority-placement-eligibility.js'],
  ['scripts/checks', 'run-formation-release-handoff-gcp.js'],
  ['scripts/checks', 'run-formation-release-handoff-gcp-streak.js'],
  ['scripts/checks', 'formation-release-handoff-gcp-analysis.js'],
  ['scripts/checks', 'analyze-formation-release-phases.js'],
  ['scripts/quest-evidence', 'formation-spread-progress-at-cause.js'],
  ['docs/specs/decision-tables', 'formation-release-handoff-closure.json'],
  ['docs/specs/decision-tables', 'formation-cohort-spread-cure.json'],
  ['models', 'formation-release-handoff-closure'],
  ['models', 'formation-barrier-spread-cure-liveness'],
  ['test/control-plane', 'formation-release-handoff-closure.test.js'],
  ['test/control-plane', 'formation-release-handoff-consumer-parity.test.js'],
  ['test/control-plane', 'formation-release-handoff-interaction-registry.test.js'],
  ['test/control-plane', 'formation-release-handoff-post-reopen-capture.test.js'],
  ['test/control-plane', 'formation-release-handoff-witness-fixture.js'],
  ['test/scripts', 'analyze-formation-release-phases.test.js'],
  ['test/scripts', 'formation-release-handoff-gcp-analysis-retained-uncompleted-teardown.test.js'],
  ['test/scripts', 'formation-release-handoff-gcp-run-fixture.js'],
  ['test/scripts', 'run-formation-release-handoff-gcp-negative-control.test.js'],
  ['test/scripts', 'run-formation-release-handoff-gcp-reverted-control.test.js'],
  ['test/scripts', 'run-formation-release-handoff-gcp-streak.test.js'],
  ['test/scripts', 'run-formation-release-handoff-gcp.test.js'],
  ['test/bootstrap', 'node-joining-formation-barrier-waiting-liveness-log.test.js'],
  ['test/bootstrap', 'join-formation-discovery-window-budget.test.js'],
  ['test/bootstrap', 'formation-readiness-owner-single-form.test.js'],
  ['test/convergence', 'dt-formation-barrier-spread-release-oscillation.test.js'],
  ['test/rebalancer', 'formation-spread-progress-at-cause.test.js'],
]);

const DELETED_PATHS = Object.freeze(
  DELETED_PATH_PAIRS.map(([dir, base]) => `${dir}/${base}`),
);

const REMOVED_MECHANISM_TOKENS = Object.freeze([
  'OPERATION_LEDGER_FORMATION_BARRIER_STATE',
  'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
  'resolveOperationLedgerFormationBarrierState',
  'buildOperationLedgerFormationBarrierLogFields',
  'awaitOperationLedgerFormationBarrier',
  'publishOperationLedgerFormationLiveness',
  'PRIORITY_PLACEMENT_FORMATION_BARRIER',
  'priorityPlacementFormationDiscoveryMs',
  'priorityPlacementFormationPollMs',
  'priorityPlacementFormationTimeoutMs',
  'FORMATION_RELEASE_HANDOFF_STATE',
  'FormationReleaseHandoffClosureOwner',
  'FormationReleaseHandoffPublicationCoordinator',
  'attachFormationReleaseHandoffToStartupAuthority',
  'setFormationReleaseAuthorityNodeId',
  'getFormationReleaseStartupAuthoritySnapshot',
  'formation_release_handoff',
  'FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION',
  'classifyFormationCohortSpreadCureNode',
  'isStartupAuthorityControlPlanePlacementEligibleNode',
  'isFormationCohortSpreadCureTarget',
  'isStartupAuthorityPlacementDispatchReady',
  'getTopologyGuardStartupAuthorityPlacementEligibleNodeIds',
  'observeCriticalPlacement',
  'FormationBarrierSpreadCureLiveness',
  'FormationReleaseHandoffClosure',
  'Formation release handoff authority transition',
  'Formation release handoff publication deferred',
  'Join priority-placement formation barrier',
]);

const SCANNED_ROOTS = Object.freeze([
  'src',
  'scripts',
  'models',
  'docs/specs/decision-tables',
  'test',
]);

function isScannedSourceFile(relPath) {
  if (TREE_AGNOSTIC_REPRODUCER_FILES.has(relPath)) {
    return false;
  }
  if (relPath.startsWith('test/shards/')) {
    return relPath === 'test/shards/impact-contracts.json';
  }
  return (
    relPath.endsWith('.js') ||
    relPath.endsWith('.tla') ||
    relPath.endsWith('.cfg') ||
    relPath.endsWith('.md') ||
    relPath.startsWith('docs/specs/decision-tables/')
  );
}

function collectFiles(absDir, relPrefix, acc) {
  for (const entry of fs.readdirSync(absDir, {withFileTypes: true})) {
    const relPath = `${relPrefix}/${entry.name}`;
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absPath, relPath, acc);
    } else if (isScannedSourceFile(relPath)) {
      acc.push({relPath, absPath});
    }
  }
}

function findRemovedTokenHits() {
  const files = [];
  for (const root of SCANNED_ROOTS) {
    collectFiles(path.join(REPO_ROOT, root), root, files);
  }
  const hits = [];
  for (const {relPath, absPath} of files) {
    const content = fs.readFileSync(absPath, 'utf8');
    for (const token of REMOVED_MECHANISM_TOKENS) {
      if (content.includes(token)) {
        hits.push(`${relPath}: ${token}`);
      }
    }
  }
  return hits;
}

test('deleted formation barrier, handoff, and pre-READY placement files are absent', () => {
  const surviving = DELETED_PATHS.filter((relPath) =>
    fs.existsSync(path.join(REPO_ROOT, relPath)),
  );
  assert.deepEqual(surviving, []);
});

test('removed mechanism identifiers, tables, models, and log messages have zero census hits', () => {
  const hits = findRemovedTokenHits();
  assert.deepEqual(hits, []);
});

test('runtime prototypes expose no formation barrier, handoff, or pre-READY placement methods', () => {
  const absentPairs = [
    [NodeJoiningService.prototype, 'awaitOperationLedgerFormationBarrier'],
    [NodeJoiningService.prototype, 'publishOperationLedgerFormationLiveness'],
    [NodeJoiningReadySignalReadiness.prototype, 'awaitOperationLedgerFormationBarrier'],
    [ControlPlaneReadinessService.prototype, 'setFormationReleaseAuthorityNodeId'],
    [ControlPlaneReadinessService.prototype, 'getFormationReleaseStartupAuthoritySnapshot'],
    [ControlPlaneReadinessService.prototype, 'reconcileFormationReleaseHandoffPublication'],
    [UnifiedRebalancer.prototype, 'isStartupAuthorityControlPlanePlacementEligibleNode'],
    [UnifiedRebalancer.prototype, 'isFormationCohortSpreadCureTarget'],
    [UnifiedRebalancer.prototype, 'isStartupAuthorityPlacementDispatchReady'],
    [UnifiedRebalancer.prototype, 'isStartupAuthorityPlacementNodeReady'],
    [RebalanceCoordinator.prototype, 'getTopologyGuardStartupAuthorityPlacementEligibleNodeIds'],
  ];
  for (const [proto, methodName] of absentPairs) {
    assert.equal(
      methodName in proto,
      false,
      `${proto.constructor.name}.prototype.${methodName} must be deleted`,
    );
  }
  for (const stateDomain of [
    CLUSTER_INCARNATION_FENCE_STATE,
    CLUSTER_INCARNATION_LOCAL_IDENTITY_STATE,
    CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_STATE,
    CLUSTER_INCARNATION_PEER_PROOF_STATE,
    MEMBERSHIP_EPOCH_VALUE_STATE,
  ]) {
    assert.equal(Object.isFrozen(stateDomain), true);
  }
});

test('bootstrap-readiness-probes.md states the one meaning of /readyz and node READY leases', () => {
  const doc = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/bootstrap-readiness-probes.md'),
    'utf8',
  );
  assert.match(doc, /### `GET \/readyz`[\s\S]*cluster has formed voter quorums/u);
  assert.match(doc, /node's own membership READY lease\s+is published from local readiness/u);
});
