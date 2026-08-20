// Canonical literal owners for change-scoped test selection.
//
// THREE QUESTIONS, THREE AUTHORITIES - they must not be conflated:
//
//   test  -> subsystem     exhaustive test-path taxonomy (subsystem-classes)
//   change -> subsystem    the source taxonomy below
//   who else must run      impact-contract registry + import graph
//
// The source taxonomy is deliberately its own table rather than a reuse of the
// test taxonomy: `test/query/**` proving the query engine does not imply that
// every source file the query engine touches lives under `src/query/`.

// The four taxonomy categories. Every candidate path belongs to exactly one.
export const CATEGORY_TEST = 'TEST';
export const CATEGORY_OWNED = 'SUBSYSTEM_OWNED';
export const CATEGORY_INERT = 'INERT';
export const CATEGORY_RELEASE_PROOF = 'RELEASE_PROOF_REQUIRED';

// How a path changed. The vanished side of a deletion and both sides of a
// rename are what a path-string list silently loses, so the status travels with
// every record rather than being inferred from whether a file still exists.
export const CHANGE_ADDED = 'added';
export const CHANGE_MODIFIED = 'modified';
export const CHANGE_DELETED = 'deleted';
export const CHANGE_RENAMED = 'renamed';

export const SELECTION_PRECISE = 'PRECISE';
export const SELECTION_WIDENED = 'WIDENED';
export const SELECTION_REFUSED = 'REFUSED';

// Why a test is in the plan. A test selected for several reasons carries all of
// them and still executes once, so --explain renders the plan rather than
// recomputing an explanation afterwards.
export const REASON_CHANGED_TEST = 'changed-test';
export const REASON_SUBSYSTEM = 'subsystem-widening';
export const REASON_IMPACT_WITNESS = 'impact-witness';
export const REASON_COUPLED_WITNESS = 'coupled-pair-witness';
export const REASON_SAFETY_SPINE = 'safety-spine';

// How the layer that ASSEMBLES a worktree declares what it injected into it.
//
// The push gate materialises the pushed tree into a throwaway worktree and
// links node_modules and data in. Those are infrastructure, not repository
// content - but git reports a symlink as an untracked file whenever the ignore
// pattern is directory-only, which silently promoted them to semantic source
// and made the exhaustive taxonomy refuse (2026-08-19).
//
// The declaration is an environment variable because the workflow supplies
// identity and environment while repository code decides what must be proved.
// Deliberately NOT "exclude every untracked symlink": a newly added symlink can
// be real product content, and dropping it would be silent under-selection -
// the one failure mode indistinguishable from success.
export const WORKSPACE_INJECTION_ENV = 'LAGRANGE_WORKSPACE_INJECTIONS';

// The ONE way a caller says which committed range this proof must cover.
//
// CI knows the identity of a change - a pull request's base and head, a push's
// before and after - and nothing else about what it means. Repository code
// decides what must be proved from that. One variable, consumed by both the
// static layer and the change proof through the same changed-path derivation,
// so `npm run check` cannot end up proving two different ranges in its two
// halves.
export const CHECK_BASE_ENV = 'LAGRANGE_CHECK_BASE';

export const SAFETY_SPINE_PATH = 'test/shards/safety-spine.json';
export const IMPACT_CONTRACTS_PATH = 'test/shards/impact-contracts.json';

// WHY modular proof is unsafe. REFUSED is still one outcome - the selector
// never silently falls back to running everything - but it says which stronger
// proof the operator must run.
export const REFUSAL_UNKNOWN_SCOPE = 'UNKNOWN_SCOPE';
export const REFUSAL_RELEASE_PROOF_REQUIRED = 'RELEASE_PROOF_REQUIRED';

// package.json is not semantically one subsystem. Editing `scripts` is dev
// tooling; editing the runtime package surface or the dependency set changes
// what every consumer installs and executes, which no subsystem proof covers.
export const PACKAGE_RELEASE_SURFACE_FIELDS = Object.freeze([
  'main',
  'exports',
  'bin',
  'files',
  'type',
  'engines',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
]);
// package.json fields that are DEVELOPMENT TOOLING and nothing else. Editing
// them changes how the repository is built and tested, never what a consumer
// installs or executes, so they belong to test-infrastructure rather than to
// the packaging surface.
//
// Without this the policy above contradicted itself: it declared that editing
// `scripts` is dev tooling, and then the path taxonomy mapped ALL of
// package.json to release-packaging, so a scripts-only edit widened into the
// packaging subsystem and dragged the npm distribution proof into ordinary CI.
export const PACKAGE_DEV_TOOLING_FIELDS = Object.freeze([
  'scripts',
  'devDependencies',
]);
export const SUBSYSTEM_TEST_INFRASTRUCTURE = 'test-infrastructure';

