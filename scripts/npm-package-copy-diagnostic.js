#!/usr/bin/env node
// Offline feasibility experiment. Never imported by the production packager.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {execGit} from './checks/git-invocation.js';
import {refuseUnderProbe} from '../src/test-helpers/probe-guard.js';
import {SOURCE, LIMITS, ENTRIES, CEILING, classify, inventory, readJson, hash, digest,
  requireFact, verifySource, verifyStage, verifyPacked, outcomeFor, safePath,
  verifyEmission, verifyCollisions, violationSummary, CANDIDATE_PATHS,
} from './checks/npm-copy-feasibility-evidence.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TIMEOUT_MS = 120000;
const OUTPUT_BYTES = 64 * 1024 * 1024;
export const CONFIG = Object.freeze({bundle: true, splitting: true, format: 'esm', platform: 'node',
  target: 'node22', packages: 'external', metafile: true, write: false, minify: false,
  treeShaking: false, ignoreAnnotations: true, keepNames: true, legalComments: 'inline',
  sourcemap: false, entryNames: '[dir]/[name]', chunkNames: 'src/npm-chunks/[name]-[hash]',
  assetNames: '[dir]/[name]'});
function command(program, args, cwd = ROOT) {
  return execFileSync(program, args, {cwd, timeout: TIMEOUT_MS, maxBuffer: OUTPUT_BYTES,
    env: {...process.env, npm_config_offline: 'true', npm_config_audit: 'false',
      npm_config_fund: 'false', npm_config_update_notifier: 'false'}});
}
function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}
function extract(tarball, destination) {
  fs.mkdirSync(destination, {recursive: true});
  const members = command('tar', ['-tzf', tarball]).toString().trim().split('\n');
  members.forEach((member) => {
    requireFact(member.startsWith('package/'), `tar-prefix:${member}`);
    safePath(member.replace(/\/$/u, ''));
  });
  command('tar', ['-xzf', tarball, '-C', destination]);
  return path.join(destination, 'package');
}
function toolchain() {
  const require = createRequire(import.meta.url);
  const lock = readJson(path.join(ROOT, 'package-lock.json'));
  const packages = ['esbuild', '@esbuild/linux-x64', 'acorn', 'acorn-walk', 'tap-parser'];
  return {node: process.version, nodeSha256: hash(fs.readFileSync(process.execPath)),
    npm: command('npm', ['--version']).toString().trim(),
    lockSha256: hash(fs.readFileSync(path.join(ROOT, 'package-lock.json'))),
    packages: packages.map((name) => {
      const packageRoot = fs.realpathSync(path.join(ROOT, 'node_modules', name));
      const manifest = readJson(path.join(packageRoot, 'package.json'));
      requireFact(manifest.version === lock.packages[`node_modules/${name}`].version,
        `tool-version:${name}`);
      const files = inventory(packageRoot);
      return {name, version: manifest.version, packageRoot, files, digest: digest(files),
        entry: name.startsWith('@esbuild/') ? 'bin/esbuild' : require.resolve(name)};
    })};
}
function snapshot(root) {
  const sourceRoot = path.join(root, 'source');
  fs.mkdirSync(sourceRoot);
  const tar = execGit(['archive', '--format=tar', SOURCE, 'src', 'vendor', 'wit', 'scripts',
    '.gitignore', '.npmignore', 'package.json', 'package-lock.json',
    'README.md', 'CHANGELOG.md', 'LICENSE'], {cwd: ROOT, timeout: TIMEOUT_MS});
  const archive = path.join(root, 'source.tar');
  requireFact(hash(tar) === 'b0e7a6f9aa4e06a18e51181aea5d9a7bf69f3a8f15caa1c645d35435c7f06bac',
    'source-archive-binding');
  fs.writeFileSync(archive, tar, {flag: 'wx'});
  command('tar', ['-xf', archive, '-C', sourceRoot]);
  return sourceRoot;
}
function normalizeMetafile(meta, inputRoot, outputRoot) {
  const output = {};
  for (const [name, data] of Object.entries(meta.outputs)) {
    const relative = safePath(path.relative(outputRoot, path.resolve(inputRoot, name)));
    requireFact(!Object.hasOwn(output, relative), `competing-output-identity:${relative}`);
    output[relative] = data;
  }
  return {...meta, outputs: output};
}
function copyLoader(inputRoot, graph, loads) {
  const raw = new Set(graph.raw);
  return {name: 'diagnostic-canonical-raw-copy', setup(build) {
    build.onLoad({filter: /\.js$/}, (args) => {
      const relative = safePath(path.relative(inputRoot, args.path));
      requireFact(args.namespace === 'file' && !args.suffix, `aliased-copy-input:${relative}`);
      requireFact(fs.realpathSync(args.path) === args.path, `symlink-input:${relative}`);
      if (!raw.has(relative)) return undefined;
      const contents = fs.readFileSync(args.path);
      loads.push({path: relative, namespace: args.namespace, loader: 'copy',
        size: contents.length, sha256: hash(contents)});
      return {contents, loader: 'copy'};
    });
  }};
}
function writeEmissions(inputRoot, outputRoot, graph, result, metafile, loads) {
  const planned = result.outputFiles.map((file) => ({
    path: safePath(path.relative(outputRoot, file.path)),
    size: file.contents.length, sha256: hash(file.contents),
  }));
  // Validate the complete batch before writing its first byte.
  const partition = verifyEmission(graph, metafile, loads, inventory(inputRoot), planned);
  verifyCollisions(inputRoot, outputRoot, graph, planned);
  for (const file of result.outputFiles) {
    fs.mkdirSync(path.dirname(file.path), {recursive: true});
    if (fs.existsSync(file.path)) continue; // Already proved identical expected raw pre-copy.
    fs.writeFileSync(file.path, file.contents, {flag: 'wx'});
  }
  return {planned, partition};
}
export async function stage(inputRoot, outputRoot, graph) {
  refuseUnderProbe('npm native-copy stage');
  requireFact(!fs.existsSync(outputRoot), 'output-root-exists');
  fs.cpSync(inputRoot, outputRoot, {recursive: true, errorOnExist: true, force: false});
  for (const name of graph.compiled) fs.unlinkSync(path.join(outputRoot, safePath(name)));
  const copyLoads = [];
  const result = await esbuild.build({...CONFIG, absWorkingDir: inputRoot,
    entryPoints: ENTRIES, outbase: inputRoot, outdir: outputRoot,
    plugins: [copyLoader(inputRoot, graph, copyLoads)],
  });
  requireFact(result.warnings.length === 0, 'build-warnings');
  copyLoads.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const metafile = normalizeMetafile(result.metafile, inputRoot, outputRoot);
  const emissions = writeEmissions(inputRoot, outputRoot, graph, result, metafile, copyLoads);
  save(path.join(outputRoot, 'src/npm-copy-diagnostic.json'), {
    schema: 'npm-copy-diagnostic/1', source: SOURCE, ceiling: CEILING,
    configDigest: digest(CONFIG), graphDigest: digest(graph), esbuild: esbuild.version,
    copyLoadsDigest: digest(copyLoads), partitionDigest: digest(emissions.partition),
  });
  return {metafile, copyLoads, emissions, originalMetafile: result.metafile};
}
async function oneRun(root, baseline, sourceRoot, label) {
  const runRoot = path.join(root, label);
  const inputRoot = extract(baseline.tarballPath, path.join(runRoot, 'input'));
  const outputRoot = path.join(runRoot, 'output', 'package');
  const selected = inventory(inputRoot);
  verifySource(sourceRoot, inputRoot, selected);
  verifyPacked(baseline, selected, fs.readFileSync(baseline.tarballPath), selected);
  save(path.join(runRoot, 'input-inventory.json'), selected);
  const graph = classify(inputRoot, selected);
  save(path.join(runRoot, 'classification.json'), graph);
  const staged = await stage(inputRoot, outputRoot, graph);
  save(path.join(runRoot, 'metafile.json'), staged.metafile);
  save(path.join(runRoot, 'original-metafile.json'), staged.originalMetafile);
  save(path.join(runRoot, 'copy-loads.json'), staged.copyLoads);
  save(path.join(runRoot, 'emissions.json'), staged.emissions);
  const verified = verifyStage(inputRoot, outputRoot, graph, staged.metafile, staged.copyLoads);
  save(path.join(runRoot, 'verified-stage.json'), verified);
  const packDir = path.join(runRoot, 'packed');
  fs.mkdirSync(packDir);
  const packed = JSON.parse(command('npm', ['pack', '--json', '--ignore-scripts',
    '--offline', '--pack-destination', packDir], outputRoot))[0];
  save(path.join(runRoot, 'npm-pack.json'), packed);
  const tarball = path.join(packDir, packed.filename);
  const tarRoot = extract(tarball, path.join(runRoot, 'extracted'));
  const tarRows = inventory(tarRoot);
  save(path.join(runRoot, 'tar-members.json'), tarRows);
  fs.writeFileSync(path.join(runRoot, 'tar-list.txt'), command('tar', ['-tvzf', tarball]),
    {flag: 'wx'});
  const stats = verifyPacked(packed, verified.inventory, fs.readFileSync(tarball), tarRows);
  return {stats, graph, violations: verified.violations, copyLoads: staged.copyLoads,
    partition: verified.partition,
    runRoot, sourceRoot, inputRoot, outputRoot, tarRoot, tarball};
}
async function measureDiagnostic(root) {
  requireFact(execGit(['rev-parse', 'HEAD'], {cwd: ROOT, timeout: TIMEOUT_MS})
    .toString().trim() === SOURCE,
  'source-head');
  const changes = execGit(['diff', SOURCE, '--', 'src', 'vendor', 'wit', 'package.json',
    'package-lock.json', 'scripts/release-npm-package.js'],
  {cwd: ROOT, timeout: TIMEOUT_MS}).toString();
  requireFact(changes.length === 0, 'production-source-dirty');
  const candidate = CANDIDATE_PATHS.map((name) => ({path: name,
    sha256: hash(fs.readFileSync(path.join(ROOT, name)))}));
  save(path.join(root, 'candidate.json'), candidate);
  const tools = toolchain();
  const prior = readJson('/tmp/lagrange-npm-staging-attempt8-20261112/toolchain.json');
  requireFact(tools.nodeSha256 === prior.nodeSha256 && tools.npm === prior.npm &&
    tools.lockSha256 === prior.lockSha256, 'toolchain-binding');
  for (const item of tools.packages) {
    requireFact(item.digest === prior.packages.find((old) => old.name === item.name).digest,
      `toolchain-bytes:${item.name}`);
  }
  save(path.join(root, 'toolchain.json'), tools);
  save(path.join(root, 'config.json'), CONFIG);
  const sourceRoot = snapshot(root);
  const baselineRoot = '/tmp/lagrange-npm-staging-attempt8-20261112';
  const baseline = readJson(path.join(baselineRoot, 'baseline.json'));
  requireFact(hash(fs.readFileSync(baseline.tarballPath)) ===
    'ebade0dda67e09304687efc4652023e21257a93e6f9ca91eb746b211193213cb', 'baseline-tar-binding');
  save(path.join(root, 'baseline-binding.json'), {reused: true,
    tarballPath: baseline.tarballPath, tarSha256: hash(fs.readFileSync(baseline.tarballPath)),
    metadataSha256: hash(fs.readFileSync(path.join(baselineRoot, 'baseline.json')))});
  save(path.join(root, 'baseline.json'), baseline);
  const first = await oneRun(root, baseline, sourceRoot, 'a');
  const second = await oneRun(root, baseline, sourceRoot, 'b');
  requireFact(digest(first.stats) === digest(second.stats), 'two-root-reproducibility');
  requireFact(digest(first.graph) === digest(second.graph), 'two-root-graph');
  requireFact(digest(first.copyLoads) === digest(second.copyLoads), 'two-root-copy-loads');
  requireFact(digest(first.violations) === digest(second.violations), 'two-root-violations');
  const raw = new Set(first.graph.raw);
  const graph = {modules: first.graph.modules.length, raw: raw.size,
    compiled: first.graph.compiled.length, edges: first.graph.edges.length,
    unclassified: first.graph.unclassified.length,
    rawToCompiled: first.graph.edges.filter((edge) => raw.has(edge.from) &&
      first.graph.compiled.includes(edge.to)).length,
    digest: digest(first.graph)};
  const packet = {schema: 'npm-copy-feasibility/1', source: SOURCE, limits: LIMITS,
    ceiling: CEILING, outcome: outcomeFor(first.stats, first.violations.length), graph,
    violations: violationSummary(first.violations),
    runs: [first.stats, second.stats], candidateDigest: digest(candidate),
    candidate, controls: [], cliControls: [], review: null, artifactsRoot: root,
    copyLoads: {count: first.copyLoads.length, digest: digest(first.copyLoads)}};
  save(path.join(root, 'run.json'), {first, second, packet});
  packet.artifacts = artifactInventory(root);
  packet.artifactsDigest = digest(packet.artifacts);
  save(path.join(root, 'packet.json'), packet);
  return packet;
}
function artifactInventory(root) {
  // Large inventories and copy-load records stay in /tmp; the receipt binds their files.
  const directories = ['', 'a', 'a/packed', 'b', 'b/packed'];
  const rows = [];
  for (const directory of directories) {
    for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true})) {
      if (!entry.isFile()) continue;
      const name = safePath(path.posix.join(directory, entry.name));
      const bytes = fs.readFileSync(path.join(root, name));
      rows.push({path: name, size: bytes.length, sha256: hash(bytes)});
    }
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}
function failureDetail(error) {
  return {name: error.name, message: error.message, stack: error.stack,
    code: error.code, errno: error.errno, syscall: error.syscall, path: error.path,
    spawnargs: error.spawnargs, status: error.status, signal: error.signal,
    cause: error.cause ? failureDetail(error.cause) : null, stdout: error.stdout?.toString(),
    stderr: error.stderr?.toString()};
}
export async function runDiagnostic(root) {
  refuseUnderProbe('npm copy diagnostic');
  requireFact(path.resolve(root).startsWith('/tmp/'), 'temporary-root-required');
  fs.mkdirSync(root); // Only a new, exclusively acquired directory is ours to write.
  try {
    return await measureDiagnostic(root);
  } catch (error) {
    fs.writeFileSync(path.join(root, 'first-unexpected.json'),
      JSON.stringify(failureDetail(error), null, 2) + '\n', {flag: 'wx'});
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] || path.join(os.tmpdir(), `lagrange-npm-copy-${Date.now()}`);
  runDiagnostic(root).then((packet) => console.log(JSON.stringify(packet, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify(failureDetail(error), null, 2));
      process.exitCode = 1;
    });
}
