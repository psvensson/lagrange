/**
 * Pure Node.js X.509v3 Ed25519 Certificate Authority and leaf certificate
 * generator, parser, and verifier (`URI:lagrange://<clusterId>/node/<nodeId>`).
 *
 * @module transport/x509-ed25519-certificate-authority
 */

import crypto from 'node:crypto';

const ASN1_TAG = Object.freeze({
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  OBJECT_IDENTIFIER: 0x06,
  UTF8_STRING: 0x0c,
  UTCTIME: 0x17,
  GENERALIZED_TIME: 0x18,
  SEQUENCE: 0x30,
  SET: 0x31,
  CONTEXT_EXPLICIT_0: 0xa0,
  CONTEXT_EXPLICIT_3: 0xa3,
  SAN_DNS_NAME: 0x82,
  SAN_URI: 0x86,
  SAN_IP_ADDRESS: 0x87,
});

const OID_BYTES = Object.freeze({
  ED25519: Buffer.from([0x2b, 0x65, 0x70]),
  COMMON_NAME: Buffer.from([0x55, 0x04, 0x03]),
  ORGANIZATION_NAME: Buffer.from([0x55, 0x04, 0x0a]),
  SUBJECT_KEY_IDENTIFIER: Buffer.from([0x55, 0x1d, 0x0e]),
  KEY_USAGE: Buffer.from([0x55, 0x1d, 0x0f]),
  SUBJECT_ALT_NAME: Buffer.from([0x55, 0x1d, 0x11]),
  BASIC_CONSTRAINTS: Buffer.from([0x55, 0x1d, 0x13]),
  EXT_KEY_USAGE: Buffer.from([0x55, 0x1d, 0x25]),
  SERVER_AUTH: Buffer.from([0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01]),
  CLIENT_AUTH: Buffer.from([0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x02]),
});

const CERT_CONSTANTS = Object.freeze({
  X509_VERSION_3: 2,
  SERIAL_BYTE_LENGTH: 16,
  HIGH_BIT_MASK: 0x80,
  SHORT_LEN_LIMIT: 0x80,
  BYTE_MASK: 0xff,
  PEM_LINE_WIDTH: 64,
  PEM_CERT_HEADER: '-----BEGIN CERTIFICATE-----',
  PEM_CERT_FOOTER: '-----END CERTIFICATE-----',
  DEFAULT_ORGANIZATION: 'Lagrange Cluster',
  DEFAULT_CA_VALIDITY_DAYS: 3650,
  DEFAULT_NODE_VALIDITY_DAYS: 90,
  CLOCK_SKEW_BACKDATE_MS: 60_000,
  MS_PER_DAY: 86_400_000,
  UTCTIME_CUTOFF_YEAR: 2050,
  SAN_URI_PREFIX: 'lagrange://',
  SAN_NODE_SEGMENT: '/node/',
  COLON_URI_PREFIX: 'URI:',
  IPV4_OCTETS: 4,
  KEY_USAGE_CA_BITS: Buffer.from([0x01, 0x86]),
  KEY_USAGE_LEAF_BITS: Buffer.from([0x07, 0x80]),
  HASH_SHA1: 'sha1',
  KEY_TYPE_ED25519: 'ed25519',
  KEY_FORMAT_DER: 'der',
  KEY_FORMAT_PEM: 'pem',
  KEY_ENCODING_SPKI: 'spki',
  KEY_ENCODING_PKCS8: 'pkcs8',
  DECIMAL_RADIX: 10,
  CENTURY_MODULO: 100,
  PAD_TWO: 2,
  PAD_FOUR: 4,
  ZERO_CHAR: '0',
  BYTE_BASE: 256,
  SERIAL_LOW_MASK: 0x7f,
  UTF8_ENCODING: 'utf8',
  ASCII_ENCODING: 'ascii',
  NEWLINE: '\n',
  SLASH: '/',
  CN_PREFIX: 'CN=',
  CN_PREFIX_LEN: 3,
  ORG_PREFIX: 'O=',
  DEFAULT_DNS_LOCALHOST: 'localhost',
  DEFAULT_IPV4_LOOPBACK: '127.0.0.1',
  MSG_CLUSTER_ID_REQUIRED: 'clusterId must be a non-empty string',
  MSG_NODE_ID_REQUIRED: 'nodeId must be a non-empty string',
  MSG_CA_CLUSTER_ID_REQUIRED:
    'clusterId is required to generate cluster root CA',
  MSG_CERT_SIG_UNTRUSTED:
    'Certificate signature is not trusted by the cluster CA bundle',
  MSG_SAN_URI_MISSING:
    'Certificate is missing SAN URI lagrange://<clusterId>/node/<nodeId>',
});

