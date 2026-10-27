// Dedicated one-measurement Madge adapter. Source reads use precinct's
// documented fileSystem injection; resolution uses resolve.sync's documented
// filesystem hooks. The installed analyzers remain the sole parsing,
// resolution and cycle owners. No Node/fs ambient intrinsic is replaced.
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {metricDigest} from './metric-report-inputs.js';
import {createCycleInputFacts} from './metric-cycle-input-facts.js';

const DEPENDENCY_TREE = 'dependency-tree';
const CABINET = 'filing-cabinet';
const RESOLVE = 'resolve';
const GENERIC_RESOLVER = 'resolve-dependency-path';
// This branch has no injectable I/O API. Its audited implementation is pure
// path computation; an upgrade/patch must be re-audited before this route seals.
const GENERIC_RESOLVER_DIGEST =
  '7f605777614c14f9a4d1b4aa92039a1c0332e1b1c80ba7e8b58f4b7763f32108';
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.jsx']);
const HOOKED_MODULE_TYPES = new Set(['commonjs', 'es6']);
const ROUTE_UNBOUND = 'unbound';
const ROUTE_HOOKED = 'hooked-resolve';
const ROUTE_GENERIC = 'pure-generic';
const MADGE = 'madge';
const RESOLVER_ESCAPE = 'cycle resolver escaped its analyzer resolution';
const COLD_ANALYZER_REQUIRED = 'cycle analyzer must start before dependency-tree is loaded';
const PACKAGE_MANIFEST = 'package.json';
const FILE_EXTENSIONS = ['js'];
const REQUIRE_CONFIG = 'config';
const WEBPACK_CONFIG = 'webpackConfig';
const TYPESCRIPT_CONFIG = 'tsConfig';
const MODULE_CONFIG = 'nodeModulesConfig';
const CUSTOM_CONFIGS = [REQUIRE_CONFIG, WEBPACK_CONFIG, TYPESCRIPT_CONFIG, MODULE_CONFIG];

function assertGraphCoverage(analysis, journal, resolutions, root) {
  const graph = analysis.obj();
  const edges = new Set(resolutions.map((resolution) =>
    JSON.stringify([resolution.filename, resolution.result])));
  const partials = new Set(resolutions.map((resolution) => resolution.partial));
  for (const [source, dependencies] of Object.entries(graph)) {
    const filename = path.resolve(root, source);
    if (!journal.reads.has(filename)) throw new Error(`unbound cycle source read: ${source}`);
    for (const dependency of dependencies) {
      const target = path.resolve(root, dependency);
      if (!edges.has(JSON.stringify([filename, target]))) {
        throw new Error(`unbound cycle edge: ${source} -> ${dependency}`);
      }
    }
  }
  for (const skipped of analysis.warnings().skipped) {
    if (!partials.has(skipped)) {
      throw new Error(`unbound cycle resolution warning: ${skipped}`);
    }
  }
}

function resolutionRoute(resolution, options, cabinet, request) {
  if (CUSTOM_CONFIGS.some((key) => options[key])) return ROUTE_UNBOUND;
  const extension = path.extname(options.filename);
  if (JAVASCRIPT_EXTENSIONS.has(extension) &&
      HOOKED_MODULE_TYPES.has(resolution.moduleType) && resolution.route === ROUTE_HOOKED) {
    return ROUTE_HOOKED;
  }
  if (cabinet.supportedFileExtensions.includes(extension)) {
    return ROUTE_UNBOUND;
  }
  const genericFile = request.resolve(GENERIC_RESOLVER);
  return metricDigest(fs.readFileSync(genericFile)) === GENERIC_RESOLVER_DIGEST ?
    ROUTE_GENERIC : ROUTE_UNBOUND;
}

function installResolutionObserver(request, journal) {
  const cabinetPath = request.resolve(CABINET);
  const cabinet = request(CABINET);
  const cabinetRequest = createRequire(cabinetPath);
  const resolver = cabinetRequest(RESOLVE);
  const originalResolve = resolver.sync;
  const resolutions = [];
  let active;
  let enabled = true;
  resolver.sync = (specifier, options) => {
    if (!enabled) return originalResolve(specifier, options);
    if (!active) throw new Error(RESOLVER_ESCAPE);
    if (Object.keys(journal.fileSystem).some((key) => Object.hasOwn(options, key))) {
      const error = new Error(`unbound custom cycle filesystem: ${specifier}`);
      journal.fail(error);
      throw error;
    }
    active.route = ROUTE_HOOKED;
    return originalResolve(specifier, {...options, ...journal.fileSystem});
  };
  const observedCabinet = (options) => {
    if (!enabled) return cabinet(options);
    const resolution = {filename: path.resolve(options.filename),
      partial: options.partial, route: ROUTE_UNBOUND};
    active = resolution;
    try {
      const result = cabinet(options);
      resolution.result = result ? path.resolve(result) : null;
      if (result) journal.kind(result);
      resolution.route = resolutionRoute(resolution, options, cabinet, cabinetRequest);
      if (resolution.route === ROUTE_UNBOUND) {
        journal.fail(new Error(`unbound cycle resolver route: ${options.filename}`));
      }
      resolutions.push(resolution);
      return result;
    } finally {
      active = undefined;
    }
  };
  Object.assign(observedCabinet, cabinet);
  observedCabinet._getJSType = (options) => {
    const type = cabinet._getJSType(options);
    if (enabled && active) active.moduleType = type;
    return type;
  };
  request.cache[cabinetPath].exports = observedCabinet;
  return {resolutions, restore() {
    enabled = false;
    resolver.sync = originalResolve;
    request.cache[cabinetPath].exports = cabinet;
  }};
}

export async function analyzeMetricCycles(root, targets) {
  const request = createRequire(path.join(root, PACKAGE_MANIFEST));
  const madgeRequest = createRequire(request.resolve(MADGE));
  const treePath = madgeRequest.resolve(DEPENDENCY_TREE);
  if (request.cache[treePath]) {
    throw new Error(COLD_ANALYZER_REQUIRED);
  }
  const journal = createCycleInputFacts(root);
  const observer = installResolutionObserver(createRequire(treePath), journal);
  try {
    const madge = request(MADGE);
    const analysis = await madge(targets, {baseDir: root, fileExtensions: FILE_EXTENSIONS,
      detectiveOptions: {fileSystem: journal.fileSystem}});
    assertGraphCoverage(analysis, journal, observer.resolutions, root);
    return {analysis, inputs: journal.finish()};
  } finally {
    observer.restore();
  }
}
