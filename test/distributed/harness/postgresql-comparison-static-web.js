// PostgreSQL comparison page: admission cells for the PostgreSQL variants next to
// Lagrange and TiDB. Cells come from the matrix; this page holds no measurement.
import {TARGET_ID} from './comparative-coverage-manifest.js';
import {buildTargetSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {
  SCENARIO_A_COLUMNS, SCENARIO_B_COLUMNS, SCENARIO_C_COLUMNS, SCENARIO_LINKS,
} from './comparative-page-columns.js';

const TARGETS = Object.freeze([TARGET_ID.LAGRANGE, TARGET_ID.TIDB, TARGET_ID.PG_SINGLE,
  TARGET_ID.PG_SYNC_STANDBYS, TARGET_ID.PG_PLPGSQL_SINGLE, TARGET_ID.PG_PLPGSQL_SYNC_STANDBYS]);

function buildPostgresqlComparisonPage(matrix) {
  const section = (heading, columns) => buildTargetSection(matrix, {
    heading, columns, targetIds: TARGETS,
    description: 'PostgreSQL variants as the deployer starts them, with Lagrange and TiDB.',
  });
  return {
    title: 'PostgreSQL comparison',
    intro: ['PostgreSQL variants: single primary, and a primary with two streaming standbys ' +
      'under synchronous_standby_names, each with client-side SQL or a PL/pgSQL function.'],
    sections: [section('Scenario A', SCENARIO_A_COLUMNS),
      section('Scenario B locality shapes', SCENARIO_B_COLUMNS),
      section('Scenario C', SCENARIO_C_COLUMNS)],
    links: SCENARIO_LINKS, sources: matrix.sources, withdrawal: matrix.withdrawal,
    svgHref: 'postgresql-comparison-progress.svg',
  };
}

async function writePostgresqlComparisonStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildPostgresqlComparisonPage(matrix),
    {svgPath, markdownPath, htmlPath});
}

export {
  writePostgresqlComparisonStaticWebArtifacts,
};
