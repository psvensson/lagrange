/**
 * Constants for programmatic callback execution contract.
 *
 * Defines the runtime callback signature, validation rules,
 * and error messages for async WASM entry exports used by
 * DB.call(select, fn).
 *
 * Requirements: 4.3, 4.5, 7.3
 */

/**
 * Required parameter names for the callback signature.
 * Every valid WASM entry export must accept exactly these
 * parameters in order: (context, partitionBatch, options).
 * @enum {string}
 */
const CALLBACK_PARAM = Object.freeze({
  CONTEXT: 'context',
  PARTITION_BATCH: 'partitionBatch',
  OPTIONS: 'options',
});

/**
 * Ordered list of required callback parameter names.
 * @type {ReadonlyArray<string>}
 */
const CALLBACK_PARAM_ORDER = Object.freeze([
  CALLBACK_PARAM.CONTEXT,
  CALLBACK_PARAM.PARTITION_BATCH,
  CALLBACK_PARAM.OPTIONS,
]);

/**
 * Minimum number of required callback parameters.
 * The callback must accept at least context and partitionBatch.
 * @type {number}
 */
const CALLBACK_MIN_PARAMS = 2;

/**
 * Maximum number of callback parameters.
 * @type {number}
 */
const CALLBACK_MAX_PARAMS = 3;

/**
 * Field names used in callback descriptor objects.
 * @enum {string}
 */
const CALLBACK_FIELD = Object.freeze({
  MODULE_REF: 'moduleRef',
  EXPORT_NAME: 'exportName',
  IS_ASYNC: 'isAsync',
  PARAM_COUNT: 'paramCount',
  PARAMS: 'params',
});

/**
 * Error messages for callback validation failures.
 * @enum {string}
 */
const CALLBACK_ERROR_MSG = Object.freeze({
  EXPORT_NOT_FOUND:
    'Callback export not found in module exports',
  EXPORT_NOT_FUNCTION:
    'Callback export must be a function',
  EXPORT_NOT_ASYNC:
    'Callback export must be an async function',
  PARAM_COUNT_TOO_FEW:
    'Callback must accept at least context and partitionBatch',
  PARAM_COUNT_TOO_MANY:
    'Callback accepts too many parameters (max 3)',
  MODULE_REF_REQUIRED:
    'Module reference is required for callback validation',
  EXPORT_NAME_REQUIRED:
    'Export name is required for callback validation',
  MANIFEST_REQUIRED:
    'Module manifest is required for callback validation',
  RUN_EXPORT_MISMATCH:
    'Callback export does not match manifest run_export',
  SIGNATURE_INVALID:
    'Callback signature does not match required contract',
});

/**
 * Log messages for callback validation events.
 * @enum {string}
 */
const CALLBACK_LOG_MSG = Object.freeze({
  VALIDATION_PASSED: 'Callback export validation passed',
  VALIDATION_FAILED: 'Callback export validation failed',
  SIGNATURE_CHECKED: 'Callback signature checked',
});

export {
  CALLBACK_PARAM,
  CALLBACK_PARAM_ORDER,
  CALLBACK_MIN_PARAMS,
  CALLBACK_MAX_PARAMS,
  CALLBACK_FIELD,
  CALLBACK_ERROR_MSG,
  CALLBACK_LOG_MSG,
};
