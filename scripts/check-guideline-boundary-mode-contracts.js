import path from 'node:path';
import process from 'node:process';
import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
} from './guideline-check-shared.js';

const LOCAL_STR_SLASH = '/';
const LOCAL_STR_HOTSPOT_BOUNDARY_STILL_CONTAINS_LEGACY_S = 'hotspot boundary still contains legacy semantic mode fragment ';
const LOCAL_STR_BOUNDARY_MODE_CONTRACT_HOTSPOT = 'boundary-mode-contract hotspot';

const RULE_REFERENCE =
  'system guidelines.md §0.2.1 Shared Contract Shape And Boundary-Impedance Discipline';

const VIOLATION_KIND = 'legacy_boundary_mode_fragment';

const BOUNDARY_MODE_HOTSPOT_CONTRACTS = Object.freeze({
  'src/config/config-key-constants.js': Object.freeze([
    'query.leaderRetryAttempts',
  ]),
  'src/query/distributed/distributed-write-coordinator.js': Object.freeze([
    'WRITE_COORDINATOR_DEFAULT',
    'this.maxRetries',
    'executePartitionStatementOnce',
  ]),
  'src/query/query-executor-write-retry-routing.js': Object.freeze([
    'options?.readPurpose',
  ]),
  'src/control-plane/control-plane-system-table-gateway-read-contracts.js':
    Object.freeze([
      'options?.ownerReadMode',
      'options?.readPurpose',
      'options?.preferOwnerRpcRead',
      'options?.requireOwnerRpcRead',
      'options?.allowSqlFallback',
      'options?.confirmEmptyLocalReadWithOwnerRpc',
      'options?.readAuthority',
      'options?.profile',
      'options?.readStrategy',
      'options?.requireAuthoritative',
    ]),
  'src/bootstrap/node-joining-operation-ledger-formation-readiness.js':
    Object.freeze([
      'completeFormationPlacementByPartition',
      'getEntityAuthoritativeOperationObservation',
      'getOperationLedgerFormationDrainObservation',
      'getOperationLedgerFormationPlacementObservation',
      'getOperationLedgerQuorumObservation',
      'isLedgerQuorumConcentratedPartition',
      'readReadinessOwnerRows',
    ]),
  'src/bootstrap/bootstrap-service-runtime-methods.js': Object.freeze([
    'registerBootstrapReadyHandler',
    'upsertNodeConnectionState',
  ]),
  'src/bootstrap/node-joining-message-group-runtime-delegation.js':
    Object.freeze([
      'startDeferredJoinMessageGroupElections',
    ]),
  'src/admin/admin-control-snapshot-local-build-base.js': Object.freeze([
    'authoritativeNodeIds',
    'effectiveNodeIds',
    'projectedNodeIds',
    'publishedNodeIds',
  ]),
  'src/control-plane/heartbeat-service-lifecycle-methods.js': Object.freeze([
    'await this.runScheduledMembershipPublicationReconcileTick',
  ]),
  'src/control-plane/replica-dispatch-replay-readiness.js': Object.freeze([
    'getPendingReplicaOpsForNode',
  ]),
  'src/control-plane/authoritative-control-plane-view.js': Object.freeze([
    'shouldRetryAuthoritativeReadWithoutOwnerRpc',
    'allowOwnerRpcFallback:',
    'preferOwnerRpcRead:',
    'requireOwnerRpcRead:',
    'confirmEmptyLocalReadWithOwnerRpc:',
    'resolveReadProfileOptions',
    'resolvedOptions?.routingReadinessDimension',
  ]),
  'src/cdc/cdc-integration-service-authoritative-read-flow.js': Object.freeze([
    'options?.authoritativeReadMode',
    'options?.ownerReadMode',
    'options?.preferOwnerRpcRead',
    'options?.requireOwnerRpcRead',
    'options?.allowOwnerRpcFallback',
    'options?.allowSqlFallback',
    'options?.confirmEmptyLocalReadWithOwnerRpc',
  ]),
  'src/cdc/cdc-integration-service-owner-rpc-read-execution.js': Object.freeze([
    'options?.allowSqlFallback',
    'options?.requireOwnerRpcRead',
  ]),
  'src/control-plane/publication-active-gate-handoff-contract-evidence.js':
    Object.freeze([
      'activeNodeViews',
    ]),
  'src/control-plane/publication-active-gate-handoff-contract-fence.js':
    Object.freeze([
      'activeNodeViews',
      'snapshotCoverageNodeIds',
      'snapshotCoverageRevision',
      'snapshotRevisionState',
    ]),
  'src/rebalancer/rebalance-coordinator.js': Object.freeze([
    'skipSqlFallbackWhenCacheEmpty',
    'preferAuthoritativeCount',
  ]),
  'src/rebalancer/unified-rebalancer.js': Object.freeze([
    'preferAuthoritativeCount',
  ]),
  'src/control-plane/control-plane-readiness-service.js': Object.freeze([
    'preferAuthoritativeRead',
  ]),
  'test/rebalancer/rebalance-coordinator-facade-compatibility.test.js':
    Object.freeze([
      'preferAuthoritativeRead',
    ]),
  'test/rebalancer/unified-rebalancer.test.js': Object.freeze([
    'preferAuthoritativeRead',
    'preferAuthoritativeCount',
  ]),
  'test/control-plane/control-plane-readiness-service.test.js': Object.freeze([
    'preferAuthoritativeRead',
  ]),
});

