import {
  PGWIRE_CREDENTIAL_ENV,
  buildPgwireCredentialVerifier,
} from '../runtime/pgwire-credential-verifier.js';
import {
  REQUEST_CELL_ROUTE_ERROR_CODE,
  createRoutingFailure,
  freezeSecurityContext,
} from './request-cell-routing-contract.js';

const AUTHORIZATION_HEADER = 'authorization';
const BASIC_PREFIX = 'Basic ';
const BASIC_SEPARATOR = ':';
const BYTE_ENCODING = 'utf8';
const REQUEST_CELL_AUTHENTICATION_MESSAGE = Object.freeze({
  CREDENTIALS_REQUIRED: 'HTTP Basic credentials are required',
  FAILED: 'Request Cell HTTP authentication failed',
  UNAVAILABLE: 'Request Cell HTTP authentication is not configured',
});

function parseBasicAuthorization(value) {
  if (typeof value !== 'string' || !value.startsWith(BASIC_PREFIX)) {
    return null;
  }
  try {
    const decoded = Buffer.from(
      value.slice(BASIC_PREFIX.length),
      'base64',
    ).toString(BYTE_ENCODING);
    const separatorIndex = decoded.indexOf(BASIC_SEPARATOR);
    if (separatorIndex <= 0) return null;
    return {
      password: decoded.slice(separatorIndex + 1),
      user: decoded.slice(0, separatorIndex),
    };
  } catch {
    return null;
  }
}

function createRequestCellBasicAuthenticator(env = process.env) {
  const verifier = buildPgwireCredentialVerifier(env);
  const tenantId = env[PGWIRE_CREDENTIAL_ENV.DATABASE];
  if (!verifier || typeof tenantId !== 'string' || tenantId.length === 0) {
    return async () => {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_UNAVAILABLE,
        REQUEST_CELL_AUTHENTICATION_MESSAGE.UNAVAILABLE,
      );
    };
  }
  return async (request) => {
    const credentials = parseBasicAuthorization(
      request?.headers?.[AUTHORIZATION_HEADER],
    );
    if (!credentials) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
        REQUEST_CELL_AUTHENTICATION_MESSAGE.CREDENTIALS_REQUIRED,
      );
    }
    const result = await verifier({...credentials, database: tenantId});
    if (result?.authenticated !== true) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
        REQUEST_CELL_AUTHENTICATION_MESSAGE.FAILED,
      );
    }
    return freezeSecurityContext({
      principal: credentials.user,
      roles: result.roles || [],
      tenantId,
    });
  };
}

export {
  createRequestCellBasicAuthenticator,
};
