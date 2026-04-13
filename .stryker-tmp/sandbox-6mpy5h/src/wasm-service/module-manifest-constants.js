/**
 * Constants for WASM module manifest validation and storage.
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
const MODULE_MANIFEST_FIELD = Object.freeze(stryMutAct_9fa48("161593") ? {} : (stryCov_9fa48("161593"), {
  NAMESPACE: stryMutAct_9fa48("161594") ? "" : (stryCov_9fa48("161594"), 'namespace'),
  NAME: stryMutAct_9fa48("161595") ? "" : (stryCov_9fa48("161595"), 'name'),
  VERSION: stryMutAct_9fa48("161596") ? "" : (stryCov_9fa48("161596"), 'version'),
  DIGEST: stryMutAct_9fa48("161597") ? "" : (stryCov_9fa48("161597"), 'digest'),
  RUN_EXPORT: stryMutAct_9fa48("161598") ? "" : (stryCov_9fa48("161598"), 'runExport'),
  EXPORTS: stryMutAct_9fa48("161599") ? "" : (stryCov_9fa48("161599"), 'exports'),
  DEPENDENCIES: stryMutAct_9fa48("161600") ? "" : (stryCov_9fa48("161600"), 'dependencies'),
  CAPABILITIES: stryMutAct_9fa48("161601") ? "" : (stryCov_9fa48("161601"), 'capabilities'),
  DEBUG_ARTIFACT: stryMutAct_9fa48("161602") ? "" : (stryCov_9fa48("161602"), 'debugArtifact'),
  SOURCE_REFERENCE: stryMutAct_9fa48("161603") ? "" : (stryCov_9fa48("161603"), 'sourceReference'),
  ARTIFACT_POINTER: stryMutAct_9fa48("161604") ? "" : (stryCov_9fa48("161604"), 'artifactPointer')
}));
const DEBUG_ARTIFACT_FIELD = Object.freeze(stryMutAct_9fa48("161605") ? {} : (stryCov_9fa48("161605"), {
  MODE: stryMutAct_9fa48("161606") ? "" : (stryCov_9fa48("161606"), 'mode'),
  SIDECAR_URI: stryMutAct_9fa48("161607") ? "" : (stryCov_9fa48("161607"), 'sidecarUri'),
  EMBEDDED_SECTION: stryMutAct_9fa48("161608") ? "" : (stryCov_9fa48("161608"), 'embeddedSection')
}));
const DEBUG_ARTIFACT_MODE = Object.freeze(stryMutAct_9fa48("161609") ? {} : (stryCov_9fa48("161609"), {
  EMBEDDED: stryMutAct_9fa48("161610") ? "" : (stryCov_9fa48("161610"), 'embedded'),
  SIDECAR: stryMutAct_9fa48("161611") ? "" : (stryCov_9fa48("161611"), 'sidecar')
}));
const MODULE_DEPENDENCY_FIELD = Object.freeze(stryMutAct_9fa48("161612") ? {} : (stryCov_9fa48("161612"), {
  MODULE_ID: stryMutAct_9fa48("161613") ? "" : (stryCov_9fa48("161613"), 'moduleId'),
  DIGEST: stryMutAct_9fa48("161614") ? "" : (stryCov_9fa48("161614"), 'digest')
}));
const MODULE_MANIFEST_COL = Object.freeze(stryMutAct_9fa48("161615") ? {} : (stryCov_9fa48("161615"), {
  NAMESPACE: stryMutAct_9fa48("161616") ? "" : (stryCov_9fa48("161616"), 'namespace'),
  NAME: stryMutAct_9fa48("161617") ? "" : (stryCov_9fa48("161617"), 'name'),
  VERSION: stryMutAct_9fa48("161618") ? "" : (stryCov_9fa48("161618"), 'version'),
  DIGEST: stryMutAct_9fa48("161619") ? "" : (stryCov_9fa48("161619"), 'digest'),
  RUN_EXPORT: stryMutAct_9fa48("161620") ? "" : (stryCov_9fa48("161620"), 'run_export'),
  EXPORTS: stryMutAct_9fa48("161621") ? "" : (stryCov_9fa48("161621"), 'exports'),
  DEPENDENCIES: stryMutAct_9fa48("161622") ? "" : (stryCov_9fa48("161622"), 'dependencies'),
  CAPABILITIES: stryMutAct_9fa48("161623") ? "" : (stryCov_9fa48("161623"), 'capabilities'),
  SOURCE_REFERENCE: stryMutAct_9fa48("161624") ? "" : (stryCov_9fa48("161624"), 'source_reference'),
  ARTIFACT_POINTER: stryMutAct_9fa48("161625") ? "" : (stryCov_9fa48("161625"), 'artifact_pointer'),
  CREATED_AT: stryMutAct_9fa48("161626") ? "" : (stryCov_9fa48("161626"), 'created_at')
}));
const DIGEST_PREFIX = stryMutAct_9fa48("161627") ? "" : (stryCov_9fa48("161627"), 'sha256:');
const DIGEST_HEX_LENGTH = 64;
const MODULE_MANIFEST_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161628") ? {} : (stryCov_9fa48("161628"), {
  NAMESPACE_REQUIRED: stryMutAct_9fa48("161629") ? "" : (stryCov_9fa48("161629"), 'Module manifest requires namespace'),
  NAME_REQUIRED: stryMutAct_9fa48("161630") ? "" : (stryCov_9fa48("161630"), 'Module manifest requires name'),
  NAMESPACE_INVALID_FORMAT: stryMutAct_9fa48("161631") ? "" : (stryCov_9fa48("161631"), 'Namespace must be lowercase alphanumeric with hyphens'),
  NAME_INVALID_FORMAT: stryMutAct_9fa48("161632") ? "" : (stryCov_9fa48("161632"), 'Name must be lowercase alphanumeric with hyphens'),
  VERSION_REQUIRED: stryMutAct_9fa48("161633") ? "" : (stryCov_9fa48("161633"), 'Module manifest requires version'),
  DIGEST_REQUIRED: stryMutAct_9fa48("161634") ? "" : (stryCov_9fa48("161634"), 'Module manifest requires digest'),
  DIGEST_INVALID_FORMAT: stryMutAct_9fa48("161635") ? "" : (stryCov_9fa48("161635"), 'Module digest must start with sha256: followed by 64 hex chars'),
  RUN_EXPORT_REQUIRED: stryMutAct_9fa48("161636") ? "" : (stryCov_9fa48("161636"), 'Module manifest requires run_export'),
  RUN_EXPORT_NOT_IN_EXPORTS: stryMutAct_9fa48("161637") ? "" : (stryCov_9fa48("161637"), 'run_export must reference a declared export'),
  EXPORTS_REQUIRED: stryMutAct_9fa48("161638") ? "" : (stryCov_9fa48("161638"), 'Module manifest requires at least one declared export'),
  EXPORTS_NOT_ARRAY: stryMutAct_9fa48("161639") ? "" : (stryCov_9fa48("161639"), 'Module exports must be an array of strings'),
  DEPENDENCIES_NOT_ARRAY: stryMutAct_9fa48("161640") ? "" : (stryCov_9fa48("161640"), 'Module dependencies must be an array'),
  DEPENDENCY_MODULE_ID_REQUIRED: stryMutAct_9fa48("161641") ? "" : (stryCov_9fa48("161641"), 'Each dependency requires module_id'),
  DEPENDENCY_DIGEST_REQUIRED: stryMutAct_9fa48("161642") ? "" : (stryCov_9fa48("161642"), 'Each dependency requires a pinned digest'),
  DEPENDENCY_DIGEST_INVALID_FORMAT: stryMutAct_9fa48("161643") ? "" : (stryCov_9fa48("161643"), 'Dependency digest must start with sha256: followed by 64 hex chars'),
  CAPABILITIES_NOT_ARRAY: stryMutAct_9fa48("161644") ? "" : (stryCov_9fa48("161644"), 'Module capabilities must be an array of strings'),
  DEBUG_ARTIFACT_INVALID: stryMutAct_9fa48("161645") ? "" : (stryCov_9fa48("161645"), 'debugArtifact must be an object when declared'),
  DEBUG_ARTIFACT_MODE_INVALID: stryMutAct_9fa48("161646") ? "" : (stryCov_9fa48("161646"), 'debugArtifact.mode must be one of: embedded, sidecar'),
  DEBUG_ARTIFACT_SIDECAR_URI_REQUIRED: stryMutAct_9fa48("161647") ? "" : (stryCov_9fa48("161647"), 'debugArtifact.sidecarUri or artifactPointer is required for sidecar mode'),
  DEBUG_ARTIFACT_EMBEDDED_SECTION_INVALID: stryMutAct_9fa48("161648") ? "" : (stryCov_9fa48("161648"), 'debugArtifact.embeddedSection must be a non-empty string when provided'),
  UNDECLARED_CAPABILITY: stryMutAct_9fa48("161649") ? "" : (stryCov_9fa48("161649"), 'Module declares capability not in tenant allowlist'),
  RUN_EXPORT_MISSING_IN_MODULE: stryMutAct_9fa48("161650") ? "" : (stryCov_9fa48("161650"), 'run_export not found in WASM module instance exports'),
  RUN_EXPORT_NOT_FUNCTION: stryMutAct_9fa48("161651") ? "" : (stryCov_9fa48("161651"), 'run_export must resolve to a function in the module'),
  RUN_EXPORT_SIGNATURE_MISMATCH: stryMutAct_9fa48("161652") ? "" : (stryCov_9fa48("161652"), 'run_export signature does not match required runtime contract'),
  MANIFEST_REQUIRED: stryMutAct_9fa48("161653") ? "" : (stryCov_9fa48("161653"), 'Module manifest is required for runtime validation'),
  MODULE_INSTANCE_REQUIRED: stryMutAct_9fa48("161654") ? "" : (stryCov_9fa48("161654"), 'WASM module instance is required for runtime validation'),
  UNDECLARED_IMPORT: stryMutAct_9fa48("161655") ? "" : (stryCov_9fa48("161655"), 'Module uses undeclared import not listed in dependencies'),
  DEPENDENCY_DIGEST_MISMATCH: stryMutAct_9fa48("161656") ? "" : (stryCov_9fa48("161656"), 'Resolved dependency digest does not match pinned manifest digest'),
  DEPENDENCY_NOT_FOUND: stryMutAct_9fa48("161657") ? "" : (stryCov_9fa48("161657"), 'Dependency module not found in approved sources'),
  DEPENDENCY_VERSION_MUTABLE: stryMutAct_9fa48("161658") ? "" : (stryCov_9fa48("161658"), 'Dependency version changed without explicit rollout'),
  CAPABILITY_NOT_ALLOWED: stryMutAct_9fa48("161659") ? "" : (stryCov_9fa48("161659"), 'Capability not permitted by tenant/service policy'),
  CAPABILITY_NOT_DECLARED: stryMutAct_9fa48("161660") ? "" : (stryCov_9fa48("161660"), 'Capability module not declared in manifest'),
  POLICY_REQUIRED: stryMutAct_9fa48("161661") ? "" : (stryCov_9fa48("161661"), 'Capability policy is required for enforcement')
}));

/**
 * Audit log message templates for module/capability resolution.
 * @enum {string}
 */
