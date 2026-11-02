// Partition movement under load and Scenario C at scale: admission cells for the advertised experiment claims. Each claim kind
// needs its own observed record; this page holds no measurement of its own.
import {buildExperimentSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {SCENARIO_LINKS} from './comparative-page-columns.js';

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
  writeMovementScenarioCScalingStaticWebArtifacts,
};