const X509_CA_ERROR_CODE = Object.freeze({
  INVALID_CLUSTER_ID: 'X509_INVALID_CLUSTER_ID',
  INVALID_NODE_ID: 'X509_INVALID_NODE_ID',
  INVALID_CERTIFICATE: 'X509_INVALID_CERTIFICATE',
  CERT_SIGNATURE_INVALID: 'X509_CERT_SIGNATURE_INVALID',
  CERT_EXPIRED: 'X509_CERT_EXPIRED',
  CERT_NOT_YET_VALID: 'X509_CERT_NOT_YET_VALID',
  CERT_REVOKED: 'X509_CERT_REVOKED',
  CERT_CLUSTER_MISMATCH: 'X509_CERT_CLUSTER_MISMATCH',
  CERT_NODE_ID_MISMATCH: 'X509_CERT_NODE_ID_MISMATCH',
  CERT_SAN_URI_MISSING: 'X509_CERT_SAN_URI_MISSING',
});

function createX509Error(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function encodeAsn1Length(length) {
  if (length < CERT_CONSTANTS.SHORT_LEN_LIMIT) {
    return Buffer.from([length]);
  }
  const octets = [];
  let remaining = length;
  while (remaining > 0) {
    octets.unshift(remaining & CERT_CONSTANTS.BYTE_MASK);
    remaining = Math.floor(remaining / CERT_CONSTANTS.BYTE_BASE);
  }
  return Buffer.from([
    CERT_CONSTANTS.HIGH_BIT_MASK | octets.length,
    ...octets,
  ]);
}

function encodeAsn1Tlv(tag, contentBuffer) {
  const body = Buffer.isBuffer(contentBuffer) ?
    contentBuffer :
    Buffer.from(contentBuffer);
  return Buffer.concat([
    Buffer.from([tag]),
    encodeAsn1Length(body.length),
    body,
  ]);
}

function encodeAsn1Sequence(items) {
  return encodeAsn1Tlv(ASN1_TAG.SEQUENCE, Buffer.concat(items));
}

function encodeAsn1Set(items) {
  return encodeAsn1Tlv(ASN1_TAG.SET, Buffer.concat(items));
}

function encodeAsn1Oid(oidBytes) {
  return encodeAsn1Tlv(ASN1_TAG.OBJECT_IDENTIFIER, oidBytes);
}

function encodeAsn1Boolean(value) {
  return encodeAsn1Tlv(
    ASN1_TAG.BOOLEAN,
    Buffer.from([value ? CERT_CONSTANTS.BYTE_MASK : 0]),
  );
}

function encodeAsn1PositiveInteger(rawBytes) {
  let bytes = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  while (bytes.length > 1 && bytes[0] === 0) {
    bytes = bytes.subarray(1);
  }
  if ((bytes[0] & CERT_CONSTANTS.HIGH_BIT_MASK) !== 0) {
    bytes = Buffer.concat([Buffer.from([0]), bytes]);
  }
  return encodeAsn1Tlv(ASN1_TAG.INTEGER, bytes);
}

function encodeAsn1SmallInteger(num) {
  return encodeAsn1Tlv(
    ASN1_TAG.INTEGER,
    Buffer.from([num & CERT_CONSTANTS.BYTE_MASK]),
  );
}

function encodeAsn1Utf8String(text) {
  return encodeAsn1Tlv(
    ASN1_TAG.UTF8_STRING,
    Buffer.from(String(text), CERT_CONSTANTS.UTF8_ENCODING),
  );
}

function encodeAsn1OctetString(bytes) {
  return encodeAsn1Tlv(ASN1_TAG.OCTET_STRING, bytes);
}

function encodeAsn1BitString(bytes, unusedBits = 0) {
  return encodeAsn1Tlv(
    ASN1_TAG.BIT_STRING,
    Buffer.concat([Buffer.from([unusedBits & CERT_CONSTANTS.BYTE_MASK]), bytes]),
  );
}

function formatTwoDigits(value) {
  return String(value).padStart(CERT_CONSTANTS.PAD_TWO, CERT_CONSTANTS.ZERO_CHAR);
}

function formatFourDigits(value) {
  return String(value).padStart(CERT_CONSTANTS.PAD_FOUR, CERT_CONSTANTS.ZERO_CHAR);
}

function encodeAsn1Time(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getUTCFullYear();
  const stamp = `${formatTwoDigits(date.getUTCMonth() + 1)}${formatTwoDigits(date.getUTCDate())}${formatTwoDigits(date.getUTCHours())}${formatTwoDigits(date.getUTCMinutes())}${formatTwoDigits(date.getUTCSeconds())}Z`;
  if (year < CERT_CONSTANTS.UTCTIME_CUTOFF_YEAR) {
    return encodeAsn1Tlv(
      ASN1_TAG.UTCTIME,
      Buffer.from(`${formatTwoDigits(year % CERT_CONSTANTS.CENTURY_MODULO)}${stamp}`, CERT_CONSTANTS.ASCII_ENCODING),
    );
  }
  return encodeAsn1Tlv(
    ASN1_TAG.GENERALIZED_TIME,
    Buffer.from(`${formatFourDigits(year)}${stamp}`, CERT_CONSTANTS.ASCII_ENCODING),
  );
}

function encodeRdnEntry(oid, text) {
  return encodeAsn1Set([
    encodeAsn1Sequence([encodeAsn1Oid(oid), encodeAsn1Utf8String(text)]),
  ]);
}

function encodeDistinguishedName({commonName, organizationName}) {
  const rdns = [];
  if (organizationName) {
    rdns.push(encodeRdnEntry(OID_BYTES.ORGANIZATION_NAME, organizationName));
  }
  rdns.push(encodeRdnEntry(OID_BYTES.COMMON_NAME, commonName));
  return encodeAsn1Sequence(rdns);
}

function encodeExtension({oid, critical = false, valueDer}) {
  const items = [encodeAsn1Oid(oid)];
  if (critical) items.push(encodeAsn1Boolean(true));
  items.push(encodeAsn1OctetString(valueDer));
  return encodeAsn1Sequence(items);
}

function parseIpv4Octets(ipText) {
  if (typeof ipText !== 'string') return null;
  const parts = ipText.trim().split('.');
  if (parts.length !== CERT_CONSTANTS.IPV4_OCTETS) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d+$/u.test(part)) return null;
    const num = Number.parseInt(part, CERT_CONSTANTS.DECIMAL_RADIX);
    if (!Number.isInteger(num) || num < 0 || num > CERT_CONSTANTS.BYTE_MASK) {
      return null;
    }
    octets.push(num);
  }
  return Buffer.from(octets);
}

