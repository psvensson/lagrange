// The whole comparative-benchmark chain for the adversarial acceptance suite
// (owner brief section J): the controlled fake product behind the REAL workload
// driver (executeBenchmarkWorkload with fake pg/mysql2 clients; faults are
// injected only in the fake product), the driver output composed into a v2 run
// record (composeFixtureRunFromDriverOutput: the deployer and campaign fields
// are fixture stand-ins), the record validator, an append-only TEMP raw store
// and a TEMP invalidation ledger, admission, the matrix, every renderer and the
// offline recomputation check against that temp root.
//
// Evidence ceiling: the fake product proves the chain's classification,
// accounting, admission and publication of each response class; it is not a
// product, and the stand-in deployer fields prove nothing about deployment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {appendInvalidationEntries} from '../benchmark-invalidation-ledger.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  composeFixtureRunFromDriverOutput,
  writeFixtureRoot,
} from '../comparative-benchmark-fixtures.js';
import {escapeXml} from '../comparative-landing-svg-renderer.js';
import {
  computeRunObservationsDigest,
  validateCampaignHeader,
  validateRunRecord,
} from '../raw-observation-record.js';
import {regenerateAllBenchmarkArtifactsFromAdmitted} from
  '../raw-observation-campaign-specs.js';
import {executeBenchmarkWorkload} from '../real-product-workload-drivers.js';
import {
  FAKE_PRODUCT_FAULT,
  createFakeOltpProduct,
} from './real-product-workload-driver-fake-product.js';
import {recomputeComparativeBenchmarks} from
  '../../../../scripts/checks/comparative-benchmark-recompute.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFindIndex = Function.call.bind(Array.prototype.findIndex);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringReplace = Function.call.bind(String.prototype.replace);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..');
const RAW_FILE = 'data/tidb-comparison/raw-observations.ndjson';
const LEDGER_FILE = 'data/tidb-comparison/invalidations.ndjson';
const MATRIX_FILE = 'data/tidb-comparison/multi-system-matrix.json';
const DOCS_DIR = 'docs/benchmarks';
const CAMPAIGN = 'chain-campaign';
const ENDPOINT = Object.freeze({host: 'lab-host-1', port: 5432});
const CREDENTIALS = Object.freeze({user: 'bench', password: 'bench', database: 'bench'});
const SWEEP_PLAN_SHA256 = createHash('sha256').update('chain-sweep-plan').digest('hex');
// The run watchdog for arms whose product answers; a silent product gets a
// short one so the watchdog closes the run inside a unit-test budget.
const ANSWERING_WATCHDOG_MS = 60000;
const SILENT_WATCHDOG_MS = 300;

const SYSTEM_OF_TARGET = Object.freeze({
  'lagrange': 'lagrange',
  'tidb-tikv': 'tidb-tikv',
  'pg-single-primary': 'postgresql',
});

// The canonical capacity workload of the suite: 2 workers x 50 measured
// operations, no warm-up (the fixture plan preregisters none), so one run
// commits the sufficiency rule's minimum of 100.
const CAPACITY_WORKLOAD = Object.freeze({
  seed: 0x5eed0001, workers: 2, warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 50, warehouseCount: 1, districtsPerWarehouse: 2,
  customersPerDistrict: 30, itemCount: 200,
});

function watchdogTimer(ms) {
  return (callback) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  };
}

function connectionFor(system) {
  if (system === 'tidb-tikv') return {endpoint: ENDPOINT, databaseName: 'bench_chain'};
  return {endpoint: ENDPOINT, credentials: CREDENTIALS};
}

/**
 * Drive one arm through the real driver against the fake product and compose
 * the v2 run record. The record is validated before it is returned.
 * @param {Object} options
 * @return {Promise<{run: Object, output: Object, product: Object}>}
 */
async function driveArm(options) {
  const {targetId, subkind = 'smoke', mode = FAKE_PRODUCT_FAULT.NONE, repetition = 1,
    offeredRatePerSec = 2000, responseDelayMs = 0, workload = CAPACITY_WORKLOAD} = options;
  const system = SYSTEM_OF_TARGET[targetId];
  const capacity = subkind === 'main';
  const product = createFakeOltpProduct(mode, {responseDelayMs});
  // Response evidence over the inline bound goes to a temp directory the arm
  // owns, never under the repository.
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-chain-evidence-'));
  const output = await executeBenchmarkWorkload({
    targetId, system, scenario: 'scenarioA', subkind,
    connection: connectionFor(system),
    plan: {offeredRatePerSec, repetition, orderIndex: repetition - 1,
      ...(capacity ? {workload, sweepPlanSha256: SWEEP_PLAN_SHA256} : {sweepPlanSha256: null})},
    drivers: {createPgClient: product.createPgClient,
      createMysqlConnection: product.createMysqlConnection},
    runtime: {setWatchdogTimer: watchdogTimer(mode === FAKE_PRODUCT_FAULT.SILENT ?
      SILENT_WATCHDOG_MS : ANSWERING_WATCHDOG_MS)},
    evidenceDir,
  }).finally(() => fs.rmSync(evidenceDir, {recursive: true, force: true}));
  const base = buildFixtureRun({campaignId: CAMPAIGN, targetId, subkind, offeredRatePerSec,
    repetition, profileClass: output.plan.profileClass});
  // The record as the store holds it: plain JSON, not the driver's frozen objects.
  const run = JSON.parse(JSON.stringify(composeFixtureRunFromDriverOutput(base, output)));
  validateRunRecord(run);
  return {run, output, product};
}

