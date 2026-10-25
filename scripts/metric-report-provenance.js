import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {cycleInputsAreCurrent} from './metric-cycle-input-facts.js';
import {METRIC_CYCLE_DISCOVERY, METRIC_REPORTS} from './metric-report-constants.js';
import {captureMetricInputs, metricDigest} from './metric-report-inputs.js';

const JSON_ENCODING = 'utf8';
const MISSING_FILE = 'ENOENT';
const SCHEMA = 'metric-report-provenance-v2';

export function metricReportPayload(payload) {
  const copy = {...payload};
  delete copy.provenance;
  if (copy.statistics) {
    copy.statistics = {...copy.statistics};
    delete copy.statistics.detectionDate;
  }
  return copy;
}

function reportDigest(payload, analyzerInputs) {
  return metricDigest(JSON.stringify({payload: metricReportPayload(payload), analyzerInputs}));
}

export function beginMetricMeasurement(id, options = {}) {
  const descriptor = METRIC_REPORTS[id];
  const root = options.root || process.cwd();
  const targets = options.targets || descriptor.targets;
  const reportPath = options.reportPath || descriptor.reportPath;
  return {id, root, targets, reportPath,
    inputs: captureMetricInputs(root, descriptor, targets, reportPath)};
}

export function finishMetricMeasurement(measurement, payload, analyzerInputs) {
  const {id, root, targets, reportPath, inputs} = measurement;
  const current = captureMetricInputs(root, METRIC_REPORTS[id], targets, reportPath);
  if (JSON.stringify(inputs) !== JSON.stringify(current)) {
    throw new Error(`metric inputs changed during measurement: ${id}`);
  }
  if (METRIC_REPORTS[id].inputDiscovery === METRIC_CYCLE_DISCOVERY &&
      !cycleInputsAreCurrent(root, analyzerInputs)) {
    throw new Error(`cycle analyzer inputs changed or are unbound: ${id}`);
  }
  const report = {...payload, provenance: {
    schema: SCHEMA, id, inputs, analyzerInputs, reportDigest: reportDigest(payload, analyzerInputs),
  }};
  const destination = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temporary, destination);
  return destination;
}

export function readCurrentMetricReport(root, id) {
  const descriptor = METRIC_REPORTS[id];
  let report;
  try {
    report = JSON.parse(fs.readFileSync(path.join(root, descriptor.reportPath), JSON_ENCODING));
  } catch (error) {
    if (error.code === MISSING_FILE || error instanceof SyntaxError) return null;
    throw error;
  }
  const seal = report?.provenance;
  if (seal?.schema !== SCHEMA || seal.id !== id ||
      seal.reportDigest !== reportDigest(report, seal.analyzerInputs)) return null;
  if (descriptor.inputDiscovery === METRIC_CYCLE_DISCOVERY &&
      !cycleInputsAreCurrent(root, seal.analyzerInputs)) return null;
  const inputs = captureMetricInputs(root, descriptor,
    descriptor.targets, descriptor.reportPath, []);
  return JSON.stringify(seal.inputs) === JSON.stringify(inputs) ? report : null;
}

export function ensureMetricReports(root) {
  const reports = {};
  for (const [id, descriptor] of Object.entries(METRIC_REPORTS)) {
    reports[id] = readCurrentMetricReport(root, id);
    if (reports[id]) continue;
    const result = spawnSync(process.execPath, descriptor.command,
      {cwd: root, stdio: 'inherit'});
    // A ratchet may exit 1 after a complete measurement. A crash with the
    // same status cannot authorize an old report: require the new seal.
    reports[id] = readCurrentMetricReport(root, id);
    if (![0, 1].includes(result.status) || !reports[id]) {
      throw new Error(`metric report refresh failed: ${id}`);
    }
  }
  return reports;
}
