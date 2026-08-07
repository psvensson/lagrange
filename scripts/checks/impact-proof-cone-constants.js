// Canonical literal owners for the impact proof-cone selector
// (developer-velocity epic V4a). Domain scalars live here per
// system-guidelines.md §4; consumers import, never re-declare.

export const PROOF_CONE_SCHEMA_VERSION = 1;
export const PROOF_CONE_SELECTOR_VERSION = 'proof-cone-selector/1';

export const PROOF_CONE_CONTRACTS_PATH = 'test/shards/impact-contracts.json';
export const PROOF_CONE_COVERAGE_PATH = 'test/shards/impact-coverage.json';
export const PROOF_CONE_RECEIPT_DIR = 'test-output/proof-cone';
export const IMPORT_GRAPH_PATH =
  'test-output/analysis/global-owner-debt-import-graph.json';

export const SAFETY_FLOOR_SHARD_PATH = 'test/shards/safety-pregate.txt';

// Escalation tiers (epic V4a sealed table). Ordered from narrowest to
// broadest; the selector picks the broadest tier any changed path maps to.
export const TIER_DOCUMENTATION = 'documentation';
export const TIER_LEAF_IMPLEMENTATION = 'leaf-implementation';
export const TIER_OWNER_IMPLEMENTATION = 'owner-implementation';
export const TIER_OWNER_BOUNDARY = 'owner-boundary';
export const TIER_PROTOCOL_SHAPE = 'protocol-shape';
export const TIER_CORE_METADATA = 'core-metadata';
export const TIER_SELECTOR_SELF = 'selector-self';
export const TIER_UNKNOWN = 'unknown';

export const FULL_SUITE_TIERS = Object.freeze([
  TIER_CORE_METADATA,
  TIER_SELECTOR_SELF,
  TIER_UNKNOWN,
]);

// Path prefixes whose change forces the full suite regardless of impact
// analysis: Raft/common routing/bootstrap/core metadata.
export const CORE_METADATA_PREFIXES = Object.freeze([
  'src/raft/',
  'src/bootstrap/',
  'src/control-plane/membership-',
  'src/routing/',
  'wit/',
  'src/message/',
  'src/system-table',
  'src/sql-engine/',
]);

// Selector/runner self-protection: any change to the selector, the
// classification owner, the test runner, or the shard machinery forces the
// full suite.
export const SELECTOR_SELF_PATHS = Object.freeze([
  'scripts/run-test-files.js',
  'scripts/generate-test-shards.js',
  'scripts/generate-test-primary-classes.js',
  'scripts/select-proof-cone.js',
  'scripts/checks/test-primary-classification.js',
  'scripts/checks/test-primary-classification-constants.js',
  'scripts/checks/impact-proof-cone.js',
  'scripts/checks/impact-proof-cone-constants.js',
  'scripts/checks/impact-coverage-collect.js',
  'test/shards/impact-contracts.json',
  'test/shards/impact-coverage.json',
  'test/shards/primary-classes.json',
]);

export const DOCUMENTATION_EXTENSIONS = Object.freeze(['.md', '.txt', '.wit.md']);
export const DOCUMENTATION_PREFIXES = Object.freeze([
  'docs/',
  'architecture/',
  'solve/epics/',
  'README',
]);

export const CONTRACT_SCHEMA_VERSION = 1;
export const COVERAGE_SCHEMA_VERSION = 1;

// Observed-coverage freshness bound: a snapshot older than this many source
// changes (by committed source fingerprint) or flagged stale by the caller
// widens the cone rather than silently narrowing it.
export const COVERAGE_FRESHNESS_SOURCE_DIGEST = 'sourceDigest';
export const COVERAGE_MINIMUM_TEST_SHARE = 0.05;
export const COVERAGE_STATE_INSUFFICIENT = 'insufficient-corpus';

export const RECEIPT_SCHEMA_VERSION = 1;