/** Re-seal a run an adversary edited, as a writer that recomputes the digest would. */
function reseal(run) {
  run.rawObservationsDigest = computeRunObservationsDigest(run);
  return run;
}

/**
 * The campaign header of a chain campaign: the harness the driver reported,
 * every adapter the campaign's arms use, and the pinned product identities.
 * @param {Array<Object>} runs
 * @param {Array<string>} targetIds
 * @return {Object}
 */
function chainHeader(runs, targetIds) {
  const harness = runs[0].identity.harness;
  const adapterIds = [...new Set(arrayMap(runs, (r) => r.identity.harness.adapterIds[0]))].sort();
  const header = buildFixtureHeader({campaignId: CAMPAIGN, targetIds,
    harness: {gitCommit: harness.gitCommit, checkoutDirty: harness.checkoutDirty,
      driverSourceSha256: harness.driverSourceSha256, adapterIds}});
  validateCampaignHeader(header);
  return header;
}

function snapshotTree(rel) {
  const out = {};
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const relPath = `${prefix}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, relPath);
      else out[relPath] = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(path.join(REPO_ROOT, rel), rel);
  return out;
}

// The repository's published data and pages, and the names directly under data/:
// fixture output must never land there.
function snapshotRepositoryPublication() {
  return {dataEntries: fs.readdirSync(path.join(REPO_ROOT, 'data')).sort(),
    ...snapshotTree('data/tidb-comparison'), ...snapshotTree(DOCS_DIR)};
}

function readPages(root) {
  const dir = path.join(root, DOCS_DIR);
  const pages = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (stringEndsWith(name, '.md') || stringEndsWith(name, '.html') ||
        stringEndsWith(name, '.svg')) {
      pages[name] = fs.readFileSync(path.join(dir, name), 'utf8');
    }
  }
  return pages;
}

/**
 * A temp publication root: the raw store and the ledger are appended record by
 * record, then the one regeneration path publishes every page.
 */
class ChainPublication {
  constructor() {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), 'comparative-chain-'));
    const relative = path.relative(REPO_ROOT, this.root);
    assert.ok(stringStartsWith(relative, '..') || path.isAbsolute(relative),
      `the temp root ${this.root} must lie outside the repository`);
    writeFixtureRoot(this.root, {rawRecords: []});
    this.matrix = null;
    this.pages = null;
  }

  path(rel) {
    return path.join(this.root, rel);
  }

  /** Append records to the temp raw store, never rewriting a line. */
  append(records) {
    fs.appendFileSync(this.path(RAW_FILE),
      arrayMap(records, (r) => `${JSON.stringify(r)}\n`).join(''));
    return this;
  }

  invalidate(entries) {
    appendInvalidationEntries(this.path(LEDGER_FILE), entries);
    return this;
  }

  async publish() {
    await regenerateAllBenchmarkArtifactsFromAdmitted(this.root);
    this.matrix = JSON.parse(fs.readFileSync(this.path(MATRIX_FILE), 'utf8'));
    this.pages = readPages(this.root);
    return this;
  }

  async recompute() {
    return recomputeComparativeBenchmarks(this.root);
  }

  rawLines() {
    return arrayFilter(stringSplit(fs.readFileSync(this.path(RAW_FILE), 'utf8'), '\n'),
      (l) => stringTrim(l) !== '');
  }

  /** Rewrite one stored line in place (an after-the-fact edit of evidence). */
  editRawLine(index, edit) {
    const lines = this.rawLines();
    lines[index] = edit(lines[index]);
    fs.writeFileSync(this.path(RAW_FILE), `${lines.join('\n')}\n`);
  }

  close() {
    fs.rmSync(this.root, {recursive: true, force: true});
  }
}

async function withChain(build) {
  const chain = new ChainPublication();
  try {
    return await build(chain);
  } finally {
    chain.close();
  }
}

// ---- reading the publication layer ----

function matrixTargetCell(matrix, targetId, column) {
  const target = arrayFind(matrix.targets, (t) => t.targetId === targetId);
  assert.ok(target, `published matrix has target ${targetId}`);
  const cell = target.claims[column];
  assert.ok(cell, `published matrix has ${targetId}/${column}`);
  return cell;
}

function matrixExperimentCell(matrix, experimentId, rowId, column) {
  const exp = arrayFind(matrix.experiments, (e) => e.experimentId === experimentId);
  const row = arrayFind(exp.rows, (r) => r.rowId === rowId);
  return row.cells[column];
}

function markdownTable(markdown, heading) {
  const lines = stringSplit(markdown, '\n');
  const start = arrayFindIndex(lines, (l) => l === `## ${heading}`);
  assert.ok(start >= 0, `page has section ${heading}`);
  const rows = [];
  for (let i = start + 1; i < lines.length && !stringStartsWith(lines[i], '## '); i += 1) {
    if (stringStartsWith(lines[i], '| ')) rows.push(lines[i]);
  }
  const split = (line) => arrayMap(stringSplit(line.slice(2, -2), / \| /u),
    (c) => stringReplace(c, /\\\|/gu, '|'));
  const header = split(rows[0]);
  return {header, rows: arrayMap(rows.slice(2), split)};
}

