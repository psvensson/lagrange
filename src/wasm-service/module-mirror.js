/**
 * ModuleMirror — local WASM module cache that ensures WASM
 * binaries are available on nodes hosting replicas. Modules
 * are pulled from peer nodes on demand and cached locally.
 *
 * Listens for code table CDC events to detect new versions
 * and invalidates stale cache entries so modules are
 * re-pulled before the next use.
 *
 * Requirements: 9.1, 9.2, 9.3
 * @module wasm-service/module-mirror
 */

import {COLUMN, TABLES, TYPEOF} from '../constants/index.js';
import {CDC_EVENT} from '../cdc/cdc-constants.js';
import {validateManifestRuntimeWithAdapter} from
  './manifest-runtime-validator.js';
import {InProcessWasmRuntimeAdapter} from
  '../debug-runtime/wasm-runtime-adapter.js';

const CODE_CDC_EVENTS = Object.freeze([
  CDC_EVENT.INSERT,
  CDC_EVENT.UPDATE,
  CDC_EVENT.UPSERT,
  CDC_EVENT.DELETE,
]);

const MODULE_MIRROR_ERROR_MSG = Object.freeze({
  FUNCTION_ID_REQUIRED: 'ModuleMirror functionId is required',
  PROVIDER_REQUIRED: 'ModuleMirror moduleProvider is required',
  INVALID_PAYLOAD:
    'ModuleMirror provider returned invalid module payload',
  INVALID_MODULE_ENTRY: 'ModuleMirror module entry must be an object',
  MANIFEST_REQUIRED: 'ModuleMirror provider missing module manifest',
  EXPORTS_REQUIRED: 'ModuleMirror provider missing module exports',
  WASM_BYTES_REQUIRED: 'ModuleMirror provider missing wasm bytes',
  RUNTIME_VALIDATION_FAILED:
    'ModuleMirror runtime manifest validation failed',
});

/**
 * Local WASM module cache with version-aware invalidation.
 */
class ModuleMirror {
  /**
   * @param {Object} [options] - Configuration options.
   * @param {Object} [options.messageRouter] - MessageRouter
   *   instance for pulling modules from peer nodes.
   * @param {Function} [options.moduleProvider] - Async
   *   provider function (functionId, version, sourceNodeId)
   *   => {version, wasmBytes, manifest, exports}.
   */
  constructor(options = {}) {
    /** @type {Map<string, {version: string, wasmBytes: Buffer,
     *   manifest: Object, exports: Object, updatedAt: number}>} */
    this.localCache = new Map();
    this.messageRouter = options.messageRouter ?? null;
    this.moduleProvider = options.moduleProvider ?? null;
    this.runtimeAdapter = options.runtimeAdapter ||
      new InProcessWasmRuntimeAdapter();
    this.runtimeManifestValidator =
      options.runtimeManifestValidator ||
      validateManifestRuntimeWithAdapter;
    this.cdcIntegrationService = null;
    this.boundCdcHandlers = new Map();

    if (options.cdcIntegrationService) {
      this.bindCdcIntegrationService(
        options.cdcIntegrationService,
      );
    }
  }

  /**
   * Check whether a module is available locally with the
   * specified version.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The expected module version.
   * @return {boolean} True if the module is cached and the
   *   version matches.
   */
  hasModule(functionId, version) {
    const entry = this.localCache.get(functionId);
    if (!entry) {
      return false;
    }
    return entry.version === version;
  }

  /**
   * Get the cached module data for a function.
   *
   * @param {string} functionId - The function identifier.
   * @return {{version: string, wasmBytes: Buffer,
   *   manifest: Object, exports: Object, updatedAt: number}|null} The
   *   cached module or null if not present.
   */
  getModule(functionId) {
    const entry = this.localCache.get(functionId);
    return entry ?? null;
  }

  /**
   * Store a module entry directly in the local cache.
   *
   * @param {string} functionId - Function identifier.
   * @param {Object} moduleEntry - Module payload.
   * @return {Promise<void>}
   */
  async setModule(functionId, moduleEntry) {
    if (!functionId || typeof functionId !== TYPEOF.STRING) {
      throw new Error(MODULE_MIRROR_ERROR_MSG.FUNCTION_ID_REQUIRED);
    }
    if (!moduleEntry || typeof moduleEntry !== TYPEOF.OBJECT) {
      throw new Error(MODULE_MIRROR_ERROR_MSG.INVALID_MODULE_ENTRY);
    }

    const normalized = this._normalizeModulePayload(
      moduleEntry.version ?? null,
      moduleEntry,
    );
    await this._storeModuleEntry(functionId, normalized);
  }

  /**
   * Pull a module from a peer node and store it in the local
   * cache via the configured module provider.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The module version to pull.
   * @param {string} sourceNodeId - The node to pull from.
   * @return {Promise<void>}
   */
  async pullModule(functionId, version, sourceNodeId) {
    if (!this.moduleProvider ||
      typeof this.moduleProvider !== 'function') {
      throw new Error(MODULE_MIRROR_ERROR_MSG.PROVIDER_REQUIRED);
    }

    const modulePayload = await this.moduleProvider(
      functionId,
      version,
      sourceNodeId,
    );
    if (!modulePayload || typeof modulePayload !== 'object') {
      throw new Error(MODULE_MIRROR_ERROR_MSG.INVALID_PAYLOAD);
    }

    const normalized = this._normalizeModulePayload(version, modulePayload);
    await this._storeModuleEntry(functionId, normalized);
  }

