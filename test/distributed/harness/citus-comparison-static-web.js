// Citus comparison page: admission cells for the advertised Citus configurations.
import {TARGET_ID} from './comparative-coverage-manifest.js';
import {buildTargetSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {
  SCENARIO_A_COLUMNS, SCENARIO_B_COLUMNS, SCENARIO_C_COLUMNS, SCENARIO_LINKS,
} from './comparative-page-columns.js';

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
    links: SCENARIO_LINKS, sources: matrix.sources, withdrawal: matrix.withdrawal, svgHref: 'citus-comparison-progress.svg',
  };
}

async function writeCitusComparisonStaticWebArtifacts({matrix, svgPath, markdownPath, htmlPath}) {
  return writeClaimPageArtifacts(buildCitusComparisonPage(matrix),
    {svgPath, markdownPath, htmlPath});
}

export {
  writeCitusComparisonStaticWebArtifacts,
};
