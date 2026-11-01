// Comparative benchmark overview (docs/benchmarks/README.md, index.html and the
// overview SVG): one admission cell per advertised configuration and scenario,
// with links to the detail pages. No winner, ranking or numeric default.
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildExperimentSection,
  buildTargetSection,
  writeClaimPageArtifacts,
} from './comparative-landing-tables.js';
import {ALL_TARGET_IDS, OVERVIEW_COLUMNS, SCENARIO_LINKS} from './comparative-page-columns.js';
import {renderScenarioSetupBreakdownSvg} from './scenario-setup-breakdown-renderer.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH = 'docs/benchmarks/comparative-overview.svg';
const DEFAULT_COMPARATIVE_LANDING_MD_PATH = 'docs/benchmarks/README.md';
const DEFAULT_COMPARATIVE_LANDING_HTML_PATH = 'docs/benchmarks/index.html';

const DETAIL_LINKS = Object.freeze(arrayMap([
  ['tidb-comparison-progress.md', 'TiDB comparison history (forensic records)'],
  ['postgresql-comparison-progress.md', 'PostgreSQL comparison'],
  ['citus-comparison-progress.md', 'Citus comparison'],
  ['yugabyte-ignite-comparison-progress.md', 'YugabyteDB and Apache Ignite comparison'],
  ['scenario-c-feature-store-progress.md', 'Scenario C: streaming feature store'],
  ['scaleout-3to5-node-rf3-progress.md', 'Three-to-five-node scale-out'],
  ['partition-granularity-sweep-progress.md', 'Partition granularity sweep'],
  ['scenario-b-rtt-working-set-crossover.md', 'Scenario B under network delay'],
  ['movement-and-scenario-c-scaling-progress.md', 'Partition movement and Scenario C at scale'],
  ['lagrange-metrics-evolution.md', 'Lagrange milestones'],
  ['cloud-reproduction-guide.md', 'Reproduction guide'],
  ['scenario-setup-time-breakdown.svg', 'Per-phase time breakdown'],
], ([href, label]) => Object.freeze({href, label})));

function buildComparativeLandingPage(matrix) {
  return {
    title: 'Comparative benchmarks',
    intro: [
      'This page lists every comparative claim the benchmark pages have advertised, one cell ' +
        'per configuration and scenario. A cell shows the admission status the evidence ' +
        'supports and the reason codes behind it; a number appears only for a cell admitted ' +
        'from retained observations.',
      'Scenario definitions and the Scenario A semantic gate are contracts, not results: see ' +
        'the related pages below.',
    ],
    sections: [
      buildTargetSection(matrix, {heading: 'Advertised configurations', columns: OVERVIEW_COLUMNS,
        targetIds: ALL_TARGET_IDS,
        description: 'Configuration labels describe what the deployer starts.'}),
      buildExperimentSection(matrix, 'scenario-setup-breakdown',
        'Phase timings are admitted only from observed spans.'),
    ],
    links: [...SCENARIO_LINKS.slice(0, 3), ...DETAIL_LINKS],
    sources: matrix.sources,
    svgHref: 'comparative-overview.svg',
  };
}

async function writeComparativeLandingArtifacts({matrix, svgPath, setupBreakdownSvgPath,
  markdownPath, htmlPath}) {
  const page = buildComparativeLandingPage(matrix);
  const rendered = await writeClaimPageArtifacts(
    {...page, sections: page.sections.slice(0, 1)}, {svgPath});
  await writeClaimPageArtifacts(page, {markdownPath, htmlPath});
  if (setupBreakdownSvgPath) {
    await fs.mkdir(path.dirname(setupBreakdownSvgPath), {recursive: true});
    await fs.writeFile(setupBreakdownSvgPath, renderScenarioSetupBreakdownSvg(matrix), 'utf8');
  }
  return rendered;
}

export {
  DEFAULT_COMPARATIVE_LANDING_HTML_PATH,
  DEFAULT_COMPARATIVE_LANDING_MD_PATH,
  DEFAULT_COMPARATIVE_OVERVIEW_SVG_PATH,
  writeComparativeLandingArtifacts,
};
