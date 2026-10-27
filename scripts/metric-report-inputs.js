import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {METRIC_GENERATED_OUTPUTS} from './metric-report-constants.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const JSON_ENCODING = 'utf8';
const SORT_LOCALE = 'en';
const PACKAGE_MANIFEST = 'package.json';
const MODULES_DIRECTORY = 'node_modules';
const PRODUCER_DIRECTORY = 'scripts';
const EXCLUDED_DIRECTORIES = new Set([MODULES_DIRECTORY, '.git']);

export function metricDigest(value) {
  return createHash(DIGEST_ALGORITHM).update(value).digest(DIGEST_ENCODING);
}

const EXECUTABLE_DIGEST = metricDigest(fs.readFileSync(process.execPath));

function addEntry(filename, realDirectory, entry, files, parents) {
  if (!entry.isSymbolicLink()) {
    if (entry.isDirectory()) {
      collectDirectory(filename, path.join(realDirectory, entry.name), files, parents);
    } else if (entry.isFile()) {
      files.add(filename);
    }
    return;
  }
  const stat = fs.statSync(filename);
  if (stat.isDirectory()) {
    collectDirectory(filename, fs.realpathSync(filename), files, parents);
  } else if (stat.isFile()) {
    files.add(filename);
  }
}

// Hash bytes, never timestamps. Relative names keep identical checkouts equal.
function collectDirectory(directory, realDirectory, files, ancestors) {
  if (ancestors.has(realDirectory)) {
    throw new Error(`metric input symlink cycle: ${directory}`);
  }
  const parents = new Set([...ancestors, realDirectory]);
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
      addEntry(path.join(directory, entry.name), realDirectory, entry, files, parents);
    }
  }
}

function collectFiles(directory, files) {
  collectDirectory(directory, fs.realpathSync(directory), files, new Set());
}

function filesDigest(root, files) {
  const entries = [...files].map((filename) => [path.relative(root, filename),
    metricDigest(fs.readFileSync(filename))]);
  entries.sort(([left], [right]) => left.localeCompare(right, SORT_LOCALE));
  return metricDigest(JSON.stringify(entries));
}

function addTargetFiles(root, targets, files) {
  for (const target of fs.globSync(targets, {cwd: root})) {
    const filename = path.resolve(root, target);
    if (fs.statSync(filename).isDirectory()) collectFiles(filename, files);
    else files.add(filename);
  }
}

function sourceDigest(root, targets) {
  const files = new Set();
  // All script bytes bind the producer and its repository helper closure.
  addTargetFiles(root, [...targets, PRODUCER_DIRECTORY], files);
  // Conservatively include every file under the measured roots: selection
  // stays with the real tools, including future extensions and nested config.
  for (const relative of METRIC_GENERATED_OUTPUTS) files.delete(path.join(root, relative));
  // Root configuration includes package/lock files, ignores and tool configs.
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const filename = path.join(root, entry.name);
    if (/(?:\.(?:json|[cm]?js|ya?ml)|ignore|rc)$/.test(entry.name) &&
        fs.statSync(filename).isFile()) {
      files.add(filename);
    }
  }
  return filesDigest(root, files);
}

function packageDirectory(request, name) {
  for (const directory of request.resolve.paths(name) || []) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(path.join(candidate, PACKAGE_MANIFEST))) {
      return fs.realpathSync(candidate);
    }
  }
  return null;
}

function collectToolPackage(directory, packages, modulesRoot) {
  const key = path.relative(modulesRoot, directory);
  if (packages.has(key)) return key;
  const manifestPath = path.join(directory, PACKAGE_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, JSON_ENCODING));
  const files = new Set();
  collectFiles(directory, files);
  const record = {content: filesDigest(directory, files), dependencies: {}};
  packages.set(key, record);
  const request = createRequire(manifestPath);
  const names = new Set([...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
    ...Object.keys(manifest.peerDependencies || {})]);
  for (const name of [...names].sort()) {
    const dependency = packageDirectory(request, name);
    record.dependencies[name] = dependency ?
      collectToolPackage(dependency, packages, modulesRoot) : null;
  }
  return key;
}

function toolsDigest(root, names) {
  const packages = new Map();
  const request = createRequire(path.join(root, PACKAGE_MANIFEST));
  const modulesRoot = fs.realpathSync(path.join(root, MODULES_DIRECTORY));
  const roots = names.map((name) => {
    const directory = packageDirectory(request, name);
    if (!directory) throw new Error(`metric tool is not installed: ${name}`);
    return [name, collectToolPackage(directory, packages, modulesRoot)];
  });
  return metricDigest(JSON.stringify({roots, packages: [...packages].sort()}));
}

export function captureMetricInputs(root, descriptor, targets, reportPath,
  runtimeArguments = process.execArgv) {
  return {
    source: sourceDigest(root, targets),
    tools: toolsDigest(root, descriptor.tools),
    runtime: {executable: EXECUTABLE_DIGEST,
      arguments: runtimeArguments, versions: process.versions, platform: process.platform,
      arch: process.arch, nodeOptions: process.env.NODE_OPTIONS || '',
      homeDirectory: homedir(),
      nodePath: process.env.NODE_PATH || '', locale: process.env.LC_ALL || '',
      language: process.env.LANG || '', timezone: process.env.TZ || ''},
    command: descriptor.command, targets, reportPath,
  };
}