/**
 * The rendered text of one cell in a Markdown page section.
 * @param {string} markdown
 * @param {string} heading
 * @param {string} rowLabel
 * @param {string} columnLabel
 * @return {string}
 */
function renderedMarkdownCell(markdown, heading, rowLabel, columnLabel) {
  const table = markdownTable(markdown, heading);
  const col = arrayIndexOf(table.header, columnLabel);
  assert.ok(col > 0, `section ${heading} has column ${columnLabel}`);
  const row = arrayFind(table.rows, (r) => r[0] === rowLabel);
  assert.ok(row, `section ${heading} has row ${rowLabel}`);
  return row[col];
}

const SMOKE_SECTION = 'Scenario A smoke runs';
const SMOKE_COLUMN_LABEL = 'Scenario A smoke';
const OVERVIEW_SECTION = 'Advertised configurations';
const OVERVIEW_COLUMN_LABEL = 'Scenario A';

/**
 * One claim cell as every publication surface shows it: the published matrix
 * JSON, the landing Markdown, the landing HTML and the overview SVG.
 * @param {ChainPublication} chain
 * @param {{targetId: string, label: string, smoke: boolean}} where
 * @return {{matrix: Object, markdown: string, html: string, svgTitle: string}}
 */
function publishedTargetCell(chain, {targetId, label, smoke}) {
  const column = smoke ? 'scenarioA/smoke' : 'scenarioA';
  const cell = matrixTargetCell(chain.matrix, targetId, column);
  const markdown = renderedMarkdownCell(chain.pages['README.md'],
    smoke ? SMOKE_SECTION : OVERVIEW_SECTION, label,
    smoke ? SMOKE_COLUMN_LABEL : OVERVIEW_COLUMN_LABEL);
  const html = chain.pages['index.html'];
  assert.ok(stringIncludes(html, `<td class="${escapeXml(cell.status)}">${escapeXml(markdown)}</td>`),
    `index.html renders ${targetId}/${column} as the Markdown does`);
  const svg = chain.pages['comparative-overview.svg'];
  const titleStart = stringIndexOf(svg, `<title>${escapeXml(cell.claimKey)} `);
  assert.ok(titleStart >= 0, `the overview SVG has a cell for ${cell.claimKey}`);
  const svgTitle = svg.slice(titleStart + '<title>'.length, stringIndexOf(svg, '</title>', titleStart));
  return {matrix: cell, markdown, html, svgTitle};
}

const LATENCY_OR_CAPACITY_TEXT = Object.freeze([/p99/u, /committed\/s/u, /\bms\b/u]);

function assertNoNumbersRendered(text, label) {
  for (const pattern of LATENCY_OR_CAPACITY_TEXT) {
    assert.equal(pattern.test(text), false, `${label} renders ${pattern}: ${text}`);
  }
}

export {
  CAMPAIGN,
  CAPACITY_WORKLOAD,
  ChainPublication,
  DOCS_DIR,
  ENDPOINT,
  MATRIX_FILE,
  RAW_FILE,
  REPO_ROOT,
  SYSTEM_OF_TARGET,
  assertNoNumbersRendered,
  chainHeader,
  driveArm,
  matrixExperimentCell,
  matrixTargetCell,
  publishedTargetCell,
  renderedMarkdownCell,
  reseal,
  snapshotRepositoryPublication,
  withChain,
};
