#!/usr/bin/env node
// Diagnostic evidence only. The CLI reads one compact receipt, never builds or packs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parse} from 'acorn';
import {simple} from 'acorn-walk';

export const SOURCE = '5e58474b13870c95ea6bd6175942c33984cd6ac9';
export const CANDIDATE_PATHS = Object.freeze(['scripts/npm-package-copy-diagnostic.js',
  'scripts/checks/npm-copy-feasibility-evidence.js',
  'test/scripts/npm-copy-feasibility-evidence.test.js',
  'solve/quests/npm-copy-feasibility/quest.json']);
export const REQUIRED_ARTIFACT_PATHS = Object.freeze(['candidate.json', 'toolchain.json',
  'config.json', 'source.tar', 'baseline-binding.json', 'baseline.json', 'run.json',
  'controls.json', 'cli-controls.json', 'receipt-controls.json', 'validation.json',
  ...['a', 'b'].flatMap((root) => ['input-inventory.json', 'classification.json',
    'metafile.json', 'original-metafile.json', 'copy-loads.json', 'emissions.json',
    'verified-stage.json', 'npm-pack.json', 'tar-members.json', 'tar-list.txt',
    'packed/lagrange-server-0.4.0.tgz'].map((name) => `${root}/${name}`))]);
export const LIMITS = Object.freeze({entries: 2100, packed: 8 * 1024 * 1024,
  unpacked: 25 * 1024 * 1024});
export const ENTRIES = Object.freeze([
  'src/public-api.js', 'src/sea-entry.js', 'src/cli/bin/lagrange-admin.js',
  'src/threading/service-worker.js', 'src/runtime/wasi-component-cell-worker.js',
  'src/runtime/wasi-component-derivation-worker.js', 'src/lagrange-runtime-startup.js',
  'src/cli/service-lifecycle-sql-client.js', 'src/service/service-local-oci-layout-builder.js',
]);
export const RAW_ROOTS = Object.freeze([
  'src/admin/admin-test-run-service.js', 'src/cli/service-wasm-scaffold.js',
  'src/diagnostics/runtime-build-provenance.js', 'src/entrypoint-runtime-provenance.js',
  'src/raft/raft-rs-binding-owner.js', 'src/runtime/wasi-component-cell-runtime.js',
  'src/runtime/wasi-component-derivation.js', 'src/service/service-component-build.js',
  'src/threading/service-thread-manager.js', 'src/cli/cutover-router.js',
  'src/cli/bulk-load-router.js', 'src/cli/service-pipeline-router.js',
  'src/embedded-lagrange.js', 'src/authoring/index.js',
]);
const COMPUTED = Object.freeze([
  ['src/cli/bulk-load-router.js', 'SQL_CLIENT_SPECIFIER', './service-lifecycle-sql-client.js'],
  ['src/cli/cutover-router.js', 'SQL_CLIENT_SPECIFIER', './service-lifecycle-sql-client.js'],
  ['src/cli/service-pipeline-router.js', 'SQL_CLIENT_SPECIFIER',
    './service-lifecycle-sql-client.js'],
  ['src/cli/service-pipeline-router.js', 'LOCAL_OCI_LAYOUT_BUILDER_SPECIFIER',
    '../service/service-local-oci-layout-builder.js'],
  ['src/embedded-lagrange.js', 'STARTUP_MODULE_SPECIFIER', './lagrange-runtime-startup.js'],
  ['src/service/service-component-build.js', 'COMPONENTIZE_SPECIFIER',
    '@bytecodealliance/componentize-js'],
  ['src/service/service-component-build.js', 'ESBUILD_SPECIFIER', 'esbuild'],
  ['src/runtime/wasi-component-cell-worker.js', 'moduleUrl', null],
  ['src/service/service-source-contract.js', 'url', null],
]);
export const CEILING = Object.freeze({runtimeIdentity: 'NOT_MEASURED',
  importOrder: 'NOT_MEASURED', runtimeProvenance: 'NOT_MEASURED',
  sourceDigest: 'NOT_MEASURED', delivery: 'NOT_MEASURED', release: 'NOT_MEASURED'});
export const CONTROLS = Object.freeze(['missing-worker', 'missing-computed', 'changed-asset',
  'input-root-external', 'raw-compiled-overlap', 'forged-count', 'forged-hash', 'raw-as-js', 'renamed-copy', 'missing-raw-child',
  'conflicting-output']);
