// Retained producer admission for one exact PartitionService. The existing
// producer supplies its currentness assertion; no current-ID lookup grants it.
const RUNTIME_INCARNATION_FIELDS = Object.freeze([
  'service_id', 'replica_id', 'partition_id', 'node_id', 'group_id',
  'created_at', 'create_attempt_token',
]);
const PARTITION_RUNTIME_PUBLICATION_REFUSED = 'PARTITION_RUNTIME_PUBLICATION_REFUSED';
const PUBLICATION_STATE = Object.freeze({ADMITTED: 'admitted', HOSTING: 'hosting',
  HOSTED: 'hosted', PUBLISHING: 'publishing', PUBLISHED: 'published', REFUSED: 'refused'});

function runtimeIncarnation(row) {
  return Object.freeze(Object.fromEntries(RUNTIME_INCARNATION_FIELDS.map(
    (field) => [field, row[field]],
  )));
}

function matchesRuntimeIncarnation(incarnation, row) {
  return Boolean(incarnation && row) && RUNTIME_INCARNATION_FIELDS.every(
    (field) => incarnation[field] === row[field],
  );
}

function runtimePublicationRefused(replicaId) {
  return Object.assign(new Error(`Partition runtime publication refused for ${replicaId}`), {
    code: PARTITION_RUNTIME_PUBLICATION_REFUSED,
    errorCode: PARTITION_RUNTIME_PUBLICATION_REFUSED,
    deferRetry: true,
  });
}

function samePublicationDestination(left, right) {
  return left.handler === right.handler && left.owner === right.owner &&
    left.localServices === right.localServices && left.localReplicas === right.localReplicas;
}

