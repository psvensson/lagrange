// Shared wire vocabulary and limits for the package diagnostic only. Packaging
// and placement retain their existing operation and verdict authority.
const OBSERVATION_SCHEMA = 'npm-package-observation/1';
const OBSERVATION_KIND = Object.freeze({
  STAGE: 'stage', COMMAND: 'command', SESSION: 'session', SNAPSHOT: 'snapshot', TERMINAL: 'terminal',
});
const OBSERVATION_EVENT = Object.freeze({
  BEGIN: 'begin', END: 'end', SNAPSHOT: 'snapshot', TERMINAL: 'terminal',
});
const OPERATION_OUTCOME = Object.freeze({SUCCESS: 'success', ERROR: 'error'});
const OBSERVATION_COMPLETENESS = Object.freeze({COMPLETE: 'complete', INCOMPLETE: 'incomplete'});
const OBSERVATION_OVERHEAD_SCOPE = 'setup-records-and-snapshots-before-terminal-write';
const OBSERVATION_STAGE = Object.freeze({
  SESSION: 'observation-session',
  COMMAND: 'command',
  GIT_HEAD_COMMAND: 'git-head-command',
  BUILD_PACKAGE: 'build-package',
  WORKSPACE_MANIFEST: 'workspace-manifest',
  RESOLVE_HEAD: 'resolve-head',
  OUTPUT_PATH: 'output-path',
  PACK_TEMPORARY_ROOT: 'pack-temporary-root',
  PACK_DIRECTORIES: 'pack-directories',
  PRELIMINARY_PACK: 'preliminary-pack',
  EXTRACT_PACKAGE: 'extract-package',
  STAGED_MANIFEST: 'staged-manifest',
  FINAL_PACK: 'final-pack',
  PACK_CLEANUP: 'pack-cleanup',
  VERIFY_INSTALLED: 'verify-installed',
  INSTALL_TEMPORARY_ROOT: 'install-temporary-root',
  INSTALL_DIRECTORIES: 'install-directories',
  CONSUMER_MANIFEST: 'consumer-manifest',
  INSTALL: 'install',
  INSTALLED_ROOT: 'installed-root',
  API_IMPORT: 'api-import',
  BIN_PATHS: 'bin-paths',
  LAGRANGE_VERSION: 'lagrange-version',
  ADMIN_VERSION: 'admin-version',
  DRY_RUN: 'dry-run',
  SERVICE_INIT: 'service-init',
  SERVICE_GENERATE: 'service-generate',
  SERVICE_BUILD: 'service-build',
  INSTALLED_CLEANUP: 'installed-cleanup',
  INSPECT_TARBALL: 'inspect-tarball',
  TEST_SETUP: 'test-setup',
  TEST_CLEANUP: 'test-cleanup',
  PACKAGE_ASSERTIONS: 'package-assertions',
  TARBALL_ASSERTIONS: 'tarball-assertions',
});
const PACKAGE_ARTIFACT = Object.freeze({
  TRACE: 'trace', PACKED: 'packed', INSTALLED_PACKAGE: 'installed-package',
  INSTALLED_LOCK: 'installed-lock',
});
const SNAPSHOT_OUTCOME = Object.freeze({
  SAVED: 'saved', OPTIONAL_MISSING: 'optional-missing', MISSING: 'missing',
  OVERSIZE_OR_NONFILE: 'oversize-or-nonfile', SOURCE_CHANGED: 'source-changed',
  INVALID_PACKED_IDENTITY: 'invalid-packed-identity', TOTAL_BOUND_EXCEEDED: 'total-bound-exceeded',
  ERROR: 'error',
});
const PACKAGE_DIAGNOSTIC_DIRECTORY = 'test-output/npm-package-diagnostic';
const TRACE_MAX_BYTES = 256 * 1024;
const SNAPSHOT_MAX_BYTES = 1024 * 1024;
const TOTAL_MAX_BYTES = 4 * 1024 * 1024;
const PACKAGE_DIAGNOSTIC_FILES = Object.freeze({
  [PACKAGE_ARTIFACT.TRACE]: 'trace.ndjson',
  [PACKAGE_ARTIFACT.PACKED]: 'packed.json',
  [PACKAGE_ARTIFACT.INSTALLED_PACKAGE]: 'installed-package.json',
  [PACKAGE_ARTIFACT.INSTALLED_LOCK]: 'installed-lock.json',
});

export {OBSERVATION_SCHEMA, OBSERVATION_KIND, OBSERVATION_EVENT, OPERATION_OUTCOME,
  OBSERVATION_COMPLETENESS, OBSERVATION_OVERHEAD_SCOPE, OBSERVATION_STAGE, PACKAGE_ARTIFACT,
  SNAPSHOT_OUTCOME, PACKAGE_DIAGNOSTIC_DIRECTORY, PACKAGE_DIAGNOSTIC_FILES,
  TRACE_MAX_BYTES, SNAPSHOT_MAX_BYTES, TOTAL_MAX_BYTES};
