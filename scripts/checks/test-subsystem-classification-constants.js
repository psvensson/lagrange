// Canonical literal owners for the subsystem classification surface.
// Domain scalars live here per system-guidelines.md §4; consumers import,
// never re-declare.
//
// Subsystem is the THIRD orthogonal dimension alongside primary and resource:
//
//   primary   — what kind of proof is this?      (unit / integration / ...)
//   resource  — how may it safely execute?       (ordinary / external-toolchain)
//   subsystem — what part of the product does it prove?
//
// The first two describe how a test executes. Neither can answer "run the
// membership subsystem", which is what change-scoped selection needs. A test is
// independently one of each: a wasm service integration test is
// primary=integration, resource=external-toolchain, subsystem=services-runtime.
//
// A subsystem is a PRODUCT RESPONSIBILITY, never a test mechanic. There is
// deliberately no `integration` subsystem: physical residence under
// test/integration/ says how a test runs, not what it proves.

export const SUBSYSTEM_SCHEMA_VERSION = 1;

export const SUBSYSTEM_ADMIN_DIAGNOSTICS = 'admin-diagnostics';
export const SUBSYSTEM_ARCHITECTURE_GOVERNANCE = 'architecture-governance';
export const SUBSYSTEM_BOOTSTRAP_MEMBERSHIP = 'bootstrap-membership';
export const SUBSYSTEM_CDC_METADATA = 'cdc-metadata';
export const SUBSYSTEM_CLI_TOOLING = 'cli-tooling';
export const SUBSYSTEM_CONTROL_PLANE = 'control-plane';
export const SUBSYSTEM_CONVERGENCE_TOPOLOGY = 'convergence-topology';
export const SUBSYSTEM_DISTRIBUTED_HARNESS = 'distributed-harness';
export const SUBSYSTEM_EXAMPLES_E2E = 'examples-e2e';
export const SUBSYSTEM_PGWIRE_COMPAT = 'pgwire-compat';
export const SUBSYSTEM_PLACEMENT_REBALANCE = 'placement-rebalance';
export const SUBSYSTEM_QUERY_SQL = 'query-sql';
export const SUBSYSTEM_RELEASE_PACKAGING = 'release-packaging';
export const SUBSYSTEM_RUNTIME_PRIMITIVES = 'runtime-primitives';
export const SUBSYSTEM_SERVICES_RUNTIME = 'services-runtime';
export const SUBSYSTEM_SOLVER_TOOLING = 'solver-tooling';
export const SUBSYSTEM_STORAGE_PARTITION = 'storage-partition';
export const SUBSYSTEM_STORAGE_RAFT = 'storage-raft';
export const SUBSYSTEM_TEST_INFRASTRUCTURE = 'test-infrastructure';
export const SUBSYSTEM_TRANSACTIONS = 'transactions';
export const SUBSYSTEM_TRANSPORT_MESSAGING = 'transport-messaging';
export const SUBSYSTEM_WASM_TOOLCHAIN = 'wasm-toolchain';

// Every declared subsystem must contain at least one live test, so this list
// cannot silently accumulate aspirational areas that nothing proves.
export const SUBSYSTEMS = Object.freeze([
  SUBSYSTEM_ADMIN_DIAGNOSTICS,
  SUBSYSTEM_ARCHITECTURE_GOVERNANCE,
  SUBSYSTEM_BOOTSTRAP_MEMBERSHIP,
  SUBSYSTEM_CDC_METADATA,
  SUBSYSTEM_CLI_TOOLING,
  SUBSYSTEM_CONTROL_PLANE,
  SUBSYSTEM_CONVERGENCE_TOPOLOGY,
  SUBSYSTEM_DISTRIBUTED_HARNESS,
  SUBSYSTEM_EXAMPLES_E2E,
  SUBSYSTEM_PGWIRE_COMPAT,
  SUBSYSTEM_PLACEMENT_REBALANCE,
  SUBSYSTEM_QUERY_SQL,
  SUBSYSTEM_RELEASE_PACKAGING,
  SUBSYSTEM_RUNTIME_PRIMITIVES,
  SUBSYSTEM_SERVICES_RUNTIME,
  SUBSYSTEM_SOLVER_TOOLING,
  SUBSYSTEM_STORAGE_PARTITION,
  SUBSYSTEM_STORAGE_RAFT,
  SUBSYSTEM_TEST_INFRASTRUCTURE,
  SUBSYSTEM_TRANSACTIONS,
  SUBSYSTEM_TRANSPORT_MESSAGING,
  SUBSYSTEM_WASM_TOOLCHAIN,
]);

