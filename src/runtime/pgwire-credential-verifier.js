/**
 * Production composition-root credential verifier for PG wire password mode.
 *
 * Password material is read from the process environment and captured only by
 * the verifier closure. It is never copied into a service runtime descriptor.
 */

import {timingSafeEqual} from 'node:crypto';

const PGWIRE_CREDENTIAL_ENV = Object.freeze({
  USER: 'PGWIRE_AUTH_USER',
  PASSWORD: 'PGWIRE_AUTH_PASSWORD',
  DATABASE: 'PGWIRE_AUTH_DATABASE',
});

const PGWIRE_CREDENTIAL_CONFIG_ERROR =
  'PG wire password authentication requires user, password, and database';
const EXPECTED_CREDENTIAL_FIELD_COUNT = Object.keys(PGWIRE_CREDENTIAL_ENV).length;
const APPLICATION_ROLE = 'application';

function safeStringEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const width = Math.max(actualBytes.length, expectedBytes.length, 1);
  const actualPadded = Buffer.alloc(width);
  const expectedPadded = Buffer.alloc(width);
  actualBytes.copy(actualPadded);
  expectedBytes.copy(expectedPadded);
  return timingSafeEqual(actualPadded, expectedPadded) &&
    actualBytes.length === expectedBytes.length;
}

function credentialTupleMatches(
  credentials,
  expected,
  compare = safeStringEqual,
) {
  const comparisons = [
    compare(credentials?.user, expected.user),
    compare(credentials?.password, expected.password),
    compare(credentials?.database, expected.database),
  ];
  return comparisons.reduce(
    (combined, matches) => combined & Number(matches),
    1,
  ) === 1;
}

/**
 * Build the production password verifier from an environment-like object.
 *
 * @param {Object} [env=process.env] - Environment key-value map.
 * @return {Function|null} Async credential verifier, or null when unconfigured.
 */
function buildPgwireCredentialVerifier(env = process.env) {
  const user = env[PGWIRE_CREDENTIAL_ENV.USER];
  const password = env[PGWIRE_CREDENTIAL_ENV.PASSWORD];
  const database = env[PGWIRE_CREDENTIAL_ENV.DATABASE];
  const configured = [user, password, database]
    .filter((value) => typeof value === 'string' && value.length > 0);

  if (configured.length === 0) return null;
  if (configured.length !== EXPECTED_CREDENTIAL_FIELD_COUNT) {
    throw new Error(PGWIRE_CREDENTIAL_CONFIG_ERROR);
  }

  const expected = Object.freeze({user, password, database});
  return async (credentials) => {
    const authenticated = credentialTupleMatches(credentials, expected);
    return {
      authenticated,
      roles: authenticated ? [APPLICATION_ROLE] : [],
    };
  };
}

export {
  PGWIRE_CREDENTIAL_ENV,
  PGWIRE_CREDENTIAL_CONFIG_ERROR,
  credentialTupleMatches,
  buildPgwireCredentialVerifier,
};
