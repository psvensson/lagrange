/**
 * Comprehensive unit and multi-node integration tests for Q7
 * (`node-transport-authenticated-encryption`):
 * - A3: ClusterTrustProvider (`builtin-ca`, `external-pki`, `insecure-local-dev`)
 * - B1: CA-pinned `lgr_join_v1_` single-use / TTL join tokens & Ed25519 CSR enrollment
 * - 5C: `URI:lagrange://<clusterId>/node/<nodeId>` SAN + Ed25519 signed `IDENTIFY`
 * - D2: Symmetric `lagrange cert` and `lagrange cluster` CLI commands
 * - Live multi-node `MessageRouter` mTLS 1.3 (`wss://`), zero-downtime rotation,
 *   and all D12 adversarial rejection cases
 * - PostgreSQL `SCRAM-SHA-256`, `SCRAM-SHA-256-PLUS` (`tls-server-end-point`),
 *   and `cert` client certificate authentication.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';

import {
  X509_CA_ERROR_CODE,
  buildLagrangeSanUri,
  parseLagrangeSanUri,
  generateEd25519KeyPairPem,
  generateClusterRootCa,
  issueNodeCertificate,
  verifyNodeCertificate,
} from '../../src/transport/x509-ed25519-certificate-authority.js';
import {
  CLUSTER_TRUST_MODE,
  TRANSPORT_AUTH_ERROR_CODE,
  ClusterTrustProvider,
  validatePrivateKeyFilePermissions,
} from '../../src/transport/cluster-trust-provider.js';
import {
  JOIN_TOKEN_PREFIX,
  JOIN_TOKEN_ERROR_CODE,
  ClusterJoinTokenStore,
  createEnrollmentCsrProof,
} from '../../src/transport/cluster-join-token.js';
import {
  SCRAM_MECHANISM,
  PGWIRE_STRONG_AUTH_MODE,
  PGWIRE_SCRAM_ERROR_CODE,
  ScramSha256ServerSession,
  createScramCredentialRecord,
  createScramClientFirstMessage,
  createScramClientFinalMessage,
  createScramAndCertAuthenticator,
} from '../../src/runtime/pgwire-scram-authenticator.js';
import {PgWireAuthHandler} from '../../src/runtime/pgwire-auth-handler.js';
import {
  CERT_CLI_EXIT_CODE,
  runCertOrClusterCommand,
} from '../../src/cli/cert-command-router.js';
import {MessageRouter} from '../../src/transport/message-router.js';

async function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

describe('Q7: node-transport-authenticated-encryption', () => {
  describe('X.509v3 Ed25519 Certificate Authority & SAN URI Identity (5C)', () => {
    it('mints Root CA and leaf certificates with URI:lagrange://<clusterId>/node/<nodeId> and verifies signatures', () => {
      const ca = generateClusterRootCa({clusterId: 'cluster-alpha'});
      assert.ok(ca.caCertPem.includes('BEGIN CERTIFICATE'));
      assert.ok(ca.caKeyPem.includes('BEGIN PRIVATE KEY'));

      const leaf = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-alpha',
        nodeId: 'node-1',
      });
      assert.equal(leaf.sanUri, 'lagrange://cluster-alpha/node/node-1');
      assert.deepEqual(parseLagrangeSanUri(leaf.sanUri), {
        clusterId: 'cluster-alpha',
        nodeId: 'node-1',
        uri: 'lagrange://cluster-alpha/node/node-1',
      });

      const verified = verifyNodeCertificate({
        certPemOrDer: leaf.certPem,
        caCertPems: [ca.caCertPem],
        expectedClusterId: 'cluster-alpha',
        expectedNodeId: 'node-1',
      });
      assert.equal(verified.valid, true);
      assert.equal(verified.clusterId, 'cluster-alpha');
      assert.equal(verified.nodeId, 'node-1');
      assert.equal(verified.serialNumber, leaf.serialNumber);
    });

    it('rejects wrong CA, wrong clusterId, wrong nodeId, expired cert, and revoked serial', () => {
      const ca1 = generateClusterRootCa({clusterId: 'cluster-alpha'});
      const ca2 = generateClusterRootCa({clusterId: 'cluster-beta'});
      const leaf1 = issueNodeCertificate({
        caCertPem: ca1.caCertPem,
        caKeyPem: ca1.caKeyPem,
        clusterId: 'cluster-alpha',
        nodeId: 'node-1',
      });

      // Wrong CA
      const wrongCa = verifyNodeCertificate({
        certPemOrDer: leaf1.certPem,
        caCertPems: [ca2.caCertPem],
        expectedClusterId: 'cluster-alpha',
        expectedNodeId: 'node-1',
      });
      assert.equal(wrongCa.valid, false);
      assert.equal(wrongCa.code, X509_CA_ERROR_CODE.CERT_SIGNATURE_INVALID);

      // Wrong cluster
      const wrongCluster = verifyNodeCertificate({
        certPemOrDer: leaf1.certPem,
        caCertPems: [ca1.caCertPem],
        expectedClusterId: 'cluster-beta',
        expectedNodeId: 'node-1',
      });
      assert.equal(wrongCluster.valid, false);
      assert.equal(wrongCluster.code, X509_CA_ERROR_CODE.CERT_CLUSTER_MISMATCH);

      // Wrong nodeId (stolen peer cert)
      const wrongNode = verifyNodeCertificate({
        certPemOrDer: leaf1.certPem,
        caCertPems: [ca1.caCertPem],
        expectedClusterId: 'cluster-alpha',
        expectedNodeId: 'node-2',
      });
      assert.equal(wrongNode.valid, false);
      assert.equal(wrongNode.code, X509_CA_ERROR_CODE.CERT_NODE_ID_MISMATCH);

      // Expired certificate
      const expiredLeaf = issueNodeCertificate({
        caCertPem: ca1.caCertPem,
        caKeyPem: ca1.caKeyPem,
        clusterId: 'cluster-alpha',
        nodeId: 'node-expired',
        notBeforeMs: Date.now() - 120_000,
        notAfterMs: Date.now() - 60_000,
      });
      const expiredCheck = verifyNodeCertificate({
        certPemOrDer: expiredLeaf.certPem,
        caCertPems: [ca1.caCertPem],
        expectedClusterId: 'cluster-alpha',
        expectedNodeId: 'node-expired',
      });
      assert.equal(expiredCheck.valid, false);
      assert.equal(expiredCheck.code, X509_CA_ERROR_CODE.CERT_EXPIRED);

      // Revoked certificate serial
      const revokedCheck = verifyNodeCertificate({
        certPemOrDer: leaf1.certPem,
        caCertPems: [ca1.caCertPem],
        expectedClusterId: 'cluster-alpha',
        expectedNodeId: 'node-1',
        revokedSerialNumbers: new Set([leaf1.serialNumber]),
      });
      assert.equal(revokedCheck.valid, false);
      assert.equal(revokedCheck.code, X509_CA_ERROR_CODE.CERT_REVOKED);
    });
  });

  describe('ClusterTrustProvider (A3) & Private Key Permission Guard', () => {
    it('refuses insecure-local-dev on non-loopback bind hosts and peer addresses', () => {
      assert.throws(
        () =>
          new ClusterTrustProvider({
            mode: CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV,
            bindHost: '0.0.0.0',
          }),
        (err) =>
          err.code ===
          TRANSPORT_AUTH_ERROR_CODE.PLAINTEXT_NON_LOOPBACK_REFUSED,
      );

      const localDev = new ClusterTrustProvider({
        mode: CLUSTER_TRUST_MODE.INSECURE_LOCAL_DEV,
        bindHost: '127.0.0.1',
      });
      assert.equal(localDev.isTlsRequired(), false);
      assert.throws(
        () => localDev.validatePeerAddress('ws://10.24.0.12:9001'),
        (err) =>
          err.code ===
          TRANSPORT_AUTH_ERROR_CODE.PLAINTEXT_NON_LOOPBACK_REFUSED,
      );
    });

    it('enforces 0600 permissions on private key files', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lgr-q7-perm-'));
      try {
        const keyPath = path.join(tmpDir, 'node.key');
        fs.writeFileSync(keyPath, 'dummy-key', {mode: 0o644});
        fs.chmodSync(keyPath, 0o644);
        assert.throws(
          () => validatePrivateKeyFilePermissions(keyPath),
          (err) =>
            err.code === TRANSPORT_AUTH_ERROR_CODE.INSECURE_KEY_PERMISSIONS,
        );
        fs.chmodSync(keyPath, 0o600);
        assert.equal(validatePrivateKeyFilePermissions(keyPath), true);
      } finally {
        fs.rmSync(tmpDir, {recursive: true, force: true});
      }
    });

    it('signs and verifies Ed25519 IDENTIFY frames and rejects tampered or spoofed frames', () => {
      const ca = generateClusterRootCa({clusterId: 'cluster-sec'});
      const node1Cert = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-sec',
        nodeId: 'node-1',
      });
      const node2Cert = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-sec',
        nodeId: 'node-2',
      });

      const trust1 = new ClusterTrustProvider({
        mode: CLUSTER_TRUST_MODE.BUILTIN_CA,
        clusterId: 'cluster-sec',
        nodeId: 'node-1',
        caCertPem: ca.caCertPem,
        certPem: node1Cert.certPem,
        keyPem: node1Cert.keyPem,
      });
      const trust2 = new ClusterTrustProvider({
        mode: CLUSTER_TRUST_MODE.EXTERNAL_PKI,
        clusterId: 'cluster-sec',
        nodeId: 'node-2',
        caCertPem: ca.caCertPem,
        certPem: node2Cert.certPem,
        keyPem: node2Cert.keyPem,
      });

      const rawIdentify = {
        type: 'IDENTIFY',
        nodeId: 'node-1',
        nodeAddress: 'wss://127.0.0.1:9101',
        bootIncarnation: 7,
        timestamp: Date.now(),
      };
      const signed = trust1.signIdentifyFrame(rawIdentify);
      const verified = trust2.verifyIdentifyFrame(signed, node1Cert.certPem);
      assert.equal(verified.valid, true);
      assert.equal(verified.nodeId, 'node-1');

      // Spoofed nodeId using node-1's cert to claim node-3
      const spoofed = {...signed, nodeId: 'node-3'};
      const spoofCheck = trust2.verifyIdentifyFrame(spoofed, node1Cert.certPem);
      assert.equal(spoofCheck.valid, false);
      assert.equal(
        spoofCheck.code,
        TRANSPORT_AUTH_ERROR_CODE.PEER_NODE_ID_MISMATCH,
      );

      // Tampered bootIncarnation invalidates Ed25519 signature
      const tampered = {...signed, bootIncarnation: 999};
      const tamperedCheck = trust2.verifyIdentifyFrame(
        tampered,
        node1Cert.certPem,
      );
      assert.equal(tamperedCheck.valid, false);
      assert.equal(
        tamperedCheck.code,
        TRANSPORT_AUTH_ERROR_CODE.IDENTIFY_SIGNATURE_INVALID,
      );
    });
  });

  describe('CA-Pinned Single-Use / TTL Join Token & CSR Enrollment (B1)', () => {
    it('enrolls a candidate node via local Ed25519 CSR proof and rejects replay, expiry, revocation, and wrong CA fingerprint', () => {
      const ca = generateClusterRootCa({clusterId: 'cluster-enroll'});
      const store = new ClusterJoinTokenStore({
        clusterId: 'cluster-enroll',
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
      });

      const minted = store.mintJoinToken({ttlMs: 60_000, singleUse: true});
      assert.ok(minted.token.startsWith(JOIN_TOKEN_PREFIX));

      const candidateKeys = generateEd25519KeyPairPem();
      const csrProof = createEnrollmentCsrProof({
        clusterId: 'cluster-enroll',
        nodeId: 'node-joiner-1',
        tokenId: minted.tokenId,
        publicKeyPem: candidateKeys.publicKeyPem,
        privateKeyPem: candidateKeys.privateKeyPem,
      });

      const enrolled = store.enrollNodeWithJoinToken({
        joinToken: minted.token,
        csrProof,
      });
      assert.equal(enrolled.clusterId, 'cluster-enroll');
      assert.equal(enrolled.nodeId, 'node-joiner-1');
      assert.equal(
        enrolled.sanUri,
        buildLagrangeSanUri('cluster-enroll', 'node-joiner-1'),
      );

      // Replay of single-use token is rejected
      assert.throws(
        () => store.enrollNodeWithJoinToken({joinToken: minted.token, csrProof}),
        (err) => err.code === JOIN_TOKEN_ERROR_CODE.TOKEN_ALREADY_CONSUMED,
      );

      // Expired token is rejected
      const expiredToken = store.mintJoinToken({
        ttlMs: 1_000,
        singleUse: true,
        nowMs: 1_000,
      });
      const csr2 = createEnrollmentCsrProof({
        clusterId: 'cluster-enroll',
        nodeId: 'node-joiner-2',
        tokenId: expiredToken.tokenId,
        publicKeyPem: candidateKeys.publicKeyPem,
        privateKeyPem: candidateKeys.privateKeyPem,
      });
      assert.throws(
        () =>
          store.enrollNodeWithJoinToken({
            joinToken: expiredToken.token,
            csrProof: csr2,
            nowMs: 5_000,
          }),
        (err) => err.code === JOIN_TOKEN_ERROR_CODE.TOKEN_EXPIRED,
      );

      // Revoked token is rejected
      const revocable = store.mintJoinToken({ttlMs: 60_000, singleUse: true});
      store.revokeJoinToken(revocable.tokenId);
      const csr3 = createEnrollmentCsrProof({
        clusterId: 'cluster-enroll',
        nodeId: 'node-joiner-3',
        tokenId: revocable.tokenId,
        publicKeyPem: candidateKeys.publicKeyPem,
        privateKeyPem: candidateKeys.privateKeyPem,
      });
      assert.throws(
        () =>
          store.enrollNodeWithJoinToken({
            joinToken: revocable.token,
            csrProof: csr3,
          }),
        (err) => err.code === JOIN_TOKEN_ERROR_CODE.TOKEN_REVOKED,
      );

      // MITM seed CA certificate mismatch is rejected
      const mitmCa = generateClusterRootCa({clusterId: 'cluster-enroll'});
      const tokenForMitm = store.mintJoinToken({ttlMs: 60_000});
      const csr4 = createEnrollmentCsrProof({
        clusterId: 'cluster-enroll',
        nodeId: 'node-joiner-4',
        tokenId: tokenForMitm.tokenId,
        publicKeyPem: candidateKeys.publicKeyPem,
        privateKeyPem: candidateKeys.privateKeyPem,
      });
      assert.throws(
        () =>
          store.enrollNodeWithJoinToken({
            joinToken: tokenForMitm.token,
            csrProof: csr4,
            expectedSeedCaCertPem: mitmCa.caCertPem,
          }),
        (err) => err.code === JOIN_TOKEN_ERROR_CODE.CA_FINGERPRINT_MISMATCH,
      );
    });
  });

  describe('Live Multi-Node MessageRouter mTLS 1.3, Adversarial Rejections & Hot Rotation (D12)', () => {
    it('routes authenticated messages across a 3-node mTLS 1.3 cluster, rejects untrusted/wrong-cluster/stolen/expired/plaintext peers, and rotates certificates under load', async () => {
      const clusterId = 'cluster-mtls-live';
      const ca = generateClusterRootCa({clusterId});

      const [port1, port2, port3] = await Promise.all([
        getFreeTcpPort(),
        getFreeTcpPort(),
        getFreeTcpPort(),
      ]);

      const makeNodeTrust = (nodeId) => {
        const cert = issueNodeCertificate({
          caCertPem: ca.caCertPem,
          caKeyPem: ca.caKeyPem,
          clusterId,
          nodeId,
        });
        return new ClusterTrustProvider({
          mode: CLUSTER_TRUST_MODE.BUILTIN_CA,
          clusterId,
          nodeId,
          caCertPem: ca.caCertPem,
          certPem: cert.certPem,
          keyPem: cert.keyPem,
        });
      };

      const trust1 = makeNodeTrust('node-1');
      const trust2 = makeNodeTrust('node-2');
      const trust3 = makeNodeTrust('node-3');

      const router1 = new MessageRouter({
        nodeId: 'node-1',
        wsHost: '127.0.0.1',
        wsPort: port1,
        bootIncarnation: 1,
        trustProvider: trust1,
      });
      const router2 = new MessageRouter({
        nodeId: 'node-2',
        wsHost: '127.0.0.1',
        wsPort: port2,
        bootIncarnation: 1,
        trustProvider: trust2,
      });
      const router3 = new MessageRouter({
        nodeId: 'node-3',
        wsHost: '127.0.0.1',
        wsPort: port3,
        bootIncarnation: 1,
        trustProvider: trust3,
      });

      const authRejections = [];
      router1.on('authenticationRejected', (evt) => authRejections.push(evt));

      try {
        await router1.initialize({startServer: true});
        await router2.initialize({startServer: true});
        await router3.initialize({startServer: true});

        router2.register('node-2/service/echo-service', async (envelope) => ({
          echoedBy: 'node-2',
          received: envelope.payload.text,
        }));

        await router1.connectToNode('node-2', `wss://127.0.0.1:${port2}`);
        await router3.connectToNode('node-1', `wss://127.0.0.1:${port1}`);

        const reply1 = await router1.deliver(
          'node-2/service/echo-service',
          {text: 'hello-mtls'},
        );
        assert.deepEqual(reply1.answer, {
          echoedBy: 'node-2',
          received: 'hello-mtls',
        });

        // 1. Adversarial: Wrong CA peer rejected during mTLS handshake
        const rogueCa = generateClusterRootCa({clusterId});
        const rogueLeaf = issueNodeCertificate({
          caCertPem: rogueCa.caCertPem,
          caKeyPem: rogueCa.caKeyPem,
          clusterId,
          nodeId: 'node-rogue',
        });
        const rogueTrust = new ClusterTrustProvider({
          mode: CLUSTER_TRUST_MODE.BUILTIN_CA,
          clusterId,
          nodeId: 'node-rogue',
          caCertPem: rogueCa.caCertPem,
          certPem: rogueLeaf.certPem,
          keyPem: rogueLeaf.keyPem,
        });
        const rogueRouter = new MessageRouter({
          nodeId: 'node-rogue',
          wsHost: '127.0.0.1',
          bootIncarnation: 1,
          trustProvider: rogueTrust,
          connectTimeoutMs: 1500,
        });
        await assert.rejects(
          () =>
            rogueRouter.connectToNode('node-1', `wss://127.0.0.1:${port1}`, {
              autoReconnect: false,
            }),
        );

        // 2. Adversarial: Wrong-cluster certificate signed by the SAME CA key
        const wrongClusterLeaf = issueNodeCertificate({
          caCertPem: ca.caCertPem,
          caKeyPem: ca.caKeyPem,
          clusterId: 'other-cluster',
          nodeId: 'node-foreign',
        });
        const wrongClusterTrust = new ClusterTrustProvider({
          mode: CLUSTER_TRUST_MODE.BUILTIN_CA,
          clusterId: 'other-cluster',
          nodeId: 'node-foreign',
          caCertPem: ca.caCertPem,
          certPem: wrongClusterLeaf.certPem,
          keyPem: wrongClusterLeaf.keyPem,
        });
        const wrongClusterRouter = new MessageRouter({
          nodeId: 'node-foreign',
          wsHost: '127.0.0.1',
          bootIncarnation: 1,
          trustProvider: wrongClusterTrust,
          connectTimeoutMs: 1500,
        });
        await assert.rejects(
          () =>
            wrongClusterRouter.connectToNode(
              'node-1',
              `wss://127.0.0.1:${port1}`,
              {autoReconnect: false},
            ),
        );

        // 3. Adversarial: Stolen certificate with mismatched IDENTIFY nodeId
        const stolenWs = new WebSocket(`wss://127.0.0.1:${port1}`, {
          ...trust2.buildClientTlsOptions(),
        });
        await new Promise((resolve, reject) => {
          stolenWs.once('open', resolve);
          stolenWs.once('error', reject);
        });
        const closedPromise = new Promise((resolve) =>
          stolenWs.once('close', resolve),
        );
        // Send IDENTIFY claiming to be node-99 while presenting node-2's TLS cert
        stolenWs.send(
          JSON.stringify(
            trust2.signIdentifyFrame({
              type: 'identify',
              nodeId: 'node-99',
              nodeAddress: 'wss://127.0.0.1:9999',
              bootIncarnation: 1,
              timestamp: Date.now(),
            }),
          ),
        );
        await closedPromise;
        assert.equal(router1.nodeConnections.has('node-99'), false);
        assert.ok(
          authRejections.some(
            (r) =>
              r.code === TRANSPORT_AUTH_ERROR_CODE.PEER_NODE_ID_MISMATCH,
          ),
        );

        // 4. Adversarial: Plaintext ws:// downgrade attempt rejected
        const plainWs = new WebSocket(`ws://127.0.0.1:${port1}`);
        await assert.rejects(
          new Promise((resolve, reject) => {
            plainWs.once('open', () => resolve('unexpected-open'));
            plainWs.once('error', reject);
            plainWs.once('close', () =>
              reject(new Error('Plaintext socket closed by TLS server')),
            );
          }),
        );

        // 5. Zero-downtime hot certificate rotation on node-1 and node-2
        const rotatedCert1 = issueNodeCertificate({
          caCertPem: ca.caCertPem,
          caKeyPem: ca.caKeyPem,
          clusterId,
          nodeId: 'node-1',
        });
        const rotatedCert2 = issueNodeCertificate({
          caCertPem: ca.caCertPem,
          caKeyPem: ca.caKeyPem,
          clusterId,
          nodeId: 'node-2',
        });
        const rot1 = trust1.rotateNodeCertificate({
          certPem: rotatedCert1.certPem,
          keyPem: rotatedCert1.keyPem,
        });
        const rot2 = trust2.rotateNodeCertificate({
          certPem: rotatedCert2.certPem,
          keyPem: rotatedCert2.keyPem,
        });
        assert.equal(rot1.rotationEpoch, 2);
        assert.equal(rot2.rotationEpoch, 2);

        // Existing active connection between node-1 and node-2 continues serving traffic without drop
        const replyAfterRotate = await router1.deliver(
          'node-2/service/echo-service',
          {text: 'after-rotation'},
        );
        assert.deepEqual(replyAfterRotate.answer, {
          echoedBy: 'node-2',
          received: 'after-rotation',
        });
      } finally {
        await router3.shutdown();
        await router2.shutdown();
        await router1.shutdown();
      }
    });
  });

  describe('PostgreSQL Wire Strong Authentication: SCRAM-SHA-256, SCRAM-SHA-256-PLUS & cert', () => {
    it('authenticates SCRAM-SHA-256, SCRAM-SHA-256-PLUS (tls-server-end-point), and cert mTLS, and rejects MITM channel binding or wrong password', async () => {
      const ca = generateClusterRootCa({clusterId: 'cluster-pg'});
      const serverCert = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-pg',
        nodeId: 'pg-server',
      });
      const clientCert = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-pg',
        nodeId: 'alice',
      });

      const verifierRecord = createScramCredentialRecord('correct-horse-battery', {
        roles: ['analyst'],
      });
      const userVerifiers = new Map([['alice', verifierRecord]]);

      // 1. Explicit 4-step SCRAM-SHA-256-PLUS exchange with tls-server-end-point binding
      const serverSession = new ScramSha256ServerSession({
        userVerifiers,
        serverCertPemOrDer: serverCert.certPem,
      });
      const clientFirst = createScramClientFirstMessage({
        user: 'alice',
        mechanism: SCRAM_MECHANISM.SCRAM_SHA_256_PLUS,
      });
      const serverFirst = serverSession.handleClientFirst(
        clientFirst.clientFirstMessage,
      );
      const clientFinal = createScramClientFinalMessage({
        password: 'correct-horse-battery',
        clientFirstBare: clientFirst.clientFirstBare,
        serverFirstMessage: serverFirst.serverFirstMessage,
        gs2Header: clientFirst.gs2Header,
        serverCertPemOrDer: serverCert.certPem,
      });
      const serverFinal = serverSession.handleClientFinal(
        clientFinal.clientFinalMessage,
      );
      assert.equal(serverFinal.authenticated, true);
      assert.equal(
        serverFinal.serverFinalMessage,
        clientFinal.expectedServerFinalMessage,
      );

      // 2. MITM certificate substitution fails SCRAM-SHA-256-PLUS channel binding
      const mitmCert = issueNodeCertificate({
        caCertPem: ca.caCertPem,
        caKeyPem: ca.caKeyPem,
        clusterId: 'cluster-pg',
        nodeId: 'pg-mitm',
      });
      const mitmSession = new ScramSha256ServerSession({
        userVerifiers,
        serverCertPemOrDer: serverCert.certPem,
      });
      const mitmFirst = createScramClientFirstMessage({
        user: 'alice',
        mechanism: SCRAM_MECHANISM.SCRAM_SHA_256_PLUS,
      });
      const mitmSrvFirst = mitmSession.handleClientFirst(
        mitmFirst.clientFirstMessage,
      );
      const mitmFinal = createScramClientFinalMessage({
        password: 'correct-horse-battery',
        clientFirstBare: mitmFirst.clientFirstBare,
        serverFirstMessage: mitmSrvFirst.serverFirstMessage,
        gs2Header: mitmFirst.gs2Header,
        serverCertPemOrDer: mitmCert.certPem,
      });
      assert.throws(
        () => mitmSession.handleClientFinal(mitmFinal.clientFinalMessage),
        (err) => err.code === PGWIRE_SCRAM_ERROR_CODE.CHANNEL_BINDING_MISMATCH,
      );

      // 3. Integration with PgWireAuthHandler for SCRAM-SHA-256, SCRAM-SHA-256-PLUS, and cert
      const trustProvider = new ClusterTrustProvider({
        mode: CLUSTER_TRUST_MODE.BUILTIN_CA,
        clusterId: 'cluster-pg',
        nodeId: 'pg-server',
        caCertPem: ca.caCertPem,
        certPem: serverCert.certPem,
        keyPem: serverCert.keyPem,
      });
      const authenticator = createScramAndCertAuthenticator({
        userVerifiers,
        trustProvider,
        serverCertPemOrDer: serverCert.certPem,
      });
      const authHandler = new PgWireAuthHandler({
        authenticator,
        policy: {allowedActions: '*'},
        logger: {info() {}},
      });

      const scramAuthOk = await authHandler.authenticate({
        user: 'alice',
        database: 'tenant_a',
        password: 'correct-horse-battery',
        authMode: PGWIRE_STRONG_AUTH_MODE.SCRAM_SHA_256_PLUS,
      });
      assert.equal(scramAuthOk.authenticated, true);
      assert.deepEqual(scramAuthOk.context.roles, ['analyst']);

      const scramAuthBad = await authHandler.authenticate({
        user: 'alice',
        database: 'tenant_a',
        password: 'wrong-password',
        authMode: PGWIRE_STRONG_AUTH_MODE.SCRAM_SHA_256,
      });
      assert.equal(scramAuthBad.authenticated, false);
      assert.equal(scramAuthBad.context, null);

      const certAuthOk = await authHandler.authenticate({
        user: 'alice',
        database: 'tenant_a',
        authMode: PGWIRE_STRONG_AUTH_MODE.CERT,
        clientCertPem: clientCert.certPem,
      });
      assert.equal(certAuthOk.authenticated, true);
      assert.equal(certAuthOk.context.principal, 'alice');
    });
  });

  describe('Symmetric lagrange cert and lagrange cluster CLI Commands (D2)', () => {
    it('executes cluster init, cluster token create, cluster join, cert issue-node, cert rotate, and cert status with 0600 key permissions', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lgr-q7-cli-'));
      try {
        const initRes = runCertOrClusterCommand([
          'cluster',
          'init',
          '--cluster-id',
          'cluster-cli',
          '--node-id',
          'seed-1',
          '--out-dir',
          tmpDir,
        ]);
        assert.equal(initRes.exitCode, CERT_CLI_EXIT_CODE.OK);
        assert.ok(initRes.joinToken.startsWith(JOIN_TOKEN_PREFIX));
        assert.equal(
          fs.statSync(initRes.caKeyPath).mode & 0o077,
          0,
          'CA key must be 0600',
        );
        assert.equal(
          fs.statSync(initRes.nodeKeyPath).mode & 0o077,
          0,
          'Seed node key must be 0600',
        );

        const joinDir = path.join(tmpDir, 'node-2');
        const joinRes = runCertOrClusterCommand(
          [
            'cluster',
            'join',
            '--join-token',
            initRes.joinToken,
            '--node-id',
            'node-2',
            '--out-dir',
            joinDir,
          ],
          {tokenStore: initRes.tokenStore},
        );
        assert.equal(joinRes.exitCode, CERT_CLI_EXIT_CODE.OK);
        assert.equal(joinRes.sanUri, 'lagrange://cluster-cli/node/node-2');

        const statusRes = runCertOrClusterCommand([
          'cert',
          'status',
          '--cert',
          joinRes.certPath,
          '--ca-cert',
          joinRes.caCertPath,
          '--cluster-id',
          'cluster-cli',
          '--node-id',
          'node-2',
        ]);
        assert.equal(statusRes.exitCode, CERT_CLI_EXIT_CODE.OK);
        assert.equal(statusRes.valid, true);

        const rotateRes = runCertOrClusterCommand([
          'cert',
          'rotate',
          '--ca-cert',
          initRes.caCertPath,
          '--ca-key',
          initRes.caKeyPath,
          '--cluster-id',
          'cluster-cli',
          '--node-id',
          'node-2',
          '--out-dir',
          joinDir,
        ]);
        assert.equal(rotateRes.exitCode, CERT_CLI_EXIT_CODE.OK);
        assert.equal(rotateRes.rotated, true);
        assert.notEqual(rotateRes.serialNumber, joinRes.serialNumber);
      } finally {
        fs.rmSync(tmpDir, {recursive: true, force: true});
      }
    });
  });
});