const MODULE_AUDIT_MSG = Object.freeze(stryMutAct_9fa48("161662") ? {} : (stryCov_9fa48("161662"), {
  MANIFEST_VALIDATION_PASSED: stryMutAct_9fa48("161663") ? "" : (stryCov_9fa48("161663"), 'Manifest runtime validation passed'),
  MANIFEST_VALIDATION_FAILED: stryMutAct_9fa48("161664") ? "" : (stryCov_9fa48("161664"), 'Manifest runtime validation failed'),
  RUN_EXPORT_VERIFIED: stryMutAct_9fa48("161665") ? "" : (stryCov_9fa48("161665"), 'run_export verified in module instance'),
  DEPENDENCY_RESOLVED: stryMutAct_9fa48("161666") ? "" : (stryCov_9fa48("161666"), 'Dependency resolved by pinned digest'),
  DEPENDENCY_REJECTED: stryMutAct_9fa48("161667") ? "" : (stryCov_9fa48("161667"), 'Dependency rejected during resolution'),
  CAPABILITY_ALLOWED: stryMutAct_9fa48("161668") ? "" : (stryCov_9fa48("161668"), 'Capability allowed by tenant/service policy'),
  CAPABILITY_DENIED: stryMutAct_9fa48("161669") ? "" : (stryCov_9fa48("161669"), 'Capability denied by tenant/service policy'),
  MODULE_ACTIVATED: stryMutAct_9fa48("161670") ? "" : (stryCov_9fa48("161670"), 'Module activation completed'),
  MODULE_ACTIVATION_REJECTED: stryMutAct_9fa48("161671") ? "" : (stryCov_9fa48("161671"), 'Module activation rejected')
}));

