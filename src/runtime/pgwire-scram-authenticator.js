/**
 * PostgreSQL Wire Protocol SCRAM-SHA-256, SCRAM-SHA-256-PLUS (RFC 5802 /
 * RFC 7677 / RFC 5929 `tls-server-end-point`), and `cert` mTLS client
 * certificate authentication.
 *
 * Stores and verifies PBKDF2-HMAC-SHA256 `StoredKey` and `ServerKey` verifiers
 * rather than cleartext passwords.
 *
 * @module runtime/pgwire-scram-authenticator
 */

import crypto from 'node:crypto';

const SCRAM_MECHANISM = Object.freeze({
  SCRAM_SHA_256: 'SCRAM-SHA-256',
  SCRAM_SHA_256_PLUS: 'SCRAM-SHA-256-PLUS',
});

const PGWIRE_STRONG_AUTH_MODE = Object.freeze({
  TRUST: 'trust',
  PASSWORD: 'password',
  SCRAM_SHA_256: 'scram-sha-256',
  SCRAM_SHA_256_PLUS: 'scram-sha-256-plus',
  CERT: 'cert',
});

const PGWIRE_SCRAM_ERROR_CODE = Object.freeze({
  INVALID_CLIENT_FIRST: 'PGWIRE_SCRAM_INVALID_CLIENT_FIRST',
  INVALID_CLIENT_FINAL: 'PGWIRE_SCRAM_INVALID_CLIENT_FINAL',
  NONCE_MISMATCH: 'PGWIRE_SCRAM_NONCE_MISMATCH',
  CHANNEL_BINDING_MISMATCH: 'PGWIRE_SCRAM_CHANNEL_BINDING_MISMATCH',
  PROOF_MISMATCH: 'PGWIRE_SCRAM_PROOF_MISMATCH',
  UNKNOWN_USER: 'PGWIRE_SCRAM_UNKNOWN_USER',
  CERT_REQUIRED: 'PGWIRE_CERT_AUTH_REQUIRED',
  CERT_UNTRUSTED: 'PGWIRE_CERT_AUTH_UNTRUSTED',
  CERT_PRINCIPAL_MISMATCH: 'PGWIRE_CERT_AUTH_PRINCIPAL_MISMATCH',
});

const SCRAM_CONSTANTS = Object.freeze({
  DEFAULT_ITERATIONS: 4096,
  SALT_BYTE_LENGTH: 16,
  NONCE_BYTE_LENGTH: 18,
  SHA256_KEY_LENGTH: 32,
  HASH_SHA256: 'sha256',
  CLIENT_KEY_LABEL: 'Client Key',
  SERVER_KEY_LABEL: 'Server Key',
  GS2_NO_CB: 'n,,',
  GS2_PLUS_PREFIX: 'p=tls-server-end-point,,',
  CHANNEL_BINDING_TYPE: 'tls-server-end-point',
  BASE64_ENCODING: 'base64',
  UTF8_ENCODING: 'utf8',
  COMMA: ',',
  PROOF_SPLIT_TOKEN: ',p=',
  PROOF_SPLIT_LEN: 3,
  ATTR_USER_PREFIX: 'n=',
  ATTR_NONCE_PREFIX: 'r=',
  ATTR_CB_PREFIX: 'c=',
  ATTR_SALT_PREFIX: 's=',
  ATTR_ITER_PREFIX: 'i=',
  DEFAULT_NODE_ROLE: 'node',
  MSG_XOR_LENGTH_MISMATCH: 'SCRAM XOR buffer length mismatch',
  MSG_PLUS_REQUIRES_SERVER_CERT:
    'SCRAM-SHA-256-PLUS requires server TLS certificate for tls-server-end-point binding',
  MSG_CLIENT_FIRST_STRING: 'client-first-message must be a string',
  MSG_INVALID_GS2: 'Invalid GS2 header in client-first-message',
  MSG_CLIENT_FIRST_MISSING_ATTRS:
    'client-first-message is missing n= or r= attribute',
  MSG_CLIENT_FINAL_STRING: 'client-final-message must be a string',
  MSG_CLIENT_FINAL_MISSING_PROOF:
    'client-final-message is missing ,p= proof attribute',
  MSG_CLIENT_FINAL_MISSING_ATTRS:
    'client-final-message is missing c=, r=, or p= attribute',
  MSG_FIRST_BEFORE_FINAL:
    'handleClientFirst must be called before handleClientFinal',
  MSG_NONCE_MISMATCH: 'SCRAM combined nonce mismatch in client-final-message',
  MSG_CB_MISMATCH: 'SCRAM channel binding data mismatch',
  MSG_PROOF_LEN_MISMATCH: 'SCRAM client proof length mismatch',
  MSG_PROOF_FAILED: 'SCRAM client proof verification failed',
});