function buildLagrangeSanUri(clusterId, nodeId) {
  if (typeof clusterId !== 'string' || clusterId.trim().length === 0) {
    throw createX509Error(
      X509_CA_ERROR_CODE.INVALID_CLUSTER_ID,
      CERT_CONSTANTS.MSG_CLUSTER_ID_REQUIRED,
    );
  }
  if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
    throw createX509Error(
      X509_CA_ERROR_CODE.INVALID_NODE_ID,
      CERT_CONSTANTS.MSG_NODE_ID_REQUIRED,
    );
  }
  return `${CERT_CONSTANTS.SAN_URI_PREFIX}${clusterId.trim()}${CERT_CONSTANTS.SAN_NODE_SEGMENT}${nodeId.trim()}`;
}

function parseLagrangeSanUri(uriString) {
  if (typeof uriString !== 'string') return null;
  const normalized = uriString.startsWith(CERT_CONSTANTS.COLON_URI_PREFIX) ?
    uriString.slice(CERT_CONSTANTS.COLON_URI_PREFIX.length).trim() :
    uriString.trim();
  if (!normalized.startsWith(CERT_CONSTANTS.SAN_URI_PREFIX)) return null;
  const rest = normalized.slice(CERT_CONSTANTS.SAN_URI_PREFIX.length);
  const segIndex = rest.indexOf(CERT_CONSTANTS.SAN_NODE_SEGMENT);
  if (segIndex <= 0) return null;
  const clusterId = rest.slice(0, segIndex);
  const nodeId = rest.slice(segIndex + CERT_CONSTANTS.SAN_NODE_SEGMENT.length);
  if (!clusterId || !nodeId || nodeId.includes(CERT_CONSTANTS.SLASH)) {
    return null;
  }
  return {clusterId, nodeId, uri: normalized};
}

