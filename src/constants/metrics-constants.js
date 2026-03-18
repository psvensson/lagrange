const METRICS_LOG_PREFIX = 'metrics.';

const METRICS_LOG_TAG = Object.freeze({
  QUERY_LIFECYCLE: 'metrics.query.lifecycle',
  QUERY_DISPATCH: 'metrics.query.dispatch',
  CONTROL_PLANE_GATEWAY_READ: 'metrics.control_plane.gateway.read',
  CONTROL_PLANE_GATEWAY_MUTATION: 'metrics.control_plane.gateway.mutation',
  CONTROL_PLANE_GATEWAY_RETENTION: 'metrics.control_plane.gateway.retention',
  PRESSURE_POLICY: 'metrics.pressure.policy',
  SELECT_DISTRIBUTED: 'metrics.select.distributed',
  FANOUT_COMPLETE: 'metrics.fanout.complete',
  PARTITION_SQLITE: 'metrics.partition.sqlite',
  PARTITION_RAFT_PROPOSE: 'metrics.partition.raft_propose',
  TRANSPORT_DELIVER: 'metrics.transport.deliver',
  TRANSPORT_ENDPOINT: 'metrics.transport.endpoint',
  CDC_WRITE: 'metrics.cdc.write',
  CDC_SQL_ROUTE: 'metrics.cdc.sql_route',
  CDC_PROPAGATION: 'metrics.cdc.propagation',
  HYDRATION_TABLE: 'metrics.hydration.table',
  HYDRATION_COMPLETE: 'metrics.hydration.complete',
  CALLBACK_THROUGHPUT: 'metrics.callback.throughput',
  REBALANCE_OPERATION: 'metrics.rebalance.operation',
  PGWIRE_HANDSHAKE: 'metrics.pgwire.handshake',
  PGWIRE_QUERY: 'metrics.pgwire.query',
  PGWIRE_SESSION: 'metrics.pgwire.session',
  PGWIRE_PROTOCOL_ERROR: 'metrics.pgwire.protocol_error',
});

export {METRICS_LOG_PREFIX, METRICS_LOG_TAG};
