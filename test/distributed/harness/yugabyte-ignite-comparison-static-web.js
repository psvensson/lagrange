// YugabyteDB and Apache Ignite comparison page, plus the Scenario B shape grid for
// every advertised configuration.
import fs from 'node:fs/promises';
import path from 'node:path';

import {TARGET_ID} from './comparative-coverage-manifest.js';
import {
  buildTargetSection,
  renderClaimPage,
  writeClaimPageArtifacts,
} from './comparative-landing-tables.js';
import {
  ALL_TARGET_IDS, SCENARIO_A_COLUMNS, SCENARIO_B_COLUMNS, SCENARIO_C_COLUMNS, SCENARIO_LINKS,
} from './comparative-page-columns.js';

const TARGETS = Object.freeze([TARGET_ID.YUGABYTE_YSQL, TARGET_ID.YUGABYTE_PROC, TARGET_ID.IGNITE]);

function buildYugabyteIgniteComparisonPage(matrix) {
  const section = (heading, columns) => buildTargetSection(matrix, {
    heading, columns, targetIds: TARGETS,
    description: 'YugabyteDB YSQL with client-side SQL or a stored procedure; Ignite 3 ' +
      'colocated compute.',
  });
  return {
    title: 'YugabyteDB and Apache Ignite comparison',
    intro: ['Advertised YugabyteDB and Ignite configurations. No YugabyteDB or Ignite ' +
      'deployment has been executed by the comparative benchmark runner.'],
    sections: [section('Scenario A', SCENARIO_A_COLUMNS),
      section('Scenario B locality shapes', SCENARIO_B_COLUMNS),
      section('Scenario C', SCENARIO_C_COLUMNS)],
    links: [...SCENARIO_LINKS,
      {href: 'scenario-b-shape-crossover.svg', label: 'Scenario B shapes, all configurations'}],
    sources: matrix.sources, svgHref: 'yugabyte-ignite-comparison-progress.svg',
  };
}

function buildScenarioBShapePage(matrix) {
  return {
    title: 'Scenario B locality shapes, all configurations', intro: [], sources: matrix.sources,
    sections: [buildTargetSection(matrix, {heading: 'Scenario B locality shapes',
      description: '', columns: SCENARIO_B_COLUMNS, targetIds: ALL_TARGET_IDS})],
  };
}

async function writeYugabyteIgniteComparisonStaticWebArtifacts({matrix, svgPath, crossoverSvgPath,
  markdownPath, htmlPath}) {
  const rendered = await writeClaimPageArtifacts(buildYugabyteIgniteComparisonPage(matrix),
    {svgPath, markdownPath, htmlPath});
  if (crossoverSvgPath) {
    await fs.mkdir(path.dirname(crossoverSvgPath), {recursive: true});
    await fs.writeFile(crossoverSvgPath, renderClaimPage(buildScenarioBShapePage(matrix)).svg);
  }
  return rendered;
}

export {
  writeYugabyteIgniteComparisonStaticWebArtifacts,
};
