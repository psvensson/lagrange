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
  FLAG_MANIFEST: '--manifest',
  FLAG_SCENARIO: '--scenario',
  FLAG_RECEIPT_DIR: '--receipt-dir',
});
