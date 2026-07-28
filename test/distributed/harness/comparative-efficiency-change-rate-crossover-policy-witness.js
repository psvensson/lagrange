import {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  comparativeChangeRateCrossoverMutationCount,
} from './comparative-efficiency-change-rate-crossover-constants.js';

const VERSION = 'comparative-change-rate-crossover-policy-witness-v1';
const HOTSPOT_RATIO = '80_percent_requests_to_20_percent_keys';
const UNIFORM_RATIO = 'deterministic_uniform_domain';
const HOTSPOT = 'hotspot_80_20';
const MATERIALIZE = 'materialize_once';
const MATERIALIZED_CTE = 'MATERIALIZED';
const NOT_MATERIALIZED_CTE = 'NOT MATERIALIZED';
const MUTATION_OPERATION = 'primary_key_prefix_update';
const DIVERSITY_OPERATION = 'request_diversity_group';
const localText = Object.freeze({
  INVALID:
    'change-rate crossover policy witness requires an exact matrix cell',
});

function exactCell(cell, expected) {
  return cell.datasetSize === expected.datasetSize &&
    cell.mutationRate === expected.mutationRate &&
    cell.mutationDivisor === expected.mutationDivisor &&
    cell.workloadDiversity === expected.workloadDiversity &&
    cell.diversityCount === expected.diversityCount &&
    cell.skew === expected.skew &&
    cell.policy === expected.policy &&
    cell.requestCount === expected.requestCount;
}

function canonicalCell(cell) {
  for (let index = 0;
    index < COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length;
    index += 1) {
    const expected = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    if (cell && exactCell(cell, expected)) return expected;
  }
  throw new TypeError(localText.INVALID);
}

export function buildComparativeChangeRateCrossoverPolicyWitness(cell) {
  const current = canonicalCell(cell);
  return {
    version: VERSION,
    owners: COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
    mutationSchedule: {
      rate: current.mutationRate,
      divisor: current.mutationDivisor,
      mutationCount:
        comparativeChangeRateCrossoverMutationCount(current),
      operation: MUTATION_OPERATION,
    },
    workloadDiversity: {
      id: current.workloadDiversity,
      groupCount: current.diversityCount,
      operation: DIVERSITY_OPERATION,
    },
    accessSkew: {
      id: current.skew,
      distribution: current.skew === HOTSPOT ?
        HOTSPOT_RATIO :
        UNIFORM_RATIO,
    },
    recomputationMaterializationPolicy: {
      id: current.policy,
      sqlCtePolicy: current.policy === MATERIALIZE ?
        MATERIALIZED_CTE :
        NOT_MATERIALIZED_CTE,
    },
  };
}
