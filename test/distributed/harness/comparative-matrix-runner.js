// The multi-system comparative matrix: the frozen coverage manifest's structure
// (14 advertised configurations and the advertised experiments) filled with the
// admission cells derived from the raw observation store. It carries no metric of
// its own, no winner and no completion count; every renderer consumes it.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {CLAIM_CELL_STATUS} from './benchmark-claim-admission.js';
import {buildCoverageManifest} from './comparative-coverage-manifest.js';
import {deriveAdmittedMeasurementsFromRawObservations} from './raw-observation-store.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const DEFAULT_MULTI_SYSTEM_MATRIX_PATH = 'data/tidb-comparison/multi-system-matrix.json';
const MULTI_SYSTEM_MATRIX_SCHEMA = 'lagrange-multi-system-comparative-matrix/v2';

const SCENARIOS = Object.freeze(arrayMap([
  ['tidb-oltp-baseline', 'Scenario A: Contended OLTP Baseline',
    'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
    'tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate'],
  ['tidb-distributed-risk-decision', 'Scenario B: Distributed Risk Decision',
    'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
    'tidb-reference-paired-owner.md'],
  ['streaming-feature-risk-decision', 'Scenario C: Streaming Feature Store',
    'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision', null],
], ([scenarioId, label, definitionHref, contractHref]) =>
  Object.freeze({scenarioId, label, definitionHref, contractHref})));

function mapCells(claims, cellsByKey) {
  return Object.fromEntries(arrayMap(Object.entries(claims),
    ([column, claim]) => [column, cellsByKey.get(claim.claimKey)]));
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const admitted = deriveAdmittedMeasurementsFromRawObservations(rootDir);
  const cellsByKey = new Map(arrayMap(admitted.cells, (cell) => [cell.claimKey, cell]));
  const manifest = buildCoverageManifest();
  return {
    schema: MULTI_SYSTEM_MATRIX_SCHEMA,
    coverageManifestId: manifest.manifestId,
    sufficiencyRuleId: admitted.sufficiencyRuleId,
    statusVocabulary: Object.values(CLAIM_CELL_STATUS),
    sources: admitted.sources,
    scenarios: SCENARIOS,
    targets: arrayMap(manifest.targets, (t) => ({
      targetId: t.targetId,
      label: t.label,
      advertisedLabel: t.advertisedLabel,
      category: t.category,
      detailPageMd: `${t.detailPagePrefix}.md`,
      detailPageHtml: `${t.detailPagePrefix}.html`,
      claims: mapCells(manifest.targetClaims.get(t.targetId), cellsByKey),
    })),
    experiments: arrayMap(manifest.experiments, (exp) => ({
      experimentId: exp.experimentId,
      title: exp.title,
      columns: exp.columns,
      rows: arrayMap(exp.rows, (r) => ({
        rowId: r.rowId, label: r.label, cells: mapCells(r.cells, cellsByKey),
      })),
    })),
  };
}

function serializeMultiSystemComparativeMatrix(matrix) {
  return `${JSON.stringify(matrix, null, 2)}\n`;
}

async function writeMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const matrixPath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix({rootDir});
  await mkdir(path.dirname(matrixPath), {recursive: true});
  await writeFile(matrixPath, serializeMultiSystemComparativeMatrix(matrix), 'utf8');
  return {matrix, matrixPath};
}

export {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  buildMultiSystemComparativeMatrix,
  MULTI_SYSTEM_MATRIX_SCHEMA,
  writeMultiSystemComparativeMatrix,
};
