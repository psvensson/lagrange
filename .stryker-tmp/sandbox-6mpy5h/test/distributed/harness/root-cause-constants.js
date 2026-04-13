// @ts-nocheck
export const ROOT_CAUSE_BUNDLE_SCHEMA_VERSION = 1;

export const ROOT_CAUSE_CODE = Object.freeze({
  UNKNOWN: 'unknown',

  ADMIN_NOT_QUERYABLE: 'admin_not_queryable',
  ROUTING_NOT_READY: 'routing_not_ready',
  SCHEMA_VERSION_UNKNOWN: 'schema_version_unknown',
  SCHEMA_VERSION_LAG: 'schema_version_lag',
  TOPOLOGY_NOT_READY: 'topology_not_ready',
  READINESS_MISSING: 'readiness_missing',

  SNAPSHOT_MISSING: 'snapshot_missing',
  LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION:
    'leadership_unknown_control_plane_partition',
  CDC_RETRY_STORM: 'cdc_retry_storm',
  CACHE_STALE_WATERMARK: 'cache_stale_watermark',
  SERVICES_MISSING_SYS_POSTGRES_WIRE: 'services_missing_sys_postgres_wire',
  DISCOVERY_EMPTY_WITH_SERVICES_PRESENT:
    'discovery_empty_with_services_present',
});

export const ROOT_CAUSE_CLASS = Object.freeze({
  UNKNOWN: 'unknown',

  STARTUP: 'startup',
  DISCOVERY: 'discovery',
  TOPOLOGY: 'topology',
  LOAD: 'load',
  VERIFY: 'verify',

  LEADERSHIP: 'leadership',
  TRANSPORT: 'transport',
  CDC: 'cdc',
  CACHE: 'cache',
});