function createScramError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hmacSha256(key, data) {
  return crypto
    .createHmac(SCRAM_CONSTANTS.HASH_SHA256, key)
    .update(data)
    .digest();
}

function sha256(data) {
  return crypto.createHash(SCRAM_CONSTANTS.HASH_SHA256).update(data).digest();
}

function xorBuffers(a, b) {
  if (a.length !== b.length) {
    throw new Error(SCRAM_CONSTANTS.MSG_XOR_LENGTH_MISMATCH);
  }
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

function hiPbkdf2Sha256(password, saltBuffer, iterations) {
  return crypto.pbkdf2Sync(
    Buffer.from(String(password), SCRAM_CONSTANTS.UTF8_ENCODING),
    saltBuffer,
    iterations,
    SCRAM_CONSTANTS.SHA256_KEY_LENGTH,
    SCRAM_CONSTANTS.HASH_SHA256,
  );
}

function createScramCredentialRecord(
  password,
  {
    saltBuffer = null,
    iterations = SCRAM_CONSTANTS.DEFAULT_ITERATIONS,
    roles = [],
  } = {},
) {
  const salt = saltBuffer ?
    Buffer.from(saltBuffer) :
    crypto.randomBytes(SCRAM_CONSTANTS.SALT_BYTE_LENGTH);
  const saltedPassword = hiPbkdf2Sha256(password, salt, iterations);
  const clientKey = hmacSha256(saltedPassword, SCRAM_CONSTANTS.CLIENT_KEY_LABEL);
  const storedKey = sha256(clientKey);
  const serverKey = hmacSha256(saltedPassword, SCRAM_CONSTANTS.SERVER_KEY_LABEL);
  return Object.freeze({
    saltBase64: salt.toString(SCRAM_CONSTANTS.BASE64_ENCODING),
    iterations,
    storedKeyBase64: storedKey.toString(SCRAM_CONSTANTS.BASE64_ENCODING),
    serverKeyBase64: serverKey.toString(SCRAM_CONSTANTS.BASE64_ENCODING),
    roles: Object.freeze([...roles]),
  });
}

function computeTlsServerEndPointBindingData(serverCertPemOrDer) {
  const x509 = serverCertPemOrDer instanceof crypto.X509Certificate ?
    serverCertPemOrDer :
    new crypto.X509Certificate(serverCertPemOrDer);
  return sha256(x509.raw);
}

function buildExpectedChannelBindingBase64({
  gs2Header,
  serverCertPemOrDer = null,
}) {
  if (gs2Header === SCRAM_CONSTANTS.GS2_NO_CB) {
    return Buffer.from(
      SCRAM_CONSTANTS.GS2_NO_CB,
      SCRAM_CONSTANTS.UTF8_ENCODING,
    ).toString(SCRAM_CONSTANTS.BASE64_ENCODING);
  }
  if (gs2Header === SCRAM_CONSTANTS.GS2_PLUS_PREFIX) {
    if (!serverCertPemOrDer) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.CHANNEL_BINDING_MISMATCH,
        SCRAM_CONSTANTS.MSG_PLUS_REQUIRES_SERVER_CERT,
      );
    }
    const cbData = computeTlsServerEndPointBindingData(serverCertPemOrDer);
    return Buffer.concat([
      Buffer.from(
        SCRAM_CONSTANTS.GS2_PLUS_PREFIX,
        SCRAM_CONSTANTS.UTF8_ENCODING,
      ),
      cbData,
    ]).toString(SCRAM_CONSTANTS.BASE64_ENCODING);
  }
  throw createScramError(
    PGWIRE_SCRAM_ERROR_CODE.CHANNEL_BINDING_MISMATCH,
    `Unsupported SCRAM GS2 header '${gs2Header}'`,
  );
}

