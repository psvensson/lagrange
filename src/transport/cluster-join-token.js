/**
 * ClusterJoinTokenStore (B1) — CA-Pinned Single-Use / TTL Join Token and
 * Automated CSR Enrollment (`POST /bootstrap/enroll`).
 *
 * Joining nodes generate an Ed25519 keypair locally (private key never leaves
 * the node), verify the seed CA certificate against the SHA-256 fingerprint
 * pinned in `lgr_join_v1_<base64url>`, and submit a signed CSR proof to receive
 * a cluster-signed leaf certificate (`URI:lagrange://<clusterId>/node/<nodeId>`).
 *
 * @module transport/cluster-join-token
 */

import crypto from 'node:crypto';
import {
  issueNodeCertificate,
} from './x509-ed25519-certificate-authority.js';

const JOIN_TOKEN_PREFIX = 'lgr_join_v1_';

const JOIN_TOKEN_ERROR_CODE = Object.freeze({
  TOKEN_MALFORMED: 'JOIN_TOKEN_MALFORMED',
  TOKEN_UNKNOWN: 'JOIN_TOKEN_UNKNOWN',
  TOKEN_SECRET_INVALID: 'JOIN_TOKEN_SECRET_INVALID',
  TOKEN_EXPIRED: 'JOIN_TOKEN_EXPIRED',
  TOKEN_REVOKED: 'JOIN_TOKEN_REVOKED',
  TOKEN_ALREADY_CONSUMED: 'JOIN_TOKEN_ALREADY_CONSUMED',
  CLUSTER_MISMATCH: 'JOIN_TOKEN_CLUSTER_MISMATCH',
  CA_FINGERPRINT_MISMATCH: 'JOIN_TOKEN_CA_FINGERPRINT_MISMATCH',
  CSR_SIGNATURE_INVALID: 'JOIN_CSR_SIGNATURE_INVALID',
});

const JOIN_TOKEN_CONSTANTS = Object.freeze({
  DEFAULT_TTL_MS: 900_000, // 15 minutes
  TOKEN_ID_BYTES: 8,
  SECRET_BYTES: 24,
  HEX_ENCODING: 'hex',
  BASE64URL_ENCODING: 'base64url',
  UTF8_ENCODING: 'utf8',
  CSR_DOMAIN_SEPARATOR: 'lagrange.enroll.csr.v1',
  HASH_SHA256: 'sha256',
  DEFAULT_DNS_LOCALHOST: 'localhost',
  DEFAULT_IPV4_LOOPBACK: '127.0.0.1',
  MSG_PREFIX_REQUIRED: 'Join token must start with lgr_join_v1_',
  MSG_PAYLOAD_EMPTY: 'Join token payload is empty',
  MSG_PAYLOAD_INVALID_JSON: 'Join token base64url payload is not valid JSON',
  MSG_PAYLOAD_MISSING_FIELDS:
    'Join token payload is missing required fields (c, fp, id, s)',
  MSG_CSR_MISSING_FIELDS: 'CSR proof is missing required fields',
  MSG_CSR_SIG_FAILED: 'CSR proof Ed25519 signature verification failed',
  MSG_CA_FP_MISMATCH:
    'Pinned CA fingerprint in join token does not match seed CA certificate',
  MSG_SECRET_MISMATCH: 'Join token secret does not match',
  MSG_CSR_TOKEN_MISMATCH: 'CSR proof tokenId does not match join token',
});

function createJoinTokenError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeFingerprint256(fingerprint) {
  if (typeof fingerprint !== 'string') return '';
  return fingerprint.replace(/:/gu, '').trim().toLowerCase();
}

function computeCertFingerprint256Hex(certPem) {
  const x509 = new crypto.X509Certificate(certPem);
  return normalizeFingerprint256(x509.fingerprint256);
}

function constantTimeHexEqual(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  const aBuf = Buffer.from(aHex, JOIN_TOKEN_CONSTANTS.UTF8_ENCODING);
  const bBuf = Buffer.from(bHex, JOIN_TOKEN_CONSTANTS.UTF8_ENCODING);
  const len = Math.max(aBuf.length, bBuf.length, 1);
  const aPadded = Buffer.alloc(len);
  const bPadded = Buffer.alloc(len);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  return (
    crypto.timingSafeEqual(aPadded, bPadded) && aBuf.length === bBuf.length
  );
}

