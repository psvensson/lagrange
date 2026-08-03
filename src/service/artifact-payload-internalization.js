/**
 * INSTALL-time artifact payload internalization (brief
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1
 * "Installation State Machine"): an Artifact must not become bindable
 * before all payload bytes are durable and verified, so the WASM
 * component payload is fetched through the resolver's verified
 * acquisition surface and sealed into the cluster-owned payload store
 * AFTER artifact resolution succeeds and BEFORE any catalog row is
 * written. A failure here propagates typed and leaves no catalog rows
 * and no bindable Artifact; byte-identical retries converge to the
 * store's alreadySealed idempotent success.
 *
 * Composition-gated: an absent store on the command owner skips
 * internalization entirely (pre-store behavior; production attaches the
 * store at the SQL-runtime handoff via
 * src/bootstrap/shared/artifact-payload-store-setup.js). Scope is
 * wasm_component payloads only (brief §1 "OCI Containers"): a resolved
 * artifact without a payloadDescriptor — an OCI container — is skipped.
 */

const INTERNALIZATION_SKIP_REASON = Object.freeze({
  NO_PAYLOAD_DESCRIPTOR: 'no_payload_descriptor',
  STORE_ABSENT: 'store_absent',
});

function skipped(reason) {
  return Object.freeze({internalized: false, reason});
}

/**
 * Internalize one resolved artifact's payload bytes into the store.
 *
 * @param {object} options {store (artifact payload store or null),
 *   resolved (the resolver's resolve() RESOLVED result), acquireBytes
 *   (async ({location, payloadDescriptor, sourceKind}) => Buffer over
 *   the resolver's verified acquisition path)}
 * @return {Promise<object>} frozen {internalized: false, reason} or
 *   {internalized: true, alreadySealed, chunkCount, payloadDigest,
 *   totalSize}
 */
async function internalizeResolvedArtifact(options = {}) {
  const {acquireBytes, resolved, store} = options;
  const artifact = resolved?.artifact || null;
  const payloadDescriptor = artifact?.payloadDescriptor || null;
  if (!store) {
    return skipped(INTERNALIZATION_SKIP_REASON.STORE_ABSENT);
  }
  if (!payloadDescriptor) {
    return skipped(INTERNALIZATION_SKIP_REASON.NO_PAYLOAD_DESCRIPTOR);
  }
  const bytes = await acquireBytes({
    location: artifact.location,
    payloadDescriptor,
    sourceKind: artifact.sourceKind,
  });
  const sealed = await store.putPayload({
    artifactDigest: artifact.digest,
    bytes,
    mediaType: artifact.payloadMediaType,
    payloadDigest: payloadDescriptor.digest,
  });
  return Object.freeze({
    alreadySealed: sealed.alreadySealed === true,
    chunkCount: sealed.chunkCount,
    internalized: true,
    payloadDigest: sealed.payloadDigest,
    totalSize: sealed.totalSize,
  });
}

/**
 * Command-owner seam: internalize the freshly resolved INSTALL/UPGRADE
 * artifact through the owner's attached store and resolver. An absent
 * store performs no store interaction at all (existing behavior).
 *
 * @param {object} owner ServiceLifecycleCommandOwner instance carrying
 *   artifactResolver and (optionally) artifactPayloadStore
 * @param {object} resolvedArtifact the owner's resolveArtifact() result
 * @return {Promise<object>} the internalizeResolvedArtifact summary
 */
async function internalizeInstallPayload(owner, resolvedArtifact) {
  if (!owner.artifactPayloadStore) {
    return skipped(INTERNALIZATION_SKIP_REASON.STORE_ABSENT);
  }
  return internalizeResolvedArtifact({
    acquireBytes: (target) =>
      owner.artifactResolver.acquireComponentBytes(target),
    resolved: resolvedArtifact,
    store: owner.artifactPayloadStore,
  });
}

export {
  INTERNALIZATION_SKIP_REASON,
  internalizeInstallPayload,
  internalizeResolvedArtifact,
};