function parseClientFirstMessage(clientFirstMessage) {
  if (typeof clientFirstMessage !== 'string') {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FIRST,
      SCRAM_CONSTANTS.MSG_CLIENT_FIRST_STRING,
    );
  }
  let gs2Header = null;
  let clientFirstBare = null;
  if (clientFirstMessage.startsWith(SCRAM_CONSTANTS.GS2_NO_CB)) {
    gs2Header = SCRAM_CONSTANTS.GS2_NO_CB;
    clientFirstBare = clientFirstMessage.slice(
      SCRAM_CONSTANTS.GS2_NO_CB.length,
    );
  } else if (clientFirstMessage.startsWith(SCRAM_CONSTANTS.GS2_PLUS_PREFIX)) {
    gs2Header = SCRAM_CONSTANTS.GS2_PLUS_PREFIX;
    clientFirstBare = clientFirstMessage.slice(
      SCRAM_CONSTANTS.GS2_PLUS_PREFIX.length,
    );
  } else {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FIRST,
      SCRAM_CONSTANTS.MSG_INVALID_GS2,
    );
  }

  const parts = clientFirstBare.split(SCRAM_CONSTANTS.COMMA);
  let username = null;
  let clientNonce = null;
  for (const part of parts) {
    if (part.startsWith(SCRAM_CONSTANTS.ATTR_USER_PREFIX)) {
      username = part.slice(2);
    }
    if (part.startsWith(SCRAM_CONSTANTS.ATTR_NONCE_PREFIX)) {
      clientNonce = part.slice(2);
    }
  }
  if (!username || !clientNonce) {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FIRST,
      SCRAM_CONSTANTS.MSG_CLIENT_FIRST_MISSING_ATTRS,
    );
  }
  return {
    gs2Header,
    clientFirstBare,
    username,
    clientNonce,
  };
}

function parseClientFinalMessage(clientFinalMessage) {
  if (typeof clientFinalMessage !== 'string') {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FINAL,
      SCRAM_CONSTANTS.MSG_CLIENT_FINAL_STRING,
    );
  }
  const proofSplitIndex = clientFinalMessage.lastIndexOf(
    SCRAM_CONSTANTS.PROOF_SPLIT_TOKEN,
  );
  if (proofSplitIndex <= 0) {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FINAL,
      SCRAM_CONSTANTS.MSG_CLIENT_FINAL_MISSING_PROOF,
    );
  }
  const clientFinalWithoutProof = clientFinalMessage.slice(0, proofSplitIndex);
  const clientProofBase64 = clientFinalMessage.slice(
    proofSplitIndex + SCRAM_CONSTANTS.PROOF_SPLIT_LEN,
  );
  const attrs = clientFinalWithoutProof.split(SCRAM_CONSTANTS.COMMA);
  let channelBindingBase64 = null;
  let combinedNonce = null;
  for (const attr of attrs) {
    if (attr.startsWith(SCRAM_CONSTANTS.ATTR_CB_PREFIX)) {
      channelBindingBase64 = attr.slice(2);
    }
    if (attr.startsWith(SCRAM_CONSTANTS.ATTR_NONCE_PREFIX)) {
      combinedNonce = attr.slice(2);
    }
  }
  if (!channelBindingBase64 || !combinedNonce || !clientProofBase64) {
    throw createScramError(
      PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FINAL,
      SCRAM_CONSTANTS.MSG_CLIENT_FINAL_MISSING_ATTRS,
    );
  }
  return {
    clientFinalWithoutProof,
    channelBindingBase64,
    combinedNonce,
    clientProofBase64,
  };
}

