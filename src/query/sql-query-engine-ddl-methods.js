import {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_OPERATION,
} from './query-constants.js';

function invalidateParsedStatements(target) {
  if (target?.parseCache?.clear) {
    target.parseCache.clear();
  }
}

function buildCreateIndexResponse(ast, metadata) {
  const result = {
    success: true,
    operation: QUERY_OPERATION.CREATE_INDEX,
    statementType: QUERY_AST_TYPE.CREATE_INDEX,
    indexName: ast.indexName,
    tableName: ast.tableName,
    rows: [],
    rowCount: 0,
  };
  if (metadata?.indexId) result.indexId = metadata.indexId;
  if (metadata?.state) result.state = metadata.state;
  if (!metadata?.deferred) return result;
  result.deferred = true;
  const fields = ['contractState', 'failureCode', 'nextAction', 'jobId', 'retryAfterMs'];
  for (const field of fields) {
    if (metadata[field] !== undefined) result[field] = metadata[field];
  }
  return result;
}

const sqlQueryEngineDdlMethods = {
  resetPreparedStatements() {
    invalidateParsedStatements(this);
  },

  async executeCreateIndex(ast, _sessionId, _options = {}) {
    if (!this.indexService) {
      const error = new Error('IndexService is not available');
      error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      throw error;
    }
    const metadata = await this.indexService.createIndex(ast);
    invalidateParsedStatements(this);
    return buildCreateIndexResponse(ast, metadata);
  },

  async executeDropIndex(ast, _sessionId, _options = {}) {
    if (!this.indexService) {
      const error = new Error('IndexService is not available');
      error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      throw error;
    }
    const dropped = await this.indexService.dropIndex(ast);
    invalidateParsedStatements(this);
    return {
      success: true,
      operation: QUERY_OPERATION.DROP_INDEX,
      statementType: QUERY_AST_TYPE.DROP_INDEX,
      indexName: ast.indexName,
      dropped,
      rows: [],
      rowCount: 0,
    };
  },
};

export {sqlQueryEngineDdlMethods};
