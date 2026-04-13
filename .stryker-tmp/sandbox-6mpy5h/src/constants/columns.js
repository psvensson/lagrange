// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const COLUMN = Object.freeze(stryMutAct_9fa48("54436") ? {} : (stryCov_9fa48("54436"), {
  NODE_ID: stryMutAct_9fa48("54437") ? "" : (stryCov_9fa48("54437"), 'node_id'),
  NODE_ADDRESS: stryMutAct_9fa48("54438") ? "" : (stryCov_9fa48("54438"), 'node_address'),
  CPU_CORES: stryMutAct_9fa48("54439") ? "" : (stryCov_9fa48("54439"), 'cpu_cores'),
  MEMORY_MB: stryMutAct_9fa48("54440") ? "" : (stryCov_9fa48("54440"), 'memory_mb'),
  DISK_GB: stryMutAct_9fa48("54441") ? "" : (stryCov_9fa48("54441"), 'disk_gb'),
  CPU_USAGE_PERCENT: stryMutAct_9fa48("54442") ? "" : (stryCov_9fa48("54442"), 'cpu_usage_percent'),
  MEMORY_USAGE_PERCENT: stryMutAct_9fa48("54443") ? "" : (stryCov_9fa48("54443"), 'memory_usage_percent'),
  DISK_USAGE_PERCENT: stryMutAct_9fa48("54444") ? "" : (stryCov_9fa48("54444"), 'disk_usage_percent'),
  STATUS: stryMutAct_9fa48("54445") ? "" : (stryCov_9fa48("54445"), 'status'),
  STATE: stryMutAct_9fa48("54446") ? "" : (stryCov_9fa48("54446"), 'state'),
  PARTITION_ID: stryMutAct_9fa48("54447") ? "" : (stryCov_9fa48("54447"), 'partition_id'),
  SIZE_BYTES: stryMutAct_9fa48("54448") ? "" : (stryCov_9fa48("54448"), 'size_bytes'),
  LEADER_NODE_ID: stryMutAct_9fa48("54449") ? "" : (stryCov_9fa48("54449"), 'leader_node_id'),
  TABLE_ID: stryMutAct_9fa48("54450") ? "" : (stryCov_9fa48("54450"), 'table_id'),
  SERVICE_ID: stryMutAct_9fa48("54451") ? "" : (stryCov_9fa48("54451"), 'service_id'),
  OPERATION_ID: stryMutAct_9fa48("54452") ? "" : (stryCov_9fa48("54452"), 'operation_id'),
  RESERVATION_ID: stryMutAct_9fa48("54453") ? "" : (stryCov_9fa48("54453"), 'reservation_id'),
  ENTITY_TYPE: stryMutAct_9fa48("54454") ? "" : (stryCov_9fa48("54454"), 'entity_type'),
  ENTITY_ID: stryMutAct_9fa48("54455") ? "" : (stryCov_9fa48("54455"), 'entity_id'),
  GROUP_ID: stryMutAct_9fa48("54456") ? "" : (stryCov_9fa48("54456"), 'group_id'),
  INDEX_ID: stryMutAct_9fa48("54457") ? "" : (stryCov_9fa48("54457"), 'index_id'),
  LOG_ID: stryMutAct_9fa48("54458") ? "" : (stryCov_9fa48("54458"), 'log_id'),
  CONFIG_KEY: stryMutAct_9fa48("54459") ? "" : (stryCov_9fa48("54459"), 'config_key'),
  CONFIG_VALUE: stryMutAct_9fa48("54460") ? "" : (stryCov_9fa48("54460"), 'config_value'),
  VALUE_TYPE: stryMutAct_9fa48("54461") ? "" : (stryCov_9fa48("54461"), 'value_type'),
  REQUIRES_RESTART: stryMutAct_9fa48("54462") ? "" : (stryCov_9fa48("54462"), 'requires_restart'),
  DESCRIPTION: stryMutAct_9fa48("54463") ? "" : (stryCov_9fa48("54463"), 'description'),
  DEFAULT_VALUE: stryMutAct_9fa48("54464") ? "" : (stryCov_9fa48("54464"), 'default_value'),
  UPDATED_BY: stryMutAct_9fa48("54465") ? "" : (stryCov_9fa48("54465"), 'updated_by'),
  UPDATED_AT: stryMutAct_9fa48("54466") ? "" : (stryCov_9fa48("54466"), 'updated_at'),
  CREATED_AT: stryMutAct_9fa48("54467") ? "" : (stryCov_9fa48("54467"), 'created_at'),
  QUERY_ID: stryMutAct_9fa48("54468") ? "" : (stryCov_9fa48("54468"), 'query_id'),
  CONTEXT_ID: stryMutAct_9fa48("54469") ? "" : (stryCov_9fa48("54469"), 'context_id'),
  FUNCTION_ID: stryMutAct_9fa48("54470") ? "" : (stryCov_9fa48("54470"), 'function_id'),
  ADDRESS: stryMutAct_9fa48("54471") ? "" : (stryCov_9fa48("54471"), 'address'),
  REPLICA_ID: stryMutAct_9fa48("54472") ? "" : (stryCov_9fa48("54472"), 'replica_id'),
  CONNECTION_STATE: stryMutAct_9fa48("54473") ? "" : (stryCov_9fa48("54473"), 'connection_state'),
  CAPABILITIES: stryMutAct_9fa48("54474") ? "" : (stryCov_9fa48("54474"), 'capabilities'),
  LAST_HEARTBEAT: stryMutAct_9fa48("54475") ? "" : (stryCov_9fa48("54475"), 'last_heartbeat'),
  READY_LEASE_EXPIRES_AT: stryMutAct_9fa48("54476") ? "" : (stryCov_9fa48("54476"), 'ready_lease_expires_at'),
  STORAGE_BUDGET_BYTES: stryMutAct_9fa48("54477") ? "" : (stryCov_9fa48("54477"), 'storage_budget_bytes'),
  STORAGE_BUDGET_SOURCE: stryMutAct_9fa48("54478") ? "" : (stryCov_9fa48("54478"), 'storage_budget_source'),
  STORAGE_BUDGET_UPDATED_AT: stryMutAct_9fa48("54479") ? "" : (stryCov_9fa48("54479"), 'storage_budget_updated_at'),
  LATENCY_GROUP_ID: stryMutAct_9fa48("54480") ? "" : (stryCov_9fa48("54480"), 'latency_group_id'),
  LAST_LATENCY_CHECK_AT: stryMutAct_9fa48("54481") ? "" : (stryCov_9fa48("54481"), 'last_latency_check_at'),
  LATENCY_ASSIGNMENT_STATE: stryMutAct_9fa48("54482") ? "" : (stryCov_9fa48("54482"), 'latency_assignment_state'),
  SERVICE_TYPE: stryMutAct_9fa48("54483") ? "" : (stryCov_9fa48("54483"), 'service_type'),
  RAFT_ROLE: stryMutAct_9fa48("54484") ? "" : (stryCov_9fa48("54484"), 'raft_role'),
  TARGET_NODE_ID: stryMutAct_9fa48("54485") ? "" : (stryCov_9fa48("54485"), 'target_node_id'),
  ESTIMATED_BYTES: stryMutAct_9fa48("54486") ? "" : (stryCov_9fa48("54486"), 'estimated_bytes'),
  AMPLIFICATION_FACTOR: stryMutAct_9fa48("54487") ? "" : (stryCov_9fa48("54487"), 'amplification_factor'),
  EXPIRES_AT: stryMutAct_9fa48("54488") ? "" : (stryCov_9fa48("54488"), 'expires_at'),
  RELEASED_AT: stryMutAct_9fa48("54489") ? "" : (stryCov_9fa48("54489"), 'released_at'),
  REASON_CODE: stryMutAct_9fa48("54490") ? "" : (stryCov_9fa48("54490"), 'reason_code'),
  // Endpoint columns for node_endpoints table
  ENDPOINT_ID: stryMutAct_9fa48("54491") ? "" : (stryCov_9fa48("54491"), 'endpoint_id'),
  TRANSPORT_TYPE: stryMutAct_9fa48("54492") ? "" : (stryCov_9fa48("54492"), 'transport_type'),
  PRIORITY: stryMutAct_9fa48("54493") ? "" : (stryCov_9fa48("54493"), 'priority'),
  METADATA: stryMutAct_9fa48("54494") ? "" : (stryCov_9fa48("54494"), 'metadata'),
  // Timer columns for service_timers table
  TIMER_ID: stryMutAct_9fa48("54495") ? "" : (stryCov_9fa48("54495"), 'timer_id'),
  // WASM meta-service columns
  NAMESPACE: stryMutAct_9fa48("54496") ? "" : (stryCov_9fa48("54496"), 'namespace'),
  NAME: stryMutAct_9fa48("54497") ? "" : (stryCov_9fa48("54497"), 'name'),
  VERSION: stryMutAct_9fa48("54498") ? "" : (stryCov_9fa48("54498"), 'version'),
  LOCK_ID: stryMutAct_9fa48("54499") ? "" : (stryCov_9fa48("54499"), 'lock_id'),
  TENANT_ID: stryMutAct_9fa48("54500") ? "" : (stryCov_9fa48("54500"), 'tenant_id'),
  IDEMPOTENCY_KEY: stryMutAct_9fa48("54501") ? "" : (stryCov_9fa48("54501"), 'idempotency_key'),
  REPRESENTATIVE_NODE_ID: stryMutAct_9fa48("54502") ? "" : (stryCov_9fa48("54502"), 'representative_node_id'),
  COORDINATOR_NODE_ID: stryMutAct_9fa48("54503") ? "" : (stryCov_9fa48("54503"), 'coordinator_node_id'),
  SOURCE_GROUP_ID: stryMutAct_9fa48("54504") ? "" : (stryCov_9fa48("54504"), 'source_group_id'),
  TARGET_GROUP_ID: stryMutAct_9fa48("54505") ? "" : (stryCov_9fa48("54505"), 'target_group_id'),
  LATENCY_MS: stryMutAct_9fa48("54506") ? "" : (stryCov_9fa48("54506"), 'latency_ms'),
  SAMPLE_COUNT: stryMutAct_9fa48("54507") ? "" : (stryCov_9fa48("54507"), 'sample_count'),
  SAMPLE_QUALITY: stryMutAct_9fa48("54508") ? "" : (stryCov_9fa48("54508"), 'sample_quality'),
  LAST_MEASURED_AT: stryMutAct_9fa48("54509") ? "" : (stryCov_9fa48("54509"), 'last_measured_at'),
  LATENCY_EDGE_ID: stryMutAct_9fa48("54510") ? "" : (stryCov_9fa48("54510"), 'latency_edge_id')
}));
export { COLUMN };