class ScramSha256ServerSession {
  constructor({userVerifiers, serverCertPemOrDer = null} = {}) {
    this.userVerifiers = userVerifiers instanceof Map ?
      userVerifiers :
      new Map(Object.entries(userVerifiers || {}));
    this.serverCertPemOrDer = serverCertPemOrDer;
    this.state = null;
  }

  handleClientFirst(clientFirstMessage, {usernameOverride = null} = {}) {
    const parsed = parseClientFirstMessage(clientFirstMessage);
    const lookupUser = usernameOverride || parsed.username;
    const verifier = this.userVerifiers.get(lookupUser);
    if (!verifier) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.UNKNOWN_USER,
        `Unknown SCRAM user '${lookupUser}'`,
      );
    }
    const serverNonce = crypto
      .randomBytes(SCRAM_CONSTANTS.NONCE_BYTE_LENGTH)
      .toString(SCRAM_CONSTANTS.BASE64_ENCODING);
    const combinedNonce = `${parsed.clientNonce}${serverNonce}`;
    const serverFirstMessage = `r=${combinedNonce},s=${verifier.saltBase64},i=${verifier.iterations}`;
    this.state = {
      username: lookupUser,
      verifier,
      gs2Header: parsed.gs2Header,
      clientFirstBare: parsed.clientFirstBare,
      combinedNonce,
      serverFirstMessage,
    };
    return {
      serverFirstMessage,
      combinedNonce,
    };
  }

  handleClientFinal(clientFinalMessage) {
    if (!this.state) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.INVALID_CLIENT_FINAL,
        SCRAM_CONSTANTS.MSG_FIRST_BEFORE_FINAL,
      );
    }
    const parsed = parseClientFinalMessage(clientFinalMessage);
    if (parsed.combinedNonce !== this.state.combinedNonce) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.NONCE_MISMATCH,
        SCRAM_CONSTANTS.MSG_NONCE_MISMATCH,
      );
    }
    const expectedCbBase64 = buildExpectedChannelBindingBase64({
      gs2Header: this.state.gs2Header,
      serverCertPemOrDer: this.serverCertPemOrDer,
    });
    if (parsed.channelBindingBase64 !== expectedCbBase64) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.CHANNEL_BINDING_MISMATCH,
        SCRAM_CONSTANTS.MSG_CB_MISMATCH,
      );
    }

    const authMessage = `${this.state.clientFirstBare},${this.state.serverFirstMessage},${parsed.clientFinalWithoutProof}`;
    const storedKey = Buffer.from(
      this.state.verifier.storedKeyBase64,
      SCRAM_CONSTANTS.BASE64_ENCODING,
    );
    const serverKey = Buffer.from(
      this.state.verifier.serverKeyBase64,
      SCRAM_CONSTANTS.BASE64_ENCODING,
    );
    const clientSignature = hmacSha256(storedKey, authMessage);
    const clientProof = Buffer.from(
      parsed.clientProofBase64,
      SCRAM_CONSTANTS.BASE64_ENCODING,
    );
    if (clientProof.length !== clientSignature.length) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.PROOF_MISMATCH,
        SCRAM_CONSTANTS.MSG_PROOF_LEN_MISMATCH,
      );
    }
    const recoveredClientKey = xorBuffers(clientProof, clientSignature);
    const recoveredStoredKey = sha256(recoveredClientKey);
    if (!crypto.timingSafeEqual(recoveredStoredKey, storedKey)) {
      throw createScramError(
        PGWIRE_SCRAM_ERROR_CODE.PROOF_MISMATCH,
        SCRAM_CONSTANTS.MSG_PROOF_FAILED,
      );
    }
    const serverSignature = hmacSha256(serverKey, authMessage).toString(
      SCRAM_CONSTANTS.BASE64_ENCODING,
    );
    return {
      authenticated: true,
      username: this.state.username,
      roles: this.state.verifier.roles || [],
      serverFinalMessage: `v=${serverSignature}`,
    };
  }
}

