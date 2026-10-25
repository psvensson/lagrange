import {test} from 'tap';
import {
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsFromSource,
  VIOLATION_KIND,
} from '../../scripts/check-guideline-decision-boundaries.js';
import fs from 'node:fs/promises';

const CALLER = 'src/bootstrap/phases/seed-partitions-phase.js';
const METHOD = 'createBootstrapPartitionReplica';

function mixed(findings) {
  return findings.filter((finding) => finding.functionName === METHOD &&
    finding.kind === VIOLATION_KIND.MIXED_CACHE_AND_SQL);
}

test('collector proves the real seed constructor injection; source alone cannot', async (t) => {
  const source = await fs.readFile(CALLER, 'utf8');
  t.equal(mixed(collectDecisionBoundaryViolationsFromSource(source, CALLER)).length, 1,
    'unproved source retains conservative evidence');
  const report = await collectDecisionBoundaryViolations([CALLER]);
  t.same(mixed(report.violations), [], 'actual verified dependency injection is passive');
});

const DELEGATES = 'src/bootstrap/bootstrap-service-seed-delegates.js';
const RUNTIME = 'src/bootstrap/bootstrap-service-runtime-methods.js';
const CDC = 'src/cdc/cdc-integration-service.js';
const PARTITION = 'src/partition/partition-service.js';
const SERVICE = 'src/bootstrap/bootstrap-service.js';
const ASSERT = 'src/utils/assert.js';
const WORKFLOW = 'src/bootstrap/bootstrap-service-seed-workflow.js';
const CONTROL_RUNTIME = 'src/bootstrap/bootstrap-service-control-plane-runtime-methods.js';
const FILES = [CALLER, DELEGATES, RUNTIME, CDC, PARTITION, SERVICE, ASSERT,
  WORKFLOW,
  'src/bootstrap/bootstrap-service-replica-registration-methods.js',
  CONTROL_RUNTIME];
const CACHE = 'systemTableCache: d.getSystemTableCache(),';
const ENGINE = 'sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine,';
const CONSTRUCTION = 'const partition = new PartitionService({';

