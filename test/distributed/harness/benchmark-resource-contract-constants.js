export const BENCHMARK_RESOURCE_CONTRACT = Object.freeze({
  ARTIFACT_SCHEMA_VERSION: 'benchmark-resource-artifact-v1',
  CELL_EVIDENCE_VERSION: 'benchmark-resource-cell-evidence-v1',
  COMPONENT_INVENTORY_VERSION: 'benchmark-component-inventory-v1',
  EFFECT_VERSION: 'benchmark-paired-effect-v1',
  MATRIX_MANIFEST_VERSION: 'benchmark-matrix-manifest-v2',
  PRICE_SHEET_VERSION: 'benchmark-price-sheet-v1',
  RESOURCE_WINDOW_VERSION: 'benchmark-resource-window-v2',
  ROOT_VERSION: 'benchmark-matrix-evidence-root-v1',
});

export const BENCHMARK_RESOURCE_ARTIFACT_KIND = Object.freeze({
  ALTERNATIVE_TOPOLOGY: 'alternative_topology',
  CAMPAIGN_ROOT: 'campaign_root',
  CAPACITY_REPORT: 'capacity_report',
  CAPACITY_SAMPLE: 'capacity_sample',
  CELL_EVIDENCE: 'cell_evidence',
  COMPONENT_INVENTORY: 'component_inventory',
  EXECUTION_ENVELOPE: 'execution_envelope',
  LIVE_CALIBRATION: 'live_calibration',
  LIVE_ENGAGEMENT: 'live_engagement',
  MATRIX_MANIFEST: 'matrix_manifest',
  PRICE_SHEET: 'price_sheet',
  PRICE_SOURCE: 'price_source',
  PREREGISTRATION: 'preregistration',
  PROFILE_ENVELOPE: 'scale_profile_envelope',
  RESOURCE_WINDOW: 'resource_window',
  ROOT: 'matrix_evidence_root',
  SEMANTIC_RECEIPT: 'semantic_receipt',
  SYNTHETIC_CALIBRATION: 'synthetic_resource_calibration',
  WINDOW_RECEIPT: 'window_receipt',
  WORKLOAD_MANIFEST: 'workload_manifest',
});

export const BENCHMARK_RESOURCE_CELL_STATE = Object.freeze({
  MEASURING: 'measuring',
  NON_MEASURING: 'non_measuring',
});

export const BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE = Object.freeze({
  MEASURING: 'MEASURING',
  NON_MEASURING: 'NON_MEASURING',
  INVALID: 'INVALID',
  STALE_INELIGIBLE: 'STALE_INELIGIBLE',
  TRANSIENT: 'TRANSIENT',
});

export const BENCHMARK_RESOURCE_MEASUREMENT_RETRY = Object.freeze({
  NEVER: 'never',
  RETRYABLE: 'retryable',
});

export const BENCHMARK_RESOURCE_MEASUREMENT_REASON = Object.freeze({
  EVIDENCE_COMPLETE: 'evidence_complete',
  EVIDENCE_NOT_CLAIM_ELIGIBLE: 'evidence_not_claim_eligible',
  EVIDENCE_INVALID: 'evidence_invalid',
  OBSERVATION_MISSING: 'observation_missing',
  EVIDENCE_NOT_YET_VALID: 'evidence_not_yet_valid',
  EVIDENCE_EXPIRED: 'evidence_expired',
  PROFILE_IDENTITY_MISMATCH: 'profile_identity_mismatch',
  PRICE_EVIDENCE_NOT_YET_VALID: 'price_evidence_not_yet_valid',
  PRICE_EVIDENCE_EXPIRED: 'price_evidence_expired',
  IMMUTABLE_RESOLUTION_DRIFT: 'immutable_resolution_drift',
  PRICE_EVIDENCE_INVALID: 'price_evidence_invalid',
});

export const BENCHMARK_RESOURCE_WINDOW_PHASE = Object.freeze({
  MEASURED: 'measured',
  WARMUP: 'warmup',
});

export const BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON = Object.freeze({
  MISMATCH: 'cell.resourceWindow:coordinate_mismatch',
  PHASE: 'cell.resourceWindow:phase_mismatch',
  DUPLICATE: 'cell.resourceWindow:coordinate_duplicate',
  OVERLAP: 'cell.resourceWindow:interval_overlap',
  PAIRED_BLOCK_MISMATCH:
    'cell.resourceWindow:paired_block_coordinate_mismatch',
  PAIRED_BLOCK_INCOMPLETE:
    'cell.resourceWindow:paired_block_side_coverage_incomplete',
  EXPECTED_SET_MISMATCH:
    'cell.resourceWindow:c3_measured_coordinate_set_mismatch',
});

export const BENCHMARK_RESOURCE_BILLING_TREATMENT = Object.freeze({
  INCLUDED: 'included',
  SYMMETRICALLY_EXCLUDED: 'symmetrically_excluded',
});

export const BENCHMARK_RESOURCE_EFFECT = Object.freeze({
  CAPACITY: 'capacity',
  COST: 'cost_per_million_correct_operations',
});

export const BENCHMARK_RESOURCE_EFFECT_DIRECTION = Object.freeze({
  HIGHER_IS_BETTER: 'higher_is_better',
  LOWER_IS_BETTER: 'lower_is_better',
});

export const BENCHMARK_RESOURCE_EFFECT_UNIT = Object.freeze({
  CAPACITY: 'correct_slo_eligible_operations_per_second',
  COST: 'currency_per_million_correct_slo_eligible_operations',
  RATIO: 'ratio',
});

export const BENCHMARK_RESOURCE_COMPONENT_ROLE = Object.freeze({
  CLIENT: 'client_load_generator',
  CONTROL_PLANE: 'control_plane',
  DATABASE: 'database',
  DURABLE_STORAGE: 'durable_storage',
  LAGRANGE_NODE: 'lagrange_node',
  MONITORING: 'required_monitoring',
  NETWORK_PROXY: 'network_or_proxy',
});

export const BENCHMARK_RESOURCE_LIMIT = Object.freeze({
  ARTIFACT_COUNT: 256,
  ARTIFACT_BYTES: 1_048_576,
  AXES: 8,
  AXIS_VALUES: 32,
  CELLS: 512,
  COMPONENTS_PER_SIDE: 64,
  DATA_DEPTH: 32,
  DATA_NODES: 100_000,
  REFERENCES_PER_ARTIFACT: 512,
  RESOURCE_WINDOWS_PER_CELL: 512,
  TOTAL_ARTIFACT_BYTES: 16_777_216,
});

export const BENCHMARK_RESOURCE_PRICE_UNIT = Object.freeze({
  CPU_CORE_SECOND: 'cpuCoreSecond',
  INTER_ZONE_NETWORK_BYTE: 'interZoneNetworkByte',
  IOP: 'iop',
  MEMORY_BYTE_SECOND: 'memoryByteSecond',
  NETWORK_BYTE: 'networkByte',
  STORAGE_BYTE_SECOND: 'storageByteSecond',
});

export const BENCHMARK_RESOURCE_SCENARIO = Object.freeze({
  GUARD: 'benchmark-whole-topology-resource-accounting-guard',
  LIVE: 'benchmark-whole-topology-resource-accounting',
});

export const BENCHMARK_RESOURCE_CAPACITY_SOURCE = Object.freeze({
  VERSION: 'benchmark-resource-c3-capacity-evidence-v1',
  EVIDENCE_CLASS: 'externally_observed_c3_terminal',
});