function createScramClientFirstMessage({
  user,
  clientNonce = null,
  mechanism = SCRAM_MECHANISM.SCRAM_SHA_256,
}) {
  const nonce =
    clientNonce ||
    crypto
      .randomBytes(SCRAM_CONSTANTS.NONCE_BYTE_LENGTH)
      .toString(SCRAM_CONSTANTS.BASE64_ENCODING);
  const gs2Header =
    mechanism === SCRAM_MECHANISM.SCRAM_SHA_256_PLUS ?
      SCRAM_CONSTANTS.GS2_PLUS_PREFIX :
      SCRAM_CONSTANTS.GS2_NO_CB;
  const clientFirstBare = `n=${user},r=${nonce}`;
  return {
    clientNonce: nonce,
    gs2Header,
    clientFirstBare,
    clientFirstMessage: `${gs2Header}${clientFirstBare}`,
  };
}

function createScramClientFinalMessage({
  password,
  clientFirstBare,
  serverFirstMessage,
  gs2Header = SCRAM_CONSTANTS.GS2_NO_CB,
  serverCertPemOrDer = null,
}) {
  const attrs = String(serverFirstMessage).split(SCRAM_CONSTANTS.COMMA);
  let combinedNonce = null;
  let saltBase64 = null;
  let iterations = 0;
  for (const attr of attrs) {
    if (attr.startsWith(SCRAM_CONSTANTS.ATTR_NONCE_PREFIX)) {
      combinedNonce = attr.slice(2);
    }
    if (attr.startsWith(SCRAM_CONSTANTS.ATTR_SALT_PREFIX)) {
      saltBase64 = attr.slice(2);
    }
    if (attr.startsWith(SCRAM_CONSTANTS.ATTR_ITER_PREFIX)) {
      iterations = Number.parseInt(attr.slice(2), 10);
    }
  }
  const cbBase64 = buildExpectedChannelBindingBase64({
    gs2Header,
    serverCertPemOrDer,
  });
  const clientFinalWithoutProof = `c=${cbBase64},r=${combinedNonce}`;
  const authMessage = `${clientFirstBare},${serverFirstMessage},${clientFinalWithoutProof}`;
  const saltBuffer = Buffer.from(saltBase64, SCRAM_CONSTANTS.BASE64_ENCODING);
  const saltedPassword = hiPbkdf2Sha256(password, saltBuffer, iterations);
  const clientKey = hmacSha256(saltedPassword, SCRAM_CONSTANTS.CLIENT_KEY_LABEL);
  const storedKey = sha256(clientKey);
  const serverKey = hmacSha256(saltedPassword, SCRAM_CONSTANTS.SERVER_KEY_LABEL);
  const clientSignature = hmacSha256(storedKey, authMessage);
  const clientProof = xorBuffers(clientKey, clientSignature).toString(
    SCRAM_CONSTANTS.BASE64_ENCODING,
  );
  const expectedServerSignature = hmacSha256(serverKey, authMessage).toString(
    SCRAM_CONSTANTS.BASE64_ENCODING,
  );
  return {
    clientFinalMessage: `${clientFinalWithoutProof},p=${clientProof}`,
    expectedServerFinalMessage: `v=${expectedServerSignature}`,
  };
}

