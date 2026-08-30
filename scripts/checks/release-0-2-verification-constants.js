/**
 * Typed vocabulary of the release-0-2-verification-v3 scenario producer
 * (scripts/checks/run-release-0-2-verification-scenarios.js), the two
 * fact-recording helpers (record-release-gate-receipt.js,
 * record-github-gate-receipt.js), and their witness. Every scenario name,
 * verdict reason, receipt name, and receipt schema lives here so decision
 * code never spells a literal and the witness asserts the same symbols the
 * producer emits.
 */

// The frozen 0.2 candidate version. package.json, CLI_VERSION,
// ENTRYPOINT_VERSION and the Helm chart version/appVersion must all equal it
// (epic release-0-2 G5) before any verification scenario can PASS.
export const RELEASE_VERSION = '0.2.0';

export const VERIFICATION_SCENARIO = Object.freeze({
  AGGREGATE: 'release-0-2-verification-v3',
  MEMORY_SOAK: 'release-0-2-verification-v3-memory-soak',
  LOCAL_ARTIFACTS: 'release-0-2-verification-v3-local-artifacts',
  REMOTE_EXACT_SHA: 'release-0-2-verification-v3-remote-exact-sha',
});

export const VERIFICATION_VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
});

// One typed reason per fail-closed condition. The producer emits exactly
// one canonical verdictReason per scenario (the first failing condition in
// table order); every condition's own outcome is carried in detail.
export const VERIFICATION_REASON = Object.freeze({
  VERIFIED: 'verified',
  RELEASE_VERSION_INCONSISTENT: 'release_version_inconsistent',
  SOAK_REPORT_MISSING: 'soak_report_missing',
  FINGERPRINT_MISSING: 'fingerprint_missing',
  FINGERPRINT_MISMATCH: 'fingerprint_mismatch',
  SOAK_SCENARIO_FAILED: 'soak_scenario_failed',
  SOAK_NODE_NOT_ANALYZED: 'soak_node_not_analyzed',
  SOAK_INSUFFICIENT_SAMPLES: 'soak_insufficient_samples',
  SOAK_INSUFFICIENT_REASON: 'soak_insufficient_analysis_reason',
  SOAK_LEAK_DETECTED: 'soak_leak_detected',
  RECEIPT_MISSING: 'receipt_missing',
  RECEIPT_EXIT_CODE_MISSING: 'receipt_exit_code_missing',
  RECEIPT_FAILED: 'receipt_failed',
  RECEIPT_VERSION_MISMATCH: 'receipt_version_mismatch',
  RECEIPT_TREE_DIRTY: 'receipt_tree_dirty',
  RECEIPT_SHA_MISMATCH: 'receipt_sha_mismatch',
  RECEIPT_FINGERPRINT_MISMATCH: 'receipt_fingerprint_mismatch',
  REMOTE_RECEIPT_MISSING: 'remote_receipt_missing',
  REMOTE_RECEIPT_TREE_DIRTY: 'remote_receipt_tree_dirty',
  REMOTE_WORKFLOW_MISMATCH: 'remote_workflow_mismatch',
  REMOTE_SHA_MISMATCH: 'remote_sha_mismatch',
  REMOTE_CHECK_NOT_FOUND: 'remote_check_not_found',
  REMOTE_CHECK_NOT_SUCCESS: 'remote_check_not_success',
  CHILD_SCENARIO_FAILED: 'child_scenario_failed',
});

// Required local gate receipts (release-0-2-verification constraint
// complete-release-gate), keyed by the receipt name the operator passes to
// record-release-gate-receipt.js.
export const GATE_RECEIPT_NAME = Object.freeze({
  TEST_GATE: 'test-gate',
  TEST_CI: 'test-ci',
  RELEASE_WORKFLOW_CONTRACTS: 'release-workflow-contracts',
  PACKAGE_NPM: 'package-npm',
  BUILD_ALL: 'build-all',
  DOCKER_SMOKE: 'docker-smoke',
  HELM_PACKAGE: 'helm-package',
});

export const REQUIRED_GATE_RECEIPTS = Object.freeze([
  GATE_RECEIPT_NAME.TEST_GATE,
  GATE_RECEIPT_NAME.TEST_CI,
  GATE_RECEIPT_NAME.RELEASE_WORKFLOW_CONTRACTS,
  GATE_RECEIPT_NAME.PACKAGE_NPM,
  GATE_RECEIPT_NAME.BUILD_ALL,
  GATE_RECEIPT_NAME.DOCKER_SMOKE,
  GATE_RECEIPT_NAME.HELM_PACKAGE,
]);

export const GATE_RECEIPT_SCHEMA = 'release-gate-receipt/1';
export const GITHUB_GATE_RECEIPT_SCHEMA = 'github-gate-receipt/1';
export const GATE_RECEIPT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
export const GATE_RECEIPT_EXIT_OK = 0;
// A command killed by a signal has no exit status; the receipt records this
// sentinel plus the signal name so the producer still reads a failure.
export const GATE_RECEIPT_EXIT_SIGNAL = 128;
export const GATE_RECEIPT_EXIT_SPAWN_FAILED = 127;

// GitHub check identity of the required remote gate: the `gate` job of the
// workflow file .github/workflows/ci.yml, which GitHub renders as
// "ci / gate". full-gate.yml also owns a job id `gate`; only the workflow
// path tells them apart, so the receipt records the path and the
// derivation requires it.
export const GITHUB_REQUIRED_CHECK = Object.freeze({
  WORKFLOW: 'ci',
  WORKFLOW_PATH: '.github/workflows/ci.yml',
  JOB: 'gate',
  DISPLAY_NAME: 'ci / gate',
  SUCCESS_CONCLUSION: 'success',
  COMPLETED_STATUS: 'completed',
});

export const GITHUB_GATE_RECEIPT_FILENAME = 'github-ci-gate.json';

// Memory-soak oracle (epic G4): every node analyzed, at least this many
// samples, no insufficient-* analysis reason, no detected leak.
export const SOAK_MIN_SAMPLES_PER_NODE = 30;
export const SOAK_INSUFFICIENT_REASON_PREFIX = 'insufficient-';
export const SOAK_REPORT_PREFIX = 'release-0-2-memory-soak';

export const VERIFICATION_REPORT_DIR = 'test-output/reports';
export const RELEASE_GATE_RECEIPT_DIR =
  'test-output/reports/release-gate-receipts';
export const REPORT_FILE_EXTENSION = '.report.json';
export const RECEIPT_FILE_EXTENSION = '.json';

export const VERIFICATION_PRODUCER = 'release-0-2-verification-derivation';
export const VERIFICATION_FIDELITY = 'release-receipt-derivation';

export const VERIFICATION_ARG = Object.freeze({
  SOAK_REPORT: '--soak-report',
  GATE_RECEIPT: '--gate-receipt',
  LOCAL_RECEIPTS: '--local-receipts',
  RECEIPT_DIR: '--receipt-dir',
  REMOTE_RECEIPT: '--remote-receipt',
  REPORT_DIR: '--report-dir',
  SHA: '--sha',
  REPO: '--repo',
  OUT: '--out',
  COMMAND_SEPARATOR: '--',
});