export const CLI_CONTROLS = Object.freeze(['existing-failure', 'existing-empty',
  'probe-existing', 'probe-fresh', 'fresh-postadmission', 'postadmission-retry']);
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const digest = (value) => hash(JSON.stringify(value));
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export class GraphRefusal extends Error {}
export function requireFact(condition, reason) {
  if (!condition) throw new GraphRefusal(reason);
}
export function safePath(name) {
  requireFact(canonicalPath(name), `unsafe-path:${name}`);
  return name;
}
function canonicalPath(name) {
  return typeof name === 'string' && !/[?#\\]/u.test(name) &&
    !name.includes(String.fromCharCode(0)) &&
    name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
export function inventory(root, prefix = '') {
  const rows = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), {withFileTypes: true})) {
    const name = safePath(path.posix.join(prefix, entry.name));
    if (entry.isDirectory()) rows.push(...inventory(root, name));
    else {
      requireFact(entry.isFile(), `nonregular-file:${name}`);
      const bytes = fs.readFileSync(path.join(root, name));
      rows.push({path: name, size: bytes.length, sha256: hash(bytes)});
    }
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}
function internalTarget(from, specifier) {
  requireFact(!/[?#\\]/u.test(specifier), `aliased-import:${from}:${specifier}`);
  return safePath(path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)));
}
function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') :
    specifier.split('/')[0];
}
export function checkEdge(from, specifier, files, dependencies, violations = null) {
  if (specifier.startsWith('.')) {
    const target = internalTarget(from, specifier);
    requireFact(files.has(target), `missing-target:${from}:${target}`);
    return target;
  }
  requireFact(!path.isAbsolute(specifier) && !specifier.startsWith('file:'),
    `escaping-import:${from}:${specifier}`);
  const declared = isBuiltin(specifier) ||
    dependencies.has(packageName(specifier));
  const reason = `undeclared-import:${from}:${specifier}`;
  if (!declared && violations !== null) violations.push(reason);
  else requireFact(declared, reason);
  return specifier;
}
function parseModule(root, name) {
  const code = fs.readFileSync(path.join(root, name), 'utf8');
  const ast = parse(code, {ecmaVersion: 'latest', sourceType: 'module'});
  const edges = [];
  const computed = [];
  const constants = new Map();
  const add = (node) => {
    if (node.source) edges.push(node.source.value);
  };
  simple(ast, {
    ImportDeclaration: add, ExportNamedDeclaration: add, ExportAllDeclaration: add,
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier') return;
      if (node.init?.type === 'Literal') constants.set(node.id.name, node.init.value);
      if (node.init?.type === 'Identifier' && constants.has(node.init.name)) {
        constants.set(node.id.name, constants.get(node.init.name));
      }
    },
    ImportExpression(node) {
      if (node.source.type === 'Literal') edges.push(node.source.value);
      else computed.push(code.slice(node.source.start, node.source.end));
    },
  });
  return {edges, computed, constants};
}
function close(roots, adjacency) {
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    for (const target of adjacency.get(queue.pop()) || []) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}
function checkComputed(name, module, observed) {
  for (const expression of module.computed) {
    const declaration = COMPUTED.find(([file, expr]) => file === name && expr === expression);
    requireFact(declaration, `unknown-computed:${name}:${expression}`);
    const [, , target] = declaration;
    if (target !== null) {
      requireFact(module.constants.get(expression) === target,
        `computed-value:${name}:${expression}`);
    }
    observed.push({from: name, expression, target});
  }
}
export function classify(root, selected) {
  const files = new Set(selected.map((row) => row.path));
  const modules = [...files].filter((name) => name.startsWith('src/') && name.endsWith('.js'));
  const moduleSet = new Set(modules);
  const dependencies = new Set(Object.keys(readJson(path.join(root, 'package.json')).dependencies));
  const edges = [];
  const computed = [];
  const violations = [];
  const adjacency = new Map();
  for (const name of modules) {
    const module = parseModule(root, name);
    const targets = module.edges.map((specifier) =>
      checkEdge(name, specifier, files, dependencies, violations));
    targets.forEach((to) => edges.push({from: name, to}));
    adjacency.set(name, targets.filter((to) => moduleSet.has(to)));
    checkComputed(name, module, computed);
  }
  requireFact(computed.length === COMPUTED.length, 'computed-inventory');
  [...RAW_ROOTS, ...ENTRIES].forEach((name) => requireFact(moduleSet.has(name), `root:${name}`));
  const reachable = close([...RAW_ROOTS, ...ENTRIES], adjacency);
  const unclassified = modules.filter((name) => !reachable.has(name));
  const raw = close([...RAW_ROOTS, ...unclassified], adjacency);
  const compiled = modules.filter((name) => !raw.has(name));
  ENTRIES.forEach((name) => requireFact(!raw.has(name), `entry-is-raw:${name}`));
  return {modules: modules.sort(), edges, computed, violations, unclassified: unclassified.sort(),
    raw: [...raw].sort(), compiled: compiled.sort()};
}
export function verifySource(sourceRoot, inputRoot, selected) {
  for (const row of selected) {
    const original = fs.readFileSync(path.join(sourceRoot, safePath(row.path)));
    const actual = fs.readFileSync(path.join(inputRoot, row.path));
    if (row.path === 'package.json') {
      const manifest = JSON.parse(original);
      manifest.gitHead = SOURCE;
      requireFact(JSON.stringify(JSON.parse(actual)) === JSON.stringify(manifest), 'source-manifest');
    } else requireFact(hash(original) === hash(actual), `source-bytes:${row.path}`);
    requireFact(hash(actual) === row.sha256 && actual.length === row.size,
      `source-inventory:${row.path}`);
  }
}
function scanStageEdges(inputRoot, outputRoot, files, dependencies) {
  const finalEdges = [];
  const violations = [];
  const computed = [];
  for (const name of files) {
    if (!name.startsWith('src/') || !name.endsWith('.js')) continue;
    const module = parseModule(outputRoot, name);
    computed.push(...module.computed.map((expression) => ({from: name, expression})));
    for (const specifier of module.edges) {
      try {
        const to = checkEdge(name, specifier, files, dependencies, violations);
        finalEdges.push({from: name, to});
      } catch (error) {
        if (!(error instanceof GraphRefusal)) throw error;
        violations.push(error.message);
        finalEdges.push({from: name, specifier, to: null, refusal: error.message});
      }
    }
    const bytes = fs.readFileSync(path.join(outputRoot, name), 'utf8');
    requireFact(!bytes.includes(inputRoot) && !bytes.includes(outputRoot), `root-leak:${name}`);
  }
  return {finalEdges, violations, computed};
}
function verifyGeneratedOutput(name, detail, compiled, raw) {
  for (const input of Object.keys(detail.inputs)) {
    requireFact(!raw.has(input), `raw-output-body:${input}`);
    requireFact(compiled.has(input), `unknown-output-body:${name}:${input}`);
  }
}
function verifyCopyOutput(name, detail, rawInputs, inputRows, outputRows) {
  const input = rawInputs[0];
  requireFact(name === input, `renamed-copy:${input}:${name}`);
  requireFact(Object.keys(detail.inputs).length === 1, `competing-copy-identity:${name}`);
  const original = inputRows.get(input);
  const emitted = outputRows.get(name);
  requireFact(emitted !== undefined, `missing-copy-output:${name}`);
  requireFact(emitted.sha256 === original.sha256 && emitted.size === original.size,
    `copy-bytes:${name}`);
  requireFact(detail.bytes === original.size &&
    detail.inputs[input].bytesInOutput === original.size, `copy-attribution:${name}`);
  requireFact(detail.entryPoint === undefined, `copy-entry:${name}`);
}
function partitionOutputs(graph, metafile, inputRows, outputRows) {
  const raw = new Set(graph.raw);
  const compiled = new Set(graph.compiled);
  const copies = [];
  const generated = [];
  for (const [name, detail] of Object.entries(metafile.outputs)) {
    safePath(name);
    const rawInputs = Object.keys(detail.inputs).filter((input) => raw.has(input));
    if (raw.has(name) || rawInputs.length > 0) {
      requireFact(rawInputs.length === 1, `copy-input-identity:${name}`);
      // A raw body attributed to a generated entry/chunk is never a copy representation.
      requireFact(raw.has(name) || !compiled.has(name) && !name.startsWith('src/npm-chunks/'),
        `raw-output-body:${rawInputs[0]}`);
      verifyCopyOutput(name, detail, rawInputs, inputRows, outputRows);
      copies.push(name);
    } else {
      verifyGeneratedOutput(name, detail, compiled, raw);
      generated.push(name);
    }
  }
  return {copies: copies.sort(), generated: generated.sort()};
}
function verifyCopyLoad(load, raw, inputRows) {
  requireFact(raw.has(safePath(load.path)), `unexpected-copy-load:${load.path}`);
  const original = inputRows.get(load.path);
  requireFact(load.loader === 'copy' && load.namespace === 'file', `copy-loader:${load.path}`);
  requireFact(load.sha256 === original.sha256 && load.size === original.size,
    `copy-load-bytes:${load.path}`);
}
function verifyCompilerInputs(graph, metafile, loads, inputRows, partition) {
  const raw = new Set(graph.raw);
  const compiled = new Set(graph.compiled);
  const names = loads.map((load) => load.path).sort();
  requireFact(new Set(names).size === names.length, 'duplicate-copy-load');
  for (const load of loads) verifyCopyLoad(load, raw, inputRows);
  for (const name of Object.keys(metafile.inputs)) {
    safePath(name);
    requireFact(compiled.has(name) || raw.has(name), `unknown-compiler-input:${name}`);
    if (raw.has(name)) {
      requireFact(names.includes(name), `raw-compiled-overlap:${name}`);
      requireFact(metafile.inputs[name].bytes === inputRows.get(name).size,
        `copy-input-bytes:${name}`);
    }
  }
  for (const name of compiled) {
    requireFact(Object.hasOwn(metafile.inputs, name), `unattributed-input:${name}`);
  }
  requireFact(digest(names) === digest(partition.copies), 'copy-load-output-bijection');
  for (const name of names) {
    requireFact(Object.hasOwn(metafile.inputs, name), `missing-copy-input:${name}`);
  }
}
function verifyCrossings(graph, metafile, loads) {
  const raw = new Set(graph.raw);
  const compiled = new Set(graph.compiled);
  const crossings = graph.edges.filter((edge) => compiled.has(edge.from) && raw.has(edge.to));
  const expected = [...new Set(crossings.map((edge) => edge.to))].sort();
  const observed = loads.map((load) => load.path).sort();
  requireFact(digest(expected) === digest(observed), 'copy-crossing-targets');
  for (const edge of crossings) {
    const imports = metafile.inputs[edge.from].imports;
    requireFact(imports.some((item) => item.path === edge.to && item.external !== true),
      `copy-crossing:${edge.from}:${edge.to}`);
  }
  return crossings;
}
export function verifyEmission(graph, metafile, loads, inputInventory, outputInventory) {
  const inputRows = new Map(inputInventory.map((row) => [row.path, row]));
  const outputRows = new Map(outputInventory.map((row) => [row.path, row]));
  const partition = partitionOutputs(graph, metafile, inputRows, outputRows);
  verifyCompilerInputs(graph, metafile, loads, inputRows, partition);
  const crossings = verifyCrossings(graph, metafile, loads);
  for (const [name, detail] of Object.entries(metafile.outputs)) {
    requireFact(outputRows.has(name), `missing-emission:${name}`);
    requireFact(outputRows.get(name).size === detail.bytes, `output-size:${name}`);
  }
  return {...partition, crossings};
}
export function verifyCollisions(inputRoot, outputRoot, graph, planned) {
  const raw = new Set(graph.raw);
  const names = new Set();
  for (const row of planned) {
    const name = safePath(row.path);
    requireFact(!names.has(name), `competing-output-identity:${name}`);
    names.add(name);
    const destination = path.join(outputRoot, name);
    if (!fs.existsSync(destination)) continue;
    requireFact(fs.lstatSync(destination).isFile() && fs.realpathSync(destination) === destination,
      `nonregular-output:${name}`);
    requireFact(raw.has(name), `conflicting-output:${name}`);
    const original = fs.readFileSync(path.join(inputRoot, name));
    requireFact(hash(original) === row.sha256 && original.length === row.size,
      `conflicting-output:${name}`);
    requireFact(hash(fs.readFileSync(destination)) === row.sha256, `conflicting-output:${name}`);
  }
}
function verifyPreserved(inputInventory, outputRoot, files, compiled) {
  for (const row of inputInventory) {
    if (compiled.has(row.path)) continue;
    requireFact(files.has(row.path), `missing-preserved:${row.path}`);
    requireFact(hash(fs.readFileSync(path.join(outputRoot, row.path))) === row.sha256,
      `preserved-bytes:${row.path}`);
  }
}
function verifyGeneratedInventory(actual, graph, partition) {
  const raw = new Set(graph.raw);
  const generated = actual.filter((row) => !raw.has(row.path) && row.path.endsWith('.js') &&
    row.path.startsWith('src/')).map((row) => row.path).sort();
  requireFact(digest(generated) === digest(partition.generated), 'generated-inventory');
}
export function violationSummary(violations) {
  const dependencies = violations.filter((reason) => reason.startsWith('undeclared-import:'));
  const paths = violations.filter((reason) => !reason.startsWith('undeclared-import:'));
  const summarize = (items) => ({count: items.length, digest: digest(items),
    examples: items.slice(0, 5)});
  return {...summarize(violations), paths: summarize(paths), dependencies: summarize(dependencies)};
}
export function verifyStage(inputRoot, outputRoot, graph, metafile, loads, claimedInventory) {
  const actual = inventory(outputRoot);
  if (claimedInventory) requireFact(digest(actual) === digest(claimedInventory), 'inventory-hash');
  const files = new Set(actual.map((row) => row.path));
  const dependencies = new Set(Object.keys(readJson(path.join(inputRoot, 'package.json')).dependencies));
  const selected = inventory(inputRoot);
  verifyPreserved(selected, outputRoot, files, new Set(graph.compiled));
  for (const entry of ENTRIES) requireFact(files.has(entry), `missing-entry:${entry}`);
  for (const item of graph.computed.filter((edge) => edge.target?.startsWith('.'))) {
    checkEdge(item.from, item.target, files, dependencies);
  }
  const {finalEdges, violations, computed} = scanStageEdges(inputRoot, outputRoot,
    files, dependencies);
  const partition = verifyEmission(graph, metafile, loads, selected, actual);
  verifyGeneratedInventory(actual, graph, partition);
  return {inventory: actual, edges: finalEdges, computed, violations,
    violationSummary: violationSummary(violations), partition,
    inventoryDigest: digest(actual), graphDigest: digest(graph), edgeDigest: digest(finalEdges)};
}
export function verifyPacked(packed, rows, tarBytes, tarRows) {
  requireFact(digest(rows) === digest(tarRows), 'tar-inventory');
  requireFact(packed.entryCount === rows.length, 'packed-count');
  requireFact(packed.unpackedSize === rows.reduce((sum, row) => sum + row.size, 0),
    'unpacked-size');
  requireFact(packed.size === tarBytes.length, 'packed-size');
  const integrity = `sha512-${createHash('sha512').update(tarBytes).digest('base64')}`;
  requireFact(packed.integrity === integrity, 'packed-hash');
  const npmRows = packed.files.map(({path: name, size}) => ({path: name, size}))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
  requireFact(digest(npmRows) === digest(rows.map(({path: name, size}) => ({path: name, size}))),
    'npm-selection');
  return {entries: rows.length, packed: tarBytes.length, unpacked: packed.unpackedSize,
    tarSha256: hash(tarBytes), inventoryDigest: digest(rows)};
}
export function outcomeFor(stats, violationCount = 0) {
  if (violationCount > 0) return 'graph_refused';
  return Object.keys(LIMITS).some((key) => stats[key] > LIMITS[key]) ? 'budget_exceeded' : 'fits';
}
function checkRuns(packet, check) {
  check(packet.runs.length === 2, 'two-roots');
  for (const run of packet.runs) {
    check(Object.keys(LIMITS).every((key) => Number.isSafeInteger(run[key]) && run[key] > 0),
      'measured-sizes');
    check(/^[a-f0-9]{64}$/u.test(run.tarSha256), 'tar-hash');
    check(/^[a-f0-9]{64}$/u.test(run.inventoryDigest), 'inventory-hash');
    check(digest(run) === digest(packet.runs[0]), 'reproducibility');
  }
}
function checkControls(packet, check) {
  check(packet.controls.length === CONTROLS.length, 'control-count');
  check(packet.cliControls.length === CLI_CONTROLS.length, 'cli-control-count');
  for (const name of CLI_CONTROLS) {
    check(packet.cliControls.some((item) => item.name === name && item.passed === true),
      `cli-control:${name}`);
  }
  for (const name of CONTROLS) {
    check(packet.controls.some((control) => control.name === name && control.rejected === true &&
      typeof control.reason === 'string' && control.reason.length > 0), `control:${name}`);
  }
}
export function measurementDigest(packet) {
  const {review: _review, ...measurement} = packet;
  return digest(measurement);
}
function checkReview(packet, check) {
  check(packet.review !== null, 'review-absent');
  if (packet.review === null) return;
  check(packet.review.verdict === 'approve', 'review-verdict');
  check(packet.review.candidateDigest === packet.candidateDigest, 'review-candidate');
  check(packet.review.measurementDigest === measurementDigest(packet), 'review-measurement');
  check(/^[a-f0-9]{64}$/u.test(packet.review.sha256), 'review-hash');
  check(typeof packet.review.verifier === 'string' &&
    packet.review.verifier.startsWith('subagent:'), 'independent-verifier');
}
function checkBindings(packet, check) {
  check(receiptRows(packet.candidate, false) &&
    digest(packet.candidate) === packet.candidateDigest, 'candidate-binding');
  check(Array.isArray(packet.candidate) && packet.candidate.length === CANDIDATE_PATHS.length &&
    CANDIDATE_PATHS.every((name) => packet.candidate.some((row) => row?.path === name)),
  'candidate-membership');
  check(receiptRows(packet.artifacts, true) &&
    digest(packet.artifacts) === packet.artifactsDigest, 'artifacts-binding');
  check(Array.isArray(packet.artifacts) && REQUIRED_ARTIFACT_PATHS.every((name) =>
    packet.artifacts.some((row) => row?.path === name)), 'artifact-membership');
  check(['modules', 'raw', 'compiled', 'edges', 'unclassified', 'rawToCompiled'].every(
    (key) => Number.isSafeInteger(packet.graph[key]) && packet.graph[key] >= 0), 'graph-counts');
  check(/^[a-f0-9]{64}$/u.test(packet.graph.digest), 'graph-hash');
  check(packet.graph.unclassified <= packet.graph.raw, 'unclassified-subset');
}
function receiptRows(rows, sized) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const names = new Set();
  for (const row of rows) {
    if (!receiptRow(row, sized) || names.has(row.path)) return false;
    names.add(row.path);
  }
  return true;
}
function receiptRow(row, sized) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return false;
  return canonicalPath(row.path) && typeof row.sha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(row.sha256) &&
    (!sized || Number.isSafeInteger(row.size) && row.size >= 0);
}
export function packetErrors(packet) {
  const errors = [];
  const check = (ok, reason) => {
    if (!ok) errors.push(reason);
  };
  check(packet.schema === 'npm-copy-feasibility/1', 'schema');
  check(packet.source === SOURCE, 'source');
  check(digest(packet.limits) === digest(LIMITS), 'limits');
  check(digest(packet.ceiling) === digest(CEILING), 'ceiling');
  check(packet.outcome === outcomeFor(packet.runs[0], packet.violations.count), 'outcome');
  check(Number.isSafeInteger(packet.violations.count) && packet.violations.count >= 0,
    'violation-count');
  check(/^[a-f0-9]{64}$/u.test(packet.violations.digest), 'violation-digest');
  checkRuns(packet, check);
  checkControls(packet, check);
  check(/^[a-f0-9]{64}$/u.test(packet.artifactsDigest), 'artifacts');
  check(/^[a-f0-9]{64}$/u.test(packet.candidateDigest), 'candidate');
  check(packet.graph.raw + packet.graph.compiled === packet.graph.modules, 'classification');
  check(packet.graph.rawToCompiled === 0, 'raw-closure');
  check(packet.violations.count === packet.violations.paths.count +
    packet.violations.dependencies.count, 'violation-partition');
  check(['paths', 'dependencies'].every((key) =>
    Number.isSafeInteger(packet.violations[key].count) && packet.violations[key].count >= 0 &&
    /^[a-f0-9]{64}$/u.test(packet.violations[key].digest)), 'violation-categories');
  check(Number.isSafeInteger(packet.copyLoads.count) && packet.copyLoads.count > 0 &&
    packet.copyLoads.count <= packet.graph.raw &&
    /^[a-f0-9]{64}$/u.test(packet.copyLoads.digest), 'copy-load-binding');
  checkBindings(packet, check);
  checkReview(packet, check);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const packetPath = path.resolve(import.meta.dirname,
    '../../solve/quests/npm-copy-feasibility/evidence/packet.json');
  try {
    console.log(packetErrors(readJson(packetPath)).length);
  } catch (error) {
    console.error(`packet unavailable: ${error.message}`);
    console.log(1);
  }
}