function authenticatePgwireClientCert(credentials, trustProvider, verifierMap) {
  if (!trustProvider || !credentials.clientCertPem) {
    return {
      authenticated: false,
      code: PGWIRE_SCRAM_ERROR_CODE.CERT_REQUIRED,
    };
  }
  const certResult = trustProvider.verifyPeerCertificate(
    credentials.clientCertPem,
    {expectedNodeId: credentials.user},
  );
  if (!certResult.valid) {
    return {
      authenticated: false,
      code: PGWIRE_SCRAM_ERROR_CODE.CERT_UNTRUSTED,
    };
  }
  const verifier = verifierMap.get(credentials.user);
  return {
    authenticated: true,
    roles: verifier?.roles || [SCRAM_CONSTANTS.DEFAULT_NODE_ROLE],
    serialNumber: certResult.serialNumber,
  };
}

function resolveScramMechanismForCredentials(credentials) {
  if (credentials.mechanism) return credentials.mechanism;
  return credentials.authMode === PGWIRE_STRONG_AUTH_MODE.SCRAM_SHA_256_PLUS ?
    SCRAM_MECHANISM.SCRAM_SHA_256_PLUS :
    SCRAM_MECHANISM.SCRAM_SHA_256;
}

function runDirectPasswordScramExchange(session, credentials, serverCertPemOrDer) {
  const mechanism = resolveScramMechanismForCredentials(credentials);
  const first = createScramClientFirstMessage({
    user: credentials.user,
    mechanism,
  });
  const srvFirst = session.handleClientFirst(first.clientFirstMessage, {
    usernameOverride: credentials.user,
  });
  const finalMsg = createScramClientFinalMessage({
    password: credentials.password,
    clientFirstBare: first.clientFirstBare,
    serverFirstMessage: srvFirst.serverFirstMessage,
    gs2Header: first.gs2Header,
    serverCertPemOrDer:
      credentials.clientObservedServerCert ||
      credentials.serverCertPemOrDer ||
      serverCertPemOrDer,
  });
  const outcome = session.handleClientFinal(finalMsg.clientFinalMessage);
  if (outcome.serverFinalMessage !== finalMsg.expectedServerFinalMessage) {
    return {authenticated: false};
  }
  return outcome;
}

function createScramAndCertAuthenticator({
  userVerifiers = {},
  trustProvider = null,
  serverCertPemOrDer = null,
} = {}) {
  const verifierMap = userVerifiers instanceof Map ?
    userVerifiers :
    new Map(Object.entries(userVerifiers));

  return async function authenticatePgwireCredentials(credentials) {
    if (!credentials || !credentials.user) {
      return {authenticated: false};
    }

    if (
      credentials.authMode === PGWIRE_STRONG_AUTH_MODE.CERT ||
      credentials.clientCertPem
    ) {
      return authenticatePgwireClientCert(
        credentials,
        trustProvider,
        verifierMap,
      );
    }

    const session = new ScramSha256ServerSession({
      userVerifiers: verifierMap,
      serverCertPemOrDer: credentials.serverCertPemOrDer || serverCertPemOrDer,
    });

    if (credentials.clientFirstMessage && credentials.clientFinalMessage) {
      session.handleClientFirst(credentials.clientFirstMessage, {
        usernameOverride: credentials.user,
      });
      return session.handleClientFinal(credentials.clientFinalMessage);
    }

    if (typeof credentials.password === 'string') {
      return runDirectPasswordScramExchange(
        session,
        credentials,
        serverCertPemOrDer,
      );
    }

    return {authenticated: false};
  };
}

export {
  SCRAM_MECHANISM,
  PGWIRE_STRONG_AUTH_MODE,
  PGWIRE_SCRAM_ERROR_CODE,
  ScramSha256ServerSession,
  createScramCredentialRecord,
  createScramClientFirstMessage,
  createScramClientFinalMessage,
  createScramAndCertAuthenticator,
};