/**
 * Resolution decision outcome values for audit records.
 * @enum {string}
 */
const RESOLUTION_DECISION = Object.freeze(stryMutAct_9fa48("161672") ? {} : (stryCov_9fa48("161672"), {
  ALLOWED: stryMutAct_9fa48("161673") ? "" : (stryCov_9fa48("161673"), 'allowed'),
  DENIED: stryMutAct_9fa48("161674") ? "" : (stryCov_9fa48("161674"), 'denied'),
  RESOLVED: stryMutAct_9fa48("161675") ? "" : (stryCov_9fa48("161675"), 'resolved'),
  REJECTED: stryMutAct_9fa48("161676") ? "" : (stryCov_9fa48("161676"), 'rejected')
}));

/**
 * Minimum parameter count for run_export runtime contract.
 * The run_export must accept at least (context, batch).
 * @type {number}
 */
const RUN_EXPORT_MIN_PARAMS = 2;

/**
 * Maximum parameter count for run_export runtime contract.
 * The run_export may accept (context, batch, options).
 * @type {number}
 */
const RUN_EXPORT_MAX_PARAMS = 3;
export { MODULE_MANIFEST_FIELD, MODULE_DEPENDENCY_FIELD, MODULE_MANIFEST_COL, DEBUG_ARTIFACT_FIELD, DEBUG_ARTIFACT_MODE, DIGEST_PREFIX, DIGEST_HEX_LENGTH, MODULE_MANIFEST_ERROR_MSG, MODULE_AUDIT_MSG, RESOLUTION_DECISION, RUN_EXPORT_MIN_PARAMS, RUN_EXPORT_MAX_PARAMS };