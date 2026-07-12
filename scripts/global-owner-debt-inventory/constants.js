export const OWNER_DEBT = Object.freeze({
  output: 'solve/changes/global-owner-debt-inventory/inventory.json',
  schemaVersion: 'global-owner-debt-inventory-v1',
  importGraphSchemaVersion: 'global-owner-debt-import-graph-v1',
  hashAlgorithm: 'sha256',
  hashEncoding: 'hex',
  pathSeparator: '/',
  encodingUtf8: 'utf8',
  identityLogicalJson: 'logical-json',
  nullSeparator: '\0',
  newline: '\n',
  space: ' ',
  rootRelative: '.',
  hyphen: '-',
  testPrefix: 'test/',
  sourceDirectory: 'src',
  testDirectory: 'test',
  distributedDirectory: 'distributed',
  sourceDuplicationTarget: 'src+scripts',
  testDuplicationTarget: 'test',
  laneM4c: 'm4c',
  semanticFallbackSuffix: '_semantic_split',
  classDeclaredOwner: 'declared-owner-rule',
  classOwnerAreaFallback: 'owner-area-fallback',
  classTestOwnerArea: 'test-owner-area',
  classToolOwnerArea: 'tool-owner-area',
  assignmentDuplicateError: 'source debt signals contain duplicate identities',
  reconciliationError: 'owner-debt inventory reconciliation failed',
  staleImportGraphError:
    'owner-debt import graph report is stale; rerun with --refresh',
  childProof:
    'focused behavior or decision-trace parity, scoped strict metrics, and a lower committed global signal count',
  expansionRule:
    'review and commit a new inventory revision before adding another child',
  fileSizeAuthority: 'scripts/check-file-size-thresholds.js',
  lintAuthority: 'eslint.config.js',
  dependencyAuthority: 'dependency-cruiser.config.cjs',
  ownerClassifierAuthority: 'scripts/inventory-ordinal-segments.js',
});

export const OWNER_DEBT_GLOB = Object.freeze({
  start: '^',
  wildcard: '*',
  single: '?',
  recursiveDirectory: '(?:.*/)?',
  recursive: '.*',
  oneSegment: '[^/]*',
  oneCharacter: '[^/]',
  unicodeFlag: 'u',
  specialCharacters: '\\^$+?.()|{}[]',
});

export const OWNER_DEBT_REPORTS = Object.freeze({
  complexity: 'test-output/analysis/complexity-src-test.json',
  cognitive: 'test-output/analysis/cognitive-complexity-src-scripts.json',
  cycles: 'test-output/analysis/madge-circular-src-scripts-test.json',
  importGraph: 'test-output/analysis/global-owner-debt-import-graph.json',
  duplicationSource: 'test-output/analysis/jscpd-src-scripts/jscpd-report.json',
  duplicationTest: 'test-output/analysis/jscpd-test/jscpd-report.json',
});

export const OWNER_DEBT_REFRESH_COMMANDS = Object.freeze([
  ['scripts/check-complexity.js'],
  ['scripts/check-cognitive-complexity.js'],
  ['scripts/check-circular-dependencies.js'],
  ['scripts/check-duplication.js'],
]);

export const OWNER_DEBT_CHILD_LIMITS = Object.freeze({
  m2: 6,
  m3: 4,
  m4c: 6,
  pathCount: 25,
  ownerAreas: 6,
  samplePaths: 5,
  adjacentTests: 8,
});

export const OWNER_DEBT_SIGNAL_KIND = Object.freeze({
  complexity: 'complexity',
  cognitive: 'cognitive',
  fileSize: 'fileSize',
  duplication: 'duplication',
  cycle: 'cycle',
  lintExclusion: 'lintExclusion',
});

export const OWNER_DEBT_SIGNAL_WEIGHTS = Object.freeze({
  complexity: 4,
  cognitive: 8,
  fileSize: 12,
  duplication: 1,
  cycle: 50,
  lintExclusion: 3,
  duplicatedLineCap: 500,
  duplicatedLineDivisor: 10,
});

export const OWNER_DEBT_DUPLICATION_IGNORED_FIELDS = Object.freeze([
  'duplicates',
  'statistics.detectionDate',
]);

export const OWNER_DEBT_SOURCE_DIRECTORIES = Object.freeze([
  'src',
  'scripts',
  'test',
]);

export const OWNER_DEBT_JAVASCRIPT_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
]);