const MUTATIONS = [
  ['cache row read', CALLER, CACHE, 'systemTableCache: d.getSystemTableCache().get("key"),'],
  ['SQL operation', CALLER, ENGINE,
    'sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine.query("SELECT 1"),'],
  ['unknown cache call', CALLER, CACHE, 'systemTableCache: unknown(d.getSystemTableCache()),'],
  ['unknown engine call', CALLER, ENGINE,
    'sqlQueryEngine: unknown(cdcIntegrationService?.sqlQueryEngine),'],
  ['computed cache getter', CALLER, CACHE, 'systemTableCache: d[cacheAccessor](),'],
  ['computed engine getter', CALLER, ENGINE,
    'sqlQueryEngine: cdcIntegrationService?.["sqlQueryEngine"],'],
  ['computed option key', CALLER, CACHE, '["systemTableCache"]: d.getSystemTableCache(),'],
  ['option accessor', CALLER, ENGINE,
    'get sqlQueryEngine() { return cdcIntegrationService?.sqlQueryEngine; },'],
  ['extra cache getter argument', CALLER, CACHE, 'systemTableCache: d.getSystemTableCache(1),'],
  ['cache fallback', CALLER, CACHE, 'systemTableCache: d.getSystemTableCache() ?? cacheRow,'],
  ['engine mutation', CALLER, ENGINE,
    'sqlQueryEngine: (cdcIntegrationService.sqlQueryEngine = queryRow),'],
  ['rebound delegate', CALLER, 'const d = this.delegates;',
    'let d = this.delegates; d = other;'],
  ['rebound CDC handle', CALLER, CONSTRUCTION,
    `cdcIntegrationService.sqlQueryEngine = other; ${CONSTRUCTION}`],
  ['delegate mutation', CALLER, CONSTRUCTION,
    `d.getSystemTableCache = other; ${CONSTRUCTION}`],
  ['delegate alias escapes', CALLER, CONSTRUCTION,
    `const alias = d; alias.getSystemTableCache = unknown; ${CONSTRUCTION}`],
  ['unknown call receives delegate', CALLER, CONSTRUCTION, `unknown(d); ${CONSTRUCTION}`],
  ['unknown call receives CDC owner', CALLER, CONSTRUCTION,
    `unknown(cdcIntegrationService); ${CONSTRUCTION}`],
  ['phase delegate replacement', CALLER, CONSTRUCTION,
    `this.delegates = other; ${CONSTRUCTION}`],
  ['shadowed constructor', CALLER, CONSTRUCTION,
    `const PartitionService = other; ${CONSTRUCTION}`],
  ['shadowed constructor parameter', CALLER, CONSTRUCTION,
    `const unused = ({PartitionService}) => PartitionService; ${CONSTRUCTION}`],
  ['wrong constructor module', CALLER, 'from \'../../partition/partition-service.js\'',
    'from \'../../partition/imposter.js\''],
  ['wrong constructor export', CALLER, 'import {PartitionService}',
    'import {Imposter as PartitionService}'],
  ['unknown CDC provider', CALLER, 'const cdcIntegrationService = d.getCdcIntegrationService();',
    'const cdcIntegrationService = d.getOtherCdcIntegrationService();'],
  ['delegates accessor', CALLER, 'class SeedPartitionsPhase {',
    'class SeedPartitionsPhase { get delegates() { return unknown(); }'],
  ['neighbor actual mixed reads', CALLER, CONSTRUCTION,
    `cache.get("key"); db.query("SELECT 1"); ${CONSTRUCTION}`],
  ['provider cache read', RUNTIME, 'this.peekSystemTableCache(),',
    'this.peekSystemTableCache().get("key"),'],
  ['provider unknown call', DELEGATES,
    'getSystemTableCache: () => self.getSystemTableCache(),',
    'getSystemTableCache: () => unknown(self.getSystemTableCache()),'],
  ['provider computed accessor', RUNTIME, 'getSystemTableCache() {',
    '["getSystemTableCache"]() {'],
  ['provider handle fallback reads', RUNTIME, 'return svc.systemTableCache;',
    'return svc.systemTableCache.get("key");'],
  ['CDC field becomes getter', CDC, 'class CDCIntegrationService extends EventEmitter {',
    'class CDCIntegrationService extends EventEmitter { get sqlQueryEngine() { return db.query(); }'],
  ['CDC field initialization reads', CDC, 'this.sqlQueryEngine = options.sqlQueryEngine || null;',
    'this.sqlQueryEngine = options.sqlQueryEngine.query() || null;'],
  ['later computed provider override', RUNTIME, 'peekSystemTableCache() {',
    '[key]() { return cache.query(); }, peekSystemTableCache() {'],
  ['runtime delegate bundle overwritten', DELEGATES,
    '...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING],',
    '...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING], ...unknown,'],
  ['actual phase receives different provider', SERVICE,
    'this.seedPartitionsPhase = new SeedPartitionsPhase({\n      delegates: seedDelegates,',
    'this.seedPartitionsPhase = new SeedPartitionsPhase({\n      delegates: unknown,'],
  ['dependency assertion reads', ASSERT, '  return value;', '  return db.query(value);'],
  ['CDC owner escapes to unknown call', CDC,
    'this.sqlQueryEngine = options.sqlQueryEngine || null;',
    'this.sqlQueryEngine = options.sqlQueryEngine || null; unknown(this);'],
  ['CDC engine overwritten after initialization', CDC,
    'this.sqlQueryEngine = options.sqlQueryEngine || null;',
    'this.sqlQueryEngine = options.sqlQueryEngine || null; this.sqlQueryEngine = db.query();'],
  ['CDC runtime getter installation', CDC, 'this.sqlQueryEngine = options.sqlQueryEngine || null;',
    'this.sqlQueryEngine = options.sqlQueryEngine || null; ' +
    'Object.defineProperty(this, "sqlQueryEngine", {get() { return db.query(); }});'],
  ['phase receiver escapes before capture', CALLER, 'const d = this.delegates;',
    'Object.defineProperty(this, "delegates", {get() { return unknown(); }}); ' +
    'const d = this.delegates;'],
  ['composed delegates escape to mutation', SERVICE,
    'this.seedInfrastructurePhase = new SeedInfrastructurePhase({',
    'Object.assign(seedDelegates, {getSystemTableCache: () => cache.get("key")}); ' +
    'this.seedInfrastructurePhase = new SeedInfrastructurePhase({'],
  ['final installed accessor overridden', SERVICE,
    'export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};',
    'Object.assign(BootstrapService.prototype, {getSystemTableCache() { ' +
    'return this.systemTableCache.get("key"); }});\n' +
    'export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};'],
  ['runtime provider not installed', SERVICE, '  createBootstrapServiceRuntimeMethods(),', '  {},'],
  ['runtime factory returns another object', RUNTIME,
    'function createBootstrapServiceRuntimeMethods() {',
    'function createBootstrapServiceRuntimeMethods() { return Object.create(null);'],
  ['delegate factory returns another object', DELEGATES,
    'function createBootstrapServiceSeedDelegateMethods() {',
    'function createBootstrapServiceSeedDelegateMethods() { return Object.create(null);'],
  ['bundle mutated before composition', SERVICE,
    '    const seedDelegates = this._composeSeedDelegates(',
    '    Object.assign(delegateBundles, {runtimeWiring: {getSystemTableCache: ' +
    '() => this.systemTableCache.get("key")}});\n' +
    '    const seedDelegates = this._composeSeedDelegates('],
  ['unknown constructor mutates forwarded provider', SERVICE,
    '    this.seedInfrastructurePhase = new SeedInfrastructurePhase({',
    '    new class { constructor({delegates}) { const old = delegates.getSystemTableCache; ' +
    'delegates.getSystemTableCache = () => old().get("key"); } }({delegates: seedDelegates});\n' +
    '    this.seedInfrastructurePhase = new SeedInfrastructurePhase({'],
  ['prototype escapes through alias', SERVICE,
    'export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};',
    'const target = BootstrapService.prototype; Object.assign(target, {getSystemTableCache() {' +
    ' return this.systemTableCache.get("key"); }});\n' +
    'export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};'],
  ['instance field shadows installed provider', SERVICE,
    '    const delegateBundles = this._buildSeedDelegateBundles();',
    '    this.getSystemTableCache = () => this.systemTableCache.get("key");\n' +
    '    const delegateBundles = this._buildSeedDelegateBundles();'],
  ['composed workflow overrides delegate method', WORKFLOW,
    'function createBootstrapServiceSeedWorkflowMethods() {\n  return {',
    'function createBootstrapServiceSeedWorkflowMethods() {\n  return {' +
    ' _composeSeedDelegates() { return unknown(); },'],
  ['nested runtime spread overrides delegate method', CONTROL_RUNTIME,
    'function createBootstrapServiceControlPlaneRuntimeMethods() {\n  return {',
    'function createBootstrapServiceControlPlaneRuntimeMethods() {\n  return {' +
    ' _buildRuntimeWiringDelegates() { return unknown(); },'],
  ['bundle builder executes mutation before returning', DELEGATES,
    'function buildPhaseExecutionDelegates(service) {',
    'function buildPhaseExecutionDelegates(service) { unknown(service);'],
  ['bundle builder supplies computed property', DELEGATES,
    '    assertOriginalSeedAttempt: () => self.assertOriginalSeedAttempt(),',
    '    [unknown()]: () => self.assertOriginalSeedAttempt(),'],
  ['own descriptor shadows installed provider', SERVICE,
    '    Object.defineProperties(this, {',
    '    Object.defineProperties(this, {getSystemTableCache: ' +
    '{value: () => this.systemTableCache.get("key")},'],
  ['own bulk assignment shadows installed provider', SERVICE,
    '    const delegateBundles = this._buildSeedDelegateBundles();',
    '    Object.assign(this, {getSystemTableCache: () => this.systemTableCache.get("key")});\n' +
    '    const delegateBundles = this._buildSeedDelegateBundles();'],
  ['constructor reexport changes', PARTITION, 'from \'./partition-service-assembly.js\'',
    'from \'./imposter.js\''],
];