function formatJoinToken({clusterId, caFingerprint256, tokenId, secretHex}) {
  const payloadJson = JSON.stringify({
    c: clusterId,
    fp: normalizeFingerprint256(caFingerprint256),
    id: tokenId,
    s: secretHex,
  });
  const encoded = Buffer.from(
    payloadJson,
    JOIN_TOKEN_CONSTANTS.UTF8_ENCODING,
  ).toString(JOIN_TOKEN_CONSTANTS.BASE64URL_ENCODING);
  return `${JOIN_TOKEN_PREFIX}${encoded}`;
}

function hasNonEmptyTokenFields(parsed) {
  return Boolean(
    parsed &&
      typeof parsed.c === 'string' &&
      typeof parsed.fp === 'string' &&
      typeof parsed.id === 'string' &&
      typeof parsed.s === 'string' &&
      parsed.c &&
      parsed.fp &&
      parsed.id &&
      parsed.s,
  );
}

function decodeJoinTokenJson(encoded) {
  try {
    const jsonText = Buffer.from(
      encoded,
      JOIN_TOKEN_CONSTANTS.BASE64URL_ENCODING,
    ).toString(JOIN_TOKEN_CONSTANTS.UTF8_ENCODING);
    return JSON.parse(jsonText);
  } catch (_err) {
    throw createJoinTokenError(
      JOIN_TOKEN_ERROR_CODE.TOKEN_MALFORMED,
      JOIN_TOKEN_CONSTANTS.MSG_PAYLOAD_INVALID_JSON,
    );
  }
}

function parseJoinToken(tokenString) {
  if (
    typeof tokenString !== 'string' ||
    !tokenString.startsWith(JOIN_TOKEN_PREFIX)
  ) {
    throw createJoinTokenError(
      JOIN_TOKEN_ERROR_CODE.TOKEN_MALFORMED,
      JOIN_TOKEN_CONSTANTS.MSG_PREFIX_REQUIRED,
    );
  }
  const encoded = tokenString.slice(JOIN_TOKEN_PREFIX.length).trim();
  if (!encoded) {
    throw createJoinTokenError(
      JOIN_TOKEN_ERROR_CODE.TOKEN_MALFORMED,
      JOIN_TOKEN_CONSTANTS.MSG_PAYLOAD_EMPTY,
    );
  }
  const parsed = decodeJoinTokenJson(encoded);
  if (!hasNonEmptyTokenFields(parsed)) {
    throw createJoinTokenError(
      JOIN_TOKEN_ERROR_CODE.TOKEN_MALFORMED,
      JOIN_TOKEN_CONSTANTS.MSG_PAYLOAD_MISSING_FIELDS,
    );
  }
  return {
    clusterId: parsed.c,
    caFingerprint256: normalizeFingerprint256(parsed.fp),
    tokenId: parsed.id,
    secretHex: parsed.s,
  };
}

function buildCanonicalCsrPayload({
  clusterId,
  nodeId,
  tokenId,
  publicKeyPem,
  timestamp,
}) {
  return JSON.stringify([
    JOIN_TOKEN_CONSTANTS.CSR_DOMAIN_SEPARATOR,
    String(clusterId || '').trim(),
    String(nodeId || '').trim(),
    String(tokenId || '').trim(),
    String(publicKeyPem || '').trim(),
    Number(timestamp || 0),
  ]);
}