// Paths that change what consumers RECEIVE or EXECUTE, across every subsystem
// boundary. They are closer to package.json.exports than to an implementation
// owner: an .npmignore edit can silently add or remove shipped content without
// touching a line of product code, and no subsystem proof would notice.
export const RELEASE_SURFACE_PATHS = Object.freeze([
  'src/public-api.js',
  'Dockerfile',
  '.npmignore',
  '.dockerignore',
]);
export const RELEASE_SURFACE_PROBLEM =
  'change alters the published/shipped surface';

// Documentation is inert wherever it lives; the deny list below protects
// EXECUTABLE and configuration content, not every file under those prefixes.
export const ALWAYS_INERT_SUFFIX = '.md';

// Paths that must NEVER be treated as inert, whatever a future broad rule says.
// Inert is the largest category, so an over-broad inert rule is the one
// taxonomy defect that could silently reduce a real source change to spine-only.
export const NEVER_INERT_PREFIXES = Object.freeze([
  'src/',
  'scripts/',
  'test/',
  'wit/',
  'charts/',
  'models/',
  'examples/',
  '.github/',
  '.githooks/',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  '.npmignore',
  '.dockerignore',
]);

export const PACKAGE_MANIFEST_PATH = 'package.json';
export const PACKAGE_LOCKFILE_PATH = 'package-lock.json';
// The refusal banner is the ONE phrase a caller can grep for. It must appear
// for every refusal code, not only the release-proof one: a caller who learns
// to look for it must never meet a refusal that omits it.
export const REFUSAL_BANNER = 'MODULAR PROOF NOT SAFE';
export const RELEASE_PROOF_HINT = 'run: npm run check:release';
export const LOCKFILE_RELEASE_PROBLEM =
  'package-lock.json changes the installed dependency graph';
export const PACKAGE_SURFACE_RELEASE_PROBLEM =
  'package.json changes the runtime package surface or dependency set';
export const PACKAGE_FIELDS_UNKNOWN_PROBLEM =
  'package.json changed but its changed fields could not be determined';

export const REFUSED_UNKNOWN_OWNER_PROBLEM =
  'SAFE TEST SCOPE UNKNOWN: no owning subsystem for';
export const REFUSED_UNCLASSIFIED_TEST_PROBLEM =
  'SAFE TEST SCOPE UNKNOWN: changed test file has no subsystem classification';

