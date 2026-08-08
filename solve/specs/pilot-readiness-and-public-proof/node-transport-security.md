# Detailed design: Node transport authenticated encryption

Quest: `node-transport-authenticated-encryption` (Q7, gate). Requirements
contract: [`requirements.md`](requirements.md) "Node transport security".
Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12.

Verified baseline: the message router is a plain `ws` `WebSocketServer`
(`src/transport/message-router-server-lifecycle.js`); the IDENTIFY handshake
accepts self-declared node identity guarded only by admission toggles and the
boot-incarnation fence; TLS exists in the repo only for pgwire.

## Owner boundaries touched

- `src/transport/message-router-server-lifecycle.js` — server start/stop;
  gains the TLS server composition (wss). Stays the one server owner.
- `src/transport/message-router-connection-authority.js` — dial/accept and
  IDENTIFY authority; gains the peer-certificate identity check before
  MessageRouter adoption.
- `src/transport/message-router-admission-controls.js` and
  `src/bootstrap/owners/bootstrap-join-admission-owner.js` — admission record
  the certificate identity is bound to.
- `src/transport/bulk-transfer-channel.js` (with
  `src/raft/bulk-connection-transfer-socket.js`) — the second per-peer
  WebSocket (`channel: bulk`) shares the same trust owner: join, reconnect,
  bulk snapshot, and ordinary channels use one TLS composition (D11).
- `src/bootstrap/cluster-incarnation-fence.js` — boot incarnation remains an
  IDENTIFY-level fence; certificates deliberately do not encode incarnation.
- `src/bootstrap/phases/seed-registration-phase.js` — mints `clusterId`
  today; the cluster CA is minted alongside it.
- Precedent (not the owner): `src/runtime/pgwire-tls-context.js` shows the
  house pattern for loading TLS material outside `runtime_config` into a
  `tls.SecureContext`; node transport gets its own trust owner, not a pgwire
  dependency.

## Contract shape

### Trust model

- **Cluster CA.** One CA per cluster, minted by the seed at cluster creation
  next to `clusterId`. The CA signs per-node certificates only; it is the
  sole trust anchor for node-to-node transport.
- **Per-node certificate.** Issued through the admission flow when a join is
  granted. Identity is encoded in the certificate (SAN URI):
  `lagrange://<clusterId>/<nodeId>`. The certificate binds *logical* node
  identity — never a network address — so address changes are preserved
  without accepting identity changes.
- **mTLS everywhere.** Both directions of every node channel present and
  verify certificates chained to the cluster CA. Verification happens before
  MessageRouter adoption; an unauthenticated socket never reaches IDENTIFY
  dispatch.
- **Identity binding.** Three identities must agree or the connection is
  refused: TLS peer certificate identity, IDENTIFY-declared identity, and
  the admission record. Boot incarnation stays in IDENTIFY (certificates
  survive restarts; the incarnation fence still kills stale processes).

### Bootstrap and first-node trust

The seed self-issues its certificate from the CA it minted. A joining node
receives the CA bundle and its own certificate through the admission flow;
the operator-provided join material carries the CA fingerprint so the
joiner's first contact verifies the seed before trusting anything it is
handed. Exact join-material format is **open** (below); the invariant is
sealed: no node adopts a peer it cannot cryptographically attribute to the
cluster CA, including on first contact.

### Rotation

- Certificates are rotated by issuing a successor over the already
  authenticated channel before expiry; an overlap window accepts old and new.
- Rotation swaps the `SecureContext` on the existing server and redials
  clients on the same composition — it never opens a second listener,
  per-channel trust model, or parallel transport path (D11).
- Expiry and trust-state diagnostics (fingerprint, notAfter, last verify
  failure reason) are exposed; private keys and secrets are never logged.

### Insecure mode containment

Plaintext transport becomes test-only or an explicit local-development mode
that can only bind loopback — it cannot bind externally by accident. The
default production composition refuses plaintext outright.

## Failure semantics (D12)

All refusals happen before MessageRouter adoption, with typed operator-
readable reasons and no secret material in logs. Required attack cases,
each red in the multi-node scenario:

- Unknown CA / untrusted chain; expired certificate.
- Wrong-cluster certificate (`clusterId` mismatch in SAN).
- Stolen certificate with mismatched node identity (cert nodeId ≠ IDENTIFY
  nodeId, or ≠ admission record).
- Plaintext downgrade attempt against a secure listener.
- Rotation during load: connections stay up or reconnect under the same
  identity; no window accepts an unauthenticated peer.
- The mTLS-green baseline: multi-node scenarios (join, reconnect, bulk
  snapshot, ordinary traffic) pass under mTLS.

## Non-goals and edition boundaries

- Core cluster safety, lands in the AGPL runtime (D8): nodes must be unable
  to trust an unauthenticated peer in every edition.
- External per `edition-matrix.md`: OIDC/SAML, customer RBAC, policy
  providers, secrets/KMS integration, hostile multi-tenancy (D8); no
  backup/cross-region coupling (D9).
- No parallel transport stack, no per-channel trust model (D11).
- pgwire client-facing TLS is out of scope here; only node-to-node transport.

## Open decisions left to the Quest

- Join-material format: how the CA fingerprint and one-time credential reach
  the joining operator (token shape, delivery, single-use enforcement).
- CA key custody: online on the seed vs operator-held; certificate lifetime
  and overlap-window defaults.
- Revocation strategy: short-lived certificates (recommended — rotation is
  already required) vs an explicit revocation list.
- On-disk key material location and permissions (following the
  `pgwire-tls-context.js` outside-`runtime_config` pattern).
- Whether the admission record stores the certificate fingerprint or the
  full leaf for audit.
