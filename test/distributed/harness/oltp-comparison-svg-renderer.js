// Lagrange/TiDB comparison history as a page model. History records are forensic:
// each row names the record and its admission status (always a non-valid status
// with reason codes); no history metric is republished.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSlice = Function.call.bind(String.prototype.slice);

const SCENARIO_A_ID = 'tidb-oltp-baseline';
const SCENARIO_B_ID = 'tidb-distributed-risk-decision';
const SUMMARY_PATH = 'data/tidb-comparison/progress-summary.json';
const ADMISSION_COLUMN = 'admission';
const SHORT_SHA_LENGTH = 12;

const SCENARIO_DEFINITION_HREFS = Object.freeze({
  [SCENARIO_A_ID]: 'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
  [SCENARIO_B_ID]: 'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
});

function getScenarioDefinitionHref(scenarioId) {
  return SCENARIO_DEFINITION_HREFS[scenarioId] || 'tidb-reference-scenarios.md';
}

function entryRow(entry) {
  const sha = stringSlice(entry.recordSha256, 0, SHORT_SHA_LENGTH);
  const fw = entry.framework;
  return {
    label: `${entry.recordedAt} ${fw.scenarioId}/${fw.profileId} ` +
      `[${entry.evidenceSource.kind}] ${sha}`,
    cells: {[ADMISSION_COLUMN]: {claimKey: `history/${sha}`, ...entry.admission,
      metrics: null}},
  };
}

function historySection(heading, entries, scenarioId) {
  return {
    heading,
    description: scenarioId ?
      `Definition: ${getScenarioDefinitionHref(scenarioId)}. Latest record per combination.` :
      'Latest record per combination.',
    columns: [{key: ADMISSION_COLUMN, label: 'Admission'}],
    rows: arrayMap(entries, entryRow),
  };
}

/**
 * The comparison-history page model built from the progress summary.
 * @param {Object} summary From buildComparisonProgressSummary.
 * @return {Object}
 */
function buildComparisonHistoryPage(summary) {
  const of = (id) => arrayFilter(summary.entries, (e) => e.framework.scenarioId === id);
  const others = arrayFilter(summary.entries, (e) =>
    e.framework.scenarioId !== SCENARIO_A_ID && e.framework.scenarioId !== SCENARIO_B_ID);
  return {
    title: 'Lagrange and TiDB comparison history',
    intro: [`The history holds ${summary.totalRecords} records over ` +
      `${summary.totalCombinations} combinations. History records are forensic: none is ` +
      'admitted as a current result.'],
    sections: [
      historySection('Scenario A history', of(SCENARIO_A_ID), SCENARIO_A_ID),
      historySection('Scenario B history', of(SCENARIO_B_ID), SCENARIO_B_ID),
      historySection('Other history', others, null),
    ],
    sources: [{path: SUMMARY_PATH, sha256: `sha256:${summary.summarySha256}`}],
    svgHref: 'tidb-comparison-progress.svg',
  };
}

function buildScenarioBHistoryPage(summary) {
  const page = buildComparisonHistoryPage(summary);
  return {...page, title: 'Scenario B comparison history', sections: [page.sections[1]]};
}

export {
  buildComparisonHistoryPage,
  buildScenarioBHistoryPage,
  getScenarioDefinitionHref,
};
