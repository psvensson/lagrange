/**
 * PG wire TLS composition-root owner.
 *
 * TLS material is loaded outside runtime_config, converted to a SecureContext,
 * and handed to the protocol listener without exposing key/certificate bytes in
 * descriptors, errors, or logs.
 */

import {readFileSync} from 'node:fs';
import tls from 'node:tls';

const PGWIRE_TLS_ENV = Object.freeze({
  KEY_PATH: 'PGWIRE_TLS_KEY_PATH',
  CERT_PATH: 'PGWIRE_TLS_CERT_PATH',
  CA_PATH: 'PGWIRE_TLS_CA_PATH',
});

const PGWIRE_TLS_ERROR = Object.freeze({
  CONFIG_REQUIRED: 'PG wire TLS configuration is required',
  CONFIG_INVALID: 'PG wire TLS configuration is invalid',
});

function readTlsFile(filePath) {
  try {
    return readFileSync(filePath);
  } catch (_error) {
    throw new Error(PGWIRE_TLS_ERROR.CONFIG_INVALID);
  }
}

/**
 * Load optional TLS material from environment-owned file paths.
 *
 * @param {Object} [env=process.env] - Environment-shaped source.
 * @return {Object|null} Node TLS options, or null when unconfigured.
 */
function loadPgwireTlsOptions(env = process.env) {
  const keyPath = env[PGWIRE_TLS_ENV.KEY_PATH];
  const certPath = env[PGWIRE_TLS_ENV.CERT_PATH];
  const caPath = env[PGWIRE_TLS_ENV.CA_PATH];
  const anyConfigured = [keyPath, certPath, caPath]
    .some((value) => typeof value === 'string' && value.length > 0);
  if (!anyConfigured) return null;
  if (
    typeof keyPath !== 'string' || keyPath.length === 0 ||
    typeof certPath !== 'string' || certPath.length === 0
  ) {
    throw new Error(PGWIRE_TLS_ERROR.CONFIG_INVALID);
  }
  return Object.freeze({
    key: readTlsFile(keyPath),
    cert: readTlsFile(certPath),
    ...(typeof caPath === 'string' && caPath.length > 0 ?
      {ca: readTlsFile(caPath)} : {}),
  });
}

/**
 * Convert composition-root TLS material to a server SecureContext.
 *
 * @param {Object|null} options - Node TLS key/cert options.
 * @return {tls.SecureContext|null} Secure context, or null when unconfigured.
 */
function buildPgwireSecureContext(options) {
  if (options === undefined || options === null) return null;
  if (
    typeof options !== 'object' ||
    options.key === undefined ||
    options.cert === undefined
  ) {
    throw new Error(PGWIRE_TLS_ERROR.CONFIG_INVALID);
  }
  try {
    return tls.createSecureContext(options);
  } catch (_error) {
    throw new Error(PGWIRE_TLS_ERROR.CONFIG_INVALID);
  }
}

/**
 * Upgrade an accepted PostgreSQL TCP socket after SSLRequest acceptance.
 *
 * @param {import('node:net').Socket} socket - Accepted TCP socket.
 * @param {tls.SecureContext} secureContext - Server secure context.
 * @return {tls.TLSSocket} Negotiating server-side TLS socket.
 */
function upgradePgwireSocketToTls(socket, secureContext) {
  return new tls.TLSSocket(socket, {
    isServer: true,
    secureContext,
  });
}

export {
  PGWIRE_TLS_ERROR,
  loadPgwireTlsOptions,
  buildPgwireSecureContext,
  upgradePgwireSocketToTls,
};
