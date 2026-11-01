// Scenario C page: freshness, rule backfill and restart recovery claims for every
// advertised configuration. Freshness, backfill and recovery each need their own
// observed record kind; none exists yet.
import {buildTargetSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {ALL_TARGET_IDS, SCENARIO_C_COLUMNS, SCENARIO_LINKS} from './comparative-page-columns.js';

const DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH = 'docs/benchmarks/scenario-c-feature-store-progress.svg';
const DEFAULT_SCENARIO_C_PROGRESS_MD_PATH = 'docs/benchmarks/scenario-c-feature-store-progress.md';
const DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH =
  'docs/benchmarks/scenario-c-feature-store-progress.html';

function buildScenarioCComparisonPage(matrix) {
  return {
    title: 'Scenario C: streaming feature store',
    intro: ['Scenario C claims need event ingestion and a freshness observation (recorded ' +
      'event/version causality or an explicit clock method). Until that execution exists ' +
      'no Scenario C value can be admitted.'],
    sections: [buildTargetSection(matrix, {heading: 'Scenario C', description: '',
      columns: SCENARIO_C_COLUMNS, targetIds: ALL_TARGET_IDS})],
    links: SCENARIO_LINKS, sources: matrix.sources,
    svgHref: 'scenario-c-feature-store-progress.svg',
  };
}

async function writeScenarioCComparisonStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildScenarioCComparisonPage(matrix),
    {svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_SCENARIO_C_PROGRESS_HTML_PATH,
  DEFAULT_SCENARIO_C_PROGRESS_MD_PATH,
  DEFAULT_SCENARIO_C_PROGRESS_SVG_PATH,
  writeScenarioCComparisonStaticWebArtifacts,
};