// Source path -> subsystem. Ordered for reading; ALL rules are evaluated and
// more than one match is a hard error, exactly as in the test taxonomy, so
// rule order can never quietly decide what CI runs.
export const SOURCE_SUBSYSTEM_RULES = Object.freeze([
  {id: 'source-rebalancer', pattern: /^src\/rebalancer\//, subsystem: 'placement-rebalance'},
  {id: 'source-bootstrap', pattern: /^src\/(bootstrap|node|entrypoint)\/(?!.*pgwire)/, subsystem: 'bootstrap-membership'},
  {id: 'source-control-plane', pattern: /^src\/(control-plane|config|policy)\//, subsystem: 'control-plane'},
  {id: 'source-query', pattern: /^src\/(query|sql|live-query|index-management)\//, subsystem: 'query-sql'},
  {id: 'source-partition', pattern: /^src\/(partition|storage|cache)\//, subsystem: 'storage-partition'},
  {id: 'source-raft', pattern: /^src\/raft\//, subsystem: 'storage-raft'},
  {id: 'source-runtime', pattern: /^src\/(runtime|service|services|function|worker|threading)\/(?!.*pgwire)/, subsystem: 'services-runtime'},
  {id: 'source-pgwire', pattern: /^src\/.*pgwire/, subsystem: 'pgwire-compat'},
  {id: 'source-wasm', pattern: /^(src\/wasm[a-z-]*|wit)\//, subsystem: 'wasm-toolchain'},
  {id: 'source-cli', pattern: /^src\/cli\//, subsystem: 'cli-tooling'},
  {id: 'source-admin', pattern: /^src\/(admin|diagnostics|debug|debug-runtime|logging)\//, subsystem: 'admin-diagnostics'},
  {id: 'source-transport', pattern: /^src\/(transport|message-group|address)\//, subsystem: 'transport-messaging'},
  {id: 'source-cdc', pattern: /^src\/(cdc|migration|metadata)\//, subsystem: 'cdc-metadata'},
  {id: 'source-transactions', pattern: /^src\/(transaction|workflow)\//, subsystem: 'transactions'},
  {id: 'source-topology', pattern: /^src\/(topology|convergence)\//, subsystem: 'convergence-topology'},
  {id: 'source-primitives', pattern: /^src\/(utils|constants|time|random|hlc|diagnostics-primitives)\//, subsystem: 'runtime-primitives'},
  {id: 'source-distributed-harness', pattern: /^test\/distributed\//, subsystem: 'distributed-harness'},
  {id: 'source-solver-tooling', pattern: /^scripts\/solve/, subsystem: 'solver-tooling'},
  // Repository tooling. `scripts/solve*` is carved out above, so the two can
  // never both match; everything else under scripts/ is test infrastructure.
  {id: 'source-scripts', pattern: /^scripts\/(?!solve)/, subsystem: 'test-infrastructure'},
  // Generated selection state. A change here alters what CI runs, so it must
  // prove the machinery that reads it rather than being treated as inert.
  {id: 'source-shard-manifests', pattern: /^test\/(shards|manifests)\//, subsystem: 'test-infrastructure'},
  {id: 'source-workflows', pattern: /^\.github\//, subsystem: 'test-infrastructure'},
  // The package manifest and lockfile are the packaging surface. A dependency
  // change is broader than any single subsystem; see the four-command table in
  // docs/steering/testing-guidelines/harness.md for when that escalates to
  // check:release.
  {id: 'source-package', pattern: /^package(-lock)?\.json$/, subsystem: 'release-packaging'},
  // Non-test files under test/: harness code, helpers and fixtures. Test FILES
  // route through the sealed classification manifest instead, so these rules
  // only ever see support code.
  {id: 'source-test-solve', pattern: /^test\/solve\//, subsystem: 'solver-tooling'},
  {id: 'source-test-support', pattern: /^test\/(scripts|fixtures|test-helpers|helpers)\//, subsystem: 'test-infrastructure'},
  {id: 'source-test-area', pattern: /^test\/(?!distributed\/|solve\/|scripts\/|fixtures\/|test-helpers\/|helpers\/|shards\/|manifests\/)[a-z-]+\//, subsystem: 'test-infrastructure'},
  {id: 'source-entrypoint-root', pattern: /^src\/(boot\/|embedded-lagrange|entrypoint-|index\.js|sea-entry\.js|lagrange-runtime-)/, subsystem: 'bootstrap-membership'},
  // The published API surface and the single-executable packaging path.
  {id: 'source-public-api', pattern: /^src\/(public-api\.js|sea\/)/, subsystem: 'release-packaging'},
  {id: 'source-authoring', pattern: /^src\/(authoring|invariants)\//, subsystem: 'architecture-governance'},
  // Repository configuration. Packaging-visible ignore files ship consequences
  // to consumers; hook and tooling config only affects the development loop.
  {id: 'source-package-ignores', pattern: /^\.(npmignore|dockerignore)$/, subsystem: 'release-packaging'},
  // Build, packaging and toolchain configuration at the repository root.
  {id: 'source-build-config', pattern: /^(Dockerfile|sea-config[a-z-]*\.json)$/, subsystem: 'release-packaging'},
  {id: 'source-toolchain-config', pattern: /^(eslint\.config\.js|knip\.json|dependency-cruiser\.config\.cjs|dependency-policy\.json|stryker\.config\.json)$/, subsystem: 'test-infrastructure'},
  {id: 'source-repo-config', pattern: /^\.(githooks\/|taprc|gitignore|gitattributes|env\.example|nvmrc|editorconfig)/, subsystem: 'test-infrastructure'},
  {id: 'source-src-support', pattern: /^src\/test-helpers\//, subsystem: 'test-infrastructure'},
  // Deployment and example surfaces ship to users, so they belong to packaging
  // and to the end-to-end examples rather than to any runtime subsystem.
  {id: 'source-charts', pattern: /^charts\//, subsystem: 'release-packaging'},
  {id: 'source-examples', pattern: /^examples\//, subsystem: 'examples-e2e'},
  {id: 'source-models', pattern: /^models\//, subsystem: 'architecture-governance'},
]);

// Paths that cannot affect behaviour, so they neither widen nor refuse. Kept
// deliberately short: anything not provably inert must reach the taxonomy.
export const INERT_PATH_RULES = Object.freeze([
  /^\.vscode\//,
  /^LICENSE$/,
  /^docs\//,
  /^solve\//,
  /^architecture\//,
  /\.md$/,
]);
