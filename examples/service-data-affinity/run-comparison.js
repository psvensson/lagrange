import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {downloadRatings} from './download-movielens.js';
import {runAffinityDemo} from './run-affinity-demo.js';
import {runPostgresBaseline} from './run-postgres-baseline.js';
import {
  writeAffinityDemoLiveReport,
} from './affinity-demo-live-report.js';

const REPORT_DIR = resolve('test-output/reports');
const REPORT_SCENARIO = 'movielens-three-way-affinity-demo-live';
const SCORE_EPSILON = 1e-9;

function rankingsEqual(left, right) {
  return left.length === right.length && left.every((row, index) =>
    Number(row.movieId) === Number(right[index]?.movieId) &&
    Math.abs(Number(row.score) - Number(right[index]?.score)) <=
      SCORE_EPSILON);
}

function buildComparison(postgres, lagrange) {
  const postgresRanking = postgres.topMovies.map((row) => ({
    movieId: Number(row.movieId),
    score: Number(row.score),
  }));
  const resultsIdentical = rankingsEqual(
    postgresRanking, lagrange.ranking,
  );
  return {
    resultsIdentical,
    postgresDistributedSql: {
      topology: 'one primary plus two synchronous streaming replicas',
      queryMs: postgres.queryDurationMs,
      returnedAggregateRows: postgres.returnedAggregateRows,
    },
    lagrangeDistributedSql: lagrange.lagrangeDistributedSql,
    lagrangeReplicatedService: {
      replicas: lagrange.parallelReduce.replicas,
      mergeCandidates: lagrange.parallelReduce.mergeCandidates,
      learnedAffinity: lagrange.learnedAffinity,
    },
    interpretation: {
      latencyComparable: false,
      reason: 'local demo topologies and runtimes differ; compare result ' +
        'correctness, transfer shape, and learned placement directly',
      serviceAdvantage: 'custom confidence-adjusted ranking runs on ' +
        'replicas placed by observed data access and exchanges at most ' +
        'replicas times top-N candidates',
    },
  };
}

async function writeComparisonReport(comparison, error = null) {
  const timestamp = new Date().toISOString();
  const passed = comparison?.resultsIdentical === true && !error;
  const report = {
    timestamp,
    scenario: REPORT_SCENARIO,
    producer: 'movielens-three-way-comparison',
    fidelity: 'live',
    summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {
      scenarios: [{
        scenario: REPORT_SCENARIO,
        passed,
        current: {passed, verdict: passed ? 'PASS' : 'FAIL'},
        detail: {comparison, error: error?.message || null},
      }],
    },
  };
  await mkdir(REPORT_DIR, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const path = resolve(
    REPORT_DIR, `${REPORT_SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}

async function runComparison() {
  const phaseEvidence = {};
  let lagrange;
  let comparison;
  try {
    await downloadRatings();
    console.log('[A/3] PostgreSQL grouped-SQL baseline...');
    const postgres = await runPostgresBaseline();
    console.log('[B+C/3] Lagrange distributed SQL and replicated service...');
    lagrange = await runAffinityDemo({phaseEvidence});
    comparison = buildComparison(postgres, lagrange);
    if (!comparison.resultsIdentical) {
      throw new Error('PostgreSQL and Lagrange rankings differ');
    }
  } catch (error) {
    await writeAffinityDemoLiveReport(null, error, phaseEvidence);
    throw error;
  }
  await writeAffinityDemoLiveReport(lagrange, null, phaseEvidence);
  return comparison;
}

if (process.argv[1]?.includes('run-comparison.js')) {
  runComparison()
    .then(async (comparison) => {
      const reportPath = await writeComparisonReport(comparison);
      console.log(JSON.stringify(comparison, null, 2));
      console.log(`Comparison report: ${reportPath}`);
    })
    .catch(async (error) => {
      const reportPath = await writeComparisonReport(null, error);
      console.error(error);
      console.error(`Failure report: ${reportPath}`);
      process.exitCode = 1;
    });
}

export {buildComparison, rankingsEqual, runComparison};
