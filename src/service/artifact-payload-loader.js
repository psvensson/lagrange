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

// Verified store read: reassemble and verify the sealed payload, cross-
// check its artifact identity and wasm media type against the request,
// atomically populate the node cache (temp file + rename inside
// persist), and return the resolver's loadComponentPayload shape.
async function materializeSealedPayload(componentCache, store, target) {
  const sealed = await store.getSealedPayload(target.payloadDigest);
  if (sealed.artifactDigest !== target.artifactDigest) {
    throw new ArtifactPayloadStoreError(
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      ARTIFACT_PAYLOAD_LOADER_MESSAGE.ARTIFACT_IDENTITY_MISMATCH,
      {
        artifactDigest: target.artifactDigest,
        payloadDigest: target.payloadDigest,
      },
    );
  }
  if (sealed.mediaType !== EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT) {
    throw new ArtifactPayloadStoreError(
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      ARTIFACT_PAYLOAD_LOADER_MESSAGE.MEDIA_TYPE_NOT_WASM,
      {mediaType: sealed.mediaType, payloadDigest: target.payloadDigest},
    );
  }
  await componentCache.persist(
    target.artifactDigest,
    {
      digest: target.payloadDigest,
      mediaType: sealed.mediaType,
      size: sealed.totalSize,
    },
    sealed.bytes,
  );
  return {bytes: sealed.bytes, payloadDigest: target.payloadDigest};
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
async function loadComponentPayloadThroughStore(owner, target) {
  const resolver = owner.artifactResolver;
  const cached = await resolver.componentCache.load(target.artifactDigest);
  if (cached) {
    return cached;
  }
  const store = owner.artifactPayloadStore || null;
  if (store) {
    const lookup = await store.findSealedPayloadByArtifactDigest(
      target.artifactDigest,
    );
    if (lookup.found) {
      return materializeSealedPayload(resolver.componentCache, store, {
        artifactDigest: target.artifactDigest,
        payloadDigest: lookup.payload.payloadDigest,
      });
    }
  }
  return resolver.loadComponentPayload(target);
}

export {loadComponentPayloadThroughStore};