function encodeSubjectAltNameExtension({
  uris = [],
  dnsNames = [],
  ipAddresses = [],
}) {
  const generalNames = [];
  for (const uri of uris) {
    generalNames.push(
      encodeAsn1Tlv(
        ASN1_TAG.SAN_URI,
        Buffer.from(String(uri), CERT_CONSTANTS.ASCII_ENCODING),
      ),
    );
  }
  for (const dns of dnsNames) {
    generalNames.push(
      encodeAsn1Tlv(
        ASN1_TAG.SAN_DNS_NAME,
        Buffer.from(String(dns), CERT_CONSTANTS.ASCII_ENCODING),
      ),
    );
  }
  for (const ip of ipAddresses) {
    const ipv4Buf = parseIpv4Octets(ip);
    if (ipv4Buf) {
      generalNames.push(encodeAsn1Tlv(ASN1_TAG.SAN_IP_ADDRESS, ipv4Buf));
    }
  }
  return encodeExtension({
    oid: OID_BYTES.SUBJECT_ALT_NAME,
    critical: false,
    valueDer: encodeAsn1Sequence(generalNames),
  });
}

function derToPemCertificate(derBuffer) {
  const base64 = derBuffer.toString('base64');
  const lines = [];
  for (let i = 0; i < base64.length; i += CERT_CONSTANTS.PEM_LINE_WIDTH) {
    lines.push(base64.slice(i, i + CERT_CONSTANTS.PEM_LINE_WIDTH));
  }
  return [
    CERT_CONSTANTS.PEM_CERT_HEADER,
    ...lines,
    CERT_CONSTANTS.PEM_CERT_FOOTER,
    '',
  ].join(CERT_CONSTANTS.NEWLINE);
}

function generateEd25519KeyPairPem() {
  const {publicKey, privateKey} = crypto.generateKeyPairSync(CERT_CONSTANTS.KEY_TYPE_ED25519);
  return {
    publicKey,
    privateKey,
    publicKeyPem: publicKey.export({
      type: CERT_CONSTANTS.KEY_ENCODING_SPKI,
      format: CERT_CONSTANTS.KEY_FORMAT_PEM,
    }),
    privateKeyPem: privateKey.export({
      type: CERT_CONSTANTS.KEY_ENCODING_PKCS8,
      format: CERT_CONSTANTS.KEY_FORMAT_PEM,
    }),
    spkiDer: publicKey.export({
      type: CERT_CONSTANTS.KEY_ENCODING_SPKI,
      format: CERT_CONSTANTS.KEY_FORMAT_DER,
    }),
  };
}

