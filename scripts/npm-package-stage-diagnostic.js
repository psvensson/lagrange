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
} from './checks/npm-staging-feasibility-evidence.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TIMEOUT_MS = 120000;
const OUTPUT_BYTES = 64 * 1024 * 1024;
const CONFIG = Object.freeze({bundle: true, splitting: true, format: 'esm', platform: 'node',
  target: 'node22', packages: 'external', metafile: true, write: false, minify: false,
  treeShaking: false, ignoreAnnotations: true, keepNames: true, legalComments: 'inline',
  sourcemap: false, entryNames: '[dir]/[name]', chunkNames: 'src/npm-chunks/[name]-[hash]'});
const CANDIDATE_PATHS = Object.freeze(['scripts/npm-package-stage-diagnostic.js',
  'scripts/checks/npm-staging-feasibility-evidence.js',
  'test/scripts/npm-staging-feasibility-evidence.test.js',
  'solve/quests/npm-staging-feasibility/quest.json']);
function command(program, args, cwd = ROOT) {
  return execFileSync(program, args, {cwd, timeout: TIMEOUT_MS, maxBuffer: OUTPUT_BYTES,
    env: {...process.env, npm_config_offline: 'true', npm_config_audit: 'false',
      npm_config_fund: 'false', npm_config_update_notifier: 'false'}});
}
function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
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
  fs.writeFileSync(archive, tar);
  command('tar', ['-xf', archive, '-C', sourceRoot]);
  return sourceRoot;
}
function normalizeMetafile(meta, inputRoot, outputRoot) {
  const output = {};
  for (const [name, data] of Object.entries(meta.outputs)) {
    const relative = safePath(path.relative(outputRoot, path.resolve(inputRoot, name)));
    output[relative] = data;
  }
  return {...meta, outputs: output};
}
async function stage(inputRoot, outputRoot, graph) {
  fs.cpSync(inputRoot, outputRoot, {recursive: true, errorOnExist: true, force: false});
  for (const name of graph.compiled) fs.unlinkSync(path.join(outputRoot, name));
  const raw = new Set(graph.raw);
  const crossings = [];
  const result = await esbuild.build({...CONFIG, absWorkingDir: inputRoot,
    entryPoints: ENTRIES, outbase: inputRoot, outdir: outputRoot,
    plugins: [{name: 'diagnostic-raw-output-boundary', setup(build) {
      build.onResolve({filter: /^\./}, (args) => {
        const target = path.resolve(args.resolveDir, args.path);
        const relative = safePath(path.relative(inputRoot, target));
        requireFact(fs.realpathSync(target) === target, `symlink-target:${relative}`);
        if (!raw.has(relative)) return undefined;
        crossings.push({from: path.relative(inputRoot, args.importer), to: relative});
        return {path: path.join(outputRoot, relative), namespace: 'file', external: true};
      });
    }}],
  });
  requireFact(result.warnings.length === 0, 'build-warnings');
  for (const file of result.outputFiles) {
    safePath(path.relative(outputRoot, file.path));
    fs.mkdirSync(path.dirname(file.path), {recursive: true});
    fs.writeFileSync(file.path, file.contents);
  }
  const expected = graph.edges.filter((edge) =>
    graph.compiled.includes(edge.from) && raw.has(edge.to));
  for (const edge of expected) {
    requireFact(crossings.some((actual) => actual.from === edge.from && actual.to === edge.to),
      `resolver-missed:${edge.from}:${edge.to}`);
  }
  save(path.join(outputRoot, 'src/npm-staging-diagnostic.json'), {
    schema: 'npm-staging-diagnostic/1', source: SOURCE, ceiling: CEILING,
    configDigest: digest(CONFIG), graphDigest: digest(graph), esbuild: esbuild.version,
  });
  return {metafile: normalizeMetafile(result.metafile, inputRoot, outputRoot), crossings,
    originalMetafile: result.metafile};
}
async function oneRun(root, baseline, sourceRoot, label) {
  const runRoot = path.join(root, label);
  const inputRoot = extract(baseline.tarballPath, path.join(runRoot, 'input'));
  const outputRoot = path.join(runRoot, 'output', 'package');
  const selected = inventory(inputRoot);
  verifySource(sourceRoot, inputRoot, selected);
  const graph = classify(inputRoot, selected);
  save(path.join(runRoot, 'classification.json'), graph);
  const staged = await stage(inputRoot, outputRoot, graph);
  save(path.join(runRoot, 'metafile.json'), staged.metafile);
  save(path.join(runRoot, 'original-metafile.json'), staged.originalMetafile);
  save(path.join(runRoot, 'crossings.json'), staged.crossings);
  const verified = verifyStage(inputRoot, outputRoot, graph, staged.metafile);
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
  fs.writeFileSync(path.join(runRoot, 'tar-list.txt'), command('tar', ['-tvzf', tarball]));
  const stats = verifyPacked(packed, verified.inventory, fs.readFileSync(tarball), tarRows);
  return {stats, graph, violations: verified.violations,
    runRoot, sourceRoot, inputRoot, outputRoot, tarRoot, tarball};
}
async function measureDiagnostic(root) {
  requireFact(execGit(['rev-parse', 'HEAD'], {cwd: ROOT}).toString().trim() === SOURCE,
    'source-head');
  const changes = execGit(['diff', SOURCE, '--', 'src', 'vendor', 'wit', 'package.json',
    'package-lock.json', 'scripts/release-npm-package.js'], {cwd: ROOT}).toString();
  requireFact(changes.length === 0, 'production-source-dirty');
  const candidate = CANDIDATE_PATHS.map((name) => ({path: name,
    sha256: hash(fs.readFileSync(path.join(ROOT, name)))}));
  save(path.join(root, 'candidate.json'), candidate);
  save(path.join(root, 'toolchain.json'), toolchain());
  save(path.join(root, 'config.json'), CONFIG);
  const sourceRoot = snapshot(root);
  process.env.npm_config_offline = 'true';
  process.env.npm_config_update_notifier = 'false';
  // npm 10's pacote runs prepare even with --ignore-scripts. The unchanged
  // producer runs outside Git ancestors so its hook installer cannot touch a checkout.
  const {buildNpmPackage} = await import(pathToFileURL(
    path.join(sourceRoot, 'scripts/release-npm-package.js')).href);
  const baseline = await buildNpmPackage({gitHead: SOURCE,
    outputDirectory: path.join(root, 'baseline')});
  save(path.join(root, 'baseline.json'), baseline);
  const first = await oneRun(root, baseline, sourceRoot, 'a');
  const second = await oneRun(root, baseline, sourceRoot, 'b');
  requireFact(digest(first.stats) === digest(second.stats), 'two-root-reproducibility');
  const raw = new Set(first.graph.raw);
  const graph = {modules: first.graph.modules.length, raw: raw.size,
    compiled: first.graph.compiled.length, edges: first.graph.edges.length,
    unclassified: first.graph.unclassified.length,
    rawToCompiled: first.graph.edges.filter((edge) => raw.has(edge.from) &&
      first.graph.compiled.includes(edge.to)).length,
    digest: digest(first.graph)};
  const packet = {schema: 'npm-staging-feasibility/1', source: SOURCE, limits: LIMITS,
    ceiling: CEILING, outcome: outcomeFor(first.stats, first.violations.length), graph,
    violations: {count: first.violations.length, digest: digest(first.violations),
      examples: first.violations.slice(0, 5)},
    runs: [first.stats, second.stats], candidateDigest: digest(candidate),
    controls: [], review: null, artifactsRoot: root};
  save(path.join(root, 'run.json'), {first, second, packet});
  return packet;
}
function failureDetail(error) {
  return {name: error.name, message: error.message, stack: error.stack,
    cause: error.cause?.message, stdout: error.stdout?.toString(),
    stderr: error.stderr?.toString()};
}
export async function runDiagnostic(root) {
  refuseUnderProbe('npm staging diagnostic');
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
  const root = process.argv[2] || path.join(os.tmpdir(), `npm-staging-${Date.now()}`);
  runDiagnostic(root).then((packet) => console.log(JSON.stringify(packet, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify(failureDetail(error), null, 2));
      process.exitCode = 1;
    });
}