export const SUBSYSTEM_MANIFEST_ID = 'test-subsystem-classification';
export const SUBSYSTEM_MANIFEST_PATH = 'test/shards/subsystem-classes.json';

export const SUBSYSTEM_SEPARATOR = ':';
export const SUBSYSTEM_DIGEST_ALGORITHM_LABEL = 'fnv1a32';
export const SUBSYSTEM_DIGEST_HEX_WIDTH = 8;
export const SUBSYSTEM_FNV1A32_OFFSET_BASIS = 0x811c9dc5;
export const SUBSYSTEM_FNV1A32_PRIME = 0x01000193;

// Fail-closed problems. Silent under-classification is indistinguishable from
// correct classification, so every one of these is an error, never a warning.
export const SUBSYSTEM_UNCLASSIFIED_PROBLEM =
  'test matches no subsystem rule (there is deliberately no catch-all)';
export const SUBSYSTEM_AMBIGUOUS_PROBLEM =
  'test matches more than one subsystem rule; add an exact override';
export const SUBSYSTEM_DEAD_RULE_PROBLEM =
  'subsystem rule matches no live test (stale taxonomy)';
export const SUBSYSTEM_DEAD_OVERRIDE_PROBLEM =
  'exact override names a path that is not a live test';
export const SUBSYSTEM_OVERRIDE_REASON_PROBLEM =
  'exact override requires a reason';
export const SUBSYSTEM_EMPTY_SUBSYSTEM_PROBLEM =
  'declared subsystem contains no live test';
export const SUBSYSTEM_UNKNOWN_SUBSYSTEM_PROBLEM = 'unknown subsystem id';
export const SUBSYSTEM_CENSUS_MISMATCH_PROBLEM =
  'subsystem census differs from the primary/resource census';

// A pgwire basename is its own product area wherever it lives. The colliding
// directory rules exclude it explicitly, so the two can never both match: the
// exclusion is disjointness by construction, not precedence.
//
// The lookahead must cover the whole remaining path, not just the segment after
// the directory root, and EVERY directory rule must carry it. Guarding only the
// first segment let a nested file such as test/runtime/sub/pgwire-thing.test.js
// double-match; guarding only three of the directory rules left 28 further
// collisions (test/storage/pgwire-page.test.js, test/cli/pgwire-x.test.js, ...).
// All failed closed as `ambiguous` rather than silently, but the claim above was
// not true until every colliding rule carried the exclusion.
const NOT_PGWIRE = '(?!(?:.*\\/)?pgwire-[^/]*$)';

