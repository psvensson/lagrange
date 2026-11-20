import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {VOTER_READY_CHECK_INTERVAL_MS} from '../../src/node/replica-handler-transition-policy.js';
import {
  LEDGER_PARTITION_ID,
  decidePlacementAdmission,
} from '../../src/partition/partition-placement-admission-decision.js';
import {createPartitionServiceRebalancerMethods} from '../../src/partition/partition-service-rebalancer-methods.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

function joinSegments(...segments) {
  return segments.join('');
}

const DELETED_RELATIVE_PATHS = Object.freeze([
  joinSegments('src/rebalancer/', 'continuation-wake', '-coordinator.js'),
  joinSegments('src/rebalancer/', 'system-spread', '-transition-policy.js'),
  joinSegments('src/rebalancer/', 'background-priority-spread', '-release-tracker.js'),
  joinSegments('test/rebalancer/', 'rebalancer-distinct-spread-and', '-continuation-wake.test.js'),
  joinSegments('test/partition/', 'partition-service-traffic-ready', '-rebalancer-wake.test.js'),
]);

const REMOVED_IDENTIFIERS = Object.freeze([
  joinSegments('continuation-wake', '-coordinator'),
  joinSegments('system-spread', '-transition-policy'),
  joinSegments('background-priority-spread', '-release-tracker'),
  'TRAFFIC_READY_STAGGER_',
  'SLOT_WAKE_STAGGER_',
  'MAX_SLOT_RELEASE_HANDOFF_HOPS',
  'maybeWakeRebalancerOnTrafficReady',
  'isPartitionTrafficReady',
  'isPartitionBelowDeclaredDistinctHostSpread',
  'syncOperationContinuationWake',
  'armOperationContinuationWake',
  'disarmOperationContinuationWake',
  'completeSlotReleaseContinuationCycle',
  'handOffUnusedContinuationSlotWake',
  'resolveContinuationSafetyDelayMs',
  'buildPhaseBGlobalSystemTransitionNodeSet',
  'evaluateSystemPartitionTargetNodeSlotAdmission',
  'doesWorkflowStepOccupySystemTargetNodeSlot',
  'doesOperationOccupySystemTargetNodeSlot',
  'doesOperationTransitionReleaseSystemTargetNodeSlot',
  'WAIT_CONTROL_PLANE_PRIORITY_STABILITY',
  'PRIORITY_SPREAD_RELEASE_WAKE',
  'phase-b-system-spread-policy-admission',
  'readiness-lifecycle-traffic-ready-rebalancer-wake',
]);

const SCANNED_EXTENSIONS = new Set(['.js', '.json', '.md']);

function collectScannedFiles(dirPath, results = []) {
  const entries = fs.readdirSync(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectScannedFiles(fullPath, results);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (path.resolve(fullPath) === path.resolve(THIS_FILE)) {
      continue;
    }
    if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

test('WP-G census: deleted workaround modules and obsolete tests do not exist', (t) => {
  for (const relPath of DELETED_RELATIVE_PATHS) {
    const absPath = path.join(REPO_ROOT, relPath);
    t.equal(
      fs.existsSync(absPath),
      false,
      `${relPath} must be deleted rather than disabled`,
    );
  }
  t.end();
});

test('WP-G census: zero occurrences of removed mechanisms across src/ and test/', (t) => {
  const files = [
    ...collectScannedFiles(path.join(REPO_ROOT, 'src')),
    ...collectScannedFiles(path.join(REPO_ROOT, 'test')),
  ];
  const hitsByIdentifier = new Map(
    REMOVED_IDENTIFIERS.map((token) => [token, []]),
  );

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(REPO_ROOT, filePath);
    for (const token of REMOVED_IDENTIFIERS) {
      if (content.includes(token)) {
        hitsByIdentifier.get(token).push(relPath);
      }
    }
  }

  for (const [token, matchingFiles] of hitsByIdentifier.entries()) {
    t.same(
      matchingFiles,
      [],
      `removed mechanism token "${token}" must have zero occurrences in src/ and test/`,
    );
  }
  t.end();
});

test('WP-G census: VOTER_READY_CHECK_INTERVAL_MS is restored to 250ms', (t) => {
  t.equal(
    VOTER_READY_CHECK_INTERVAL_MS,
    250,
    'VOTER_READY_CHECK_INTERVAL_MS must be restored from 50ms workaround to 250ms',
  );
  t.end();
});

test('WP-G census: single placement admission path and per-partition UnifiedRebalancer suppression', (t) => {
  t.equal(
    typeof decidePlacementAdmission,
    'function',
    'decidePlacementAdmission is the single conditional ledger insert decision owner',
  );
  t.equal(
    LEDGER_PARTITION_ID,
    'replica_operations-p1',
    'placement admission is anchored on the replica_operations-p1 ledger partition',
  );

  const rebalancerMethods = createPartitionServiceRebalancerMethods();
  let attachedToLedger = 0;
  let initializeRebalancerCalls = 0;
  const ledgerService = {
    ...rebalancerMethods,
    partitionId: LEDGER_PARTITION_ID,
    isShutdown: false,
    isLeader: true,
    replicaPlacementOwnerAttachment: null,
    rebalancerLeadershipSink: null,
    rebalancer: null,
    systemTableCache: {},
    cdcIntegrationService: {},
    tablePolicyService: {},
    messageRouter: {},
    sqlQueryEngine: {},
    rebalanceCoordinator: {
      placementAdmissionEnabled: true,
      attachLedgerReplicaPlacementOwner(service) {
        attachedToLedger += 1;
        return {service};
      },
    },
    isBackgroundWorkReady: () => true,
    driveRebalancerLeadershipSink: () => {},
    initializeRebalancer() {
      initializeRebalancerCalls += 1;
    },
  };

  ledgerService.maybeInitializeRebalancer();
  t.equal(
    attachedToLedger,
    1,
    'replica_operations-p1 attaches the single ReplicaPlacementOwner',
  );
  t.equal(
    initializeRebalancerCalls,
    0,
    'per-partition UnifiedRebalancer is never initialized when placementAdmissionEnabled is true',
  );
  t.equal(
    ledgerService.rebalancer,
    null,
    'no per-partition UnifiedRebalancer instance is created under placementAdmissionEnabled',
  );
  t.end();
});