function createRuntimePublication({incarnation, assertSourceCurrent,
  assertLifecycleOwner, assertDestination}, original) {
  if (!incarnation || typeof assertSourceCurrent !== 'function' ||
      !original && (typeof assertLifecycleOwner !== 'function' ||
        typeof assertDestination !== 'function') ||
      !Number.isSafeInteger(incarnation.created_at) ||
      incarnation.service_id !== incarnation.replica_id || incarnation.group_id !== null ||
      !(incarnation.create_attempt_token === null ||
        typeof incarnation.create_attempt_token === 'string' &&
          incarnation.create_attempt_token.length > 0) ||
      !['service_id', 'replica_id', 'partition_id', 'node_id'].every(
        (field) => typeof incarnation[field] === 'string' && incarnation[field].length > 0)) {
    throw runtimePublicationRefused(incarnation?.service_id);
  }
  const source = runtimeIncarnation(incarnation);
  let runtime = null;
  let publication = Object.freeze({state: PUBLICATION_STATE.ADMITTED});
  const capability = Object.freeze({incarnation: source,
    bind(service) {
      if (runtime !== null && runtime !== service ||
          service?.replicaId !== source.replica_id ||
          service.partitionId !== source.partition_id || service.nodeId !== source.node_id) {
        throw runtimePublicationRefused(source.service_id);
      }
      runtime = service;
      this.assertCurrent(service);
    },
    assertCurrent(service) {
      if (service !== runtime || service?.isShutdown === true) {
        throw runtimePublicationRefused(source.service_id);
      }
      if (publication.state === PUBLICATION_STATE.ADMITTED) {
        assertSourceCurrent(service);
      } else if (publication.state === PUBLICATION_STATE.HOSTED) {
        assertSourceCurrent(service);
        publication.assertCurrent(service, publication.destination);
      } else if (publication.state === PUBLICATION_STATE.PUBLISHED) {
        publication.assertCurrent(service, publication.binding);
      } else {
        throw runtimePublicationRefused(source.service_id);
      }
      return true;
    },
    assertLifecycleOwner(service, owner) {
      this.assertCurrent(service);
      if (publication.state === PUBLICATION_STATE.PUBLISHED) {
        if (publication.binding.owner !== owner) throw runtimePublicationRefused(source.service_id);
      } else if (publication.state === PUBLICATION_STATE.HOSTED) {
        if (publication.destination.owner !== owner) throw runtimePublicationRefused(source.service_id);
      } else if (original) {
        throw runtimePublicationRefused(source.service_id);
      } else {
        assertLifecycleOwner(service, owner);
      }
    },
    assertDestination(service, destination) {
      this.assertLifecycleOwner(service, destination.owner);
      if (publication.state === PUBLICATION_STATE.PUBLISHED ||
          publication.state === PUBLICATION_STATE.HOSTED) {
        if (!samePublicationDestination(publication.destination, destination) ||
            publication.state === PUBLICATION_STATE.HOSTED &&
              publication.destination.hostServices !== destination.hostServices) {
          throw runtimePublicationRefused(source.service_id);
        }
      } else {
        assertDestination(service, destination);
      }
    },
    publicationPredecessor(service, destination, expectedPredecessor) {
      this.assertDestination(service, destination);
      if (publication.state !== PUBLICATION_STATE.HOSTED) return expectedPredecessor;
      if (expectedPredecessor !== null && expectedPredecessor !== service) {
        throw runtimePublicationRefused(source.service_id);
      }
      return runtime;
    },
    captureHosting(service, handler, registry) {
      this.assertCurrent(service);
      if ((publication.state !== PUBLICATION_STATE.HOSTED &&
           publication.state !== PUBLICATION_STATE.PUBLISHED) ||
          publication.destination.handler !== handler ||
          publication.destination.localServices !== registry) {
        throw runtimePublicationRefused(source.service_id);
      }
      return publication;
    },
    isHostingCurrent(service, handler, registry, claim) {
      if (claim !== publication || handler.localServices !== registry) return false;
      try {
        return this.captureHosting(service, handler, registry) === claim;
      } catch {
        return false;
      }
    },
    isPublished(service, binding) {
      return publication.state === PUBLICATION_STATE.PUBLISHED &&
        service === runtime && service.isShutdown !== true && publication.binding === binding;
    },
    retainedPublishedBinding(service) {
      // Cleanup retains publication provenance after serving has stopped.
      // This read grants no new publication, admission, or routing authority.
      if (publication.state !== PUBLICATION_STATE.PUBLISHED || service !== runtime ||
          publication.binding !== service.runtimeBinding) {
        throw runtimePublicationRefused(source.service_id);
      }
      return publication.binding;
    },
    publish(service, binding, destination, commit, assertCurrent) {
      this.assertDestination(service, destination);
      if (binding?.service !== runtime || runtime.runtimeBinding !== binding ||
          !matchesRuntimeIncarnation(binding.incarnation, source) ||
          typeof commit !== 'function' || typeof assertCurrent !== 'function') {
        throw runtimePublicationRefused(source.service_id);
      }
      if (publication.state === PUBLICATION_STATE.PUBLISHED) {
        if (publication.binding !== binding) throw runtimePublicationRefused(source.service_id);
        return publication.record;
      }
      // The admitted producer and its canonical map publication share this
      // synchronous turn. Subsequent status revisions retain this exact binding;
      // they never recapture the construction admission or mint a replacement.
      publication = Object.freeze({state: PUBLICATION_STATE.PUBLISHING});
      try {
        const record = commit();
        assertCurrent(service, binding);
        publication = Object.freeze({state: PUBLICATION_STATE.PUBLISHED,
          binding, record, destination, assertCurrent});
        return record;
      } catch (error) {
        // A partially completed publication owns cleanup, never renewed
        // admission. Reentrant consumers cannot use any partially written map.
        publication = Object.freeze({state: PUBLICATION_STATE.REFUSED});
        throw error;
      }
    },
  });
  // Only the original preparation receives this closure. The service's
  // public capability cannot adopt an arbitrary map as original hosting.
  const host = (service, destination, commit, assertCurrent) => {
    if (!original) throw runtimePublicationRefused(source.service_id);
    capability.assertCurrent(service);
    if (publication.state === PUBLICATION_STATE.HOSTED) {
      capability.assertDestination(service, destination);
      return publication.record;
    }
    if (publication.state !== PUBLICATION_STATE.ADMITTED ||
        typeof commit !== 'function' || typeof assertCurrent !== 'function') {
      throw runtimePublicationRefused(source.service_id);
    }
    publication = Object.freeze({state: PUBLICATION_STATE.HOSTING});
    try {
      const record = commit();
      assertSourceCurrent(service);
      assertCurrent(service, destination);
      publication = Object.freeze({state: PUBLICATION_STATE.HOSTED,
        destination, record, assertCurrent});
      return record;
    } catch (error) {
      publication = Object.freeze({state: PUBLICATION_STATE.REFUSED});
      throw error;
    }
  };
  return Object.freeze({publication: capability, host});
}

