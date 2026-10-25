import {isSystemTableName} from
  '../bootstrap/system-table-schema-shared-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';

/**
 * Validate user CREATE before recording intent and again on provisioning resume.
 * Bootstrap owns system table creation independently of catalog cache presence.
 * @param {Object} ast
 */
function validateUserTableCreateIntent(ast = {}) {
  if (isSystemTableName(ast.tableName)) {
    const error = new Error(QUERY_ERROR_MSG.SYSTEM_TABLE_NAME_RESERVED);
    error.code = QUERY_ERROR_CODE.SYSTEM_TABLE_NAME_RESERVED;
    throw error;
  }
  if (Array.isArray(ast.primaryKey) && ast.primaryKey.length > 0) return;
  const error = new Error(
    `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${ast.tableName}` +
    `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. ` +
    QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL,
  );
  error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
  throw error;
}

export {validateUserTableCreateIntent};