function createEnrollmentCsrProof({
  clusterId,
  nodeId,
  tokenId,
  publicKeyPem,
  privateKeyPem,
  dnsNames = [JOIN_TOKEN_CONSTANTS.DEFAULT_DNS_LOCALHOST],
  ipAddresses = [JOIN_TOKEN_CONSTANTS.DEFAULT_IPV4_LOOPBACK],
  timestamp = Date.now(),
}) {
  const payload = buildCanonicalCsrPayload({
    clusterId,
    nodeId,
    tokenId,
    publicKeyPem,
    timestamp,
  });
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto
    .sign(
      null,
      Buffer.from(payload, JOIN_TOKEN_CONSTANTS.UTF8_ENCODING),
      privateKey,
    )
    .toString(JOIN_TOKEN_CONSTANTS.BASE64URL_ENCODING);
  return {
    clusterId,
    nodeId,
    tokenId,
    publicKeyPem,
    dnsNames,
    ipAddresses,
    timestamp,
    csrSignature: signature,
  };
}

function buildCsrFailure(reason) {
  return {
    valid: false,
    code: JOIN_TOKEN_ERROR_CODE.CSR_SIGNATURE_INVALID,
    reason,
  };
}

function hasRequiredCsrFields(csrProof) {
  return Boolean(
    csrProof &&
      typeof csrProof.clusterId === 'string' &&
      typeof csrProof.nodeId === 'string' &&
      typeof csrProof.tokenId === 'string' &&
      typeof csrProof.publicKeyPem === 'string' &&
      typeof csrProof.csrSignature === 'string',
  );
}

function verifyEnrollmentCsrProof(csrProof) {
  if (!hasRequiredCsrFields(csrProof)) {
    return buildCsrFailure(JOIN_TOKEN_CONSTANTS.MSG_CSR_MISSING_FIELDS);
  }
  try {
    const publicKey = crypto.createPublicKey(csrProof.publicKeyPem);
    const payload = buildCanonicalCsrPayload({
      clusterId: csrProof.clusterId,
      nodeId: csrProof.nodeId,
      tokenId: csrProof.tokenId,
      publicKeyPem: csrProof.publicKeyPem,
      timestamp: csrProof.timestamp,
    });
    const verified = crypto.verify(
      null,
      Buffer.from(payload, JOIN_TOKEN_CONSTANTS.UTF8_ENCODING),
      publicKey,
      Buffer.from(
        csrProof.csrSignature,
        JOIN_TOKEN_CONSTANTS.BASE64URL_ENCODING,
      ),
    );
    return verified ?
      {valid: true, code: null} :
      buildCsrFailure(JOIN_TOKEN_CONSTANTS.MSG_CSR_SIG_FAILED);
  } catch (err) {
    return buildCsrFailure(err.message);
  }
}

class ClusterJoinTokenStore {
  constructor({clusterId, caCertPem, caKeyPem} = {}) {
    this.clusterId = String(clusterId || '').trim();
    this.caCertPem = caCertPem;
    this.caKeyPem = caKeyPem;
    this.caFingerprint256 = caCertPem ?
      computeCertFingerprint256Hex(caCertPem) :
      '';
    this.tokensById = new Map();
  }

  mintJoinToken({
    ttlMs = JOIN_TOKEN_CONSTANTS.DEFAULT_TTL_MS,
    singleUse = true,
    maxUses = 1,
    nowMs = Date.now(),
  } = {}) {
    const tokenId = crypto
      .randomBytes(JOIN_TOKEN_CONSTANTS.TOKEN_ID_BYTES)
      .toString(JOIN_TOKEN_CONSTANTS.HEX_ENCODING);
    const secretHex = crypto
      .randomBytes(JOIN_TOKEN_CONSTANTS.SECRET_BYTES)
      .toString(JOIN_TOKEN_CONSTANTS.HEX_ENCODING);
    const effectiveMaxUses = singleUse ? 1 : Math.max(1, Number(maxUses) || 1);
    const expiresAtMs = nowMs + ttlMs;
    const record = {
      tokenId,
      secretHex,
      clusterId: this.clusterId,
      caFingerprint256: this.caFingerprint256,
      createdAtMs: nowMs,
      expiresAtMs,
      maxUses: effectiveMaxUses,
      usedCount: 0,
      revoked: false,
    };
    this.tokensById.set(tokenId, record);
    const token = formatJoinToken({
      clusterId: this.clusterId,
      caFingerprint256: this.caFingerprint256,
      tokenId,
      secretHex,
    });
    return {
      token,
      tokenId,
      clusterId: this.clusterId,
      caFingerprint256: this.caFingerprint256,
      expiresAtMs,
      maxUses: effectiveMaxUses,
    };
  }

