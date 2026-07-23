const DEPLOYMENT_BINDING_BUDGET_FIELDS = Object.freeze([
  'cpu_time_ms',
  'wall_time_ms',
  'memory_bytes',
  'input_bytes',
  'output_bytes',
  'context_bytes',
]);

const DEPLOYMENT_BINDING_BUDGET_LIMITS = Object.freeze({
  context_bytes: Object.freeze({minimum: 0, maximum: 67108864}),
  cpu_time_ms: Object.freeze({minimum: 1, maximum: 60000}),
  input_bytes: Object.freeze({minimum: 0, maximum: 16777216}),
  memory_bytes: Object.freeze({minimum: 1, maximum: 1073741824}),
  output_bytes: Object.freeze({minimum: 0, maximum: 16777216}),
  wall_time_ms: Object.freeze({minimum: 1, maximum: 300000}),
});

export {
  DEPLOYMENT_BINDING_BUDGET_FIELDS,
  DEPLOYMENT_BINDING_BUDGET_LIMITS,
};
