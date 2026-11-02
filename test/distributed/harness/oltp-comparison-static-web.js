// Writes the Lagrange/TiDB comparison history pages from the progress summary.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {renderClaimPage} from './comparative-landing-tables.js';
import {
  buildComparisonHistoryPage,
  buildScenarioBHistoryPage,
  getScenarioDefinitionHref,
} from './oltp-comparison-svg-renderer.js';

const DEFAULT_COMPARISON_PROGRESS_SVG_PATH = 'docs/benchmarks/tidb-comparison-progress.svg';
const DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH = 'docs/benchmarks/tidb-scenario-b-comparison.svg';
const DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH = 'docs/benchmarks/tidb-comparison-progress.md';
const DEFAULT_COMPARISON_PROGRESS_HTML_PATH = 'docs/benchmarks/tidb-comparison-progress.html';

function renderComparisonProgress(summary) {
  const page = renderClaimPage(buildComparisonHistoryPage(summary));
  return {...page, scenarioBSvg: renderClaimPage(buildScenarioBHistoryPage(summary)).svg};
}

async function writeComparisonStaticWebArtifacts({
  summary,
  svgPath = DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  scenarioBSvgPath = DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  markdownPath = DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  htmlPath = DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
} = {}) {
  const rendered = renderComparisonProgress(summary);
  const writeTarget = async (p, c) => {
    await mkdir(path.dirname(p), {recursive: true});
    await writeFile(p, c, 'utf8');
  };
  await writeTarget(svgPath, rendered.svg);
  await writeTarget(scenarioBSvgPath, rendered.scenarioBSvg);
  await writeTarget(markdownPath, rendered.markdown);
  await writeTarget(htmlPath, rendered.html);
  return Object.freeze({...rendered, svgPath, scenarioBSvgPath, markdownPath, htmlPath});
}

export {
  DEFAULT_COMPARISON_PROGRESS_HTML_PATH,
  DEFAULT_COMPARISON_PROGRESS_MARKDOWN_PATH,
  DEFAULT_COMPARISON_PROGRESS_SVG_PATH,
  DEFAULT_SCENARIO_B_COMPARISON_SVG_PATH,
  getScenarioDefinitionHref,
  renderComparisonProgress,
  writeComparisonStaticWebArtifacts,
};
