import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  isNodeLifecyclePublicationCompleted,
  isNodeLifecyclePublicationDeferred,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME,
} from './node-lifecycle-publication.js';
import {nodeLifecycleRequestFromMessage} from
  './node-lifecycle-publication-wire.js';

const {
  CONTROL_PLANE_MESSAGE_COMPLETION_FIELD,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  assertCritical,
  buildStaleNodeIncarnationError,
  getControlPlaneMessageCompletionKind,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const NODE_LIFECYCLE_INGRESS_LITERAL = Object.freeze({
  PUBLICATION_REQUIRED:
    'ReplicaDispatchService requires the node lifecycle publication owner',
});

const REFUSAL_ERROR_CODE = Object.freeze({
  [NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_SOURCE_CHANGED]:
    REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_SOURCE_CHANGED,
  [NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_TERMINAL_STATE]:
    REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_SOURCE_CHANGED,
  [NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_INCARNATION_REQUIRED]:
    REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_INCARNATION_REQUIRED,
});

function buildDurableCompletion(result, completionKind) {
  return {
    completionKind,
    completionCompleted: true,
    publicationOutcome: result.outcome,
    [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]: result.row,
    [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_OBSERVED_AT_MS]:
      result.observedAtMs,
  };
}

function buildDeferredCompletion(result, completionKind) {
  return {
    completionKind,
    completionCompleted: false,
    publicationOutcome: result.outcome,
    deferRetry: true,
    retryAfterMs: result.retryAfterMs,
  };
}

// A completed or deferred outcome becomes the message completion; a refusal
// has no completion and is raised as its typed error.
function resolveNodeLifecycleCompletion(result, completionKind) {
  return isNodeLifecyclePublicationCompleted(result.outcome) ?
    buildDurableCompletion(result, completionKind) :
    isNodeLifecyclePublicationDeferred(result.outcome) ?
      buildDeferredCompletion(result, completionKind) :
      null;
}

function buildRefusalError(code, request, result) {
  const error = new Error(code);
  error.code = code;
  error.nodeId = request.nodeId || null;
  error.knownIncarnation = result.knownIncarnation ?? null;
  return error;
}

const REPLICA_DISPATCH_STATE_PUBLICATION_METHODS = Object.freeze({
  /**
   * Routed ingress adapter: the receiving message-group replica publishes the
   * node lifecycle request itself. It neither forwards to the message-group
   * leader nor reacts to the write; membership follow-ups are driven by the
   * NODES cache/CDC triggers.
   * @param {Object} payload - NODE_STATE_UPDATE message payload.
   * @return {Promise<Object>} Durable or deferred message completion.
   */
  async publishNodeLifecycleMessage(payload) {
    const publication = assertCritical(
      this.nodeLifecyclePublication,
      NODE_LIFECYCLE_INGRESS_LITERAL.PUBLICATION_REQUIRED,
    );
    const request = nodeLifecycleRequestFromMessage(payload);
    const result = await publication.publish(request);
    const completion = resolveNodeLifecycleCompletion(
      result,
      getControlPlaneMessageCompletionKind(payload?.type),
    );
    if (completion) {
      return completion;
    }
    return this.throwNodeLifecycleRefusal(request, result);
  },

  throwNodeLifecycleRefusal(request, result) {
    if (result.outcome ===
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_STALE_INCARNATION) {
      throw buildStaleNodeIncarnationError({
        nodeId: request.nodeId,
        receivedIncarnation: request.bootIncarnation,
        knownIncarnation: result.knownIncarnation,
      });
    }
    if (result.outcome ===
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_ROW_MISSING) {
      throw this.buildMissingNodeRowError(request.nodeId);
    }
    throw buildRefusalError(
      REFUSAL_ERROR_CODE[result.outcome],
      request,
      result,
    );
  },
});

export {REPLICA_DISPATCH_STATE_PUBLICATION_METHODS};
