import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {PgWireAuthHandler} from '../../src/runtime/pgwire-auth-handler.js';
import {
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';

const TEST_PGWIRE_POLICY = Object.freeze({allowedActions: '*'});
const TEST_PGWIRE_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function createTestPgwireAuthHandler(options = {}) {
  return new PgWireAuthHandler({
    mode: PGWIRE_AUTH_HANDLER_MODE.TRUST,
    policy: options.policy || TEST_PGWIRE_POLICY,
    authenticator: options.authenticator,
    logger: options.logger || TEST_PGWIRE_LOGGER,
  });
}

function createTestPostgresWireAdapter(options = {}) {
  const {authenticator, authHandler, ...adapterOptions} = options;
  return new PostgresWireAdapter({
    ...adapterOptions,
    authHandler: authHandler || createTestPgwireAuthHandler({authenticator}),
  });
}

export {
  createTestPgwireAuthHandler,
  createTestPostgresWireAdapter,
};
