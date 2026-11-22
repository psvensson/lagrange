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

const sqlQueryEngineDdlMethods = {
  async executeCreateIndex(ast, _sessionId, _options = {}) {
    if (!this.indexService) {
      const error = new Error('IndexService is not available');
      error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      throw error;
    }
    const metadata = await this.indexService.createIndex(ast);
    invalidateParsedStatements(this);
    const result = {
      success: true,
      operation: QUERY_OPERATION.CREATE_INDEX,
      statementType: QUERY_AST_TYPE.CREATE_INDEX,
      indexName: metadata?.indexName || ast.indexName,
      tableName: ast.tableName,
      rows: [],
      rowCount: 0,
    };
    if (metadata?.indexId) result.indexId = metadata.indexId;
    if (metadata?.state) result.state = metadata.state;
    if (metadata?.deferred) {
      result.deferred = true;
      if (metadata.contractState !== undefined) result.contractState = metadata.contractState;
      if (metadata.failureCode !== undefined) result.failureCode = metadata.failureCode;
      if (metadata.nextAction !== undefined) result.nextAction = metadata.nextAction;
      if (metadata.jobId !== undefined) result.jobId = metadata.jobId;
      if (metadata.retryAfterMs !== undefined) result.retryAfterMs = metadata.retryAfterMs;
    }
    return result;
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
