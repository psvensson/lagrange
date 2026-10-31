---
audience: development
documentClass: planning
---

# Node Transport Security, Cluster Trust, and PostgreSQL Authentication (Q7)

Epic: [pilot-readiness-and-public-proof](../../epics/pilot-readiness-and-public-proof.md)
Parent requirements: [requirements.md](requirements.md)
Roadmap rows: `RM-0.5-pilot-transport-security`, `RM-0.5-pilot-pg-authentication`,
`RM-0.5-cde-cluster-init`, `RM-0.5-cde-cluster-join`, `RM-0.5-cde-node-start`

## 1. Locked-in architectural decisions (2026-10-31)

| Axis | Locked-in choice | Summary |
| --- | --- | --- |
| 5A. Cluster CA & trust root | **A3: Pluggable `ClusterTrustProvider`** | Built-in `_raft_cp` Issuing CA by default (zero-dependency out-of-the-box mTLS), with external cert-file override (`--tls-ca-cert`, `--tls-cert`, `--tls-key`) for Kubernetes cert-manager / Vault PKI / SPIFFE |
| 5B. First-node & join enrollment | **B1: Join token with CA fingerprint + CSR** | `lgr_join_v1_<base64url>` embeds cluster ID, seed endpoint, CA SHA-256 fingerprint, and one-time HMAC secret; joiner generates its Ed25519 key locally, pins the seed TLS cert to the CA fingerprint, and submits a CSR (`POST /bootstrap/enroll`) |
| 5C. Peer identity & rotation | **5C: Hierarchical SAN URI + signed `IDENTIFY`** | X.509 SAN URI `lagrange://<clusterId>/node/<nodeId>` (extensible to `/service/<serviceId>/revision/<revisionId>/cell/<cellId>` for 0.6 OCI) plus an Ed25519-signed `IDENTIFY` envelope binding `bootIncarnationId` and `membershipEpoch` (reusable in 0.7 NATS and 0.8 Veilid) |
| 5D. Operator CLI contract | **D2: Composable `init` / `join` + idempotent `start`** | `lagrange cluster init` (initializes seed state/CA and prints join token), `lagrange cluster join` (enrolls via CSR and writes node bundle), and `lagrange node start` (idempotent daemon entrypoint with optional `--init` / `--join-token` flags for containers) |
| 4. PostgreSQL authentication | **Full PostgreSQL auth in 0.5** | `SCRAM-SHA-256`, `SCRAM-SHA-256-PLUS` (`tls-server-end-point`), `cert` (mTLS client cert verification), `password` over TLS, loopback `trust`, and durable role/verifier management |

## 2. Pluggable `ClusterTrustProvider` (`A3`)

1. **Built-in `_raft_cp` Issuing CA (default mode):**
   - On `lagrange cluster init`, the seed node generates an Ed25519 Cluster Root / Issuing CA and a seed node leaf certificate (`lagrange://<clusterId>/node/<seedNodeId>`), persisting the local node trust bundle under `<dataDir>/tls/` (`ca.crt`, `node.crt`, `node.key` with `0600` permissions) and replicating the CA record and issued node certificate serials/fingerprints in `_raft_cp`.
   - Zero external PKI tooling is required for local multi-node, Docker Compose, or single-binary evaluations.
2. **External PKI file/dir mode (`--tls-ca-cert`, `--tls-cert`, `--tls-key`):**
   - When external certificate paths are configured, `ClusterTrustProvider` loads the CA bundle, leaf certificate, and private key from disk and watches for atomic rotation (such as Kubernetes `Secret` symlink swaps from `cert-manager` or SPIFFE/Vault agents) to reload `tls.SecureContext` in place without dropping active connections.
   - In 1.2 (Enterprise), `ClusterTrustProvider` can be backed by cloud KMS/HSM (`AWS KMS`, `GCP Cloud KMS`, `Vault PKI`) without changing transport or routing code.

## 3. Bootstrap trust & CSR enrollment (`B1`)

1. **Join token format (`lgr_join_v1_<base64url>`):**
   - Contains JSON payload `{v: 1, clusterId, seedUrl, caSha256, tokenId, secret, expiresAtMs}`.
   - Stored in `_raft_cp` (`cluster_join_tokens` table) with single-use or bounded-TTL semantics and explicit revocation support.
2. **Zero-trust TLS pinning and CSR exchange:**
   - The joining node generates its own Ed25519 private key (`node.key`) locally; private keys never traverse the network.
   - The joiner connects to `seedUrl` over HTTPS, verifying that the server certificate chain is signed by the CA whose SHA-256 digest matches `caSha256` from the join token (preventing MITM on untrusted networks).
   - The joiner submits `POST /bootstrap/enroll` with `{tokenId, secret, nodeId, publicKeyPem, csrProofSignature}`.
   - The seed validates the token in `_raft_cp`, records the node's `publicKeyFingerprint` and `issuedCertSerial` in the durable node admission record, and returns `{caCertPem, nodeCertPem, clusterId, membershipEpoch}`.