test('owned injection proof refuses adversarial argument and provider changes', async (t) => {
  const {default: os} = await import('node:os');
  const {default: path} = await import('node:path');
  const {loadSeedConstructorInjectionProof} = await import(
    '../../scripts/checks/decision-boundary-seed-injection.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-injection-audit-'));
  t.teardown(() => fs.rm(root, {recursive: true, force: true}));
  const sources = new Map();
  for (const file of FILES) {
    sources.set(file, await fs.readFile(file, 'utf8'));
    await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true});
    await fs.writeFile(path.join(root, file), sources.get(file));
  }
  const check = async (source = sources.get(CALLER)) => {
    const constructionContext = await loadSeedConstructorInjectionProof(root);
    return mixed(collectDecisionBoundaryViolationsFromSource(
      source, path.join(root, CALLER), {constructionContext}));
  };
  t.same(await check(), [], 'real owner bytes pass in an isolated collector root');
  for (const [name, file, before, after] of MUTATIONS) {
    const original = sources.get(file);
    // The delegate accessor is intentionally checked in every bundle, including
    // the final runtime wiring override that supplies the phase's actual handle.
    t.ok(original.includes(before), `${name}: mutation engages actual source`);
    const mutated = original.replaceAll(before, after);
    await fs.writeFile(path.join(root, file), mutated);
    t.equal((await check(file === CALLER ? mutated : sources.get(CALLER))).length, 1,
      `${name}: conservative mixed evidence remains`);
    await fs.writeFile(path.join(root, file), original);
  }
  t.same(await check(), [], 'restoring exact current owner bytes restores the proof');
  const unrelated = sources.get(SERVICE).replace('    this.lastError = null;',
    '    void 0; this.lastError = null;');
  await fs.writeFile(path.join(root, SERVICE), unrelated);
  t.same(await check(), [], 'unrelated constructor work is not covered by a whole-function hash');
  await fs.writeFile(path.join(root, SERVICE), sources.get(SERVICE));
  const proof = await loadSeedConstructorInjectionProof(root);
  const source = sources.get(CALLER);
  t.equal(mixed(collectDecisionBoundaryViolationsFromSource(source, CALLER,
    {constructionContext: proof})).length, 1, 'proof cannot move to another source root');
  t.equal(mixed(collectDecisionBoundaryViolationsFromSource(`${source}\n`, path.join(root, CALLER),
    {constructionContext: proof})).length, 1, 'proof cannot move to other caller bytes');
  t.equal(mixed(collectDecisionBoundaryViolationsFromSource(source, path.join(root, CALLER),
    {constructionContext: {}})).length, 1, 'plain data cannot forge collector proof');
  await fs.rm(path.join(root, CDC));
  t.equal((await check()).length, 1, 'missing owner revokes proof');
});

