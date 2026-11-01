// Lagrange milestone page: the admission cells behind each advertised milestone.
import {TARGET_ID} from './comparative-coverage-manifest.js';
import {
  buildExperimentSection,
  buildTargetSection,
  writeClaimPageArtifacts,
} from './comparative-landing-tables.js';
import {OVERVIEW_COLUMNS, SCENARIO_LINKS} from './comparative-page-columns.js';

const DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH = 'docs/benchmarks/lagrange-metrics-evolution.svg';
const DEFAULT_LAGRANGE_EVOLUTION_MD_PATH = 'docs/benchmarks/lagrange-metrics-evolution.md';
const DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH = 'docs/benchmarks/lagrange-metrics-evolution.html';

function buildLagrangeEvolutionPage(matrix) {
  return {
    title: 'Lagrange milestones',
    intro: ['Each milestone lists the claims it advertised. Lagrange Scenario B is blocked ' +
      'until the compiled risk service journey exists.'],
    sections: [
      buildExperimentSection(matrix, 'lagrange-evolution', ''),
      buildTargetSection(matrix, {heading: 'Lagrange configurations', description: '',
        columns: OVERVIEW_COLUMNS, targetIds: [TARGET_ID.LAGRANGE, TARGET_ID.LAGRANGE_5]}),
    ],
    links: SCENARIO_LINKS, sources: matrix.sources, svgHref: 'lagrange-metrics-evolution.svg',
  };
}

async function writeLagrangeEvolutionStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildLagrangeEvolutionPage(matrix),
    {svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_LAGRANGE_EVOLUTION_HTML_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_MD_PATH,
  DEFAULT_LAGRANGE_EVOLUTION_SVG_PATH,
  writeLagrangeEvolutionStaticWebArtifacts,
};
