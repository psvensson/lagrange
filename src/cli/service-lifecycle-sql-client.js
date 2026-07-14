const SQL_CLIENT_ERROR_NAME = 'ServiceLifecycleSqlClientError';
const STAGE_MESSAGE = Object.freeze({
  connect: 'PostgreSQL connection failed',
  disconnect: 'PostgreSQL connection close failed after an ambiguous result',
  load: 'PostgreSQL client initialization failed',
});
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;

class ServiceLifecycleSqlClientError extends Error {
  constructor(stage, message, options = {}) {
    super(message, options);
    this.name = SQL_CLIENT_ERROR_NAME;
    this.stage = stage;
    this.ambiguous = stage === 'query' || stage === 'disconnect';
  }
}

function sqlFailure(stage, error) {
  const authenticationFailure = stage === 'connect' &&
    /authenticat/iu.test(String(error?.message || ''));
  const sqlState = SQLSTATE_PATTERN.test(String(error?.code || '')) ?
    ` (${error.code})` : '';
  const detail = stage === 'query' ?
    `PostgreSQL lifecycle query rejected${sqlState}` :
    (authenticationFailure ? 'PostgreSQL authentication failed' :
      STAGE_MESSAGE[stage] || 'PostgreSQL lifecycle command failed');
  return new ServiceLifecycleSqlClientError(stage, detail, {cause: error});
}

function createServiceLifecycleSqlClient(options = {}) {
  const loadPg = options.loadPg || (() => import('pg'));
  return Object.freeze({
    async execute(statement, parameters) {
      let client;
      let primaryFailure = null;
      let result;
      try {
        const pg = await loadPg();
        const Client = pg.Client || pg.default?.Client;
        if (typeof Client !== 'function') {
          throw new TypeError('pg Client export is unavailable');
        }
        client = new Client();
        try {
          await client.connect();
        } catch (error) {
          throw sqlFailure('connect', error);
        }
        try {
          result = await client.query({text: statement, values: parameters});
        } catch (error) {
          throw sqlFailure('query', error);
        }
      } catch (error) {
        primaryFailure = error instanceof ServiceLifecycleSqlClientError ?
          error : sqlFailure('load', error);
      }

      if (client) {
        try {
          await client.end();
        } catch (error) {
          if (!primaryFailure) primaryFailure = sqlFailure('disconnect', error);
        }
      }
      if (primaryFailure) throw primaryFailure;
      return Object.freeze({rows: result?.rows});
    },
  });
}

export {ServiceLifecycleSqlClientError, createServiceLifecycleSqlClient};
