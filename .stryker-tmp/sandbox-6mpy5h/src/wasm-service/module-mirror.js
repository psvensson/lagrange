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
import { COLUMN, TABLES, TYPEOF } from '../constants/index.js';
import { CDC_EVENT } from '../cdc/cdc-constants.js';
import { validateManifestRuntimeWithAdapter } from './manifest-runtime-validator.js';
import { InProcessWasmRuntimeAdapter } from '../debug-runtime/wasm-runtime-adapter.js';
const CODE_CDC_EVENTS = Object.freeze(stryMutAct_9fa48("161911") ? [] : (stryCov_9fa48("161911"), [CDC_EVENT.INSERT, CDC_EVENT.UPDATE, CDC_EVENT.UPSERT, CDC_EVENT.DELETE]));
const MODULE_MIRROR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161912") ? {} : (stryCov_9fa48("161912"), {
  FUNCTION_ID_REQUIRED: stryMutAct_9fa48("161913") ? "" : (stryCov_9fa48("161913"), 'ModuleMirror functionId is required'),
  PROVIDER_REQUIRED: stryMutAct_9fa48("161914") ? "" : (stryCov_9fa48("161914"), 'ModuleMirror moduleProvider is required'),
  INVALID_PAYLOAD: stryMutAct_9fa48("161915") ? "" : (stryCov_9fa48("161915"), 'ModuleMirror provider returned invalid module payload'),
  INVALID_MODULE_ENTRY: stryMutAct_9fa48("161916") ? "" : (stryCov_9fa48("161916"), 'ModuleMirror module entry must be an object'),
  MANIFEST_REQUIRED: stryMutAct_9fa48("161917") ? "" : (stryCov_9fa48("161917"), 'ModuleMirror provider missing module manifest'),
  EXPORTS_REQUIRED: stryMutAct_9fa48("161918") ? "" : (stryCov_9fa48("161918"), 'ModuleMirror provider missing module exports'),
  WASM_BYTES_REQUIRED: stryMutAct_9fa48("161919") ? "" : (stryCov_9fa48("161919"), 'ModuleMirror provider missing wasm bytes'),
  RUNTIME_VALIDATION_FAILED: stryMutAct_9fa48("161920") ? "" : (stryCov_9fa48("161920"), 'ModuleMirror runtime manifest validation failed')
}));

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
    if (stryMutAct_9fa48("161921")) {
      {}
    } else {
      stryCov_9fa48("161921");
      /** @type {Map<string, {version: string, wasmBytes: Buffer,
       *   manifest: Object, exports: Object, updatedAt: number}>} */
      this.localCache = new Map();
      this.messageRouter = stryMutAct_9fa48("161922") ? options.messageRouter && null : (stryCov_9fa48("161922"), options.messageRouter ?? null);
      this.moduleProvider = stryMutAct_9fa48("161923") ? options.moduleProvider && null : (stryCov_9fa48("161923"), options.moduleProvider ?? null);
      this.runtimeAdapter = stryMutAct_9fa48("161926") ? options.runtimeAdapter && new InProcessWasmRuntimeAdapter() : stryMutAct_9fa48("161925") ? false : stryMutAct_9fa48("161924") ? true : (stryCov_9fa48("161924", "161925", "161926"), options.runtimeAdapter || new InProcessWasmRuntimeAdapter());
      this.runtimeManifestValidator = stryMutAct_9fa48("161929") ? options.runtimeManifestValidator && validateManifestRuntimeWithAdapter : stryMutAct_9fa48("161928") ? false : stryMutAct_9fa48("161927") ? true : (stryCov_9fa48("161927", "161928", "161929"), options.runtimeManifestValidator || validateManifestRuntimeWithAdapter);
      this.cdcIntegrationService = null;
      this.boundCdcHandlers = new Map();
      if (stryMutAct_9fa48("161931") ? false : stryMutAct_9fa48("161930") ? true : (stryCov_9fa48("161930", "161931"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("161932")) {
          {}
        } else {
          stryCov_9fa48("161932");
          this.bindCdcIntegrationService(options.cdcIntegrationService);
        }
      }
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
    if (stryMutAct_9fa48("161933")) {
      {}
    } else {
      stryCov_9fa48("161933");
      const entry = this.localCache.get(functionId);
      if (stryMutAct_9fa48("161936") ? false : stryMutAct_9fa48("161935") ? true : stryMutAct_9fa48("161934") ? entry : (stryCov_9fa48("161934", "161935", "161936"), !entry)) {
        if (stryMutAct_9fa48("161937")) {
          {}
        } else {
          stryCov_9fa48("161937");
          return stryMutAct_9fa48("161938") ? true : (stryCov_9fa48("161938"), false);
        }
      }
      return stryMutAct_9fa48("161941") ? entry.version !== version : stryMutAct_9fa48("161940") ? false : stryMutAct_9fa48("161939") ? true : (stryCov_9fa48("161939", "161940", "161941"), entry.version === version);
    }
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
    if (stryMutAct_9fa48("161942")) {
      {}
    } else {
      stryCov_9fa48("161942");
      const entry = this.localCache.get(functionId);
      return stryMutAct_9fa48("161943") ? entry && null : (stryCov_9fa48("161943"), entry ?? null);
    }
  }

  /**
   * Store a module entry directly in the local cache.
   *
   * @param {string} functionId - Function identifier.
   * @param {Object} moduleEntry - Module payload.
   * @return {Promise<void>}
   */
  async setModule(functionId, moduleEntry) {
    if (stryMutAct_9fa48("161944")) {
      {}
    } else {
      stryCov_9fa48("161944");
      if (stryMutAct_9fa48("161947") ? !functionId && typeof functionId !== TYPEOF.STRING : stryMutAct_9fa48("161946") ? false : stryMutAct_9fa48("161945") ? true : (stryCov_9fa48("161945", "161946", "161947"), (stryMutAct_9fa48("161948") ? functionId : (stryCov_9fa48("161948"), !functionId)) || (stryMutAct_9fa48("161950") ? typeof functionId === TYPEOF.STRING : stryMutAct_9fa48("161949") ? false : (stryCov_9fa48("161949", "161950"), typeof functionId !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("161951")) {
          {}
        } else {
          stryCov_9fa48("161951");
          throw new Error(MODULE_MIRROR_ERROR_MSG.FUNCTION_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("161954") ? !moduleEntry && typeof moduleEntry !== TYPEOF.OBJECT : stryMutAct_9fa48("161953") ? false : stryMutAct_9fa48("161952") ? true : (stryCov_9fa48("161952", "161953", "161954"), (stryMutAct_9fa48("161955") ? moduleEntry : (stryCov_9fa48("161955"), !moduleEntry)) || (stryMutAct_9fa48("161957") ? typeof moduleEntry === TYPEOF.OBJECT : stryMutAct_9fa48("161956") ? false : (stryCov_9fa48("161956", "161957"), typeof moduleEntry !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("161958")) {
          {}
        } else {
          stryCov_9fa48("161958");
          throw new Error(MODULE_MIRROR_ERROR_MSG.INVALID_MODULE_ENTRY);
        }
      }
      const normalized = this._normalizeModulePayload(stryMutAct_9fa48("161959") ? moduleEntry.version && null : (stryCov_9fa48("161959"), moduleEntry.version ?? null), moduleEntry);
      await this._storeModuleEntry(functionId, normalized);
    }
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
    if (stryMutAct_9fa48("161960")) {
      {}
    } else {
      stryCov_9fa48("161960");
      if (stryMutAct_9fa48("161963") ? !this.moduleProvider && typeof this.moduleProvider !== 'function' : stryMutAct_9fa48("161962") ? false : stryMutAct_9fa48("161961") ? true : (stryCov_9fa48("161961", "161962", "161963"), (stryMutAct_9fa48("161964") ? this.moduleProvider : (stryCov_9fa48("161964"), !this.moduleProvider)) || (stryMutAct_9fa48("161966") ? typeof this.moduleProvider === 'function' : stryMutAct_9fa48("161965") ? false : (stryCov_9fa48("161965", "161966"), typeof this.moduleProvider !== (stryMutAct_9fa48("161967") ? "" : (stryCov_9fa48("161967"), 'function')))))) {
        if (stryMutAct_9fa48("161968")) {
          {}
        } else {
          stryCov_9fa48("161968");
          throw new Error(MODULE_MIRROR_ERROR_MSG.PROVIDER_REQUIRED);
        }
      }
      const modulePayload = await this.moduleProvider(functionId, version, sourceNodeId);
      if (stryMutAct_9fa48("161971") ? !modulePayload && typeof modulePayload !== 'object' : stryMutAct_9fa48("161970") ? false : stryMutAct_9fa48("161969") ? true : (stryCov_9fa48("161969", "161970", "161971"), (stryMutAct_9fa48("161972") ? modulePayload : (stryCov_9fa48("161972"), !modulePayload)) || (stryMutAct_9fa48("161974") ? typeof modulePayload === 'object' : stryMutAct_9fa48("161973") ? false : (stryCov_9fa48("161973", "161974"), typeof modulePayload !== (stryMutAct_9fa48("161975") ? "" : (stryCov_9fa48("161975"), 'object')))))) {
        if (stryMutAct_9fa48("161976")) {
          {}
        } else {
          stryCov_9fa48("161976");
          throw new Error(MODULE_MIRROR_ERROR_MSG.INVALID_PAYLOAD);
        }
      }
      const normalized = this._normalizeModulePayload(version, modulePayload);
      await this._storeModuleEntry(functionId, normalized);
    }
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
    if (stryMutAct_9fa48("161977")) {
      {}
    } else {
      stryCov_9fa48("161977");
      const validation = await this.runtimeManifestValidator(moduleEntry.manifest, moduleEntry, this.runtimeAdapter, functionId);
      if (stryMutAct_9fa48("161979") ? false : stryMutAct_9fa48("161978") ? true : (stryCov_9fa48("161978", "161979"), validation.valid)) {
        if (stryMutAct_9fa48("161980")) {
          {}
        } else {
          stryCov_9fa48("161980");
          return;
        }
      }
      const detail = Array.isArray(validation.errors) ? validation.errors.join(stryMutAct_9fa48("161981") ? "" : (stryCov_9fa48("161981"), '; ')) : stryMutAct_9fa48("161982") ? "" : (stryCov_9fa48("161982"), 'unknown runtime validation failure');
      throw new Error(stryMutAct_9fa48("161983") ? `` : (stryCov_9fa48("161983"), `${MODULE_MIRROR_ERROR_MSG.RUNTIME_VALIDATION_FAILED}: ${detail}`));
    }
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
    if (stryMutAct_9fa48("161984")) {
      {}
    } else {
      stryCov_9fa48("161984");
      const payloadVersion = stryMutAct_9fa48("161985") ? modulePayload.version && version : (stryCov_9fa48("161985"), modulePayload.version ?? version);
      const payloadManifest = modulePayload.manifest;
      const payloadExports = modulePayload.exports;
      if (stryMutAct_9fa48("161988") ? !payloadManifest && typeof payloadManifest !== TYPEOF.OBJECT : stryMutAct_9fa48("161987") ? false : stryMutAct_9fa48("161986") ? true : (stryCov_9fa48("161986", "161987", "161988"), (stryMutAct_9fa48("161989") ? payloadManifest : (stryCov_9fa48("161989"), !payloadManifest)) || (stryMutAct_9fa48("161991") ? typeof payloadManifest === TYPEOF.OBJECT : stryMutAct_9fa48("161990") ? false : (stryCov_9fa48("161990", "161991"), typeof payloadManifest !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("161992")) {
          {}
        } else {
          stryCov_9fa48("161992");
          throw new Error(MODULE_MIRROR_ERROR_MSG.MANIFEST_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("161995") ? !payloadExports && typeof payloadExports !== TYPEOF.OBJECT : stryMutAct_9fa48("161994") ? false : stryMutAct_9fa48("161993") ? true : (stryCov_9fa48("161993", "161994", "161995"), (stryMutAct_9fa48("161996") ? payloadExports : (stryCov_9fa48("161996"), !payloadExports)) || (stryMutAct_9fa48("161998") ? typeof payloadExports === TYPEOF.OBJECT : stryMutAct_9fa48("161997") ? false : (stryCov_9fa48("161997", "161998"), typeof payloadExports !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("161999")) {
          {}
        } else {
          stryCov_9fa48("161999");
          throw new Error(MODULE_MIRROR_ERROR_MSG.EXPORTS_REQUIRED);
        }
      }
      let wasmBytes = modulePayload.wasmBytes;
      if (stryMutAct_9fa48("162001") ? false : stryMutAct_9fa48("162000") ? true : (stryCov_9fa48("162000", "162001"), Buffer.isBuffer(wasmBytes))) {
        if (stryMutAct_9fa48("162002")) {
          {}
        } else {
          stryCov_9fa48("162002");
          wasmBytes = Buffer.from(wasmBytes);
        }
      } else if (stryMutAct_9fa48("162004") ? false : stryMutAct_9fa48("162003") ? true : (stryCov_9fa48("162003", "162004"), wasmBytes instanceof Uint8Array)) {
        if (stryMutAct_9fa48("162005")) {
          {}
        } else {
          stryCov_9fa48("162005");
          wasmBytes = Buffer.from(wasmBytes);
        }
      } else if (stryMutAct_9fa48("162008") ? typeof wasmBytes !== TYPEOF.STRING : stryMutAct_9fa48("162007") ? false : stryMutAct_9fa48("162006") ? true : (stryCov_9fa48("162006", "162007", "162008"), typeof wasmBytes === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("162009")) {
          {}
        } else {
          stryCov_9fa48("162009");
          wasmBytes = Buffer.from(wasmBytes, stryMutAct_9fa48("162010") ? "" : (stryCov_9fa48("162010"), 'base64'));
        }
      } else {
        if (stryMutAct_9fa48("162011")) {
          {}
        } else {
          stryCov_9fa48("162011");
          throw new Error(MODULE_MIRROR_ERROR_MSG.WASM_BYTES_REQUIRED);
        }
      }
      return stryMutAct_9fa48("162012") ? {} : (stryCov_9fa48("162012"), {
        version: String(stryMutAct_9fa48("162013") ? payloadVersion && '' : (stryCov_9fa48("162013"), payloadVersion ?? (stryMutAct_9fa48("162014") ? "Stryker was here!" : (stryCov_9fa48("162014"), '')))),
        wasmBytes,
        manifest: payloadManifest,
        exports: payloadExports
      });
    }
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
    if (stryMutAct_9fa48("162015")) {
      {}
    } else {
      stryCov_9fa48("162015");
      await this._validateRuntimeManifest(functionId, moduleEntry);
      this.localCache.set(functionId, stryMutAct_9fa48("162016") ? {} : (stryCov_9fa48("162016"), {
        ...moduleEntry,
        updatedAt: Date.now()
      }));
    }
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
    if (stryMutAct_9fa48("162017")) {
      {}
    } else {
      stryCov_9fa48("162017");
      const entry = this.localCache.get(functionId);
      if (stryMutAct_9fa48("162020") ? false : stryMutAct_9fa48("162019") ? true : stryMutAct_9fa48("162018") ? entry : (stryCov_9fa48("162018", "162019", "162020"), !entry)) {
        if (stryMutAct_9fa48("162021")) {
          {}
        } else {
          stryCov_9fa48("162021");
          return;
        }
      }
      if (stryMutAct_9fa48("162024") ? false : stryMutAct_9fa48("162023") ? true : stryMutAct_9fa48("162022") ? version : (stryCov_9fa48("162022", "162023", "162024"), !version)) {
        if (stryMutAct_9fa48("162025")) {
          {}
        } else {
          stryCov_9fa48("162025");
          this.localCache.delete(functionId);
          return;
        }
      }
      if (stryMutAct_9fa48("162028") ? entry.version !== version : stryMutAct_9fa48("162027") ? false : stryMutAct_9fa48("162026") ? true : (stryCov_9fa48("162026", "162027", "162028"), entry.version === version)) {
        if (stryMutAct_9fa48("162029")) {
          {}
        } else {
          stryCov_9fa48("162029");
          return;
        }
      }
      this.localCache.delete(functionId);
    }
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
    if (stryMutAct_9fa48("162030")) {
      {}
    } else {
      stryCov_9fa48("162030");
      if (stryMutAct_9fa48("162033") ? (!cdcIntegrationService || typeof cdcIntegrationService.on !== TYPEOF.FUNCTION) && typeof cdcIntegrationService.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("162032") ? false : stryMutAct_9fa48("162031") ? true : (stryCov_9fa48("162031", "162032", "162033"), (stryMutAct_9fa48("162035") ? !cdcIntegrationService && typeof cdcIntegrationService.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("162034") ? false : (stryCov_9fa48("162034", "162035"), (stryMutAct_9fa48("162036") ? cdcIntegrationService : (stryCov_9fa48("162036"), !cdcIntegrationService)) || (stryMutAct_9fa48("162038") ? typeof cdcIntegrationService.on === TYPEOF.FUNCTION : stryMutAct_9fa48("162037") ? false : (stryCov_9fa48("162037", "162038"), typeof cdcIntegrationService.on !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("162040") ? typeof cdcIntegrationService.off === TYPEOF.FUNCTION : stryMutAct_9fa48("162039") ? false : (stryCov_9fa48("162039", "162040"), typeof cdcIntegrationService.off !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("162041")) {
          {}
        } else {
          stryCov_9fa48("162041");
          return stryMutAct_9fa48("162042") ? true : (stryCov_9fa48("162042"), false);
        }
      }
      this.unbindCdcIntegrationService();
      this.cdcIntegrationService = cdcIntegrationService;
      for (const eventName of CODE_CDC_EVENTS) {
        if (stryMutAct_9fa48("162043")) {
          {}
        } else {
          stryCov_9fa48("162043");
          const handler = stryMutAct_9fa48("162044") ? () => undefined : (stryCov_9fa48("162044"), (() => {
            const handler = event => this._handleCodeCdcEvent(event);
            return handler;
          })());
          this.boundCdcHandlers.set(eventName, handler);
          cdcIntegrationService.on(eventName, handler);
        }
      }
      return stryMutAct_9fa48("162045") ? false : (stryCov_9fa48("162045"), true);
    }
  }

  /**
   * Remove previously bound CDC listeners.
   */
  unbindCdcIntegrationService() {
    if (stryMutAct_9fa48("162046")) {
      {}
    } else {
      stryCov_9fa48("162046");
      if (stryMutAct_9fa48("162049") ? !this.cdcIntegrationService && typeof this.cdcIntegrationService.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("162048") ? false : stryMutAct_9fa48("162047") ? true : (stryCov_9fa48("162047", "162048", "162049"), (stryMutAct_9fa48("162050") ? this.cdcIntegrationService : (stryCov_9fa48("162050"), !this.cdcIntegrationService)) || (stryMutAct_9fa48("162052") ? typeof this.cdcIntegrationService.off === TYPEOF.FUNCTION : stryMutAct_9fa48("162051") ? false : (stryCov_9fa48("162051", "162052"), typeof this.cdcIntegrationService.off !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("162053")) {
          {}
        } else {
          stryCov_9fa48("162053");
          this.cdcIntegrationService = null;
          this.boundCdcHandlers.clear();
          return;
        }
      }
      for (const [eventName, handler] of this.boundCdcHandlers) {
        if (stryMutAct_9fa48("162054")) {
          {}
        } else {
          stryCov_9fa48("162054");
          this.cdcIntegrationService.off(eventName, handler);
        }
      }
      this.cdcIntegrationService = null;
      this.boundCdcHandlers.clear();
    }
  }

  /**
   * Handle a CDC event and invalidate cached module entries
   * for code-table changes.
   *
   * @param {Object} event - CDC event payload.
   * @private
   */
  _handleCodeCdcEvent(event) {
    if (stryMutAct_9fa48("162055")) {
      {}
    } else {
      stryCov_9fa48("162055");
      if (stryMutAct_9fa48("162058") ? !event && event.tableName !== TABLES.CODE : stryMutAct_9fa48("162057") ? false : stryMutAct_9fa48("162056") ? true : (stryCov_9fa48("162056", "162057", "162058"), (stryMutAct_9fa48("162059") ? event : (stryCov_9fa48("162059"), !event)) || (stryMutAct_9fa48("162061") ? event.tableName === TABLES.CODE : stryMutAct_9fa48("162060") ? false : (stryCov_9fa48("162060", "162061"), event.tableName !== TABLES.CODE)))) {
        if (stryMutAct_9fa48("162062")) {
          {}
        } else {
          stryCov_9fa48("162062");
          return;
        }
      }
      const functionId = stryMutAct_9fa48("162065") ? (event.data?.[COLUMN.FUNCTION_ID] || event.whereClause?.[COLUMN.FUNCTION_ID]) && null : stryMutAct_9fa48("162064") ? false : stryMutAct_9fa48("162063") ? true : (stryCov_9fa48("162063", "162064", "162065"), (stryMutAct_9fa48("162067") ? event.data?.[COLUMN.FUNCTION_ID] && event.whereClause?.[COLUMN.FUNCTION_ID] : stryMutAct_9fa48("162066") ? false : (stryCov_9fa48("162066", "162067"), (stryMutAct_9fa48("162068") ? event.data[COLUMN.FUNCTION_ID] : (stryCov_9fa48("162068"), event.data?.[COLUMN.FUNCTION_ID])) || (stryMutAct_9fa48("162069") ? event.whereClause[COLUMN.FUNCTION_ID] : (stryCov_9fa48("162069"), event.whereClause?.[COLUMN.FUNCTION_ID])))) || null);
      if (stryMutAct_9fa48("162072") ? false : stryMutAct_9fa48("162071") ? true : stryMutAct_9fa48("162070") ? functionId : (stryCov_9fa48("162070", "162071", "162072"), !functionId)) {
        if (stryMutAct_9fa48("162073")) {
          {}
        } else {
          stryCov_9fa48("162073");
          return;
        }
      }
      const version = stryMutAct_9fa48("162076") ? (event.data?.[COLUMN.VERSION] || event.whereClause?.[COLUMN.VERSION]) && null : stryMutAct_9fa48("162075") ? false : stryMutAct_9fa48("162074") ? true : (stryCov_9fa48("162074", "162075", "162076"), (stryMutAct_9fa48("162078") ? event.data?.[COLUMN.VERSION] && event.whereClause?.[COLUMN.VERSION] : stryMutAct_9fa48("162077") ? false : (stryCov_9fa48("162077", "162078"), (stryMutAct_9fa48("162079") ? event.data[COLUMN.VERSION] : (stryCov_9fa48("162079"), event.data?.[COLUMN.VERSION])) || (stryMutAct_9fa48("162080") ? event.whereClause[COLUMN.VERSION] : (stryCov_9fa48("162080"), event.whereClause?.[COLUMN.VERSION])))) || null);
      this.onCodeUpdate(functionId, version);
    }
  }
}
export { ModuleMirror };