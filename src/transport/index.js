/**
 * Transport module exports.
 */

export {
  MessageRouter,
  ConnectionState as RouterConnectionState,
  RouterMessageType,
} from './message-router.js';

export {
  RPCClient,
} from './rpc-client.js';

export {
  X509_CA_ERROR_CODE,
  buildLagrangeSanUri,
  parseLagrangeSanUri,
  generateEd25519KeyPairPem,
  generateClusterRootCa,
  issueNodeCertificate,
  extractSanIdentitiesFromX509,
  verifyNodeCertificate,
} from './x509-ed25519-certificate-authority.js';

export {
  CLUSTER_TRUST_MODE,
  TRANSPORT_AUTH_ERROR_CODE,
  ClusterTrustProvider,
  createTransportAuthError,
  isLoopbackHost,
  assertPlaintextAllowedOnHost,
  validatePrivateKeyFilePermissions,
} from './cluster-trust-provider.js';

export {
  JOIN_TOKEN_PREFIX,
  JOIN_TOKEN_ERROR_CODE,
  ClusterJoinTokenStore,
  computeCertFingerprint256Hex,
  formatJoinToken,
  parseJoinToken,
  createEnrollmentCsrProof,
  verifyEnrollmentCsrProof,
} from './cluster-join-token.js';