const BOUNDARY_MODE_PREFIX_CONTRACTS = Object.freeze({
  'src/query/': Object.freeze([
    'class QueryRouter',
    'getWriteRetryAttemptLimit',
    'leaderRetryAttempts',
    'maxRecoveryAttempts',
    'readPurpose:',
    'REQUIRE_CANONICAL_LEADER',
    'preferOwnerRpcReadLeader',
    'requireOwnerRpcReadLeader',
  ]),
  'src/rebalancer/': Object.freeze([
    'incompleteOperationReadMode',
    'preferAuthoritativeRead',
    'requireOwnerRpcRead:',
    'skipSqlFallbackWhenCacheEmpty',
    'preferOwnerRpcReadLeader',
    'requireOwnerRpcReadLeader',
  ]),
  'src/cdc/': Object.freeze([
    'preferOwnerRpcReadLeader',
    'requireOwnerRpcReadLeader',
  ]),
  'src/control-plane/': Object.freeze([
    'preferAuthoritativeRead',
    'requireAuthoritative:',
    'preferOwnerRpcReadLeader',
    'requireOwnerRpcReadLeader',
  ]),
  'src/admin/': Object.freeze([
    'preferAuthoritativeRead',
    'requireAuthoritative:',
  ]),
});

function normalizePath(filePath) {
  return filePath.split(path.sep).join(LOCAL_STR_SLASH);
}

function resolveBoundaryModeContract(filePath) {
  const normalizedPath = normalizePath(filePath);
  const exactContract = BOUNDARY_MODE_HOTSPOT_CONTRACTS[normalizedPath] || [];
  const prefixContract = Object.entries(BOUNDARY_MODE_PREFIX_CONTRACTS)
    .filter(([prefix]) => normalizedPath.startsWith(prefix))
    .flatMap(([, fragments]) => fragments);
  const combinedContract = [...exactContract, ...prefixContract];
  return combinedContract.length > 0 ? combinedContract : null;
}

function collectBoundaryModeContractViolationsFromSource(source, filePath) {
  const bannedFragments = resolveBoundaryModeContract(filePath);
  if (!bannedFragments) {
    return [];
  }
  return bannedFragments
    .filter((fragment) => String(source || '').includes(fragment))
    .map((fragment) => ({
      filePath,
      line: 1,
      column: 1,
      kind: VIOLATION_KIND,
      target: fragment,
      reason:
        LOCAL_STR_HOTSPOT_BOUNDARY_STILL_CONTAINS_LEGACY_S +
        `"${fragment}" instead of the named mode contract`,
      ruleReference: RULE_REFERENCE,
    }));
}

async function buildBoundaryModeContractViolationReport(pathsToScan) {
  const defaultPaths = [
    ...Object.keys(BOUNDARY_MODE_HOTSPOT_CONTRACTS),
    ...Object.keys(BOUNDARY_MODE_PREFIX_CONTRACTS),
  ];
  const selectedPaths = Array.isArray(pathsToScan) && pathsToScan.length > 0 ?
    pathsToScan :
    defaultPaths;
  return buildGuidelineViolationReport(
    selectedPaths,
    {includeTests: true},
    collectBoundaryModeContractViolationsFromSource,
  );
}

function formatBoundaryModeContractHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    LOCAL_STR_BOUNDARY_MODE_CONTRACT_HOTSPOT,
  );
}

async function main(argv = process.argv.slice(2)) {
  return runGuidelineCheck(
    argv,
    buildBoundaryModeContractViolationReport,
    formatBoundaryModeContractHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  BOUNDARY_MODE_HOTSPOT_CONTRACTS,
  buildBoundaryModeContractViolationReport,
  collectBoundaryModeContractViolationsFromSource,
};
