/**
 * Value formatting, comparison, and validation helpers for ConfigView.
 */

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_JSON = 'json';
const LOCAL_STR_NULL = 'null';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_FORTY = 40;
const LOCAL_NUM_THIRTY_SEVEN = 37;
const LOCAL_STR_ELLIPSIS = '...';
const LOCAL_STR_TRUE = 'true';
const LOCAL_STR_FALSE = 'false';
const LOCAL_STR_DEFAULT_VALUE = 'default_value';
const LOCAL_STR_NUMBER_EMPTY_ERROR = 'Number value cannot be empty';
const LOCAL_STR_ONE = '1';
const LOCAL_STR_YES = 'yes';
const LOCAL_STR_ZERO = '0';
const LOCAL_STR_NO = 'no';
const LOCAL_STR_JSON_EMPTY_ERROR = 'JSON value cannot be empty';

/**
 * Format config value for display.
 * @param {*} value - Config value
 * @param {string} type - Value type
 * @return {string} Formatted value
 */
export function formatConfigValue(value, type) {
  if (value === null || value === undefined) {
    return LOCAL_STR_NULL;
  }

  if (type === LOCAL_STR_JSON && typeof value === LOCAL_STR_OBJECT) {
    const str = JSON.stringify(value);
    return str.length > LOCAL_NUM_FORTY ?
      str.substring(0, LOCAL_NUM_THIRTY_SEVEN) + LOCAL_STR_ELLIPSIS :
      str;
  }

  if (type === LOCAL_STR_BOOLEAN) {
    return value ? LOCAL_STR_TRUE : LOCAL_STR_FALSE;
  }

  const str = String(value);
  return str.length > LOCAL_NUM_FORTY ?
    str.substring(0, LOCAL_NUM_THIRTY_SEVEN) + LOCAL_STR_ELLIPSIS :
    str;
}

/**
 * Check if config value differs from default.
 * @param {Object} config - Config record
 * @return {boolean} True if value differs from default
 */
export function isConfigDifferentFromDefault(config) {
  if (!Object.prototype.hasOwnProperty.call(config, LOCAL_STR_DEFAULT_VALUE)) {
    return false;
  }

  const currentValue = config.config_value;
  const defaultValue = config.default_value;

  if (currentValue === null || currentValue === undefined) {
    return defaultValue !== null && defaultValue !== undefined;
  }
  if (defaultValue === null || defaultValue === undefined) {
    return true;
  }

  if (typeof currentValue === LOCAL_STR_OBJECT || typeof defaultValue === LOCAL_STR_OBJECT) {
    return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
  }

  return currentValue !== defaultValue;
}

/**
 * Format full value for detail view without truncation.
 * @param {*} value - Config value
 * @param {string} type - Value type
 * @return {string} Formatted value
 */
export function formatFullConfigValue(value, type) {
  if (value === null || value === undefined) {
    return LOCAL_STR_NULL;
  }

  if (type === LOCAL_STR_JSON && typeof value === LOCAL_STR_OBJECT) {
    return JSON.stringify(value, null, 2);
  }

  if (type === LOCAL_STR_BOOLEAN) {
    return value ? LOCAL_STR_TRUE : LOCAL_STR_FALSE;
  }

  return String(value);
}

/**
 * Validate a value against the expected type.
 * @param {string} inputValue - The input value as a string
 * @param {string} type - The expected type
 * @return {{valid: boolean, parsedValue?: *, error?: string}} Validation result
 */
export function validateConfigValue(inputValue, type) {
  if (inputValue === null || inputValue === undefined) {
    return {valid: true, parsedValue: null};
  }

  const trimmedInput = String(inputValue).trim();

  switch (type) {
  case LOCAL_STR_STRING:
    return {valid: true, parsedValue: trimmedInput};

  case LOCAL_STR_NUMBER:
    return validateNumberValue(trimmedInput);

  case LOCAL_STR_BOOLEAN:
    return validateBooleanValue(trimmedInput);

  case LOCAL_STR_JSON:
    return validateJsonValue(trimmedInput);

  default:
    return {valid: true, parsedValue: trimmedInput};
  }
}

function validateNumberValue(trimmedInput) {
  if (trimmedInput === '') {
    return {valid: false, error: LOCAL_STR_NUMBER_EMPTY_ERROR};
  }
  const num = Number(trimmedInput);
  if (isNaN(num)) {
    return {valid: false, error: `Invalid number: "${trimmedInput}"`};
  }
  return {valid: true, parsedValue: num};
}

function validateBooleanValue(trimmedInput) {
  const lower = trimmedInput.toLowerCase();
  if (lower === LOCAL_STR_TRUE || lower === LOCAL_STR_ONE || lower === LOCAL_STR_YES) {
    return {valid: true, parsedValue: true};
  }
  if (lower === LOCAL_STR_FALSE || lower === LOCAL_STR_ZERO || lower === LOCAL_STR_NO) {
    return {valid: true, parsedValue: false};
  }
  return {
    valid: false,
    error: `Invalid boolean: "${trimmedInput}". Use true/false, yes/no, or 1/0`,
  };
}

function validateJsonValue(trimmedInput) {
  if (trimmedInput === '') {
    return {valid: false, error: LOCAL_STR_JSON_EMPTY_ERROR};
  }
  try {
    const parsed = JSON.parse(trimmedInput);
    return {valid: true, parsedValue: parsed};
  } catch (err) {
    return {valid: false, error: `Invalid JSON: ${err.message}`};
  }
}
