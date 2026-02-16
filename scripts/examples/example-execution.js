import {
  CODE_TABLE_VERSION,
  CODE_PERMISSIONS_EMPTY,
  INSERT_CODE_SQL,
  INSERT_MODULE_MANIFEST_SQL,
  MODULE_CAPABILITIES_EMPTY,
  MODULE_DEPENDENCIES_EMPTY,
  MODULE_NAMESPACE,
  codeSignature,
  moduleExportsSingle,
} from './examples-runner-constants.js';

/**
 * Build SQL parameter tuple for `INSERT OR REPLACE INTO code`.
 *
 * @param {Object} example
 * @param {number} nowMs
 * @return {Array}
 */
function buildCodeInsertParams(example, nowMs) {
  return [
    example.functionId,
    example.functionName,
    CODE_TABLE_VERSION,
    example.executorType,
    example.codeBlob,
    codeSignature(example.callbackExport),
    CODE_PERMISSIONS_EMPTY,
    nowMs,
    nowMs,
  ];
}

/**
 * Build SQL parameter tuple for `INSERT OR REPLACE INTO module_manifests`.
 *
 * @param {Object} example
 * @param {number} nowMs
 * @return {Array}
 */
function buildManifestInsertParams(example, nowMs) {
  return [
    MODULE_NAMESPACE,
    example.moduleName,
    example.version,
    example.digest,
    example.callbackExport,
    moduleExportsSingle(example.callbackExport),
    MODULE_DEPENDENCIES_EMPTY,
    MODULE_CAPABILITIES_EMPTY,
    example.sourcePath,
    example.functionId,
    nowMs,
  ];
}

/**
 * Upload example callback code and manifest rows.
 *
 * @param {Object} client
 * @param {Object} example
 * @param {number} nowMs
 * @return {Promise<void>}
 */
async function uploadExample(client, example, nowMs) {
  await client.query(
    INSERT_CODE_SQL,
    buildCodeInsertParams(example, nowMs),
  );

  await client.query(
    INSERT_MODULE_MANIFEST_SQL,
    buildManifestInsertParams(example, nowMs),
  );
}

/**
 * Execute one packaged example using `partition_callback`.
 *
 * @param {Object} client
 * @param {Object} example
 * @return {Promise<Object>}
 */
async function executeExample(client, example) {
  const callbackResult = await client.partitionCallback({
    statement: example.select,
    parameters: example.params,
    callbackModuleRef: example.functionId,
    callbackExport: example.callbackExport,
    runtimeKind: example.runtimeKind,
  });

  return callbackResult;
}

export {
  executeExample,
  uploadExample,
};