function buildX509v3Ed25519Certificate(params) {
  const versionExplicit = encodeAsn1Tlv(
    ASN1_TAG.CONTEXT_EXPLICIT_0,
    encodeAsn1SmallInteger(CERT_CONSTANTS.X509_VERSION_3),
  );
  const serialInteger = encodeAsn1PositiveInteger(params.serialBytes);
  const signatureAlgorithm = encodeAsn1Sequence([encodeAsn1Oid(OID_BYTES.ED25519)]);
  const validitySequence = encodeAsn1Sequence([
    encodeAsn1Time(params.notBeforeDate),
    encodeAsn1Time(params.notAfterDate),
  ]);
  const extensionsExplicit = encodeAsn1Tlv(
    ASN1_TAG.CONTEXT_EXPLICIT_3,
    encodeAsn1Sequence(params.extensionsDerList),
  );
  const tbsCertificate = encodeAsn1Sequence([
    versionExplicit,
    serialInteger,
    signatureAlgorithm,
    params.issuerDnDer,
    validitySequence,
    params.subjectDnDer,
    params.subjectSpkiDer,
    extensionsExplicit,
  ]);
  const signatureBytes = crypto.sign(null, tbsCertificate, params.issuerPrivateKey);
  const certificateDer = encodeAsn1Sequence([
    tbsCertificate,
    signatureAlgorithm,
    encodeAsn1BitString(signatureBytes, 0),
  ]);
  const certificatePem = derToPemCertificate(certificateDer);
  const parsed = new crypto.X509Certificate(certificatePem);
  return {
    certificateDer,
    certificatePem,
    serialNumber: parsed.serialNumber.toLowerCase(),
    fingerprint256: parsed.fingerprint256,
    validFrom: parsed.validFrom,
    validTo: parsed.validTo,
    x509: parsed,
  };
}

function generateClusterRootCa({
  clusterId,
  commonName = null,
  organizationName = CERT_CONSTANTS.DEFAULT_ORGANIZATION,
  validityDays = CERT_CONSTANTS.DEFAULT_CA_VALIDITY_DAYS,
  nowMs = Date.now(),
} = {}) {
  if (typeof clusterId !== 'string' || clusterId.trim().length === 0) {
    throw createX509Error(
      X509_CA_ERROR_CODE.INVALID_CLUSTER_ID,
      CERT_CONSTANTS.MSG_CA_CLUSTER_ID_REQUIRED,
    );
  }
  const normalizedClusterId = clusterId.trim();
  const caKeys = generateEd25519KeyPairPem();
  const serialBytes = crypto.randomBytes(CERT_CONSTANTS.SERIAL_BYTE_LENGTH);
  serialBytes[0] &= CERT_CONSTANTS.SERIAL_LOW_MASK;
  serialBytes[0] |= 1;
  const caDnDer = encodeDistinguishedName({
    commonName: commonName || `lagrange-ca-${normalizedClusterId}`,
    organizationName,
  });
  const skiHash = crypto.createHash(CERT_CONSTANTS.HASH_SHA1).update(caKeys.spkiDer).digest();
  const extensions = [
    encodeExtension({
      oid: OID_BYTES.BASIC_CONSTRAINTS,
      critical: true,
      valueDer: encodeAsn1Sequence([encodeAsn1Boolean(true)]),
    }),
    encodeExtension({
      oid: OID_BYTES.KEY_USAGE,
      critical: true,
      valueDer: encodeAsn1Tlv(ASN1_TAG.BIT_STRING, CERT_CONSTANTS.KEY_USAGE_CA_BITS),
    }),
    encodeExtension({
      oid: OID_BYTES.SUBJECT_KEY_IDENTIFIER,
      critical: false,
      valueDer: encodeAsn1OctetString(skiHash),
    }),
  ];
  const built = buildX509v3Ed25519Certificate({
    serialBytes,
    issuerDnDer: caDnDer,
    subjectDnDer: caDnDer,
    notBeforeDate: new Date(nowMs - CERT_CONSTANTS.CLOCK_SKEW_BACKDATE_MS),
    notAfterDate: new Date(nowMs + validityDays * CERT_CONSTANTS.MS_PER_DAY),
    subjectSpkiDer: caKeys.spkiDer,
    extensionsDerList: extensions,
    issuerPrivateKey: caKeys.privateKey,
  });
  return {
    clusterId: normalizedClusterId,
    caCertPem: built.certificatePem,
    caKeyPem: caKeys.privateKeyPem,
    caPublicKeyPem: caKeys.publicKeyPem,
    serialNumber: built.serialNumber,
    fingerprint256: built.fingerprint256,
    validFrom: built.validFrom,
    validTo: built.validTo,
  };
}