  /**
   * Validate manifest/export runtime contract using the runtime adapter.
   *
   * @param {string} functionId - Function identifier.
   * @param {Object} moduleEntry - Module entry candidate.
   * @return {Promise<void>}
   * @private
   */
  async _validateRuntimeManifest(functionId, moduleEntry) {
    const validation = await this.runtimeManifestValidator(
      moduleEntry.manifest,
      moduleEntry,
      this.runtimeAdapter,
      functionId,
    );

    if (validation.valid) {
      return;
    }

    const detail = Array.isArray(validation.errors) ?
      validation.errors.join('; ') :
      'unknown runtime validation failure';

    throw new Error(
      `${MODULE_MIRROR_ERROR_MSG.RUNTIME_VALIDATION_FAILED}: ${detail}`,
    );
  }

  /**
   * Normalize external module payload shape.
   *
   * @param {string|null} version
   * @param {Object} modulePayload
   * @return {{version: string, wasmBytes: Buffer, manifest: Object, exports: Object}}
   * @private
   */
  _normalizeModulePayload(version, modulePayload) {
    const payloadVersion = modulePayload.version ?? version;
    const payloadManifest = modulePayload.manifest;
    const payloadExports = modulePayload.exports;
    if (!payloadManifest || typeof payloadManifest !== TYPEOF.OBJECT) {
      throw new Error(MODULE_MIRROR_ERROR_MSG.MANIFEST_REQUIRED);
    }
    if (!payloadExports || typeof payloadExports !== TYPEOF.OBJECT) {
      throw new Error(MODULE_MIRROR_ERROR_MSG.EXPORTS_REQUIRED);
    }

    let wasmBytes = modulePayload.wasmBytes;
    if (Buffer.isBuffer(wasmBytes)) {
      wasmBytes = Buffer.from(wasmBytes);
    } else if (wasmBytes instanceof Uint8Array) {
      wasmBytes = Buffer.from(wasmBytes);
    } else if (typeof wasmBytes === TYPEOF.STRING) {
      wasmBytes = Buffer.from(wasmBytes, 'base64');
    } else {
      throw new Error(MODULE_MIRROR_ERROR_MSG.WASM_BYTES_REQUIRED);
    }

    return {
      version: String(payloadVersion ?? ''),
      wasmBytes,
      manifest: payloadManifest,
      exports: payloadExports,
    };
  }

  /**
   * Validate and persist a normalized module entry.
   *
   * @param {string} functionId
   * @param {{version: string, wasmBytes: Buffer, manifest: Object, exports: Object}} moduleEntry
   * @return {Promise<void>}
   * @private
   */
  async _storeModuleEntry(functionId, moduleEntry) {
    await this._validateRuntimeManifest(functionId, moduleEntry);
    this.localCache.set(functionId, {
      ...moduleEntry,
      updatedAt: Date.now(),
    });
  }

  /**
   * Handle a code table CDC event indicating a new module
   * version. If the cached version differs from the incoming
   * version, the stale entry is removed so the module will
   * be re-pulled before next use.
   *
   * If the cached version already matches, this is a no-op.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The new module version from
   *   the CDC event.
   */
  onCodeUpdate(functionId, version) {
    const entry = this.localCache.get(functionId);
    if (!entry) {
      return;
    }
    if (!version) {
      this.localCache.delete(functionId);
      return;
    }
    if (entry.version === version) {
      return;
    }
    this.localCache.delete(functionId);
  }

  /**
   * Bind module cache invalidation to CDC code-table events.
   * Uses the existing CDC owner without introducing parallel
   * cache owners.
   *
   * @param {Object} cdcIntegrationService - CDC event emitter.
   * @return {boolean} True when binding was applied.
   */
  bindCdcIntegrationService(cdcIntegrationService) {
    if (!cdcIntegrationService ||
      typeof cdcIntegrationService.on !== TYPEOF.FUNCTION ||
      typeof cdcIntegrationService.off !== TYPEOF.FUNCTION) {
      return false;
    }

    this.unbindCdcIntegrationService();

    this.cdcIntegrationService = cdcIntegrationService;
    for (const eventName of CODE_CDC_EVENTS) {
      const handler = (event) => this._handleCodeCdcEvent(event);
      this.boundCdcHandlers.set(eventName, handler);
      cdcIntegrationService.on(eventName, handler);
    }

    return true;
  }

  /**
   * Remove previously bound CDC listeners.
   */
  unbindCdcIntegrationService() {
    if (!this.cdcIntegrationService ||
      typeof this.cdcIntegrationService.off !== TYPEOF.FUNCTION) {
      this.cdcIntegrationService = null;
      this.boundCdcHandlers.clear();
      return;
    }

    for (const [eventName, handler] of this.boundCdcHandlers) {
      this.cdcIntegrationService.off(eventName, handler);
    }

    this.cdcIntegrationService = null;
    this.boundCdcHandlers.clear();
  }

  /**
   * Handle a CDC event and invalidate cached module entries
   * for code-table changes.
   *
   * @param {Object} event - CDC event payload.
   * @private
   */
  _handleCodeCdcEvent(event) {
    if (!event || event.tableName !== TABLES.CODE) {
      return;
    }

    const functionId = event.data?.[COLUMN.FUNCTION_ID] ||
      event.whereClause?.[COLUMN.FUNCTION_ID] ||
      null;
    if (!functionId) {
      return;
    }

    const version = event.data?.[COLUMN.VERSION] ||
      event.whereClause?.[COLUMN.VERSION] ||
      null;
    this.onCodeUpdate(functionId, version);
  }
}

export {ModuleMirror};
