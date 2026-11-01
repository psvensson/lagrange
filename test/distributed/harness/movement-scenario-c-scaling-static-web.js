// Partition movement under load and Scenario C at scale: admission cells for the advertised experiment claims. Each claim kind
// needs its own observed record; this page holds no measurement of its own.
import {buildExperimentSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {SCENARIO_LINKS} from './comparative-page-columns.js';

const DEFAULT_MOVEMENT_SCALING_SVG_PATH = 'docs/benchmarks/movement-and-scenario-c-scaling-progress.svg';
const DEFAULT_MOVEMENT_SCALING_MD_PATH = 'docs/benchmarks/movement-and-scenario-c-scaling-progress.md';
const DEFAULT_MOVEMENT_SCALING_HTML_PATH = 'docs/benchmarks/movement-and-scenario-c-scaling-progress.html';

function buildPage(matrix) {
  return {
    title: 'Partition movement under load and Scenario C at scale',
    intro: ['A movement claim needs injection times, the observed authority change, acknowledged operation identities and a final-state check.'],
    sections: [
      buildExperimentSection(matrix, 'live-movement-under-load', ''),
      buildExperimentSection(matrix, 'scenario-c-joint-scaling', ''),
    ],
    links: SCENARIO_LINKS, sources: matrix.sources,
    svgHref: 'movement-and-scenario-c-scaling-progress.svg',
  };
}

async function writeMovementScenarioCScalingStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildPage(matrix), {svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_MOVEMENT_SCALING_HTML_PATH,
  DEFAULT_MOVEMENT_SCALING_MD_PATH,
  DEFAULT_MOVEMENT_SCALING_SVG_PATH,
  writeMovementScenarioCScalingStaticWebArtifacts,
};
