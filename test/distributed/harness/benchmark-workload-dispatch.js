// Owner of comparative-benchmark dispatch: which business-operation family a
// (scenario, subkind) runs, which named workload profile it uses, and the
// typed non-executions. Every family is enumerated; anything else is a typed
// refusal, never a substitute statement.
import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const FAMILY = Object.freeze({
  SCENARIO_A_OLTP: 'scenario-a-oltp',
  SCENARIO_A_SMOKE: 'scenario-a-smoke',
  SCENARIO_B_RISK_DECISION: 'scenario-b-risk-decision',
  SCENARIO_C_STREAMING_FEATURE: 'scenario-c-streaming-feature',
});

const DISPATCH_STATUS = Object.freeze({
  EXECUTED: 'executed',
  BLOCKED: 'blocked',
  UNSUPPORTED: 'unsupported',
});

const DISPATCH_REFUSED_CODE = 'BENCHMARK_DISPATCH_REFUSED';

const NON_EXECUTION_REASON = Object.freeze({
  LAGRANGE_RISK_SERVICE_MISSING: 'missing-compiled-risk-decision-service-journey',
  RISK_COMPARATOR_JOURNEY_MISSING: 'comparator-risk-decision-journey-not-implemented',
  STREAMING_INGESTION_MISSING: 'event-ingestion-and-freshness-contract-not-implemented',
});

// The publication class of a profile: a smoke profile is published as
// smoke and never as Scenario A capacity.
const PUBLICATION = Object.freeze({
  SMOKE: 'smoke',
  SCENARIO_A: 'scenario-a',
});

// The profile class admission reads: a smoke profile never carries a
// capacity metric.
const PROFILE_CLASS = Object.freeze({
  SMOKE: 'smoke',
  CAPACITY: 'capacity',
});

const WORKLOAD_PROFILE = Object.freeze({
  [FAMILY.SCENARIO_A_SMOKE]: Object.freeze({
    id: 'scenario-a-smoke-v1',
    publication: PUBLICATION.SMOKE,
    profileClass: PROFILE_CLASS.SMOKE,
    ownsWorkload: true,
    workload: Object.freeze({
      seed: 0x5eed5eed,
      workers: 2,
      warmupOperationsPerWorker: 5,
      measurementOperationsPerWorker: 50,
      warehouseCount: 1,
      districtsPerWarehouse: 2,
      customersPerDistrict: 30,
      itemCount: 200,
    }),
  }),
  [FAMILY.SCENARIO_A_OLTP]: Object.freeze({
    id: 'scenario-a-oltp-baseline-v1',
    publication: PUBLICATION.SCENARIO_A,
    profileClass: PROFILE_CLASS.CAPACITY,
    ownsWorkload: false,
    workload: null,
  }),
});

const SCENARIO = Object.freeze({
  A: 'scenarioA',
  B: 'scenarioB',
  C: 'scenarioC',
});
const SCENARIO_A_SUBKIND = Object.freeze({
  MAIN: 'main',
  SMOKE: 'smoke',
});

const SYSTEMS = Object.freeze(Object.values(OLTP_SCENARIO_A_SYSTEM));

function refuse(message, details) {
  const error = new Error(message);
  error.name = 'BenchmarkDispatchRefusedError';
  error.code = DISPATCH_REFUSED_CODE;
  error.dispatch = Object.freeze({...details});
  return error;
}

function requireSystem(system, details) {
  if (!arrayIncludes(SYSTEMS, system)) {
    throw refuse(`benchmark dispatch does not know system ${system}`, details);
  }
  return system;
}

function familyOf(scenario, subkind, details) {
  if (scenario === SCENARIO.A && subkind === SCENARIO_A_SUBKIND.MAIN) {
    return FAMILY.SCENARIO_A_OLTP;
  }
  if (scenario === SCENARIO.A && subkind === SCENARIO_A_SUBKIND.SMOKE) {
    return FAMILY.SCENARIO_A_SMOKE;
  }
  if (scenario === SCENARIO.B && typeof subkind === 'string' && subkind !== '') {
    return FAMILY.SCENARIO_B_RISK_DECISION;
  }
  if (scenario === SCENARIO.C && typeof subkind === 'string' && subkind !== '') {
    return FAMILY.SCENARIO_C_STREAMING_FEATURE;
  }
  throw refuse(
    `benchmark dispatch has no business-operation family for ${scenario}/${subkind}`,
    details,
  );
}

function nonExecution(family, system) {
  if (family === FAMILY.SCENARIO_B_RISK_DECISION) {
    return system === OLTP_SCENARIO_A_SYSTEM.LAGRANGE ?
      {status: DISPATCH_STATUS.BLOCKED,
        reason: NON_EXECUTION_REASON.LAGRANGE_RISK_SERVICE_MISSING} :
      {status: DISPATCH_STATUS.UNSUPPORTED,
        reason: NON_EXECUTION_REASON.RISK_COMPARATOR_JOURNEY_MISSING};
  }
  if (family === FAMILY.SCENARIO_C_STREAMING_FEATURE) {
    return {status: DISPATCH_STATUS.UNSUPPORTED,
      reason: NON_EXECUTION_REASON.STREAMING_INGESTION_MISSING};
  }
  return null;
}

function resolveBenchmarkDispatch({targetId, system, scenario, subkind}) {
  const details = {targetId, system, scenario, subkind};
  requireSystem(system, details);
  const family = familyOf(scenario, subkind, details);
  const blocked = nonExecution(family, system);
  return Object.freeze({
    targetId,
    system,
    scenario,
    subkind,
    family,
    status: blocked ? blocked.status : DISPATCH_STATUS.EXECUTED,
    reason: blocked ? blocked.reason : null,
    profile: blocked ? null : WORKLOAD_PROFILE[family],
  });
}

/**
 * The named workload profile a Scenario A (scenario, subkind) runs, for a
 * reader that holds a run record (admission): the same family resolution as
 * the dispatch, without a system. A family without an executed profile and an
 * unknown family are typed refusals.
 * @param {{scenario: string, subkind: string}} claim
 * @return {Object} the workload profile
 */
function resolveBenchmarkWorkloadProfile({scenario, subkind}) {
  const details = {scenario, subkind};
  const profile = WORKLOAD_PROFILE[familyOf(scenario, subkind, details)];
  if (!profile) {
    throw refuse(`benchmark family of ${scenario}/${subkind} executes no workload profile`,
      details);
  }
  return profile;
}

function isBenchmarkDispatchRefusal(error) {
  return error?.code === DISPATCH_REFUSED_CODE && stringStartsWith(String(error.name),
    'BenchmarkDispatch');
}

export {
  DISPATCH_REFUSED_CODE as BENCHMARK_DISPATCH_REFUSED_CODE,
  DISPATCH_STATUS as BENCHMARK_DISPATCH_STATUS,
  FAMILY as BENCHMARK_OPERATION_FAMILY,
  PROFILE_CLASS as BENCHMARK_PROFILE_CLASS,
  WORKLOAD_PROFILE as BENCHMARK_WORKLOAD_PROFILE,
  isBenchmarkDispatchRefusal,
  resolveBenchmarkDispatch,
  resolveBenchmarkWorkloadProfile,
};
