/**
 * ClusterTrustProvider (A3) — Cluster CA & Pluggable External PKI Trust Provider
 * for authenticated and encrypted node-to-node transport (mTLS 1.3 + Ed25519
 * signed IDENTIFY handshake).
 *
 * Supports three explicit modes:
 * 1. `builtin-ca` (default): Lagrange Ed25519 Root CA & leaf certificates.
 * 2. `external-pki`: External X.509 certificates (Vault, cert-manager, SPIFFE).
 * 3. `insecure-local-dev`: Loopback-only (`127.0.0.1`, `::1`, `localhost`) dev
 *    override; refuses startup on any non-loopback bind/peer host.
 *
 * @module transport/cluster-trust-provider
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import tls from 'node:tls';
import {
  X509_CA_ERROR_CODE,
  verifyNodeCertificate,
} from './x509-ed25519-certificate-authority.js';

const CLUSTER_TRUST_MODE = Object.freeze({
  BUILTIN_CA: 'builtin-ca',
  EXTERNAL_PKI: 'external-pki',
  INSECURE_LOCAL_DEV: 'insecure-local-dev',
});

const ALLOWED_TRUST_MODES = Object.freeze(
  new Set(Object.values(CLUSTER_TRUST_MODE)),
);

const TRANSPORT_AUTH_ERROR_CODE = Object.freeze({
  INVALID_TRUST_MODE: 'TRANSPORT_INVALID_TRUST_MODE',
  PLAINTEXT_NON_LOOPBACK_REFUSED: 'TRANSPORT_PLAINTEXT_NON_LOOPBACK_REFUSED',
  INSECURE_KEY_PERMISSIONS: 'TRANSPORT_INSECURE_KEY_PERMISSIONS',
  MISSING_KEY_MATERIAL: 'TRANSPORT_MISSING_KEY_MATERIAL',
  PEER_CERT_REQUIRED: 'TRANSPORT_PEER_CERT_REQUIRED',
  PEER_CERT_UNTRUSTED: 'TRANSPORT_PEER_CERT_UNTRUSTED',
  PEER_CERT_EXPIRED: 'TRANSPORT_PEER_CERT_EXPIRED',
  PEER_CERT_REVOKED: 'TRANSPORT_PEER_CERT_REVOKED',
  PEER_CLUSTER_MISMATCH: 'TRANSPORT_PEER_CLUSTER_MISMATCH',
  PEER_NODE_ID_MISMATCH: 'TRANSPORT_PEER_NODE_ID_MISMATCH',
  IDENTIFY_SIGNATURE_INVALID: 'TRANSPORT_IDENTIFY_SIGNATURE_INVALID',
  IDENTIFY_TIMESTAMP_SKEW: 'TRANSPORT_IDENTIFY_TIMESTAMP_SKEW',
});

const TRUST_CONSTANTS = Object.freeze({
  MIN_TLS_VERSION: 'TLSv1.3',
  GROUP_OR_OTHER_PERMISSION_MASK: 0o077,
  FILE_MODE_MASK: 0o777,
  OCTAL_RADIX: 8,
  DEFAULT_IDENTIFY_MAX_SKEW_MS: 300_000,
  SIGNATURE_ENCODING: 'base64url',
  UTF8_ENCODING: 'utf8',
  IDENTIFY_DOMAIN_SEPARATOR: 'lagrange.transport.identify.v1',
  DER_CERT_PREFIX: '-----BEGIN CERTIFICATE-----\n',
  DER_CERT_SUFFIX: '\n-----END CERTIFICATE-----\n',
  PEM_LINE_WIDTH: 64,
  SCHEME_SEPARATOR: '://',
  OPEN_BRACKET: '[',
  CLOSE_BRACKET: ']',
  COLON: ':',
  NEWLINE: '\n',
  MSG_KEY_PATH_REQUIRED: 'Private key file path is required',
  MSG_CLUSTER_AND_NODE_REQUIRED:
    'ClusterTrustProvider requires clusterId and nodeId for mTLS modes',
  MSG_KEY_MATERIAL_REQUIRED:
    'ClusterTrustProvider requires caCertPem(s), certPem, and keyPem',
  MSG_ROTATE_INSECURE_FORBIDDEN:
    'Cannot rotate certificates in insecure-local-dev mode',
  MSG_PEER_CERT_REQUIRED:
    'Peer TLS client/server certificate is required for mTLS',
  MSG_IDENTIFY_SKEW:
    'IDENTIFY frame timestamp is missing or outside allowed clock skew window',
  MSG_IDENTIFY_SIG_MISSING:
    'IDENTIFY frame is missing cryptographic Ed25519 signature',
  MSG_IDENTIFY_SIG_FAILED:
    'IDENTIFY frame Ed25519 signature verification failed',
});

const LOOPBACK_HOSTS = Object.freeze(
  new Set([
    '127.0.0.1',
    '::1',
    '[::1]',
    'localhost',
    'ffff:127.0.0.1',
    '::ffff:127.0.0.1',
  ]),
);

function createTransportAuthError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function extractHostFromAddressOrHost(hostOrAddress) {
  if (typeof hostOrAddress !== 'string') return '';
  const trimmed = hostOrAddress.trim();
  if (!trimmed) return '';
  if (trimmed.includes(TRUST_CONSTANTS.SCHEME_SEPARATOR)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname.toLowerCase();
    } catch (_err) {
      return trimmed.toLowerCase();
    }
  }
  if (trimmed.startsWith(TRUST_CONSTANTS.OPEN_BRACKET)) {
    const endBracket = trimmed.indexOf(TRUST_CONSTANTS.CLOSE_BRACKET);
    if (endBracket > 0) {
      return trimmed.slice(1, endBracket).toLowerCase();
    }
  }
  const colonCount = (trimmed.match(/:/gu) || []).length;
  if (colonCount === 1) {
    return trimmed.split(TRUST_CONSTANTS.COLON)[0].toLowerCase();
  }
  return trimmed.toLowerCase();
}

function isLoopbackHost(hostOrAddress) {
  const host = extractHostFromAddressOrHost(hostOrAddress);
  if (!host) return false;
  return LOOPBACK_HOSTS.has(host);
}

function assertPlaintextAllowedOnHost(hostOrAddress, trustMode) {
  if (
    trustMode === CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV &&
    isLoopbackHost(hostOrAddress)
  ) {
    return true;
  }
  throw createTransportAuthError(
    TRANSPORT_AUTH_ERROR_CODE.PLAINTEXT_NON_LOOPBACK_REFUSED,
    `Plaintext or insecure-local-dev transport is refused for host '${hostOrAddress}'; mTLS 1.3 is required on non-loopback interfaces`,
    {host: hostOrAddress, trustMode},
  );
}

function validatePrivateKeyFilePermissions(keyFilePath) {
  if (typeof keyFilePath !== 'string' || keyFilePath.trim().length === 0) {
    throw createTransportAuthError(
      TRANSPORT_AUTH_ERROR_CODE.MISSING_KEY_MATERIAL,
      TRUST_CONSTANTS.MSG_KEY_PATH_REQUIRED,
    );
  }
  const stats = fs.statSync(keyFilePath);
  if ((stats.mode & TRUST_CONSTANTS.GROUP_OR_OTHER_PERMISSION_MASK) !== 0) {
    const modeBits = stats.mode & TRUST_CONSTANTS.FILE_MODE_MASK;
    throw createTransportAuthError(
      TRANSPORT_AUTH_ERROR_CODE.INSECURE_KEY_PERMISSIONS,
      `Private key file '${keyFilePath}' has insecure permissions (${modeBits.toString(TRUST_CONSTANTS.OCTAL_RADIX)}); expected 0600 or 0400`,
      {keyFilePath, mode: modeBits},
    );
  }
  return true;
}

function rawDerToPem(rawBuffer) {
  const base64 = Buffer.from(rawBuffer).toString('base64');
  const lines = [];
  for (let i = 0; i < base64.length; i += TRUST_CONSTANTS.PEM_LINE_WIDTH) {
    lines.push(base64.slice(i, i + TRUST_CONSTANTS.PEM_LINE_WIDTH));
  }
  return `${TRUST_CONSTANTS.DER_CERT_PREFIX}${lines.join(TRUST_CONSTANTS.NEWLINE)}${TRUST_CONSTANTS.DER_CERT_SUFFIX}`;
}

function normalizePeerCertToPem(peerCertInput) {
  if (!peerCertInput) return null;
  if (typeof peerCertInput === 'string') {
    return peerCertInput.trim().length > 0 ? peerCertInput : null;
  }
  if (Buffer.isBuffer(peerCertInput)) {
    return rawDerToPem(peerCertInput);
  }
  if (typeof peerCertInput === 'object' && Buffer.isBuffer(peerCertInput.raw)) {
    return rawDerToPem(peerCertInput.raw);
  }
  return null;
}

const X509_TO_TRANSPORT_ERROR_MAP = Object.freeze({
  [X509_CA_ERROR_CODE.CERT_EXPIRED]:
    TRANSPORT_AUTH_ERROR_CODE.PEER_CERT_EXPIRED,
  [X509_CA_ERROR_CODE.CERT_NOT_YET_VALID]:
    TRANSPORT_AUTH_ERROR_CODE.PEER_CERT_EXPIRED,
  [X509_CA_ERROR_CODE.CERT_REVOKED]:
    TRANSPORT_AUTH_ERROR_CODE.PEER_CERT_REVOKED,
  [X509_CA_ERROR_CODE.CERT_CLUSTER_MISMATCH]:
    TRANSPORT_AUTH_ERROR_CODE.PEER_CLUSTER_MISMATCH,
  [X509_CA_ERROR_CODE.CERT_NODE_ID_MISMATCH]:
    TRANSPORT_AUTH_ERROR_CODE.PEER_NODE_ID_MISMATCH,
});

function mapX509ErrorToTransportCode(x509Code) {
  return (
    X509_TO_TRANSPORT_ERROR_MAP[x509Code] ||
    TRANSPORT_AUTH_ERROR_CODE.PEER_CERT_UNTRUSTED
  );
}

function buildAuthFailureOutcome(code, reason) {
  return {
    valid: false,
    code,
    reason,
  };
}

function buildCanonicalIdentifyPayload({
  clusterId,
  nodeId,
  nodeAddress,
  bootIncarnation,
  timestamp,
  certSerialNumber,
}) {
  return JSON.stringify([
    TRUST_CONSTANTS.IDENTIFY_DOMAIN_SEPARATOR,
    String(clusterId || ''),
    String(nodeId || ''),
    String(nodeAddress || ''),
    Number(bootIncarnation),
    Number(timestamp || 0),
    String(certSerialNumber || '').toLowerCase(),
  ]);
}

function resolveIdentifyMaxSkewMs(identifyMaxSkewMs) {
  return Number.isFinite(identifyMaxSkewMs) && identifyMaxSkewMs > 0 ?
    identifyMaxSkewMs :
    TRUST_CONSTANTS.DEFAULT_IDENTIFY_MAX_SKEW_MS;
}

function resolveCaCertPemsList(options) {
  if (Array.isArray(options.caCertPems)) {
    return options.caCertPems.filter(Boolean);
  }
  return options.caCertPem ? [options.caCertPem] : [];
}

class ClusterTrustProvider {
  constructor(options = {}) {
    const mode = options.mode || CLUSTER_TRUST_MODE.BUILTIN_CA;
    if (!ALLOWED_TRUST_MODES.has(mode)) {
      throw createTransportAuthError(
        TRANSPORT_AUTH_ERROR_CODE.INVALID_TRUST_MODE,
        `Unsupported cluster trust mode '${mode}'`,
        {mode},
      );
    }
    this.mode = mode;
    this.clusterId = String(options.clusterId || '').trim();
    this.nodeId = String(options.nodeId || '').trim();
    this.identifyMaxSkewMs = resolveIdentifyMaxSkewMs(
      options.identifyMaxSkewMs,
    );
    this.revokedSerialNumbers = new Set(
      Array.from(options.revokedSerialNumbers || [], (s) =>
        String(s).toLowerCase(),
      ),
    );
    this.attachedTlsServers = new Set();
    this.rotationEpoch = 0;

    if (this.mode === CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV) {
      this._initInsecureLocalDev(options.bindHost);
      return;
    }

    this._initAuthenticatedMode(options);
  }

  _initInsecureLocalDev(bindHost) {
    if (bindHost) {
      assertPlaintextAllowedOnHost(bindHost, this.mode);
    }
    this.caCertPems = [];
    this.certPem = null;
    this.keyPem = null;
    this.privateKey = null;
    this.x509 = null;
    this.serialNumber = null;
  }

  _initAuthenticatedMode(options) {
    if (!this.clusterId || !this.nodeId) {
      throw createTransportAuthError(
        TRANSPORT_AUTH_ERROR_CODE.MISSING_KEY_MATERIAL,
        TRUST_CONSTANTS.MSG_CLUSTER_AND_NODE_REQUIRED,
      );
    }
    if (options.keyFilePath) {
      validatePrivateKeyFilePermissions(options.keyFilePath);
    }
    const caCertPems = resolveCaCertPemsList(options);
    const certPem = options.certPem || null;
    const keyPem = options.keyPem || null;
    if (caCertPems.length === 0 || !certPem || !keyPem) {
      throw createTransportAuthError(
        TRANSPORT_AUTH_ERROR_CODE.MISSING_KEY_MATERIAL,
        TRUST_CONSTANTS.MSG_KEY_MATERIAL_REQUIRED,
      );
    }
    this._applyCredentials({caCertPems, certPem, keyPem});
  }

  _applyCredentials({caCertPems, certPem, keyPem}) {
    const x509 = new crypto.X509Certificate(certPem);
    const privateKey = crypto.createPrivateKey(keyPem);
    const selfVerify = verifyNodeCertificate({
      certPemOrDer: x509,
      caCertPems,
      expectedClusterId: this.clusterId,
      expectedNodeId: this.nodeId,
      revokedSerialNumbers: this.revokedSerialNumbers,
    });
    if (!selfVerify.valid) {
      throw createTransportAuthError(
        mapX509ErrorToTransportCode(selfVerify.code),
        `Local node certificate failed cluster trust validation: ${selfVerify.reason}`,
        selfVerify,
      );
    }
    this.caCertPems = Object.freeze([...caCertPems]);
    this.certPem = certPem;
    this.keyPem = keyPem;
    this.privateKey = privateKey;
    this.x509 = x509;
    this.serialNumber = selfVerify.serialNumber;
    this.rotationEpoch += 1;
  }

  isTlsRequired() {
    return this.mode !== CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV;
  }

  validateBindHost(hostOrAddress) {
    if (this.mode === CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV) {
      return assertPlaintextAllowedOnHost(hostOrAddress, this.mode);
    }
    return true;
  }

  validatePeerAddress(address) {
    if (this.mode === CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV) {
      return assertPlaintextAllowedOnHost(address, this.mode);
    }
    return true;
  }

  buildServerTlsOptions() {
    if (!this.isTlsRequired()) {
      return null;
    }
    return {
      minVersion: TRUST_CONSTANTS.MIN_TLS_VERSION,
      maxVersion: TRUST_CONSTANTS.MIN_TLS_VERSION,
      ca: [...this.caCertPems],
      cert: this.certPem,
      key: this.keyPem,
      requestCert: true,
      rejectUnauthorized: true,
    };
  }

  buildClientTlsOptions() {
    if (!this.isTlsRequired()) {
      return null;
    }
    return {
      minVersion: TRUST_CONSTANTS.MIN_TLS_VERSION,
      maxVersion: TRUST_CONSTANTS.MIN_TLS_VERSION,
      ca: [...this.caCertPems],
      cert: this.certPem,
      key: this.keyPem,
      rejectUnauthorized: true,
      checkServerIdentity: (_servername, peerCert) => {
        const result = this.verifyPeerCertificate(peerCert);
        if (!result.valid) {
          return createTransportAuthError(result.code, result.reason, result);
        }
        return undefined;
      },
    };
  }

  attachTlsServer(tlsServer) {
    if (tlsServer && typeof tlsServer.setSecureContext === 'function') {
      this.attachedTlsServers.add(tlsServer);
    }
  }

  detachTlsServer(tlsServer) {
    this.attachedTlsServers.delete(tlsServer);
  }

  rotateNodeCertificate({certPem, keyPem, caCertPems = null}) {
    if (!this.isTlsRequired()) {
      throw createTransportAuthError(
        TRANSPORT_AUTH_ERROR_CODE.INVALID_TRUST_MODE,
        TRUST_CONSTANTS.MSG_ROTATE_INSECURE_FORBIDDEN,
      );
    }
    const nextCaList = caCertPems ?
      (Array.isArray(caCertPems) ? caCertPems : [caCertPems]) :
      [...this.caCertPems];
    this._applyCredentials({
      caCertPems: nextCaList,
      certPem,
      keyPem,
    });
    for (const tlsServer of this.attachedTlsServers) {
      tlsServer.setSecureContext({
        ca: [...this.caCertPems],
        cert: this.certPem,
        key: this.keyPem,
      });
    }
    return {
      rotationEpoch: this.rotationEpoch,
      serialNumber: this.serialNumber,
      validTo: this.x509.validTo,
    };
  }

  revokeCertificateSerial(serialNumber) {
    if (typeof serialNumber === 'string' && serialNumber.trim().length > 0) {
      this.revokedSerialNumbers.add(serialNumber.trim().toLowerCase());
    }
  }

  isSerialRevoked(serialNumber) {
    if (typeof serialNumber !== 'string') return false;
    return this.revokedSerialNumbers.has(serialNumber.trim().toLowerCase());
  }

  verifyPeerCertificate(
    peerCertInput,
    {expectedNodeId = null, nowMs = Date.now()} = {},
  ) {
    if (!this.isTlsRequired()) {
      return {
        valid: true,
        code: null,
        clusterId: this.clusterId,
        nodeId: expectedNodeId,
      };
    }
    const pem = normalizePeerCertToPem(peerCertInput);
    if (!pem) {
      return {
        valid: false,
        code: TRANSPORT_AUTH_ERROR_CODE.PEER_CERT_REQUIRED,
        reason: TRUST_CONSTANTS.MSG_PEER_CERT_REQUIRED,
      };
    }
    const verification = verifyNodeCertificate({
      certPemOrDer: pem,
      caCertPems: this.caCertPems,
      expectedClusterId: this.clusterId,
      expectedNodeId,
      revokedSerialNumbers: this.revokedSerialNumbers,
      nowMs,
    });
    if (!verification.valid) {
      return {
        ...verification,
        code: mapX509ErrorToTransportCode(verification.code),
      };
    }
    return {
      ...verification,
      certPem: pem,
    };
  }

  signIdentifyFrame(identifyMessage) {
    if (!this.isTlsRequired()) {
      return {...identifyMessage};
    }
    const payload = buildCanonicalIdentifyPayload({
      clusterId: this.clusterId,
      nodeId: identifyMessage.nodeId,
      nodeAddress: identifyMessage.nodeAddress || identifyMessage.address,
      bootIncarnation: identifyMessage.bootIncarnation,
      timestamp: identifyMessage.timestamp,
      certSerialNumber: this.serialNumber,
    });
    const signature = crypto
      .sign(null, Buffer.from(payload, 'utf8'), this.privateKey)
      .toString(TRUST_CONSTANTS.SIGNATURE_ENCODING);
    return {
      ...identifyMessage,
      clusterId: this.clusterId,
      certSerialNumber: this.serialNumber,
      certPem: this.certPem,
      identitySignature: signature,
    };
  }

  _checkIdentifyEnvelopeFields(identifyMessage, nowMs) {
    if (
      identifyMessage?.clusterId &&
      identifyMessage.clusterId !== this.clusterId
    ) {
      return buildAuthFailureOutcome(
        TRANSPORT_AUTH_ERROR_CODE.PEER_CLUSTER_MISMATCH,
        `IDENTIFY clusterId '${identifyMessage.clusterId}' does not match local clusterId '${this.clusterId}'`,
      );
    }
    const msgTimestamp = Number(identifyMessage?.timestamp);
    if (
      !Number.isFinite(msgTimestamp) ||
      Math.abs(nowMs - msgTimestamp) > this.identifyMaxSkewMs
    ) {
      return buildAuthFailureOutcome(
        TRANSPORT_AUTH_ERROR_CODE.IDENTIFY_TIMESTAMP_SKEW,
        TRUST_CONSTANTS.MSG_IDENTIFY_SKEW,
      );
    }
    const sigText = identifyMessage?.identitySignature;
    if (typeof sigText !== 'string' || sigText.length === 0) {
      return buildAuthFailureOutcome(
        TRANSPORT_AUTH_ERROR_CODE.IDENTIFY_SIGNATURE_INVALID,
        TRUST_CONSTANTS.MSG_IDENTIFY_SIG_MISSING,
      );
    }
    return null;
  }

  _verifyIdentifySignature(identifyMessage, certCheck) {
    const payload = buildCanonicalIdentifyPayload({
      clusterId: this.clusterId,
      nodeId: identifyMessage.nodeId,
      nodeAddress: identifyMessage.nodeAddress || identifyMessage.address,
      bootIncarnation: identifyMessage.bootIncarnation,
      timestamp: identifyMessage.timestamp,
      certSerialNumber: certCheck.serialNumber,
    });
    return crypto.verify(
      null,
      Buffer.from(payload, TRUST_CONSTANTS.UTF8_ENCODING),
      certCheck.publicKey,
      Buffer.from(
        identifyMessage.identitySignature,
        TRUST_CONSTANTS.SIGNATURE_ENCODING,
      ),
    );
  }

  verifyIdentifyFrame(identifyMessage, peerCertInput, options) {
    const nowMs = options?.nowMs ?? Date.now();
    const msg = identifyMessage || {};
    if (!this.isTlsRequired()) {
      return {
        valid: true,
        nodeId: msg.nodeId || null,
        clusterId: this.clusterId,
      };
    }
    const candidateCert = peerCertInput || msg.certPem || null;
    const certCheck = this.verifyPeerCertificate(candidateCert, {
      expectedNodeId: msg.nodeId || null,
      nowMs,
    });
    if (!certCheck.valid) return certCheck;

    const fieldFailure = this._checkIdentifyEnvelopeFields(msg, nowMs);
    if (fieldFailure) return fieldFailure;

    if (!this._verifyIdentifySignature(msg, certCheck)) {
      return buildAuthFailureOutcome(
        TRANSPORT_AUTH_ERROR_CODE.IDENTIFY_SIGNATURE_INVALID,
        TRUST_CONSTANTS.MSG_IDENTIFY_SIG_FAILED,
      );
    }
    return {
      valid: true,
      code: null,
      clusterId: certCheck.clusterId,
      nodeId: certCheck.nodeId,
      serialNumber: certCheck.serialNumber,
      fingerprint256: certCheck.fingerprint256,
    };
  }

  getTrustStatus({nowMs = Date.now()} = {}) {
    if (!this.isTlsRequired()) {
      return {
        mode: this.mode,
        tlsEnabled: false,
        clusterId: this.clusterId || null,
        nodeId: this.nodeId || null,
      };
    }
    const validToMs = Date.parse(this.x509.validTo);
    return {
      mode: this.mode,
      tlsEnabled: true,
      tlsVersion: tls.DEFAULT_MAX_VERSION || TRUST_CONSTANTS.MIN_TLS_VERSION,
      clusterId: this.clusterId,
      nodeId: this.nodeId,
      serialNumber: this.serialNumber,
      fingerprint256: this.x509.fingerprint256,
      validFrom: this.x509.validFrom,
      validTo: this.x509.validTo,
      remainingMs: Number.isFinite(validToMs) ? validToMs - nowMs : null,
      rotationEpoch: this.rotationEpoch,
      revokedCount: this.revokedSerialNumbers.size,
    };
  }
}

export {
  CLUSTER_TRUST_MODE,
  TRANSPORT_AUTH_ERROR_CODE,
  ClusterTrustProvider,
  createTransportAuthError,
  isLoopbackHost,
  assertPlaintextAllowedOnHost,
  validatePrivateKeyFilePermissions,
};
