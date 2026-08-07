// Canonical literal owners for the primary test classification surface
// (developer-velocity epic V2a). Domain scalars live here per
// system-guidelines.md §4; consumers import, never re-declare.

export const PRIMARY_CLASS_SCHEMA_VERSION = 1;

export const PRIMARY_CLASS_UNIT = 'unit';
export const PRIMARY_CLASS_INTEGRATION = 'integration';
export const PRIMARY_CLASS_BOOTSTRAP = 'bootstrap';
export const PRIMARY_CLASS_CONVERGENCE_PROBE = 'convergence-probe';
export const PRIMARY_CLASS_PACKAGING = 'packaging';

export const PRIMARY_CLASSES = Object.freeze([
  PRIMARY_CLASS_UNIT,
  PRIMARY_CLASS_INTEGRATION,
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_PACKAGING,
]);

export const PRIMARY_CLASS_MANIFEST_ID = 'test-primary-classification';
export const PRIMARY_CLASS_MANIFEST_PATH = 'test/shards/primary-classes.json';
export const PRIMARY_CLASS_SCENARIO = 'test-primary-classification-manifest';

export const CONVERGENCE_PROBES_SHARD_PATH = 'test/shards/convergence-probes.txt';
export const DEVELOPER_SMOKE_MANIFEST_PATH =
  'test/manifests/developer-smoke-proof-manifest.json';
export const SMOKE_FOCUSED_COMMAND_ID = 'focused-contracts';

export const TEST_FILE_SUFFIX = '.test.js';
export const INTEGRATION_FILE_SUFFIX = '.integration.test.js';
export const INTEGRATION_DIRECTORY_PREFIX = 'test/integration/';
export const BOOTSTRAP_DIRECTORY_PREFIX = 'test/bootstrap/';
export const PACKAGING_DIRECTORY_PREFIX = 'test/packaging/';

export const CLASS_SEPARATOR = ':';
export const DIGEST_ALGORITHM_LABEL = 'fnv1a32';
export const DIGEST_HEX_WIDTH = 8;
export const FNV1A32_OFFSET_BASIS = 0x811c9dc5;
export const FNV1A32_PRIME = 0x01000193;

export const REPORTS_DIRECTORY = 'test-output/reports';
export const VERDICT_PASS = 'pass';
export const VERDICT_FAIL = 'fail';
export const VERDICT_REASON_ALL_PASS = 'all-checks-pass';
export const VERDICT_REASON_CHECK_FAILED = 'check-failed';

export const MINIMUM_LIVE_CENSUS_SIZE = 1900;
