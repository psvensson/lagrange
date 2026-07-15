const SQL_CLIENT_ERROR_NAME = 'ServiceLifecycleSqlClientError';
const SQL_CLIENT_STAGE = Object.freeze({
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  LOAD: 'load',
  QUERY: 'query',
});
const STAGE_MESSAGE = Object.freeze({
  [SQL_CLIENT_STAGE.CONNECT]: 'PostgreSQL connection failed',
  [SQL_CLIENT_STAGE.DISCONNECT]:
    'PostgreSQL connection close failed after an ambiguous result',
  [SQL_CLIENT_STAGE.LOAD]: 'PostgreSQL client initialization failed',
});
const PG_CLIENT_EXPORT_UNAVAILABLE = 'pg Client export is unavailable';
const NO_PRIMARY_FAILURE = Symbol('no-primary-failure');
const AMBIGUOUS_SQL_CLIENT_STAGES = Object.freeze(new Set([
  SQL_CLIENT_STAGE.QUERY,
  SQL_CLIENT_STAGE.DISCONNECT,
]));
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;

class ServiceLifecycleSqlClientError extends Error {
  constructor(stage, message, options = {}) {
    super(message, options);
    this.name = SQL_CLIENT_ERROR_NAME;
    this.stage = stage;
    this.ambiguous = AMBIGUOUS_SQL_CLIENT_STAGES.has(stage);
  }
}

function sqlFailure(stage, error) {
  const authenticationFailure = stage === SQL_CLIENT_STAGE.CONNECT &&
    /authenticat/iu.test(String(error?.message || ''));
  const sqlState = SQLSTATE_PATTERN.test(String(error?.code || '')) ?
    ` (${error.code})` : '';
  const detail = stage === SQL_CLIENT_STAGE.QUERY ?
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
      let primaryFailure = NO_PRIMARY_FAILURE;
      let result;
      try {
        const pg = await loadPg();
        const Client = pg.Client || pg.default?.Client;
        if (typeof Client !== 'function') {
          throw new TypeError(PG_CLIENT_EXPORT_UNAVAILABLE);
        }
        client = new Client();
        try {
          await client.connect();
        } catch (error) {
          throw sqlFailure(SQL_CLIENT_STAGE.CONNECT, error);
        }
        try {
          result = await client.query({text: statement, values: parameters});
        } catch (error) {
          throw sqlFailure(SQL_CLIENT_STAGE.QUERY, error);
        }
      } catch (error) {
        primaryFailure = error instanceof ServiceLifecycleSqlClientError ?
          error : sqlFailure(SQL_CLIENT_STAGE.LOAD, error);
      }

      if (client) {
        try {
          await client.end();
        } catch (error) {
          if (primaryFailure === NO_PRIMARY_FAILURE) {
            primaryFailure = sqlFailure(SQL_CLIENT_STAGE.DISCONNECT, error);
          }
        }
      }
      if (primaryFailure !== NO_PRIMARY_FAILURE) throw primaryFailure;
      return Object.freeze({rows: result?.rows});
    },
  });
}

export {createServiceLifecycleSqlClient};
