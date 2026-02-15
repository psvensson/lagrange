export {
  WASM_RUNTIME_ADAPTER_KIND,
  WASM_RUNTIME_OPERATION,
  WASM_RUNTIME_ADAPTER_STATE,
  WASM_RUNTIME_DEFAULT,
  WASM_RUNTIME_ADAPTER_ERROR_MSG,
  HOST_IMPORT_NAMESPACE,
  DEBUG_CAPABILITY,
} from './debug-runtime-constants.js';

export {
  DWARF_INDEX_DEFAULT,
  DWARF_INDEX_VALUE,
  DWARF_INDEX_ERROR_MSG,
  DWARF_INDEX_FIELD,
} from './dwarf-index-constants.js';

export {
  WasmRuntimeAdapter,
  InProcessWasmRuntimeAdapter,
} from './wasm-runtime-adapter.js';

export {
  HostImportRegistry,
  createHostImportRegistry,
  shouldInjectDebugCapability,
} from './host-import-registry.js';

export {
  DEBUG_METADATA_TABLE,
  DEBUG_SESSION_FIELD,
  DEBUG_BREAKPOINT_FIELD,
  DEBUG_SNAPSHOT_FIELD,
  DEBUG_SESSION_STATUS,
} from './debug-metadata-constants.js';

export {
  DEBUG_METADATA_ACTION,
  DEBUG_METADATA_ROLE,
  DEBUG_METADATA_DEFAULT,
  DEBUG_METADATA_ERROR_CODE,
  DEBUG_METADATA_ERROR_MSG,
  DEBUG_METADATA_SQL,
  DEBUG_METADATA_ROW_LIMIT,
} from './debug-metadata-service-constants.js';

export {
  DebugMetadataStore,
  defaultDebugPolicyResolver,
  createDebugMetadataError,
} from './debug-metadata-service.js';

export {
  VscodeDwarfParserBackend,
  validateDwarfModuleRequest,
  normalizeWasmBytesToArrayBuffer,
  normalizeSourceFiles,
  normalizeMappedLines,
} from './vscode-dwarf-parser-backend.js';

export {
  buildDwarfIndex,
  lookupOffsetsForSource,
  lookupSourceForOffset,
  lookupSymbolsForOffset,
  lookupSymbolRangesByName,
} from './dwarf-index-builder.js';

export {
  DwarfIndexCache,
} from './dwarf-index-cache.js';

export {
  DwarfIndexPipeline,
  buildDwarfIndexCacheKey,
} from './dwarf-index-pipeline.js';

export {
  BREAKPOINT_MANAGER_DEFAULT,
  BREAKPOINT_STEP_ACTION,
  BREAKPOINT_MANAGER_ERROR_MSG,
} from './breakpoint-manager-constants.js';

export {
  BreakpointManager,
} from './breakpoint-manager.js';

export {
  RUNTIME_INTROSPECTOR_DEFAULT,
  RUNTIME_INTROSPECTOR_ERROR_MSG,
} from './runtime-introspector-constants.js';

export {
  RuntimeIntrospector,
} from './runtime-introspector.js';

export {
  DAP_MESSAGE_TYPE,
  DAP_COMMAND,
  DAP_EVENT,
  DAP_DEFAULT,
  DAP_ERROR_MSG,
} from './dap-constants.js';

export {
  DapMessageFramer,
  DapServer,
  encodeDapProtocolMessage,
} from './dap-server.js';

export {
  DEBUG_COORDINATOR_DEFAULT,
  DEBUG_COORDINATOR_EVENT,
  DEBUG_COORDINATOR_ERROR_MSG,
} from './debug-coordinator-constants.js';

export {
  DebugCoordinator,
  decideMonotonicTransition,
} from './debug-coordinator.js';

export {
  SNAPSHOT_RECORDER_DEFAULT,
  SNAPSHOT_RECORDER_ERROR_MSG,
} from './snapshot-recorder-constants.js';

export {
  SnapshotRecorder,
  serializeSnapshotEnvelope,
  deserializeSnapshotEnvelope,
  buildSnapshotManifest,
} from './snapshot-recorder.js';

export {
  REPLAY_RUNTIME_DEFAULT,
  REPLAY_DRIFT_REASON,
  REPLAY_RUNTIME_ERROR_MSG,
} from './replay-runtime-constants.js';

export {
  ReplayRuntime,
} from './replay-runtime.js';