  revokeJoinToken(tokenId) {
    const record = this.tokensById.get(tokenId);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  _validateTokenRecordForEnrollment(parsedToken, nowMs) {
    const record = this.tokensById.get(parsedToken.tokenId);
    if (!record) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.TOKEN_UNKNOWN,
        `Unknown join token ID '${parsedToken.tokenId}'`,
      );
    }
    if (!constantTimeHexEqual(parsedToken.secretHex, record.secretHex)) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.TOKEN_SECRET_INVALID,
        JOIN_TOKEN_CONSTANTS.MSG_SECRET_MISMATCH,
      );
    }
    if (record.revoked) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.TOKEN_REVOKED,
        `Join token '${parsedToken.tokenId}' has been revoked`,
      );
    }
    if (nowMs > record.expiresAtMs) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.TOKEN_EXPIRED,
        `Join token '${parsedToken.tokenId}' expired at ${new Date(record.expiresAtMs).toISOString()}`,
      );
    }
    if (record.usedCount >= record.maxUses) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.TOKEN_ALREADY_CONSUMED,
        `Join token '${parsedToken.tokenId}' has already been consumed`,
      );
    }
    return record;
  }

  enrollNodeWithJoinToken({
    joinToken,
    csrProof,
    expectedSeedCaCertPem = null,
    nowMs = Date.now(),
  } = {}) {
    const parsedToken = parseJoinToken(joinToken);
    if (parsedToken.clusterId !== this.clusterId) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.CLUSTER_MISMATCH,
        `Join token clusterId '${parsedToken.clusterId}' does not match '${this.clusterId}'`,
      );
    }
    const candidateCaPem = expectedSeedCaCertPem || this.caCertPem;
    const actualFingerprint = computeCertFingerprint256Hex(candidateCaPem);
    if (parsedToken.caFingerprint256 !== actualFingerprint) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.CA_FINGERPRINT_MISMATCH,
        JOIN_TOKEN_CONSTANTS.MSG_CA_FP_MISMATCH,
      );
    }

    const record = this._validateTokenRecordForEnrollment(parsedToken, nowMs);

    if (!csrProof || csrProof.tokenId !== parsedToken.tokenId) {
      throw createJoinTokenError(
        JOIN_TOKEN_ERROR_CODE.CSR_SIGNATURE_INVALID,
        JOIN_TOKEN_CONSTANTS.MSG_CSR_TOKEN_MISMATCH,
      );
    }
    const csrResult = verifyEnrollmentCsrProof(csrProof);
    if (!csrResult.valid) {
      throw createJoinTokenError(csrResult.code, csrResult.reason);
    }

    record.usedCount += 1;
    const issued = issueNodeCertificate({
      caCertPem: this.caCertPem,
      caKeyPem: this.caKeyPem,
      clusterId: this.clusterId,
      nodeId: csrProof.nodeId,
      subjectPublicKeyPem: csrProof.publicKeyPem,
      dnsNames: csrProof.dnsNames || [JOIN_TOKEN_CONSTANTS.DEFAULT_DNS_LOCALHOST],
      ipAddresses: csrProof.ipAddresses || [
        JOIN_TOKEN_CONSTANTS.DEFAULT_IPV4_LOOPBACK,
      ],
      nowMs,
    });

    return {
      clusterId: issued.clusterId,
      nodeId: issued.nodeId,
      sanUri: issued.sanUri,
      certPem: issued.certPem,
      caCertPem: this.caCertPem,
      serialNumber: issued.serialNumber,
      fingerprint256: issued.fingerprint256,
      validFrom: issued.validFrom,
      validTo: issued.validTo,
    };
  }
}

export {
  JOIN_TOKEN_PREFIX,
  JOIN_TOKEN_ERROR_CODE,
  ClusterJoinTokenStore,
  computeCertFingerprint256Hex,
  formatJoinToken,
  parseJoinToken,
  createEnrollmentCsrProof,
  verifyEnrollmentCsrProof,
};
