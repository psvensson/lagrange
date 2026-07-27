export const BENCHMARK_RESOURCE_ROOT_TEXT = Object.freeze({
  CELL_REASON_CODES: 'cell.reasonCodes',
  CELL_REASON_CODES_NON_EMPTY_REQUIRED:
    'cell.reasonCodes:non_empty_required',
  CELL_REASON_CODES_DUPLICATE: 'cell.reasonCodes:duplicate',
  SOURCE_ARTIFACT_KIND_UNSUPPORTED: 'sourceArtifact.kind:unsupported',
  CELL_CAPACITY_REPORT_DIGESTS_EXACT_PAIR_REQUIRED:
    'cell.capacityReportDigests:exact_pair_required',
  CELL_WINDOW_EVIDENCE_COMPLETE_EQUAL_COUNTS_REQUIRED:
    'cell.windowEvidence:complete_equal_counts_required',
  CELL_CAPACITY_EFFECT_INVALID: 'cell.capacityEffect:invalid',
  CELL_COST_EFFECT_INVALID: 'cell.costEffect:invalid',
  CELL_EFFECTS_TYPE_MISMATCH: 'cell.effects:type_mismatch',
  CELL: 'cell',
  ROOT_ARTIFACTS: 'root.artifacts',
  ROOT_ARTIFACTS_NON_EMPTY_REQUIRED: 'root.artifacts:non_empty_required',
  ROOT_ARTIFACTS_BYTE_LENGTH_MISMATCH:
    'root.artifacts:byte_length_mismatch',
  ROOT_ARTIFACTS_PARSED_ARTIFACT_MISMATCH:
    'root.artifacts:parsed_artifact_mismatch',
  ROOT_ARTIFACTS_DIGEST_DUPLICATE: 'root.artifacts:digest_duplicate',
  ROOT_ARTIFACTS_TOTAL_BYTES_LIMIT: 'root.artifacts:total_bytes_limit',
  ROOT: 'root',
  ROOT_SOURCE_REVISION: 'root.sourceRevision',
  ROOT_CELL_EVIDENCE_DIGESTS_NON_EMPTY_REQUIRED:
    'root.cellEvidenceDigests:non_empty_required',
  ROOT_ARTIFACTS_OWNER_MISSING: 'root.artifacts:owner_missing',
  ROOT_PAYLOAD: 'root.payload',
  ROOT_VERSION_UNSUPPORTED: 'root.version:unsupported',
  ROOT_ARTIFACT_MANIFEST: 'root.artifactManifest',
  ROOT_ARTIFACT_MANIFEST_DIGEST_MISMATCH:
    'root.artifactManifest:digest_mismatch',
  ROOT_ARTIFACT_MANIFEST_NOT_STRICTLY_SORTED_UNIQUE:
    'root.artifactManifest:not_strictly_sorted_unique',
  RESOLVER_RESOLVE_ARTIFACT_MISSING: 'resolver.resolve:artifact_missing',
  RESOLVER_RESOLVE_BYTES: 'resolver.resolve.bytes',
  RESOLVER_RESOLVE_BYTE_LENGTH_MISMATCH:
    'resolver.resolve:byte_length_mismatch',
  RESOLVER_RESOLVE_TOTAL_BYTES_LIMIT: 'resolver.resolve:total_bytes_limit',
  RESOLVER_RESOLVE_KIND_MISMATCH: 'resolver.resolve:kind_mismatch',
  RESOLVER_RESOLVE_ARTIFACT_KIND_UNSUPPORTED:
    'resolver.resolve:artifact_kind_unsupported',
  ROOT_REFERENCES_MANIFEST_COUNT_MISMATCH:
    'root.references:manifest_count_mismatch',
  ROOT_REFERENCES_MANIFEST_ORDER_MISMATCH:
    'root.references:manifest_order_mismatch',
  RESOLVER: 'resolver',
  RESOLVER_RESOLVE_FUNCTION_REQUIRED: 'resolver.resolve:function_required',
  ROOT_ARTIFACTS_CYCLE: 'root.artifacts:cycle',
  ROOT_ARTIFACTS_REFERENCE_MISSING: 'root.artifacts:reference_missing',
  CELL_COST_EFFECT_CORRECT_OPERATIONS_MISSING:
    'cell.costEffect:correct_operations_missing',
  CELL_EFFECT_SIDES_MISMATCH: 'cell.effect:sides_mismatch',
  CELL_RESOURCE_WINDOW_LIVE_COMPONENT_OBSERVATION_MISSING:
    'cell.resourceWindow:live_component_observation_missing',
  CELL_RESOURCE_WINDOW_LIVE_UTILIZATION_RECOMPUTATION_MISMATCH:
    'cell.resourceWindow:live_utilization_recomputation_mismatch',
  CELL_RESOURCE_WINDOW_LIVE_INVENTORY_RECOMPUTATION_MISMATCH:
    'cell.resourceWindow:live_inventory_recomputation_mismatch',
  CELL_RESOURCE_WINDOW_LIVE_AMPLIFICATION_POLICY_MISMATCH:
    'cell.resourceWindow:live_amplification_policy_mismatch',
  CELL_RESOURCE_WINDOW_LIVE_TOPOLOGY_CLOSURE_MISMATCH:
    'cell.resourceWindow:live_topology_closure_mismatch',
  CELL_RECONSTRUCTION_MISMATCH: 'cell:reconstruction_mismatch',
  CELL_OWNER_IDENTITY_MISMATCH: 'cell:owner_identity_mismatch',
  CELL_CAPACITY_EFFECT_CAPACITY_SIDE_MISMATCH:
    'cell.capacityEffect:capacity_side_mismatch',
  CELL_RESOURCE_WINDOW_COORDINATE_MISMATCH:
    'cell.resourceWindow:coordinate_mismatch',
  CELL_RESOURCE_WINDOW_LIVE_INTERVAL_RECOMPUTATION_MISMATCH:
    'cell.resourceWindow:live_interval_recomputation_mismatch',
  CELL_RESOURCE_WINDOW_SIDE_COVERAGE_INCOMPLETE:
    'cell.resourceWindow:side_coverage_incomplete',
  CELL_RESOURCE_WINDOW_RECEIPT_JOIN_MISMATCH:
    'cell.resourceWindow:receipt_join_mismatch',
  CELL_CAPACITY_EFFECT_SAMPLE_JOIN_MISMATCH:
    'cell.capacityEffect:sample_join_mismatch',
  CELL_CAPACITY_PROTOCOL_EVIDENCE_INVALID:
    'cell.capacityEffect:c3_protocol_evidence_invalid',
  CELL_CAPACITY_EFFECT_SOURCE_DIGEST_MISMATCH:
    'cell.capacityEffect:source_digest_mismatch',
  CELL_COST_EFFECT_SOURCE_DIGEST_MISMATCH:
    'cell.costEffect:source_digest_mismatch',
  CELL_EFFECTS_RECOMPUTATION_MISMATCH:
    'cell.effects:recomputation_mismatch',
  CELL_NON_MEASURING_RECONSTRUCTION_MISMATCH:
    'cell.nonMeasuring:reconstruction_mismatch',
  ROOT_CELLS_COUNT_MISMATCH: 'root.cells:count_mismatch',
  ROOT_CELLS_EXTRA_OR_DUPLICATE: 'root.cells:extra_or_duplicate',
  CELL_STATE_UNSUPPORTED: 'cell.state:unsupported',
  ROOT_CELLS_MISSING: 'root.cells:missing',
  ROOT_ARTIFACTS_EXTRA_OR_RELOCATED:
    'root.artifacts:extra_or_relocated',
  ROOT_DIGEST: 'rootDigest',
  ROOT_RECEIPT: 'rootReceipt',
  ROOT_RECEIPT_ROOT_DIGEST: 'rootReceipt.rootDigest',
  ROOT_RECEIPT_ROOT_MISSING: 'rootReceipt:root_missing',
  ROOT_RECEIPT_ROOT_BYTES: 'rootReceipt.rootBytes',
  ROOT_KIND_UNSUPPORTED: 'root.kind:unsupported',
  ROOT_ARTIFACT_MANIFEST_SELF_INCLUSION:
    'root.artifactManifest:self_inclusion',
  ROOT_MATRIX: 'root.matrix',
  ROOT_INVENTORY: 'root.inventory',
  ROOT_PRICE: 'root.price',
  ROOT_PRICE_NOT_VALID_AT_PRODUCTION: 'root.price:not_valid_at_production',
  ROOT_OWNERS_MATRIX_INVENTORY_MISMATCH:
    'root.owners:matrix_inventory_mismatch',
  VALIDATION_FAILED: 'validation:failed_closed',
  VALID: 'valid',
  UNRESOLVED: 'unresolved',
});
