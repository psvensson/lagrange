// Citus comparison page: admission cells for the advertised Citus configurations.
import {TARGET_ID} from './comparative-coverage-manifest.js';
import {buildTargetSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {
  SCENARIO_A_COLUMNS, SCENARIO_B_COLUMNS, SCENARIO_C_COLUMNS, SCENARIO_LINKS,
} from './comparative-page-columns.js';

const DEFAULT_CITUS_PROGRESS_SVG_PATH = 'docs/benchmarks/citus-comparison-progress.svg';
const DEFAULT_CITUS_PROGRESS_MD_PATH = 'docs/benchmarks/citus-comparison-progress.md';
const DEFAULT_CITUS_PROGRESS_HTML_PATH = 'docs/benchmarks/citus-comparison-progress.html';
const TARGETS = Object.freeze([TARGET_ID.CITUS_SQL, TARGET_ID.CITUS_UDF]);

function buildCitusComparisonPage(matrix) {
  const section = (heading, columns) => buildTargetSection(matrix, {
    heading, columns, targetIds: TARGETS,
    description: 'Citus with client-side SQL and with colocated tables plus a distributed function.',
  });
  return {
    title: 'Citus comparison',
    intro: ['Advertised Citus configurations. No Citus deployment has been executed by the ' +
      'comparative benchmark runner.'],
    sections: [section('Scenario A', SCENARIO_A_COLUMNS),
      section('Scenario B locality shapes', SCENARIO_B_COLUMNS),
      section('Scenario C', SCENARIO_C_COLUMNS)],
    links: SCENARIO_LINKS, sources: matrix.sources, svgHref: 'citus-comparison-progress.svg',
  };
}

async function writeCitusComparisonStaticWebArtifacts({matrix, svgPath, markdownPath, htmlPath}) {
  return writeClaimPageArtifacts(buildCitusComparisonPage(matrix),
    {svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_CITUS_PROGRESS_HTML_PATH,
  DEFAULT_CITUS_PROGRESS_MD_PATH,
  DEFAULT_CITUS_PROGRESS_SVG_PATH,
  writeCitusComparisonStaticWebArtifacts,
};