function resolveNodeSubjectKeyMaterial(subjectPublicKeyPem) {
  if (subjectPublicKeyPem) {
    const spkiDer = crypto.createPublicKey(subjectPublicKeyPem).export({
      type: CERT_CONSTANTS.KEY_ENCODING_SPKI,
      format: CERT_CONSTANTS.KEY_FORMAT_DER,
    });
    return {spkiDer, privateKeyPem: null, publicKeyPem: subjectPublicKeyPem};
  }
  const generated = generateEd25519KeyPairPem();
  return {
    spkiDer: generated.spkiDer,
    privateKeyPem: generated.privateKeyPem,
    publicKeyPem: generated.publicKeyPem,
  };
}

function parseCaIssuerSubjectAttributes(caX509, clusterId, defaultOrgName) {
  const subjectLines = String(caX509.subject || '').split(CERT_CONSTANTS.NEWLINE);
  let caCommonName = `lagrange-ca-${clusterId.trim()}`;
  let caOrgName = defaultOrgName;
  for (const line of subjectLines) {
    if (line.startsWith(CERT_CONSTANTS.CN_PREFIX)) {
      caCommonName = line.slice(CERT_CONSTANTS.CN_PREFIX_LEN);
    }
    if (line.startsWith(CERT_CONSTANTS.ORG_PREFIX)) {
      caOrgName = line.slice(2);
    }
  }
  return {caCommonName, caOrgName};
}

function buildLeafExtensions({subjectSpkiDer, sanUri, dnsNames, ipAddresses}) {
  const skiHash = crypto.createHash(CERT_CONSTANTS.HASH_SHA1).update(subjectSpkiDer).digest();
  return [
    encodeExtension({
      oid: OID_BYTES.BASIC_CONSTRAINTS,
      critical: true,
      valueDer: encodeAsn1Sequence([]),
    }),
    encodeExtension({
      oid: OID_BYTES.KEY_USAGE,
      critical: true,
      valueDer: encodeAsn1Tlv(ASN1_TAG.BIT_STRING, CERT_CONSTANTS.KEY_USAGE_LEAF_BITS),
    }),
    encodeExtension({
      oid: OID_BYTES.EXT_KEY_USAGE,
      critical: false,
      valueDer: encodeAsn1Sequence([
        encodeAsn1Oid(OID_BYTES.SERVER_AUTH),
        encodeAsn1Oid(OID_BYTES.CLIENT_AUTH),
      ]),
    }),
    encodeExtension({
      oid: OID_BYTES.SUBJECT_KEY_IDENTIFIER,
      critical: false,
      valueDer: encodeAsn1OctetString(skiHash),
    }),
    encodeSubjectAltNameExtension({uris: [sanUri], dnsNames, ipAddresses}),
  ];
}

function resolveValidityDates({nowMs, validityDays, notBeforeMs, notAfterMs}) {
  return {
    notBeforeDate:
      notBeforeMs !== null ?
        new Date(notBeforeMs) :
        new Date(nowMs - CERT_CONSTANTS.CLOCK_SKEW_BACKDATE_MS),
    notAfterDate:
      notAfterMs !== null ?
        new Date(notAfterMs) :
        new Date(nowMs + validityDays * CERT_CONSTANTS.MS_PER_DAY),
  };
}

function normalizeNodeCertOptions(options = {}) {
  return {
    caCertPem: options.caCertPem,
    caKeyPem: options.caKeyPem,
    clusterId: options.clusterId,
    nodeId: options.nodeId,
    subjectPublicKeyPem: options.subjectPublicKeyPem || null,
    dnsNames: options.dnsNames || [CERT_CONSTANTS.DEFAULT_DNS_LOCALHOST],
    ipAddresses: options.ipAddresses || [CERT_CONSTANTS.DEFAULT_IPV4_LOOPBACK],
    validityDays:
      options.validityDays ?? CERT_CONSTANTS.DEFAULT_NODE_VALIDITY_DAYS,
    organizationName:
      options.organizationName || CERT_CONSTANTS.DEFAULT_ORGANIZATION,
    nowMs: options.nowMs ?? Date.now(),
    notBeforeMs: options.notBeforeMs ?? null,
    notAfterMs: options.notAfterMs ?? null,
  };
}

