// Durable Solver state ends at declarations, append-only logs, exact change
// artifacts, and verifier receipts. Ordinary Markdown reports are reproducible
// views of that state; everything else under solve/report is retained evidence.

import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HASH_ALGORITHM = 'sha256';
const REPORT_ROOT = 'solve/report';
const OVERVIEW_PATH = 'solve/OVERVIEW.generated.md';
const DEFAULT_MANIFEST_PATH =
  'solve/migrations/report-projection-cutover.json';
const QUEST_REPORT_PATTERN = /^solve\/report\/([^/]+)\.md$/u;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

function normalizeRelative(root, filePath) {
  const relative = path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
  return relative.replaceAll(path.sep, '/');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function sha256(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest('hex');
}

function artifactEntry(root, filePath, kind) {
  const bytes = fs.readFileSync(filePath);
  return {
    path: normalizeRelative(root, filePath),
    kind,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function resolveHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const commit = String(result.stdout || '').trim();
  return result.status === 0 && GIT_COMMIT_PATTERN.test(commit) ? commit : null;
}

function trackedReportFiles(root) {
  const result = spawnSync('git', ['ls-files', '-z', '--', REPORT_ROOT], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\0').filter(Boolean)
    .map((relative) => path.join(root, relative))
    .filter((file) => fs.existsSync(file))
    .sort();
}

export function isRegenerableQuestReport(root, filePath) {
  const relative = normalizeRelative(root, filePath);
  const match = QUEST_REPORT_PATTERN.exec(relative);
  if (!match) return false;
  const questId = match[1];
  return fs.existsSync(path.join(root, 'solve', 'quests', `${questId}.json`)) &&
    fs.existsSync(path.join(root, 'solve', 'log', `${questId}.ndjson`));
}

export function reportRetentionInventory(root, options = {}) {
  const reportFiles = options.trackedOnly === false ?
    walk(path.join(root, REPORT_ROOT)) : trackedReportFiles(root);
  const ordinary = reportFiles.filter((file) => isRegenerableQuestReport(root, file));
  const retained = reportFiles.filter((file) => !ordinary.includes(file));
  const overview = path.join(root, OVERVIEW_PATH);
  return {
    ordinary: ordinary.map((file) => artifactEntry(
      root, file, 'quest-report-projection')),
    retained: retained.map((file) => artifactEntry(
      root, file, 'non-regenerable-report-evidence')),
    overview: fs.existsSync(overview) ? artifactEntry(
      root, overview, 'work-overview-projection') : null,
  };
}

export function buildReportProjectionManifest(root) {
  const inventory = reportRetentionInventory(root);
  const removed = [
    ...inventory.ordinary,
    ...(inventory.overview ? [inventory.overview] : []),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const retained = [...inventory.retained]
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    sourceCommit: resolveHead(root),
    classification: 'Immediate solve/report/<quest-id>.md with matching ' +
      'solve/quests/<quest-id>.json and solve/log/<quest-id>.ndjson is ' +
      'regenerable; all other report-tree files are retained.',
    removed,
    retained,
    totals: {
      removedFiles: removed.length,
      removedBytes: removed.reduce((total, entry) => total + entry.bytes, 0),
      retainedFiles: retained.length,
      retainedBytes: retained.reduce((total, entry) => total + entry.bytes, 0),
    },
  };
}

export function migrateReportProjections(root, options = {}) {
  const relativeManifest = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifestPath = path.join(root, relativeManifest);
  const manifest = buildReportProjectionManifest(root);
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const entry of manifest.removed) {
    fs.rmSync(path.join(root, entry.path));
  }
  return {manifest, manifestPath};
}

export function normalizeReportProjectionManifest(root, options = {}) {
  const relativeManifest = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifestPath = path.join(root, relativeManifest);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.retained = (manifest.retained || [])
    .filter((entry) => trackedByGit(root, entry.path));
  manifest.totals = {
    removedFiles: manifest.removed.length,
    removedBytes: manifest.removed.reduce(
      (total, entry) => total + entry.bytes, 0),
    retainedFiles: manifest.retained.length,
    retainedBytes: manifest.retained.reduce(
      (total, entry) => total + entry.bytes, 0),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function currentEntry(root, entry) {
  const file = path.join(root, entry.path);
  return fs.existsSync(file) ? artifactEntry(root, file, entry.kind) : null;
}

function ignoredEvenIfTracked(root, filePath) {
  const result = spawnSync(
    'git', ['check-ignore', '--quiet', '--no-index', '--', filePath],
    {cwd: root, encoding: 'utf8'},
  );
  return result.status === 0;
}

function trackedByGit(root, filePath) {
  const result = spawnSync(
    'git', ['ls-files', '--error-unmatch', '--', filePath],
    {cwd: root, encoding: 'utf8'},
  );
  return result.status === 0;
}

export function verifyReportProjectionRetention(root, options = {}) {
  const relativeManifest = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifestPath = path.join(root, relativeManifest);
  if (!fs.existsSync(manifestPath)) {
    return {ok: false, problems: [`missing retention manifest: ${relativeManifest}`]};
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const problems = [];
  for (const entry of manifest.removed || []) {
    if (!ignoredEvenIfTracked(root, entry.path)) {
      problems.push(`removed projection is not ignored: ${entry.path}`);
    }
  }
  for (const entry of manifest.retained || []) {
    const current = currentEntry(root, entry);
    if (!current) problems.push(`retained evidence is missing: ${entry.path}`);
    else if (current.sha256 !== entry.sha256 || current.bytes !== entry.bytes) {
      problems.push(`retained evidence drifted: ${entry.path}`);
    }
    if (!trackedByGit(root, entry.path)) {
      problems.push(`retained evidence is not tracked: ${entry.path}`);
    }
  }
  for (const entry of reportRetentionInventory(root, {trackedOnly: false}).ordinary) {
    if (!ignoredEvenIfTracked(root, entry.path)) {
      problems.push(`ordinary report is not ignored: ${entry.path}`);
    }
  }
  if (!ignoredEvenIfTracked(root, OVERVIEW_PATH)) {
    problems.push(`overview projection is not ignored: ${OVERVIEW_PATH}`);
  }
  return {ok: problems.length === 0, problems, manifest};
}

function runCli() {
  if (process.argv.includes('--normalize-manifest')) {
    const manifest = normalizeReportProjectionManifest(process.cwd());
    process.stdout.write(`${JSON.stringify(manifest.totals)}\n`);
    return;
  }
  const migrate = process.argv.includes('--migrate');
  if (migrate) {
    const result = migrateReportProjections(process.cwd());
    process.stdout.write(`${JSON.stringify(result.manifest.totals)}\n`);
    return;
  }
  const result = verifyReportProjectionRetention(process.cwd());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
