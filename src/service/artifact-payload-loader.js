/**
 * Node-local artifact loader chain (brief
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1
 * "Artifact Loading"): resolve component bytes in the order
 *
 *   1. node-local content-addressed cache (disposable),
 *   2. internal cluster-owned payload store (source of truth after
 *      installation) — fully verified read, then ATOMIC population of
 *      the node cache so the next activation is a cache hit,
 *   3. external source through the resolver (repair path only; its
 *      typed remote-provider-missing refusal is the honest "repair
 *      source absent" outcome).
 *
 * Composition-gated like INSTALL-time internalization: an owner without
 * an attached store skips step 2 entirely (pre-store behavior). A
 * sealed payload that does not belong to the requested artifact or is
 * not a wasm component payload fails closed typed; nothing is written
 * to the cache on any verification failure.
 */

import {EXTERNAL_SERVICE_MEDIA_TYPE} from './external-service-manifest.js';
import {
  ARTIFACT_PAYLOAD_ERROR_CODE,
  ArtifactPayloadStoreError,
} from './artifact-payload-store.js';

const ARTIFACT_PAYLOAD_LOADER_MESSAGE = Object.freeze({
  ARTIFACT_IDENTITY_MISMATCH:
    'the sealed payload does not belong to the requested artifact digest',
  MEDIA_TYPE_NOT_WASM:
    'the sealed payload media type is not the wasm component media type',
});

// Verified store read (owner side only — one truth per decision, no
// node-copy access in this function): discover the sealed payload for
// the artifact, reassemble and verify it, and cross-check its artifact
// identity and wasm media type against the request. Returns the
// explicit miss variant when the store has no sealed payload.
async function readVerifiedSealedPayloadIfFound(store, target) {
  const lookup = await store.findSealedPayloadByArtifactDigest(
    target.artifactDigest,
  );
  if (!lookup.found) {
    return {found: false};
  }
  const payloadDigest = lookup.payload.payloadDigest;
  const sealed = await store.getSealedPayload(payloadDigest);
  if (sealed.artifactDigest !== target.artifactDigest) {
    throw new ArtifactPayloadStoreError(
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      ARTIFACT_PAYLOAD_LOADER_MESSAGE.ARTIFACT_IDENTITY_MISMATCH,
      {
        artifactDigest: target.artifactDigest,
        payloadDigest,
      },
    );
  }
  if (sealed.mediaType !== EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT) {
    throw new ArtifactPayloadStoreError(
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      ARTIFACT_PAYLOAD_LOADER_MESSAGE.MEDIA_TYPE_NOT_WASM,
      {mediaType: sealed.mediaType, payloadDigest},
    );
  }
  return {found: true, payloadDigest, sealed};
}

// Node-copy population (disposable side only): atomically persist the
// already-verified sealed bytes into the node-local content-addressed
// cache (temp file + rename inside persist) so the next activation is
// a local hit. The cache is a copy of the store's truth, never an
// alternative source for the decision above.
async function persistVerifiedNodeCopy(componentCache, target, verified) {
  if (componentCache) {
    await componentCache.persist(
      target.artifactDigest,
      {
        digest: verified.payloadDigest,
        mediaType: verified.sealed.mediaType,
        size: verified.sealed.totalSize,
      },
      verified.sealed.bytes,
    );
  }
  return {
    bytes: verified.sealed.bytes,
    payloadDigest: verified.payloadDigest,
  };
}

/**
 * Load one component payload through the cache -> internal store ->
 * external repair chain.
 *
 * @param {object} owner ServiceLifecycleCommandOwner instance carrying
 *   artifactResolver and (optionally) artifactPayloadStore
 * @param {object} target the loadComponentArtifact payload request
 *   {artifactDigest, manifest}
 * @return {Promise<object>} {bytes, payloadDigest} — the exact shape
 *   the resolver's loadComponentPayload returns
 */
const TYPE_FUNCTION = 'function';

// Composition gate for the node-copy surface: a resolver assembled
// without a component cache (bare test fixtures, cacheless deployments)
// simply has no tier-1 copy and no tier-2 populate step.
function nodeCopySurface(resolver) {
  const componentCache = resolver.componentCache;
  return typeof componentCache?.load === TYPE_FUNCTION &&
    typeof componentCache?.persist === TYPE_FUNCTION ?
    componentCache :
    null;
}

// Tier 1 — the disposable node-local copy. A hit is the same immutable
// content-addressed payload (re-verified on load), never an alternative
// truth: on a miss the chain falls through to the owning store.
async function probeNodeCopyTier(componentCache, target) {
  if (!componentCache) {
    return {found: false};
  }
  const cached = await componentCache.load(target.artifactDigest);
  return cached ?
    {found: true, payload: cached} :
    {found: false};
}

async function loadComponentPayloadThroughStore(owner, target) {
  const resolver = owner.artifactResolver;
  const componentCache = nodeCopySurface(resolver);
  const nodeCopy = await probeNodeCopyTier(componentCache, target);
  if (nodeCopy.found) {
    return nodeCopy.payload;
  }
  // Tier 2 — the cluster-owned internal store (the durable owner after
  // installation), composition-gated. Verification happens entirely on
  // the store side; only already-verified bytes reach the node copy.
  const store = owner.artifactPayloadStore;
  if (store) {
    const verified = await readVerifiedSealedPayloadIfFound(store, target);
    if (verified.found) {
      return persistVerifiedNodeCopy(componentCache, target, verified);
    }
  }
  // Tier 3 — external repair through the resolver; its typed
  // remote-provider-missing refusal is the honest repair-absent outcome.
  return resolver.loadComponentPayload(target);
}

export {loadComponentPayloadThroughStore};
