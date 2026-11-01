// Raw observation store: reads the append-only raw observation files (v2 runs and
// the retained v1 forensic campaigns), the invalidation ledger and the frozen
// coverage manifest, and derives one admission cell per advertised claim. The
// derivation is deterministic: the same files yield the same bytes, which is what
// the offline recomputation check compares against the published artifacts.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {SUFFICIENCY_RULE, admitClaim} from './benchmark-claim-admission.js';
import {
  DEFAULT_INVALIDATIONS_PATH,
  readInvalidationLedger,
} from './benchmark-invalidation-ledger.js';
import {buildCoverageManifest, listManifestClaims} from './comparative-coverage-manifest.js';
import {parseRawObservationText} from './raw-observation-record.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const UTF8 = 'utf8';
const PARENT_DIR = '..';
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), PARENT_DIR, PARENT_DIR, PARENT_DIR,
);

const DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH = 'data/tidb-comparison/raw-observations.ndjson';
const DEFAULT_FORENSIC_RAW_OBSERVATIONS_DIR = 'data/tidb-comparison/forensic';
const DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH =
  'data/tidb-comparison/admitted-lab-measurements.json';
const ADMITTED_CLAIM_CELLS_SCHEMA = 'lagrange-admitted-claim-cells/v2';
const NDJSON_SUFFIX = '.ndjson';

function sha256OfFile(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function listRawObservationFiles(rootDir) {
  const forensicDir = path.resolve(rootDir, DEFAULT_FORENSIC_RAW_OBSERVATIONS_DIR);
  const forensic = fs.existsSync(forensicDir) ?
    arrayMap(arrayFilter(fs.readdirSync(forensicDir).sort(),
      (name) => stringEndsWith(name, NDJSON_SUFFIX)),
    (name) => `${DEFAULT_FORENSIC_RAW_OBSERVATIONS_DIR}/${name}`) :
    [];
  return [DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH, ...forensic];
}

/**
 * Read every raw observation file. A missing primary file or a corrupt line throws.
 * @param {string} rootDir
 * @return {{sources: Array<Object>, campaignHeaders: Map<string, Object>,
 *   runs: Array<{file: string, run: Object}>, retainedReferences: Array<Object>}}
 */
function readRawObservationSources(rootDir = REPO_ROOT) {
  const sources = [];
  const campaignHeaders = new Map();
  const runs = [];
  const retainedReferences = [];
  for (const relPath of listRawObservationFiles(rootDir)) {
    const absPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(absPath)) throw new Error(`Raw observation file missing: ${relPath}`);
    const parsed = parseRawObservationText(fs.readFileSync(absPath, UTF8), relPath);
    sources.push({path: relPath, sha256: sha256OfFile(absPath)});
    for (const header of parsed.campaignHeaders) {
      if (campaignHeaders.has(header.campaignId)) {
        throw new Error(`Duplicate campaign header ${header.campaignId} in ${relPath}`);
      }
      campaignHeaders.set(header.campaignId, header);
    }
    for (const run of parsed.runs) runs.push({file: relPath, run});
    retainedReferences.push(...parsed.retainedReferences);
  }
  return {sources, campaignHeaders, runs, retainedReferences};
}

function ledgerSource(rootDir) {
  const absPath = path.resolve(rootDir, DEFAULT_INVALIDATIONS_PATH);
  return {
    path: DEFAULT_INVALIDATIONS_PATH,
    sha256: fs.existsSync(absPath) ? sha256OfFile(absPath) : null,
  };
}

/**
 * The admitted measurements: one admission cell per claim of the frozen coverage
 * manifest. Regeneration always reads the invalidation ledger, so an entry appended
 * after a publication flips the covered cell on the next regeneration.
 * @param {string} rootDir
 * @return {Object}
 */
function deriveAdmittedMeasurementsFromRawObservations(rootDir = REPO_ROOT) {
  const raw = readRawObservationSources(rootDir);
  const invalidations = readInvalidationLedger(rootDir);
  const manifest = buildCoverageManifest();
  const cells = arrayMap(listManifestClaims(manifest), (claim) => admitClaim({
    claim, runs: raw.runs, campaignHeaders: raw.campaignHeaders,
    retainedReferences: raw.retainedReferences, invalidations,
  }));
  return {
    schema: ADMITTED_CLAIM_CELLS_SCHEMA,
    coverageManifestId: manifest.manifestId,
    sufficiencyRuleId: SUFFICIENCY_RULE.id,
    sources: [...raw.sources, ledgerSource(rootDir)],
    cells,
  };
}

function serializeAdmittedMeasurements(admitted) {
  return `${JSON.stringify(admitted, null, 2)}\n`;
}

export {
  ADMITTED_CLAIM_CELLS_SCHEMA,
  DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH,
  DEFAULT_FORENSIC_RAW_OBSERVATIONS_DIR,
  DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
  deriveAdmittedMeasurementsFromRawObservations,
  readRawObservationSources,
  serializeAdmittedMeasurements,
};