## 4. Peer identity binding, `IDENTIFY` handshake, and rotation (`5C`)

1. **Hierarchical X.509 SAN URI:**
   - Every node certificate carries `subjectAltName = URI:lagrange://<clusterId>/node/<nodeId>`.
   - In 0.6 (`RM-0.6-native-oci-call-cells`), the same CA and `ClusterTrustProvider` issue short-lived workload certificates with `URI:lagrange://<clusterId>/service/<serviceId>/revision/<revisionId>/cell/<cellId>` to authenticate the OCI container broker stream.
2. **Transport-agnostic signed `IDENTIFY` envelope:**
   - Every inter-node channel (`WebSocketServerTransport`, `WebSocketClientPool`, `BulkTransferService`, and future 0.7 NATS / 0.8 Veilid channels) exchanges an Ed25519-signed `IDENTIFY` frame immediately upon connection establishment:
     `{clusterId, nodeId, bootIncarnationId, membershipEpoch, certSerial, timestampMs, nonce, signature}`.
   - `MessageRouter` refuses adoption until both the TLS peer certificate SAN URI (`lagrange://<clusterId>/node/<nodeId>`) and the `IDENTIFY` signature match the claimed `nodeId`, `clusterId`, and active `membershipEpoch`.
   - Address changes (`host:port`) preserve identity only when presented with a valid certificate and `IDENTIFY` signature for that `nodeId`.
3. **Hitless rotation & revocation:**
   - Certificates renew before expiry (`--tls-cert-ttl-ms`, default 30 days in built-in CA mode; configurable down to seconds in tests).
   - Both `WebSocketServerTransport` and `WebSocketClientPool` hot-reload `tls.SecureContext` on rotation.
   - Compromised or decommissioned nodes are added to the `_raft_cp` revocation list (`revokedCertSerials`), immediately rejecting new handshakes and terminating existing sockets for that serial.
4. **Plaintext restriction:**
   - Production default requires `tlsMode: 'mtls'`.
   - Plaintext (`--insecure-local-dev`) is refused unless the bind address is loopback (`127.0.0.1` / `::1`) or an explicit test harness flag is set.

## 5. Operator CLI contract (`D2`)

1. `lagrange cluster init --data-dir <dir> [--cluster-id <id>] [--listen <addr>]`:
   - Initializes `<dir>`, bootstraps the `_raft_cp` Issuing CA and seed node certificate (or validates external `--tls-*` files), writes `<dir>/node-config.json`, and outputs the `lgr_join_v1_...` join token.
2. `lagrange cluster join --data-dir <dir> --join-token <token> [--node-id <id>] [--listen <addr>]`:
   - Generates the node's local Ed25519 keypair, completes CSR enrollment against the seed pinned by `caSha256`, writes `<dir>/tls/{ca.crt,node.crt,node.key}` and `<dir>/node-config.json`.
3. `lagrange node start --data-dir <dir> [--init | --join-token <token>]`:
   - Starts the node daemon from `<dir>/node-config.json`.
   - When `--init` or `--join-token` is supplied and `<dir>/node-config.json` does not yet exist, runs the corresponding `init` or `join` step idempotently before starting (enabling single-command Docker Compose and Kubernetes StatefulSet entrypoints).

## 6. Full PostgreSQL wire authentication (`RM-0.5-pilot-pg-authentication`)

1. **`SCRAM-SHA-256` and `SCRAM-SHA-256-PLUS`:**
   - Full RFC 5802 / RFC 7677 SASL handshake (`AuthenticationSASL` -> `SASLInitialResponse` -> `AuthenticationSASLContinue` -> `SASLResponse` -> `AuthenticationSASLFinal`) with `tls-server-end-point` channel binding when TLS is active.
   - Role credentials are stored as salted PBKDF2-HMAC-SHA256 `StoredKey` and `ServerKey` verifiers (`SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>`) in the durable system catalog, never plaintext passwords.
2. **`cert` (mTLS client certificate authentication):**
   - Verifies the client TLS certificate against the configured client CA and maps the certificate Subject CN or SAN URI to the authenticated PostgreSQL role and tenant context.
3. **`password` (cleartext over TLS) and loopback `trust`:**
   - `password` mode is permitted only over an active TLS connection unless explicitly overridden for local testing.
   - `trust` mode is restricted to loopback (`127.0.0.1` / `::1`) local development.
4. **Required negative controls:**
   - Wrong password, wrong SCRAM server signature, channel-binding mismatch, untrusted/expired client certificate, wrong-CA node certificate, stolen node certificate with mismatched `nodeId`, and plaintext connection attempts against an `mtls`/`scram-sha-256` listener must all fail closed with deterministic error codes.
