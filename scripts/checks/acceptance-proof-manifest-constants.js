export const ACCEPTANCE_MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_ACCEPTANCE_MANIFEST =
  'test/manifests/project-hardening-proof-manifest.json';

export const ACCEPTANCE_PROOF = Object.freeze({
  HASH_ALGORITHM: 'sha256',
  HASH_ENCODING: 'hex',
  PARENT_SEGMENT: '..',
  SKIPPED_STATUS: 'skipped',
  COMMAND_FIELD: 'command',
  SHELL_FIELD: 'shell',
  MAX_EXIT_CODE: 255,
  MANIFEST_OBJECT_REQUIRED: 'manifest must be an object',
  MANIFEST_ID_REQUIRED: 'id must be a non-empty string',
  ENVIRONMENT_CONTRACT_REQUIRED:
    'environment must declare inherit:boolean and string set values',
  COMMANDS_REQUIRED: 'commands must be a non-empty ordered array',
  TEXT_ENCODING: 'utf8',
  MISSING_ERROR: 'missing',
  TIMEOUT_ERROR_CODE: 'ETIMEDOUT',
  TERMINATION_SIGNAL: 'SIGTERM',
  MANIFEST_DRIFT_REASON: 'manifest drifted while the proof run was active',
  STATUS_PASS: 'PASS',
  STATUS_FAIL: 'FAIL',
  STATUS_NOT_RUN: 'NOT_RUN',
  PRIOR_COMMAND_FAILED: 'a prior manifest command failed',
  PATH_SEPARATOR: '/',
  PRODUCER: 'acceptance-proof-manifest-runner',
  FIDELITY: 'deterministic-acceptance-manifest',
  FALLBACK_MANIFEST_ID: 'acceptance-manifest',
  INVALID_MANIFEST_ID: 'invalid-acceptance-manifest',
  // Explicit per-state counts. A bare `N/6` reads as "6 minus N failed", but
  // the manifest FAILS FAST: everything after the first failure is NOT_RUN, so
  // `1/6` meant one failure and four unexecuted commands. That misreading cost
  // a diagnosis cycle on 2026-08-19.
  SUMMARY_INDENT: '  ',
  SUMMARY_LABEL_WIDTH: 8,
  FIRST_FAILURE_LABEL: 'first failure: ',
  // The first failing command's failing test files, read from its captured
  // output: diagnosis only, the verdict stays the command's status.
  FAILING_FILES_LABEL: 'failing test files: ',
  FAILING_FILES_SHOWN: 20,
  FAILING_FILES_WITHHELD_PREFIX: '... ',
  FAILING_FILES_WITHHELD_MIDDLE: ' more withheld (all in ',
  FAILING_FILES_WITHHELD_SUFFIX: ')',
  INCOMPLETE_SUFFIX: ' - list may be incomplete',
  SUMMARY_LINE_ABSENT: 'summary line absent',
  ENDED_BY_SIGNAL_PREFIX: 'the command ended by ',
  UNREAD_VERDICTS_SUFFIX: ' verdict line(s) too long to read',
  FLAG_MANIFEST: '--manifest',
  FLAG_SCENARIO: '--scenario',
  FLAG_RECEIPT_DIR: '--receipt-dir',
});
