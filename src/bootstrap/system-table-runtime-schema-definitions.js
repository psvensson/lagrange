/**
 * Runtime and service system table schema definitions.
 */

import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
} from '../wasm-service/wasm-service-models.js';
import {
  SERVICE_PARTITION_ACCESS_COL as SPA_COL,
} from '../constants/service.js';
import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';

const CONTROL_PLANE_PUBLICATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  columns: [
    {name: 'publication_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'publication_kind', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'publication_epoch', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'publisher_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'source_topology_epoch', type: COLUMN_TYPE.INTEGER},
    {name: 'source_snapshot_version', type: COLUMN_TYPE.INTEGER},
    {name: 'published_active_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'required_ack_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'acknowledged_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'priority_partition_summary', type: COLUMN_TYPE.TEXT},
    {name: 'membership_lifecycle_summary', type: COLUMN_TYPE.TEXT},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'reason_code', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'published_at', type: COLUMN_TYPE.INTEGER},
    {name: 'closed_at', type: COLUMN_TYPE.INTEGER},
    {name: 'transition_history', type: COLUMN_TYPE.TEXT, notNull: true},
  ],
  indices: [
    {
      name: 'idx_control_plane_publications_kind_epoch',
      columns: ['publication_kind', 'publication_epoch'],
    },
    {
      name: 'idx_control_plane_publications_status_updated',
      columns: ['status', 'updated_at'],
    },
  ],
};
/**
 * Replica operations system table schema.
 * Stores persistent log of all replica operations for debugging and recovery.
 * Requirements: 9.1, 9.2
 */
const REPLICA_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  columns: [
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'type', type: COLUMN_TYPE.TEXT, notNull: true}, // 'ADD' or 'REMOVE'
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'replica_id', type: COLUMN_TYPE.TEXT},
    {name: 'target_claim_key', type: COLUMN_TYPE.TEXT},
    {name: 'source_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'target_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true}, // ReplicaStatus value
    {name: 'workflow_step', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'completed_at', type: COLUMN_TYPE.INTEGER},
    {name: 'lease_expires_at', type: COLUMN_TYPE.INTEGER},
    {name: 'error_message', type: COLUMN_TYPE.TEXT},
    {name: 'steps_history', type: COLUMN_TYPE.TEXT, notNull: true}, // JSON array
  ],
  indices: [
    {name: 'idx_replica_ops_status', columns: ['status']},
    {name: 'idx_replica_ops_partition', columns: ['partition_id']},
    {name: 'idx_replica_ops_entity', columns: ['entity_type', 'entity_id']},
    {
      name: 'idx_replica_ops_target_claim_key',
      columns: ['target_claim_key'],
      unique: true,
    },
    {
      name: 'idx_replica_ops_source_step_type',
      columns: ['source_node_id', 'workflow_step', 'type'],
    },
    {
      name: 'idx_replica_ops_target_step_type',
      columns: ['target_node_id', 'workflow_step', 'type'],
    },
    {
      name: 'idx_replica_ops_partition_target',
      columns: ['partition_id', 'target_node_id'],
    },
    {name: 'idx_replica_ops_created', columns: ['created_at']},
  ],
};

/**
 * Node endpoints system table schema.
 * Stores transport endpoints for nodes (WebSocket, NATS, Veilid, etc.).
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const NODE_ENDPOINTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'transport_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'address', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'priority', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'metadata', type: COLUMN_TYPE.TEXT},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_node_endpoints_node', columns: ['node_id']},
    {name: 'idx_node_endpoints_type', columns: ['transport_type']},
    {name: 'idx_node_endpoints_status', columns: ['status']},
  ],
};

/**
 * Service definitions system table schema.
 * Stores metadata about replicated service definitions.
 * Supports unified runtime model (native_js, wasm_component, oci_container).
 * Requirements: 5.1, 5.5, 12.3, 12.4, 12.5
 */
const SERVICE_DEFINITION_COLUMN_SPEC = Object.freeze({
  [SD_COL.SERVICE_ID]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    primaryKey: true,
  }),
  [SD_COL.SERVICE_NAME]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    unique: true,
  }),
  [SD_COL.SERVICE_PROFILE]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'default\'',
  }),
  [SD_COL.HANDLER_FUNCTION_ID]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
  }),
  [SD_COL.READ_CONSISTENCY]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.WRITE_CONSISTENCY]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.READ_LOCALITY]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'any\'',
  }),
  [SD_COL.REPLICA_COUNT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
    defaultValue: 3,
  }),
  [SD_COL.PROTOCOL]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'websocket\'',
  }),
  [SD_COL.RESOURCE_BUDGET]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'{}\'',
  }),
  [SD_COL.SAFETY_INTERVAL_MS]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
    defaultValue: 500,
  }),
  [SD_COL.RUNTIME_KIND]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.RUNTIME_REF]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.RUNTIME_CONFIG]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.BINDING_VERSION_ID]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.BINDING_DIGEST]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.BINDING_PROJECTION]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.STATUS]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'active\'',
  }),
  [SD_COL.CREATED_AT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
  }),
  [SD_COL.UPDATED_AT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
  }),
});