function issueNodeCertificate(rawOptions) {
  const opts = normalizeNodeCertOptions(rawOptions);
  const sanUri = buildLagrangeSanUri(opts.clusterId, opts.nodeId);
  const caX509 = new crypto.X509Certificate(opts.caCertPem);
  const caPrivateKey = crypto.createPrivateKey(opts.caKeyPem);
  const keyMaterial = resolveNodeSubjectKeyMaterial(opts.subjectPublicKeyPem);
  const serialBytes = crypto.randomBytes(CERT_CONSTANTS.SERIAL_BYTE_LENGTH);
  serialBytes[0] &= CERT_CONSTANTS.SERIAL_LOW_MASK;
  serialBytes[0] |= 1;
  const {caCommonName, caOrgName} = parseCaIssuerSubjectAttributes(
    caX509,
    opts.clusterId,
    opts.organizationName,
  );
  const extensions = buildLeafExtensions({
    subjectSpkiDer: keyMaterial.spkiDer,
    sanUri,
    dnsNames: opts.dnsNames,
    ipAddresses: opts.ipAddresses,
  });
  const {notBeforeDate, notAfterDate} = resolveValidityDates(opts);
  const built = buildX509v3Ed25519Certificate({
    serialBytes,
    issuerDnDer: encodeDistinguishedName({
      commonName: caCommonName,
      organizationName: caOrgName,
    }),
    subjectDnDer: encodeDistinguishedName({
      commonName: opts.nodeId.trim(),
      organizationName: caOrgName,
    }),
    notBeforeDate,
    notAfterDate,
    subjectSpkiDer: keyMaterial.spkiDer,
    extensionsDerList: extensions,
    issuerPrivateKey: caPrivateKey,
  });
  return {
    clusterId: opts.clusterId.trim(),
    nodeId: opts.nodeId.trim(),
    sanUri,
    certPem: built.certificatePem,
    keyPem: keyMaterial.privateKeyPem,
    publicKeyPem: keyMaterial.publicKeyPem,
    serialNumber: built.serialNumber,
    fingerprint256: built.fingerprint256,
    validFrom: built.validFrom,
    validTo: built.validTo,
  };
}

function extractSanIdentitiesFromX509(x509) {
  const sanString = typeof x509?.subjectAltName === 'string' ?
    x509.subjectAltName :
    '';
  if (!sanString) return {uris: [], lagrangeIdentities: []};
  const entries = sanString.split(',').map((part) => part.trim());
  const uris = [];
  const lagrangeIdentities = [];
  for (const entry of entries) {
    if (entry.startsWith(CERT_CONSTANTS.COLON_URI_PREFIX)) {
      const uri = entry.slice(CERT_CONSTANTS.COLON_URI_PREFIX.length).trim();
      uris.push(uri);
      const parsed = parseLagrangeSanUri(uri);
      if (parsed) lagrangeIdentities.push(parsed);
    }
  }
  return {uris, lagrangeIdentities};
}

function buildCertVerificationFailure(code, reason, extra = {}) {
  return {valid: false, code, reason, ...extra};
}

function checkCertificateRevocation(serialNumber, revokedSerialNumbers) {
  if (!revokedSerialNumbers) return null;
  const normalizedRevoked = revokedSerialNumbers instanceof Set ?
    revokedSerialNumbers :
    new Set(Array.from(revokedSerialNumbers, (s) => String(s).toLowerCase()));
  return normalizedRevoked.has(serialNumber) ?
    buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_REVOKED,
      `Certificate serial ${serialNumber} is revoked`,
      {serialNumber},
    ) :
    null;
}

function checkCertificateValidityWindow(x509, serialNumber, nowMs) {
  const validFromMs = Date.parse(x509.validFrom);
  if (Number.isFinite(validFromMs) && nowMs < validFromMs) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_NOT_YET_VALID,
      `Certificate not valid until ${x509.validFrom}`,
      {serialNumber},
    );
  }
  const validToMs = Date.parse(x509.validTo);
  if (Number.isFinite(validToMs) && nowMs > validToMs) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_EXPIRED,
      `Certificate expired at ${x509.validTo}`,
      {serialNumber},
    );
  }
  return null;
}

