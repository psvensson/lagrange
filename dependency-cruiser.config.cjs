const DEPENDENCY_RULE = Object.freeze({
  NO_CIRCULAR: 'no-circular',
  NO_ORPHANS: 'no-orphans',
  NOT_TO_UNRESOLVABLE: 'not-to-unresolvable',
  PARTITION_APPLY_NO_TRANSPORT_CACHE_OR_PLANNER:
    'partition-apply-no-transport-cache-or-planner',
  PARTITION_DECISION_AND_STORE_NO_INDIRECT_NONDETERMINISTIC_CAPABILITIES:
    'partition-decision-and-store-no-indirect-nondeterministic-capabilities',
  PURE_SQL_RENDER_AND_PLACEMENT_DECISION_NO_NONDETERMINISTIC_CAPABILITIES:
    'pure-sql-render-and-placement-decision-no-nondeterministic-capabilities',
  QUERY_NO_DURABLE_LOCKING_READ_STORE: 'query-no-durable-locking-read-store',
  LOCKING_READ_RESERVATION_NO_DURABLE_STORE: 'locking-read-reservation-no-durable-store',
});
const DEPENDENCY_RULE_COMMENT = Object.freeze({
  NO_CIRCULAR: 'Disallow circular dependencies.',
  NO_ORPHANS: 'Warn on modules not reachable from configured entry points.',
  NOT_TO_UNRESOLVABLE: 'A relative import must resolve to a file: a module ' +
    'deleted while something still imports it fails only when that importer ' +
    'loads, which a selected proof may never do.',
  PARTITION_APPLY_NO_TRANSPORT_CACHE_OR_PLANNER:
    'Deterministic partition apply, store, decision and command modules must ' +
    'not import transport, volatile cache, control-plane readiness, wall-clock ' +
    'time sources, or rebalancer workflow/planner modules.',
  PARTITION_DECISION_AND_STORE_NO_INDIRECT_NONDETERMINISTIC_CAPABILITIES:
    'Pure decision, store, bytes and command modules must not transitively ' +
    'reach transport, volatile cache, CDC delivery, wall-clock time sources, ' +
    'query engines, or rebalancer workflow/planner execution.',
  PURE_SQL_RENDER_AND_PLACEMENT_DECISION_NO_NONDETERMINISTIC_CAPABILITIES:
    'Pure SQL AST/rendering and pure placement/reconciliation decision modules ' +
    'must not directly or transitively import transport, mutable caches, ' +
    'wall-clock timers, or worker/process managers.',
  QUERY_NO_DURABLE_LOCKING_READ_STORE:
    'Query/gateway modules must never import the partition-private durable ' +
    'locking-read SQLite store; durable acquisition and release belong solely ' +
    'to the partition owners.',
  LOCKING_READ_RESERVATION_NO_DURABLE_STORE:
    'The shared volatile locking-read reservation mirror module must never ' +
    'reach the durable SQLite reservation store or SQLite connection state ' +
    'directly or transitively.',
});
const DEPENDENCY_RULE_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});
const DEPENDENCY_PATH = Object.freeze({
  ADMIN_CLI_ENTRY: '(^|/)src/cli/bin/lagrange-admin\\.js$',
  // Relative specifiers are admitted so an unresolved one (which keeps its
  // raw `./` or `../` path) reaches the not-to-unresolvable rule; resolved
  // modules all carry their src/test/scripts path.
  INCLUDE_ONLY: '^src|^test|^scripts|^\\.',
  INDEX_ENTRY: '(^|/)src/index\\.js$',
  NODE_MODULE_PACKAGE: 'node_modules/[^/]+',
  NODE_MODULES: 'node_modules',
  PARTITION_APPLY_AND_DECISION_MODULES:
    '(^|/)src/(partition/(partition-participant-transaction-(apply|store|bytes)|' +
    'partition-locking-read-(service|store|command)|' +
    'partition-placement-admission-(decision|command|identity))|' +
    'rebalancer/replica-placement-owner-admission-statement)\\.js$',
  PARTITION_PURE_DECISION_AND_STORE_MODULES:
    '(^|/)src/(partition/(partition-participant-transaction-(store|bytes)|' +
    'partition-locking-read-(store|command)|' +
    'partition-placement-admission-(decision|command|identity))|' +
    'rebalancer/replica-placement-owner-admission-statement)\\.js$',
  QUERY_LAYER_MODULES: '(^|/)src/query/',
  LOCKING_READ_RESERVATION_MIRROR_MODULE:
    '(^|/)src/partition/partition-locking-read-reservation\\.js$',
  DURABLE_LOCKING_READ_STORE_MODULE:
    '(^|/)src/partition/partition-locking-read-store\\.js$',
  DURABLE_LOCKING_READ_SQLITE_MODULES:
    '(^|/)src/(partition/partition-locking-read-store|storage/sqlite-connection-state)\\.js$',
  PARTITION_APPLY_FORBIDDEN_DIRECT:
    '(^|/)(src/(transport|cache|control-plane|api|cli|admin|time)/|' +
    'src/bootstrap/(bootstrap-)?readiness-|' +
    'src/rebalancer/(replica-placement-owner(-deficits|-order)?\\.js$|' +
    'operation-workflow-|unified-rebalancer|move-planner|' +
    'replica-operation-executor|replica-operation-repository\\.js$)|' +
    'src/query/distributed/distributed-transaction-coordinator)|' +
    '(^(node:)?(http|https|net|tls|dgram|dns|child_process|worker_threads|fs)(/|$))',
  PARTITION_DECISION_FORBIDDEN_REACHABLE:
    '(^|/)(src/(transport|cache|cdc|time|api|cli|admin|query)/|' +
    'src/bootstrap/(bootstrap-)?readiness-|' +
    'src/control-plane/(?!owners/service-(install-catalog|instance)-contract\\.js$)|' +
    'src/rebalancer/(replica-placement-owner(-deficits|-order)?\\.js$|' +
    'operation-workflow-|unified-rebalancer|move-planner|' +
    'replica-operation-executor|replica-operation-repository\\.js$))|' +
    '(^(node:)?(http|https|net|tls|dgram|dns|child_process|worker_threads|fs)(/|$))',
  PURE_SQL_RENDER_AND_PLACEMENT_DECISION_MODULES:
    '(^|/)src/(query/(sql-statement-renderer|sql-table-definition|sqlite-identifier|sql-value-codec)|' +
    'rebalancer/(replica-placement-owner-(deficits|order)|placement-owner-decision|operation-lifecycle))\\.js$',
  PURE_SQL_RENDER_AND_PLACEMENT_DECISION_FORBIDDEN_REACHABLE:
    '(^|/)(src/(transport|cache|cdc|time|api|cli|admin)/|' +
    'src/query/distributed/coordinator-merge-process\\.js$|' +
    'src/rebalancer/(operation-workflow-(?!owner-(constants|evidence|state|effects)\\.js)|' +
    'unified-rebalancer|move-planner|replica-operation-executor|replica-operation-repository\\.js$))|' +
    '(^(node:)?(http|https|net|tls|dgram|dns|child_process|worker_threads|fs)(/|$))',
  REQUEST_CELL_WORKER_ENTRY:
    '(^|/)src/runtime/wasi-component-cell-worker\\.js$',
  COMPONENT_DERIVATION_WORKER_ENTRY:
    '(^|/)src/runtime/wasi-component-derivation-worker\\.js$',
  SCRIPTS: '^scripts/',
  TEST: '^test/',
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: DEPENDENCY_RULE.NOT_TO_UNRESOLVABLE,
      comment: DEPENDENCY_RULE_COMMENT.NOT_TO_UNRESOLVABLE,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: DEPENDENCY_RULE.NO_CIRCULAR,
      comment: DEPENDENCY_RULE_COMMENT.NO_CIRCULAR,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: DEPENDENCY_RULE.PARTITION_APPLY_NO_TRANSPORT_CACHE_OR_PLANNER,
      comment:
        DEPENDENCY_RULE_COMMENT.PARTITION_APPLY_NO_TRANSPORT_CACHE_OR_PLANNER,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {
        path: DEPENDENCY_PATH.PARTITION_APPLY_AND_DECISION_MODULES,
      },
      to: {
        path: DEPENDENCY_PATH.PARTITION_APPLY_FORBIDDEN_DIRECT,
      },
    },
    {
      name: DEPENDENCY_RULE
        .PARTITION_DECISION_AND_STORE_NO_INDIRECT_NONDETERMINISTIC_CAPABILITIES,
      comment: DEPENDENCY_RULE_COMMENT
        .PARTITION_DECISION_AND_STORE_NO_INDIRECT_NONDETERMINISTIC_CAPABILITIES,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {
        path: DEPENDENCY_PATH.PARTITION_PURE_DECISION_AND_STORE_MODULES,
      },
      to: {
        reachable: true,
        path: DEPENDENCY_PATH.PARTITION_DECISION_FORBIDDEN_REACHABLE,
      },
    },
    {
      name: DEPENDENCY_RULE
        .PURE_SQL_RENDER_AND_PLACEMENT_DECISION_NO_NONDETERMINISTIC_CAPABILITIES,
      comment: DEPENDENCY_RULE_COMMENT
        .PURE_SQL_RENDER_AND_PLACEMENT_DECISION_NO_NONDETERMINISTIC_CAPABILITIES,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {
        path: DEPENDENCY_PATH.PURE_SQL_RENDER_AND_PLACEMENT_DECISION_MODULES,
      },
      to: {
        reachable: true,
        path: DEPENDENCY_PATH
          .PURE_SQL_RENDER_AND_PLACEMENT_DECISION_FORBIDDEN_REACHABLE,
      },
    },
    {
      name: DEPENDENCY_RULE.QUERY_NO_DURABLE_LOCKING_READ_STORE,
      comment: DEPENDENCY_RULE_COMMENT.QUERY_NO_DURABLE_LOCKING_READ_STORE,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {
        path: DEPENDENCY_PATH.QUERY_LAYER_MODULES,
      },
      to: {
        path: DEPENDENCY_PATH.DURABLE_LOCKING_READ_STORE_MODULE,
      },
    },
    {
      name: DEPENDENCY_RULE.LOCKING_READ_RESERVATION_NO_DURABLE_STORE,
      comment: DEPENDENCY_RULE_COMMENT.LOCKING_READ_RESERVATION_NO_DURABLE_STORE,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {
        path: DEPENDENCY_PATH.LOCKING_READ_RESERVATION_MIRROR_MODULE,
      },
      to: {
        reachable: true,
        path: DEPENDENCY_PATH.DURABLE_LOCKING_READ_SQLITE_MODULES,
      },
    },
    {
      name: DEPENDENCY_RULE.NO_ORPHANS,
      comment: DEPENDENCY_RULE_COMMENT.NO_ORPHANS,
      severity: DEPENDENCY_RULE_SEVERITY.WARN,
      from: {
        orphan: true,
        pathNot: [
          DEPENDENCY_PATH.INDEX_ENTRY,
          DEPENDENCY_PATH.ADMIN_CLI_ENTRY,
          DEPENDENCY_PATH.REQUEST_CELL_WORKER_ENTRY,
          DEPENDENCY_PATH.COMPONENT_DERIVATION_WORKER_ENTRY,
          DEPENDENCY_PATH.TEST,
          DEPENDENCY_PATH.SCRIPTS,
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: DEPENDENCY_PATH.NODE_MODULES,
    },
    // A worktree whose node_modules is a symlink reaches packages through
    // `../` paths, which the relative admission above would otherwise keep.
    exclude: {
      path: DEPENDENCY_PATH.NODE_MODULES,
    },
    includeOnly: DEPENDENCY_PATH.INCLUDE_ONLY,
    reporterOptions: {
      dot: {
        collapsePattern: DEPENDENCY_PATH.NODE_MODULE_PACKAGE,
      },
    },
  },
};
