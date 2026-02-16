const DISTRIBUTED_STATEMENT_TYPE = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});

const DISTRIBUTED_PLAN_FIELD = Object.freeze({
  PLAN_ID: 'planId',
  STATEMENT_TYPE: 'statementType',
  TABLE_PLANS: 'tablePlans',
  JOIN_PLAN: 'joinPlan',
  SET_OPERATION_PLAN: 'setOperationPlan',
  FRAGMENT_PLANS: 'fragmentPlans',
  MERGE_PLAN: 'mergePlan',
  EXECUTION_POLICY: 'executionPolicy',
  DIAGNOSTICS: 'diagnostics',
});

const DISTRIBUTED_JOIN_STRATEGY = Object.freeze({
  BROADCAST: 'broadcast',
  REPARTITION: 'repartition',
  NESTED_LOOP: 'nested_loop',
});

const DISTRIBUTED_ROLE_HINT = Object.freeze({
  LEADER: 'leader',
  FOLLOWER_OK: 'follower-ok',
});

const DISTRIBUTED_PREDICATE_SHAPE = Object.freeze({
  EQ: 'eq',
  RANGE: 'range',
  IN: 'in',
  BETWEEN: 'between',
  SCATTER: 'scatter',
});

const DISTRIBUTED_EXECUTION_POLICY = Object.freeze({
  READ_FAIL_CLOSED: 'read_fail_closed',
  WRITE_FAIL_CLOSED: 'write_fail_closed',
});

const DISTRIBUTED_QUERY_ERROR_CODE = Object.freeze({
  DISTRIBUTED_PLAN_INVALID: 'DISTRIBUTED_PLAN_INVALID',
  DISTRIBUTED_TABLE_PLAN_MISSING: 'DISTRIBUTED_TABLE_PLAN_MISSING',
});

const DISTRIBUTED_QUERY_ERROR_MSG = Object.freeze({
  DISTRIBUTED_PLAN_INVALID: 'Distributed query plan is invalid',
  DISTRIBUTED_TABLE_PLAN_MISSING: 'Table access plan missing from distributed plan',
});

const DISTRIBUTED_PLANNER_DEFAULT = Object.freeze({
  JOIN_BROADCAST_PARTITION_THRESHOLD: 2,
});

export {
  DISTRIBUTED_EXECUTION_POLICY,
  DISTRIBUTED_JOIN_STRATEGY,
  DISTRIBUTED_PLAN_FIELD,
  DISTRIBUTED_PLANNER_DEFAULT,
  DISTRIBUTED_PREDICATE_SHAPE,
  DISTRIBUTED_QUERY_ERROR_CODE,
  DISTRIBUTED_QUERY_ERROR_MSG,
  DISTRIBUTED_ROLE_HINT,
  DISTRIBUTED_STATEMENT_TYPE,
};
