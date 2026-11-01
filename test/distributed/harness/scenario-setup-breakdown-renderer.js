// Per-phase time breakdown: phase timings come only from observed spans. No run
// records spans today, so no phase value can be admitted; earlier published
// phases were constants or fractions of a total (defect D09).
import {buildExperimentSection, renderClaimPage} from './comparative-landing-tables.js';

const DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH =
  'docs/benchmarks/scenario-setup-time-breakdown.svg';

function renderScenarioSetupBreakdownSvg(matrix) {
  return renderClaimPage({
    title: 'Per-phase time breakdown', intro: [], sources: matrix.sources,
    sections: [buildExperimentSection(matrix, 'scenario-setup-breakdown', '')],
  }).svg;
}

export {DEFAULT_SCENARIO_SETUP_BREAKDOWN_SVG_PATH, renderScenarioSetupBreakdownSvg};
