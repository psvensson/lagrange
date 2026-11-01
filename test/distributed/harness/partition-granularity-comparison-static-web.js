// Partition granularity sweep: admission cells for the advertised experiment claims. Each claim kind
// needs its own observed record; this page holds no measurement of its own.
import {buildExperimentSection, writeClaimPageArtifacts} from './comparative-landing-tables.js';
import {SCENARIO_LINKS} from './comparative-page-columns.js';

const DEFAULT_PARTITION_SWEEP_SVG_PATH = 'docs/benchmarks/partition-granularity-sweep-progress.svg';
const DEFAULT_PARTITION_SWEEP_MD_PATH = 'docs/benchmarks/partition-granularity-sweep-progress.md';
const DEFAULT_PARTITION_SWEEP_HTML_PATH = 'docs/benchmarks/partition-granularity-sweep-progress.html';

function buildPage(matrix) {
  return {
    title: 'Partition granularity sweep',
    intro: ['A partition-count claim needs runs that create the stated partition counts and record the observed leader and replica placement.'],
    sections: [
      buildExperimentSection(matrix, 'partition-granularity-sweep', ''),
    ],
    links: SCENARIO_LINKS, sources: matrix.sources,
    svgHref: 'partition-granularity-sweep-progress.svg',
  };
}

async function writePartitionGranularityComparisonStaticWebArtifacts({matrix, svgPath, markdownPath,
  htmlPath}) {
  return writeClaimPageArtifacts(buildPage(matrix), {svgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_PARTITION_SWEEP_HTML_PATH,
  DEFAULT_PARTITION_SWEEP_MD_PATH,
  DEFAULT_PARTITION_SWEEP_SVG_PATH,
  writePartitionGranularityComparisonStaticWebArtifacts,
};
