// Three-to-five-node scale-out: admission cells for the advertised experiment claims. Each claim kind
// needs its own observed record; this page holds no measurement of its own.
import {buildExperimentSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {SCENARIO_LINKS} from './comparative-page-columns.js';

function buildPage(matrix) {
  return {
    title: 'Three-to-five-node scale-out',
    intro: ['A scale-out claim needs Scenario A runs at both node counts with observed process placement; replica placement needs its own observation and is never derived from the replication factor.'],
    sections: [
      buildExperimentSection(matrix, 'scaleout-3to5-node-rf3', ''),
      buildExperimentSection(matrix, 'replica-placement-5node-rf3', ''),
    ],
    links: SCENARIO_LINKS, sources: matrix.sources,
    svgHref: 'scaleout-3to5-node-rf3-progress.svg',
  };
}

async function writeScaleout3To5ComparisonStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildPage(matrix), {svgPath, markdownPath, htmlPath});
}

export {
  writeScaleout3To5ComparisonStaticWebArtifacts,
};