/**
 * Build canonical service_definitions column descriptors from the shared
 * service-definition column list.
 * @return {Array<Object>} Ordered schema column descriptors.
 */
function createServiceDefinitionColumns() {
  return SERVICE_DEFINITION_COLUMN_LIST.map((columnName) => {
    const spec = SERVICE_DEFINITION_COLUMN_SPEC[columnName];
    if (!spec) {
      throw new Error(
        `Missing schema spec for service_definitions column: ${columnName}`,
      );
    }
    return {
      name: columnName,
      ...spec,
    };
  });
}

const SERVICE_DEFINITIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
  columns: createServiceDefinitionColumns(),
  indices: [
    {name: 'idx_svc_def_name', columns: [SD_COL.SERVICE_NAME]},
    {name: 'idx_svc_def_handler', columns: [SD_COL.HANDLER_FUNCTION_ID]},
    {name: 'idx_svc_def_status', columns: [SD_COL.STATUS]},
    {name: 'idx_svc_def_runtime_kind', columns: [SD_COL.RUNTIME_KIND]},
    {
      name: 'idx_svc_def_binding_version',
      columns: [SD_COL.BINDING_VERSION_ID],
      unique: true,
    },
  ],
};

/**
 * Service endpoints system table schema.
 * Stores externally reachable endpoints for WASM service replicas.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_ENDPOINTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'service_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'protocol', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'address', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'port', type: COLUMN_TYPE.INTEGER, notNull: true},
    {
      name: 'health_status',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'healthy\'',
    },
    {name: 'metadata', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_svc_ep_service', columns: ['service_id']},
    {name: 'idx_svc_ep_node', columns: ['node_id']},
    {name: 'idx_svc_ep_health', columns: ['health_status']},
  ],
};

/**
 * Service timers system table schema.
 * Stores persistent timer entries for WASM service groups.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_TIMERS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_TIMERS,
  columns: [
    {name: 'timer_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'service_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'delay_ms', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'fire_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'payload', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_svc_timer_service', columns: ['service_id']},
    {name: 'idx_svc_timer_status', columns: ['status']},
    {name: 'idx_svc_timer_fire', columns: ['fire_at']},
  ],
};

/**
 * Immutable tenant-scoped Binding declaration generations.
 * Runtime actuals and mutable head state are intentionally absent.
 */
const SERVICE_BINDINGS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
  columns: [
    {name: 'binding_version_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'binding_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'binding_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'generation', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'binding_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'package_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'manifest_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'export_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'source_kind', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'normalized_binding', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_by', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_service_bindings_identity_generation',
      columns: ['binding_id', 'generation'],
      unique: true,
    },
    {
      name: 'idx_service_bindings_tenant_name',
      columns: ['tenant_id', 'binding_name'],
    },
    {name: 'idx_service_bindings_package', columns: ['package_id']},
  ],
};

/**
 * Immutable, verified external service package identities.
 * Runtime instance and endpoint observations are intentionally absent.
 */
const SERVICE_PACKAGES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_PACKAGES,
  columns: [
    {name: 'package_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'package_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'package_version', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'manifest_schema_version', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'runtime_kind', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'artifact_ref', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'artifact_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'artifact_media_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'payload_media_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'signature_status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'normalized_manifest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_service_packages_name_version',
      columns: ['package_name', 'package_version'],
    },
    {name: 'idx_service_packages_digest', columns: ['artifact_digest']},
  ],
};

/**
 * Immutable configuration revisions derived from verified packages.
 */
const SERVICE_REVISIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_REVISIONS,
  columns: [
    {name: 'revision_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'package_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'artifact_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'config_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'normalized_config', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_service_revisions_package', columns: ['package_id']},
    {name: 'idx_service_revisions_digest', columns: ['artifact_digest']},
  ],
};

/**
 * Desired install and rollout state. service_definition_id is the only link
 * into runtime ownership; replica and endpoint actuals stay in their tables.
 */
const SERVICE_INSTALLATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_INSTALLATIONS,
  columns: [
    {name: 'installation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'revision_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'service_definition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'desired_state', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'rollout_state', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'latest_failure_id', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_service_installations_revision', columns: ['revision_id']},
    {
      name: 'idx_service_installations_definition',
      columns: ['service_definition_id'],
    },
    {name: 'idx_service_installations_rollout', columns: ['rollout_state']},
  ],
};

/**
 * Typed failure facts. Free-form exception text is excluded to keep catalog
 * state bounded and prevent provider or credential detail from leaking.
 */
