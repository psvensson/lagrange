import {
  SCHEMA_VERSION_CAUSAL_ANALYSIS_V1,
  buildCausalAnalysisSchema,
} from './causal-analysis-schema.js';
import {buildCausalGraph} from './causal-graph-builder.js';
import {accountBudgets} from './budget-timeout-accounting.js';
import {reviewInvariants} from './invariant-review.js';
import {classifyFailures} from './failure-class-taxonomy.js';
import {decideStopCondition} from './stop-condition-decision.js';

function buildCausalAnalysis(input = {}) {
  const graph = buildCausalGraph(input);
  const budgetAccounting = accountBudgets(input);
  const invariantReview = reviewInvariants(input);
  const failureTaxonomy = classifyFailures(input);
  const stopDecision = decideStopCondition(input);
  return {
    schemaVersion: SCHEMA_VERSION_CAUSAL_ANALYSIS_V1,
    scenario: graph.scenario,
    schema: buildCausalAnalysisSchema(),
    graph,
    budgetAccounting,
    invariantReview,
    failureTaxonomy,
    stopDecision,
    summary: {
      outcome: stopDecision.outcome,
      dominantFailureClass: failureTaxonomy.dominantFailureClass,
      firstCriticalPathNodeId: graph.summary.firstCriticalPathNodeId,
      exhaustedBudgetCount: budgetAccounting.summary.exhaustedCount,
      failedInvariantCount: invariantReview.summary.failedCount,
    },
  };
}

export {
  buildCausalAnalysis,
  buildCausalAnalysisSchema,
  buildCausalGraph,
  accountBudgets,
  reviewInvariants,
  classifyFailures,
  decideStopCondition,
};