function createPartitionRuntimePublication(options) {
  return createRuntimePublication(options, false).publication;
}

function createOriginalPartitionRuntimePublication(options) {
  return createRuntimePublication(options, true);
}

function bindPartitionRuntimeLifecycle(service, owner, source) {
  if (!owner || !service?.runtimePublication ||
      !matchesRuntimeIncarnation(service.runtimePublication.incarnation, source)) {
    throw runtimePublicationRefused(service?.replicaId);
  }
  service.runtimePublication.assertLifecycleOwner(service, owner);
  const existing = service.runtimeBinding;
  if (existing) {
    if (existing.service !== service || existing.owner !== owner ||
        existing.ownerIncarnation !== owner.ownerIncarnation ||
        !matchesRuntimeIncarnation(existing.incarnation, source)) {
      throw runtimePublicationRefused(service.replicaId);
    }
    return existing;
  }
  const binding = Object.freeze({service, owner, ownerIncarnation: owner.ownerIncarnation,
    incarnation: service.runtimePublication.incarnation});
  Object.defineProperty(service, 'runtimeBinding', {value: binding});
  return binding;
}

function attachPartitionRuntimePublication(service, publication) {
  if (!publication || typeof publication.bind !== 'function' ||
      typeof publication.assertCurrent !== 'function') {
    throw runtimePublicationRefused(service.replicaId);
  }
  Object.defineProperty(service, 'runtimePublication', {value: publication});
  publication.bind(service);
}

// A release read retains this exact phase, registry and port across its
// awaits. Neither a current-looking map entry nor a later phase can renew it.
function capturePartitionRuntimeHosting(handler, service) {
  if (handler.shuttingDown === true || service?.initialized !== true ||
      service.isShutdown === true || !service.runtimePublication) return null;
  const registry = handler.localServices;
  if (registry.get(service.replicaId) !== service) return null;
  try {
    const publication = service.runtimePublication;
    const claim = publication.captureHosting(service, handler, registry);
    return Object.freeze({handler, service, registry, publication, claim, port: service.raft});
  } catch {
    return null;
  }
}

function isPartitionRuntimeHostingCurrent(hosting) {
  return hosting !== null && hosting.handler.shuttingDown !== true &&
    hosting.service.initialized === true && hosting.service.isShutdown !== true &&
    hosting.service.runtimePublication === hosting.publication &&
    hosting.service.raft === hosting.port &&
    hosting.publication.isHostingCurrent(hosting.service, hosting.handler,
      hosting.registry, hosting.claim);
}

export {PARTITION_RUNTIME_PUBLICATION_REFUSED, attachPartitionRuntimePublication,
  bindPartitionRuntimeLifecycle,
  capturePartitionRuntimeHosting, isPartitionRuntimeHostingCurrent,
  createOriginalPartitionRuntimePublication, createPartitionRuntimePublication,
  matchesRuntimeIncarnation, runtimeIncarnation,
  runtimePublicationRefused};