const SERVICE_INSTALL_FAILURES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_INSTALL_FAILURES,
  columns: [
    {name: 'failure_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'installation_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'revision_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'failure_code', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'failure_phase', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'retryable', type: COLUMN_TYPE.BOOLEAN, notNull: true},
    {name: 'occurred_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_service_install_failures_installation',
      columns: ['installation_id', 'occurred_at'],
    },
    {name: 'idx_service_install_failures_code', columns: ['failure_code']},
  ],
};

/**
 * Module manifests system table schema.
 * Stores WASM module/package metadata with component-model identity.
 * Requirements: 3.2, 5.2, 10.1, 10.2
 */
const MODULE_MANIFESTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.MODULE_MANIFESTS,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'version', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'run_export', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'exports',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'dependencies',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'capabilities',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'source_reference', type: COLUMN_TYPE.TEXT},
    {name: 'artifact_pointer', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  primaryKey: ['namespace', 'name', 'version'],
  indices: [
    {
      name: 'idx_module_manifests_digest',
      columns: ['digest'],
    },
    {
      name: 'idx_module_manifests_namespace',
      columns: ['namespace'],
    },
  ],
};

/**
 * Package registry mappings system table schema.
 * Stores namespace-to-registry resolution rules.
 * Requirements: 4.1, 10.1, 10.2
 */
const PACKAGE_REGISTRY_MAPPINGS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'registry_url', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [],
};

/**
 * Package registry overrides system table schema.
 * Stores per-package registry override rules.
 * Requirements: 4.2, 10.1, 10.2
 */
const PACKAGE_REGISTRY_OVERRIDES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'registry_url', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  primaryKey: ['namespace', 'name'],
  indices: [],
};

/**
 * Module dependency locks system table schema.
 * Stores resolved dependency graphs pinned to immutable digests.
 * Requirements: 5.2, 10.1, 10.2
 */
const MODULE_DEPENDENCY_LOCKS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS,
  columns: [
    {name: 'lock_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {
      name: 'target_module_namespace',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_name',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_version',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {name: 'target_service_id', type: COLUMN_TYPE.TEXT},
    {
      name: 'resolved_dependencies',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_dep_locks_target',
      columns: [
        'target_module_namespace',
        'target_module_name',
        'target_module_version',
      ],
    },
    {
      name: 'idx_dep_locks_service',
      columns: ['target_service_id'],
    },
  ],
};

/**
 * WASM operations system table schema.
 * Stores async operation workflow state and idempotency metadata.
 * Requirements: 8.1, 8.3, 10.1, 10.2
 */
const WASM_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.WASM_OPERATIONS,
  columns: [
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'command', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'idempotency_key', type: COLUMN_TYPE.TEXT},
    {
      name: 'state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'pending\'',
    },
    {
      name: 'result',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {
      name: 'error',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_wasm_ops_tenant',
      columns: ['tenant_id'],
    },
    {
      name: 'idx_wasm_ops_state',
      columns: ['state'],
    },
    {
      name: 'uidx_wasm_ops_tenant_idempotency',
      columns: ['tenant_id', 'idempotency_key'],
      unique: true,
    },
  ],
};

/**
 * Service↔partition access attribution system table schema.
 * One row per (node, service): JSON-packed per-partition read/write
 * counts published as deltas by each node's access publisher; the
 * placement policy owner aggregates them across nodes into the
 * A[service][partition] matrix (service↔data affinity placement epic).
 */
const SERVICE_PARTITION_ACCESS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_PARTITION_ACCESS,
  columns: [
    {name: SPA_COL.ACCESS_ID, type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: SPA_COL.NODE_ID, type: COLUMN_TYPE.TEXT, notNull: true},
    {name: SPA_COL.SERVICE_ID, type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: SPA_COL.ACCESS_JSON,
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: SPA_COL.WINDOW_STARTED_AT, type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: SPA_COL.PUBLISHED_AT, type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_svc_part_access_service', columns: [SPA_COL.SERVICE_ID]},
    {name: 'idx_svc_part_access_node', columns: [SPA_COL.NODE_ID]},
  ],
};

export {
  CONTROL_PLANE_PUBLICATIONS_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  NODE_ENDPOINTS_SCHEMA,
  SERVICE_DEFINITIONS_SCHEMA,
  SERVICE_BINDINGS_SCHEMA,
  SERVICE_ENDPOINTS_SCHEMA,
  SERVICE_PARTITION_ACCESS_SCHEMA,
  SERVICE_TIMERS_SCHEMA,
  SERVICE_PACKAGES_SCHEMA,
  SERVICE_REVISIONS_SCHEMA,
  SERVICE_INSTALLATIONS_SCHEMA,
  SERVICE_INSTALL_FAILURES_SCHEMA,
  MODULE_MANIFESTS_SCHEMA,
  PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
  PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
  MODULE_DEPENDENCY_LOCKS_SCHEMA,
  WASM_OPERATIONS_SCHEMA,
};
