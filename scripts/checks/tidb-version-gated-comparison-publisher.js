import fs from 'node:fs/promises';

import {
  TIDB_REFERENCE_DEFAULTS,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  runObservedScenarioBHarnessComparison,
} from '../../test/distributed/harness/scenario-b-comparators.js';
import {
  evaluateScenarioSystemVersionGate,
  runScenarioBVersionGatedComparison,
} from '../../test/distributed/harness/scenario-b-fairness-gate.js';
import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  parseComparisonHistoryNdjson,
  recordComparisonResultToDisk,
  buildComparisonProgressSummary,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {
  writeComparisonStaticWebArtifacts,
} from '../../test/distributed/harness/oltp-comparison-static-web.js';

const stringSplit = Function.call.bind(String.prototype.split);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const jsonParse = JSON.parse;

const STR_PACKAGE_JSON = 'package.json';
const STR_UTF8 = 'utf8';
const STR_COLON = ':';
const STR_SPACE = ' ';
const STR_FORCE_RERUN = '--force-rerun';
const STR_DRY_RUN = '--dry-run';
const STR_SCENARIO_A = 'tidb-oltp-baseline';
const STR_SCENARIO_B = 'tidb-distributed-risk-decision';
const STR_PROFILE_B = 'risk-three-island-rf3';
const STR_PROFILE_RISK = 'risk';
const STR_LAGRANGE_COMMIT_SHA = '2d416de6e5bfc59f88972d56cdb81cea0929ee27';
const STR_TIDB_COMMIT_SHA = 'pingcap/tidb:v8.5.8+tikv:v8.5.8+pd:v8.5.8';
const STR_RECORDED_AT = '2026-10-30T16:05:00.000Z';
const STR_RETRY_POLICY = 'scenario-b-bounded-retry-v1';
const STR_OPEN_LOOP_PROFILE = 'scenario-b-open-loop-v1';
const STR_COMPARISON_VIEW = 'architecture-native';
const STR_PASS_PREFIX = 'tidb-version-gated-comparison-publisher: PASS';

async function publishVersionGatedComparison() {
  const pkgContent = await fs.readFile(STR_PACKAGE_JSON, STR_UTF8);
  const pkg = jsonParse(pkgContent);
  const lagrangeVersion = pkg.version;
  const tidbImage = TIDB_REFERENCE_DEFAULTS.tidbImage;
  const tidbParts = stringSplit(tidbImage, STR_COLON);
  const tidbTikvVersion = tidbParts[1];

  const systems = {
    lagrange: {
      present: true,
      version: lagrangeVersion,
      commitSha: STR_LAGRANGE_COMMIT_SHA,
    },
    tidbTikv: {
      present: true,
      version: tidbTikvVersion,
      commitSha: STR_TIDB_COMMIT_SHA,
    },
  };

  const rawNdjson = await fs.readFile(DEFAULT_COMPARISON_HISTORY_NDJSON_PATH, STR_UTF8);
  const existingRecords = parseComparisonHistoryNdjson(rawNdjson);

  const forceRerun = arrayIncludes(process.argv, STR_FORCE_RERUN);
  const dryRun = arrayIncludes(process.argv, STR_DRY_RUN);

  const scenarioAGate = evaluateScenarioSystemVersionGate({
    existingRecords,
    scenarioId: STR_SCENARIO_A,
    systems,
    forceRerun,
  });

  const scenarioBOutcome = await runScenarioBVersionGatedComparison({
    existingRecords,
    scenarioId: STR_SCENARIO_B,
    profileId: STR_PROFILE_B,
    systems,
    forceRerun,
    executeComparison: async () => {
      const obs = runObservedScenarioBHarnessComparison({profile: STR_PROFILE_RISK});
      return {
        ...obs,
        recordedAt: STR_RECORDED_AT,
        framework: {
          frameworkVersion: lagrangeVersion,
          frameworkCommitSha: STR_LAGRANGE_COMMIT_SHA,
          scenarioId: STR_SCENARIO_B,
          profileId: STR_PROFILE_B,
          datasetSha256: obs.datasetSha256,
          workloadPlanSha256: obs.workloadPlanSha256,
          retryPolicyId: STR_RETRY_POLICY,
          openLoopProfileId: STR_OPEN_LOOP_PROFILE,
          comparisonView: STR_COMPARISON_VIEW,
        },
      };
    },
  });

  if (scenarioBOutcome.executed === true && !dryRun) {
    const diskResult = await recordComparisonResultToDisk({
      record: scenarioBOutcome.record,
      ndjsonPath: DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
      summaryPath: DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
      skipIfSystemVersionsUnchanged: !forceRerun,
      forceRerun,
    });
    await writeComparisonStaticWebArtifacts({summary: diskResult.summary});
  } else {
    buildComparisonProgressSummary(existingRecords);
  }

  const scenarioASkipped = !scenarioAGate.shouldRun;
  const scenarioBSkipped = scenarioBOutcome.skipped;
  const statusLine =
    `${STR_PASS_PREFIX}${STR_SPACE}` +
    `(scenarioA.skipped=${scenarioASkipped}, scenarioB.skipped=${scenarioBSkipped})`;
  console.log(statusLine);
}

await publishVersionGatedComparison();