function tryVerifyWithCaPem(x509, caPem) {
  if (!caPem) return false;
  try {
    const caX509 = caPem instanceof crypto.X509Certificate ?
      caPem :
      new crypto.X509Certificate(caPem);
    return x509.verify(caX509.publicKey);
  } catch (err) {
    return Boolean(err && false);
  }
}

function isSignedByAnyClusterCa(x509, caCertPems) {
  const caList = Array.isArray(caCertPems) ? caCertPems : [caCertPems];
  for (const caPem of caList) {
    if (tryVerifyWithCaPem(x509, caPem)) return true;
  }
  return false;
}

function resolveIdentityMismatchError(
  identity,
  serialNumber,
  expectedClusterId,
  expectedNodeId,
) {
  if (!identity) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_SAN_URI_MISSING,
      CERT_CONSTANTS.MSG_SAN_URI_MISSING,
      {serialNumber},
    );
  }
  if (expectedClusterId && identity.clusterId !== expectedClusterId) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_CLUSTER_MISMATCH,
      `Certificate clusterId '${identity.clusterId}' does not match expected '${expectedClusterId}'`,
      {serialNumber, clusterId: identity.clusterId, nodeId: identity.nodeId},
    );
  }
  if (expectedNodeId && identity.nodeId !== expectedNodeId) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_NODE_ID_MISMATCH,
      `Certificate nodeId '${identity.nodeId}' does not match expected '${expectedNodeId}'`,
      {serialNumber, clusterId: identity.clusterId, nodeId: identity.nodeId},
    );
  }
  return null;
}

function parseX509OrError(certPemOrDer) {
  try {
    const x509 = certPemOrDer instanceof crypto.X509Certificate ?
      certPemOrDer :
      new crypto.X509Certificate(certPemOrDer);
    return {x509, error: null};
  } catch (err) {
    return {
      x509: null,
      error: buildCertVerificationFailure(
        X509_CA_ERROR_CODE.INVALID_CERTIFICATE,
        err.message,
      ),
    };
  }
}

function checkCertPreconditions(x509, serialNumber, options) {
  const nowMs = options.nowMs ?? Date.now();
  const preCheck =
    checkCertificateRevocation(serialNumber, options.revokedSerialNumbers) ||
    checkCertificateValidityWindow(x509, serialNumber, nowMs);
  if (preCheck) return preCheck;
  if (!isSignedByAnyClusterCa(x509, options.caCertPems || [])) {
    return buildCertVerificationFailure(
      X509_CA_ERROR_CODE.CERT_SIGNATURE_INVALID,
      CERT_CONSTANTS.MSG_CERT_SIG_UNTRUSTED,
      {serialNumber},
    );
  }
  return null;
}

function verifyNodeCertificate(rawOptions) {
  const options = rawOptions || {};
  const {x509, error: parseError} = parseX509OrError(options.certPemOrDer);
  if (parseError) return parseError;

  const serialNumber = String(x509.serialNumber || '').toLowerCase();
  const preCheckFailure = checkCertPreconditions(x509, serialNumber, options);
  if (preCheckFailure) return preCheckFailure;

  const {lagrangeIdentities} = extractSanIdentitiesFromX509(x509);
  const identity = lagrangeIdentities[0] || null;
  const mismatch = resolveIdentityMismatchError(
    identity,
    serialNumber,
    options.expectedClusterId,
    options.expectedNodeId,
  );
  if (mismatch) return mismatch;

  return {
    valid: true,
    code: null,
    serialNumber,
    fingerprint256: x509.fingerprint256,
    clusterId: identity.clusterId,
    nodeId: identity.nodeId,
    sanUri: identity.uri,
    validFrom: x509.validFrom,
    validTo: x509.validTo,
    publicKey: x509.publicKey,
  };
}

export {
  X509_CA_ERROR_CODE,
  buildLagrangeSanUri,
  parseLagrangeSanUri,
  generateEd25519KeyPairPem,
  generateClusterRootCa,
  issueNodeCertificate,
  extractSanIdentitiesFromX509,
  verifyNodeCertificate,
};