// Ordered for reading only. `subsystemRulesMatching` evaluates all of them.
export const SUBSYSTEM_RULES = Object.freeze([
  {id: 'pgwire-basename', pattern: /\/pgwire-[^/]*$/, subsystem: SUBSYSTEM_PGWIRE_COMPAT},

  {id: 'governance-config', pattern: /^test\/config\/.*(guardrails|centralization|uniqueness|compliance|tracking)/, subsystem: SUBSYSTEM_ARCHITECTURE_GOVERNANCE},
  {id: 'governance-dirs', pattern: new RegExp(`^test\\/(closure|contract|invariants|model|authoring)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_ARCHITECTURE_GOVERNANCE},

  // test/integration/ is redistributed by what each file proves, because
  // "integration" is an execution class and never a product area.
  {id: 'integration-cdc', pattern: /^test\/integration\/(?!pgwire-).*(cdc|user-table-metadata|metadata-fanout|metadata-propagation)/, subsystem: SUBSYSTEM_CDC_METADATA},
  {id: 'integration-raft', pattern: /^test\/integration\/(?!pgwire-).*(raft|insert-or-ignore)/, subsystem: SUBSYSTEM_STORAGE_RAFT},
  {id: 'integration-placement', pattern: /^test\/integration\/(?!pgwire-)(?!.*cdc).*(rebalance|move-replica|replica-placement|replica-assignment|node-joining|replica-count)/, subsystem: SUBSYSTEM_PLACEMENT_REBALANCE},
  {id: 'integration-bootstrap', pattern: /^test\/integration\/(?!pgwire-)(?!.*(cdc|rebalance|node-joining)).*(bootstrap|seed-|node-join|membership|discovery)/, subsystem: SUBSYSTEM_BOOTSTRAP_MEMBERSHIP},
  {id: 'integration-control-plane', pattern: /^test\/integration\/(?!.*(cdc|bootstrap)).*(control-plane|convergence|control-snapshot|preflight)/, subsystem: SUBSYSTEM_CONTROL_PLANE},
  {id: 'integration-partition', pattern: /^test\/integration\/(?!.*(rebalance|replica-count)).*(managed-split|create-table-partition|learner)/, subsystem: SUBSYSTEM_STORAGE_PARTITION},
  {id: 'integration-query', pattern: /^test\/integration\/.*(sql-workflow|table-read-path|system-writes|leader-metadata)/, subsystem: SUBSYSTEM_QUERY_SQL},
  {id: 'integration-services', pattern: /^test\/integration\/(?!.*(cdc|bootstrap|rebalance|pgwire|websocket|multi-node|npm-package)).*(service|cell|call-composition|artifact-payload|http-to-call)/, subsystem: SUBSYSTEM_SERVICES_RUNTIME},
  {id: 'integration-transport', pattern: /^test\/integration\/(?!.*(cdc|replica-handler)).*(websocket|message-group|ack-delivery|load-channel|owner-read-transport)/, subsystem: SUBSYSTEM_TRANSPORT_MESSAGING},
  {id: 'integration-release', pattern: /^test\/integration\/.*(npm-package)/, subsystem: SUBSYSTEM_RELEASE_PACKAGING},
  {id: 'integration-convergence', pattern: /^test\/integration\/(?!.*(rebalance|admission)).*(benchmark|strict-)/, subsystem: SUBSYSTEM_CONVERGENCE_TOPOLOGY},
  {id: 'integration-admin', pattern: /^test\/integration\/(?!.*(cdc|websocket)).*(admin|debug-join)/, subsystem: SUBSYSTEM_ADMIN_DIAGNOSTICS},
  {id: 'integration-harness', pattern: /^test\/integration\/.*(failure-scenarios|multi-node-cluster)/, subsystem: SUBSYSTEM_DISTRIBUTED_HARNESS},

  {id: 'directory-rebalancer', pattern: new RegExp(`^test\\/rebalancer\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_PLACEMENT_REBALANCE},
  {id: 'directory-bootstrap', pattern: new RegExp(`^test\\/(bootstrap|node|entrypoint|boot)\\/(.*\\/)?${NOT_PGWIRE}`), subsystem: SUBSYSTEM_BOOTSTRAP_MEMBERSHIP},
  {id: 'file-entrypoint-helpers', pattern: /^test\/entrypoint-runtime-helpers/, subsystem: SUBSYSTEM_BOOTSTRAP_MEMBERSHIP},
  {id: 'directory-distributed', pattern: new RegExp(`^test\\/distributed\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_DISTRIBUTED_HARNESS},
  {id: 'directory-control-plane', pattern: new RegExp(`^test\\/control-plane\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CONTROL_PLANE},
  {id: 'directory-config-runtime', pattern: new RegExp(`^test\\/config\\/(?!.*(guardrails|centralization|uniqueness|compliance|tracking))${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CONTROL_PLANE},
  {id: 'directory-policy', pattern: new RegExp(`^test\\/policy\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CONTROL_PLANE},
  {id: 'directory-query', pattern: new RegExp(`^test\\/(query|live-query|index-management)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_QUERY_SQL},
  {id: 'file-sql-engine', pattern: /^test\/sql-engine-/, subsystem: SUBSYSTEM_QUERY_SQL},
  {id: 'directory-partition', pattern: new RegExp(`^test\\/(partition|storage|cache)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_STORAGE_PARTITION},
  {id: 'directory-raft', pattern: new RegExp(`^test\\/raft\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_STORAGE_RAFT},
  {id: 'directory-services', pattern: new RegExp(`^test\\/(runtime|service|function|worker|threading)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_SERVICES_RUNTIME},
  {id: 'directory-wasm', pattern: new RegExp(`^test\\/wasm-service\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_WASM_TOOLCHAIN},
  {id: 'directory-cli', pattern: new RegExp(`^test\\/cli\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CLI_TOOLING},
  {id: 'directory-solve', pattern: new RegExp(`^test\\/solve\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_SOLVER_TOOLING},
  {id: 'directory-test-infrastructure', pattern: new RegExp(`^test\\/(scripts|test-helpers)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_TEST_INFRASTRUCTURE},
  {id: 'directory-admin', pattern: new RegExp(`^test\\/(admin|diagnostics|debug|debug-runtime|logging)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_ADMIN_DIAGNOSTICS},
  {id: 'directory-convergence', pattern: new RegExp(`^test\\/(convergence|topology|active-gate)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CONVERGENCE_TOPOLOGY},
  {id: 'directory-examples', pattern: new RegExp(`^test\\/examples\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_EXAMPLES_E2E},
  {id: 'directory-transport', pattern: new RegExp(`^test\\/(transport|message-group|address)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_TRANSPORT_MESSAGING},
  {id: 'directory-cdc', pattern: new RegExp(`^test\\/(cdc|migration)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_CDC_METADATA},
  {id: 'directory-transactions', pattern: new RegExp(`^test\\/(transaction|workflow)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_TRANSACTIONS},
  {id: 'directory-release', pattern: new RegExp(`^test\\/(packaging|release|helm|sea)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_RELEASE_PACKAGING},
  {id: 'directory-primitives', pattern: new RegExp(`^test\\/(utils|constants|time|random|hlc)\\/${NOT_PGWIRE}`), subsystem: SUBSYSTEM_RUNTIME_PRIMITIVES},
]);

// Exact overrides: named tests whose general rules genuinely conflict, or whose
// semantic home differs from what their path implies. Each must name exactly
// one live test and carry a reason, so a stale override fails like a dead rule.
export const SUBSYSTEM_OVERRIDES = Object.freeze({
  'test/integration/benchmark-system-table-read-path.integration.test.js': {
    subsystem: SUBSYSTEM_QUERY_SQL,
    reason: 'benchmarks a read path; the area under proof is the query engine, not convergence behaviour',
  },
  'test/integration/control-plane-rebalance.integration.test.js': {
    subsystem: SUBSYSTEM_PLACEMENT_REBALANCE,
    reason: 'rebalance driven through the control plane; the proven outcome is the placement',
  },
  'test/integration/message-group-service-handler-services-row.integration.test.js': {
    subsystem: SUBSYSTEM_SERVICES_RUNTIME,
    reason: 'a service handler writing its services row; message-group is only the transport it uses',
  },
  'test/integration/node-join-convergence-slo.integration.test.js': {
    subsystem: SUBSYSTEM_BOOTSTRAP_MEMBERSHIP,
    reason: 'join SLO is a membership property that happens to be measured during convergence',
  },
  'test/integration/benchmark-replica-instability-admission.integration.test.js': {
    subsystem: SUBSYSTEM_CONVERGENCE_TOPOLOGY,
    reason: 'admission behaviour under replica instability is a convergence proof',
  },
  'test/integration/minimal-deployment-runtime-access-policy-live-validation.integration.test.js': {
    subsystem: SUBSYSTEM_SERVICES_RUNTIME,
    reason: 'runtime access policy validated live; deployment is the fixture, not the subject',
  },
  'test/integration/service-install-lifecycle-cli-pgwire.integration.test.js': {
    subsystem: SUBSYSTEM_SERVICES_RUNTIME,
    reason: 'service install lifecycle; CLI and pgwire are the surfaces it drives',
  },
});
