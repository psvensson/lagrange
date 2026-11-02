// Scenario B under network delay and a heavy working set: admission cells for the advertised experiment claims. Each claim kind
// needs its own observed record; this page holds no measurement of its own.
import {buildExperimentSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {SCENARIO_LINKS} from './comparative-page-columns.js';

function buildPage(matrix) {
  return {
    title: 'Scenario B under network delay and a heavy working set',
    intro: ['Network delay is a controlled impairment of actual traffic and must be verified before and after a run; load variables stay fixed across delay points.'],
    sections: [
      buildExperimentSection(matrix, 'scenario-b-rtt-sweep', ''),
      buildExperimentSection(matrix, 'scenario-b-working-set', ''),
    ],
    links: SCENARIO_LINKS, sources: matrix.sources, withdrawal: matrix.withdrawal,
    svgHref: 'scenario-b-rtt-working-set-crossover.svg',
  };
}

async function writeScenarioBRttWorkingSetStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildPage(matrix), {svgPath, markdownPath, htmlPath});
}

export {
  writeScenarioBRttWorkingSetStaticWebArtifacts,
};
