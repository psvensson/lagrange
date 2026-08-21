import {test} from '../../src/test-helpers/tap.js';
import {
  BOUNDARY_MODE_HOTSPOT_CONTRACTS,
  collectBoundaryModeContractViolationsFromSource,
} from '../../scripts/check-guideline-boundary-mode-contracts.js';

const REBALANCE_COORDINATOR_FILE_PATH =
  'src/rebalancer/rebalance-coordinator.js';
const HEARTBEAT_LIFECYCLE_FILE_PATH =
  'src/control-plane/heartbeat-service-lifecycle-methods.js';
const FORMATION_BARRIER_FILE_PATH =
  'src/bootstrap/node-joining-operation-ledger-formation-readiness.js';
const QUERY_ROUTER_FILE_PATH = 'src/query/query-router.js';
const DISTRIBUTED_WRITE_COORDINATOR_FILE_PATH =
  'src/query/distributed/distributed-write-coordinator.js';
const BOOTSTRAP_RUNTIME_FILE_PATH =
  'src/bootstrap/bootstrap-service-runtime-methods.js';
const OWNER_RPC_READ_EXECUTION_FILE_PATH =
  'src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
const READ_AUTHORITY_CONTRACT_FILE_PATH =
  'src/control-plane/control-plane-system-table-gateway-read-contracts.js';
const NON_HOTSPOT_FILE_PATH = 'src/runtime/plain-helper.js';

test('detects legacy semantic mode fragments in hotspot files', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function queryIncompleteOperations(options = {}) {',
      '  if (options.preferAuthoritativeRead === true) {',
      '    return [];',
      '  }',
      '}',
    ].join('\n'),
    REBALANCE_COORDINATOR_FILE_PATH,
  );

  t.equal(violations.length, 1);
  t.equal(
    violations[0].target,
    'preferAuthoritativeRead',
  );
});

test('accepts hotspot files that use only named mode vocabulary', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function queryIncompleteOperations(options = {}) {',
      '  return {',
      '    visibilityReadMode: options.visibilityReadMode,',
      '    concurrentBudgetReadMode: options.concurrentBudgetReadMode,',
      '  };',
      '}',
    ].join('\n'),
    REBALANCE_COORDINATOR_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('rejects coupling membership reconcile back into heartbeat ownership',
  async (t) => {
    const violations = collectBoundaryModeContractViolationsFromSource(
      'await this.runScheduledMembershipPublicationReconcileTick();',
      HEARTBEAT_LIFECYCLE_FILE_PATH,
    );

    t.equal(violations.length, 1);
    t.equal(
      violations[0].target,
      'await this.runScheduledMembershipPublicationReconcileTick',
    );
  });

test('rejects a second placement or operation authority in the formation barrier',
  async (t) => {
    const violations = collectBoundaryModeContractViolationsFromSource(
      [
        'await view.readReadinessOwnerRows();',
        'await coordinator.getEntityAuthoritativeOperationObservation();',
      ].join('\n'),
      FORMATION_BARRIER_FILE_PATH,
    );

    t.same(
      violations.map((violation) => violation.target).sort(),
      [
        'getEntityAuthoritativeOperationObservation',
        'readReadinessOwnerRows',
      ],
    );
  });

test('rejects a second query router or write retry authority', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'class QueryRouter {}',
      'const maxRecoveryAttempts = 40;',
      'executor.getWriteRetryAttemptLimit();',
    ].join('\n'),
    QUERY_ROUTER_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      'class QueryRouter',
      'getWriteRetryAttemptLimit',
      'maxRecoveryAttempts',
    ],
  );
});

test('rejects an aggregation-layer participant retry authority', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'this.maxRetries = 1;',
      'return this.executePartitionStatementOnce();',
    ].join('\n'),
    DISTRIBUTED_WRITE_COORDINATOR_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      'executePartitionStatementOnce',
      'this.maxRetries',
    ],
  );
});

test('rejects the retired direct bootstrap node-ready mutation path', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'registerBootstrapReadyHandler() {}',
      'async upsertNodeConnectionState() {}',
    ].join('\n'),
    BOOTSTRAP_RUNTIME_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      'registerBootstrapReadyHandler',
      'upsertNodeConnectionState',
    ],
  );
});

test('rejects field-level authority below the read ingress', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'if (options?.allowSqlFallback) return fallback();',
      'return options?.preferOwnerRpcReadLeader;',
    ].join('\n'),
    OWNER_RPC_READ_EXECUTION_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      'options?.allowSqlFallback',
      'preferOwnerRpcReadLeader',
    ],
  );
});

test('rejects alternate authority constructor forms', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'const mode = options?.ownerReadMode;',
      'const authority = options?.readAuthority;',
      'const profile = options?.profile;',
      'const purpose = options?.readPurpose;',
      'const strategy = options?.readStrategy;',
    ].join('\n'),
    READ_AUTHORITY_CONTRACT_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      'options?.ownerReadMode',
      'options?.profile',
      'options?.readAuthority',
      'options?.readPurpose',
      'options?.readStrategy',
    ],
  );
});

test('ignores non-hotspot files', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function helper() {',
      '  return {ok: true};',
      '}',
    ].join('\n'),
    NON_HOTSPOT_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('tracks the bounded boundary-mode hotspot set explicitly', async (t) => {
  t.same(
    Object.keys(BOUNDARY_MODE_HOTSPOT_CONTRACTS).sort(),
    [
      'src/admin/admin-control-snapshot-local-build-base.js',
      'src/bootstrap/bootstrap-service-runtime-methods.js',
      'src/bootstrap/node-joining-message-group-runtime-delegation.js',
      'src/bootstrap/node-joining-operation-ledger-formation-readiness.js',
      'src/cdc/cdc-integration-service-authoritative-read-flow.js',
      'src/cdc/cdc-integration-service-owner-rpc-read-execution.js',
      'src/config/config-key-constants.js',
      'src/control-plane/authoritative-control-plane-view.js',
      'src/control-plane/control-plane-readiness-service.js',
      'src/control-plane/control-plane-system-table-gateway-read-contracts.js',
      'src/control-plane/heartbeat-service-lifecycle-methods.js',
      'src/control-plane/publication-active-gate-handoff-contract-evidence.js',
      'src/control-plane/publication-active-gate-handoff-contract-fence.js',
      'src/control-plane/replica-dispatch-replay-readiness.js',
      'src/query/distributed/distributed-write-coordinator.js',
      'src/query/query-executor-write-retry-routing.js',
      'src/rebalancer/rebalance-coordinator.js',
      'src/rebalancer/unified-rebalancer.js',
      'test/control-plane/control-plane-readiness-service.test.js',
      'test/rebalancer/rebalance-coordinator-facade-compatibility.test.js',
      'test/rebalancer/unified-rebalancer.test.js',
    ],
  );
});