test('injection proof resists replaced intrinsics and forged capability inheritance', async (t) => {
  const {parseSourceFile} = await import('../../scripts/guideline-check-shared.js');
  const {loadSeedConstructorInjectionProof, verifiedSeedConstructorInputs} = await import(
    '../../scripts/checks/decision-boundary-seed-injection.js');
  const source = await fs.readFile(CALLER, 'utf8');
  const ast = parseSourceFile(source);
  const context = await loadSeedConstructorInjectionProof();
  t.equal(verifiedSeedConstructorInputs(ast, source, CALLER, context).length, 2,
    'both exact provider arguments engage the production proof');
  t.same(verifiedSeedConstructorInputs(ast, source, CALLER, Object.create(context)), [],
    'inheriting a valid capability does not confer it');
  const originals = new Map([
    [Array.prototype, ['some', 'every', 'find', 'filter', 'includes', 'slice', 'indexOf']],
    [Set.prototype, ['has']], [WeakMap.prototype, ['get']],
  ].map(([owner, names]) => [owner, names.map((name) => [name, owner[name]])]));
  let proved;
  let forged;
  const objectPrototype = Object.getPrototypeOf({});
  const originalToJSON = Object.getOwnPropertyDescriptor(objectPrototype, 'toJSON');
  try {
    Object.defineProperty(objectPrototype, 'toJSON', {
      configurable: true, value: () => ({}),
    });
    for (const [owner, methods] of originals) {
      for (const [name] of methods) {
        owner[name] = () => {
          throw new Error('ambient call');
        };
      }
    }
    proved = verifiedSeedConstructorInputs(ast, source, CALLER, context);
    forged = verifiedSeedConstructorInputs(ast, source, CALLER, {});
  } finally {
    for (const [owner, methods] of originals) {
      for (const [name, original] of methods) owner[name] = original;
    }
    if (originalToJSON) Object.defineProperty(objectPrototype, 'toJSON', originalToJSON);
    else delete objectPrototype.toJSON;
  }
  t.equal(proved.length, 2, 'captured intrinsics and own AST normalization preserve exact proof');
  t.same(forged, [], 'a replaced WeakMap method cannot manufacture a proof');
});