export const SELECTION_STATIC = 'static';
export const SELECTION_COVERAGE = 'coverage';
export const SELECTION_CONTRACT = 'contract';
export const SELECTION_CHANGED_TEST = 'changed-test';
export const SELECTION_SAFETY_FLOOR = 'safety-floor';

// Machine-readable selection reasons (selection-explainable contract). Every
// selected test carries at least one; every escalation names its rule.
export const REASON_STATIC_DEPENDENCY = 'static_dependency';
export const REASON_OBSERVED_COVERAGE = 'observed_coverage';
export const REASON_SEMANTIC_CONTRACT = 'semantic_contract';
export const REASON_CHANGED_TEST = 'changed_test';
export const REASON_UNIVERSAL_SAFETY = 'universal_safety';
export const REASON_ESCALATION = 'escalation';

// Decision modes. There is no empty-tests "probably safe" mode: anything the
// selector cannot prove escalates to full.
export const MODE_SELECTED = 'selected';
export const MODE_FULL = 'full';

// Escalation rules (the machine-readable "why" for a full-mode decision).
export const ESCALATION_RULE_UNCLASSIFIED_PATH = 'unclassified_changed_path';
export const ESCALATION_RULE_CORE_METADATA = 'core_metadata_change';
export const ESCALATION_RULE_SELECTOR_SELF = 'proof_system_self_change';
export const ESCALATION_RULE_EMPTY_CHANGE_SET = 'empty_change_set';
export const ESCALATION_RULE_STALE_COVERAGE = 'stale_coverage';
export const ESCALATION_RULE_INSUFFICIENT_COVERAGE = 'insufficient_coverage_corpus';
export const ESCALATION_RULE_ABSENT_COVERAGE = 'absent_coverage';
export const ESCALATION_RULE_DEAD_CONTRACT = 'dead_contract_edge';
export const ESCALATION_RULE_INPUT_MISSING = 'selector_input_missing';
export const ESCALATION_RULE_TIER_POLICY = 'escalation_tier_policy';

export const VERDICT_PASS = 'pass';
export const VERDICT_FAIL = 'fail';
export const VERDICT_REASON_ALL_PASS = 'all-checks-pass';
export const VERDICT_REASON_CHECK_FAILED = 'check-failed';

export const PROOF_CONE_SCENARIO = 'impact-graph-proof-cone-owner';
export const REPORTS_DIRECTORY = 'test-output/reports';

// Selector problem/detail literals (named per system-guidelines §4).
export const PROBLEM_CONTRACTS_SCHEMA = 'contracts manifest lacks a contracts object';
export const PROBLEM_EMPTY_CHANGE_SET =
  'empty changed-path set; failing closed to full suite';
export const PROBLEM_ZERO_SELECTED =
  'proof cone selected zero tests outside documentation tier';
export const COVERAGE_STATE_STALE = 'stale';
export const COVERAGE_STATE_ABSENT = 'absent';
export const DIRECTORY_PREFIX_SUFFIX = '/';
export const LIST_JOIN_SEPARATOR = ', ';
export const NEWLINE_SEPARATOR = '\n';
export const JSON_FILE_SUFFIX = '.json';
export const TAP_OK = 'ok';
export const TAP_NOT_OK = 'not ok';
export const OUTCOME_PASS = 'PASS';
export const OUTCOME_FAIL = 'FAIL';
export const PROBLEM_JOIN_SEPARATOR = '; ';
export const ERR_NO_TEST_FILES = 'impact-coverage-collect: no test files given';
export const ERR_SELECT_USAGE =
  'select-proof-cone: provide --changed <file> or --diff-base <ref>';
export const STALE_DIGEST_FORGE = 'stale-digest-for-attack';
export const CONTRACT_PARTITION_TOPOLOGY = 'partition-topology';
export const TOPOLOGY_TEST_PREFIX = 'test/topology/';
export const CALL_CELL_NAME_FRAGMENT = 'call-cell';
export const RUNTIME_NAME_FRAGMENT = 'runtime';
