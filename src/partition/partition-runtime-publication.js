// Retained producer admission for one exact PartitionService. The existing
// producer supplies its currentness assertion; no current-ID lookup grants it.
const RUNTIME_INCARNATION_FIELDS = Object.freeze([
  'service_id', 'replica_id', 'partition_id', 'node_id', 'group_id',
  'created_at', 'create_attempt_token',
]);
const PARTITION_RUNTIME_PUBLICATION_REFUSED = 'PARTITION_RUNTIME_PUBLICATION_REFUSED';
const PUBLICATION_STATE = Object.freeze({ADMITTED: 'admitted', PUBLISHING: 'publishing',
  PUBLISHED: 'published', REFUSED: 'refused'});

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

function createPartitionRuntimePublication({incarnation, assertSourceCurrent}) {
  if (!incarnation || typeof assertSourceCurrent !== 'function' ||
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
  return Object.freeze({incarnation: source,
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
      } else if (publication.state === PUBLICATION_STATE.PUBLISHED) {
        publication.assertCurrent(service, publication.binding);
      } else {
        throw runtimePublicationRefused(source.service_id);
      }
      return true;
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
    publish(service, binding, commit, assertCurrent) {
      this.assertCurrent(service);
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
          binding, record, assertCurrent});
        return record;
      } catch (error) {
        // A partially completed publication owns cleanup, never renewed
        // admission. Reentrant consumers cannot use any partially written map.
        publication = Object.freeze({state: PUBLICATION_STATE.REFUSED});
        throw error;
      }
    },
  });
}

function bindPartitionRuntimeLifecycle(service, owner, source) {
  if (!owner || !service?.runtimePublication ||
      !matchesRuntimeIncarnation(service.runtimePublication.incarnation, source)) {
    throw runtimePublicationRefused(service?.replicaId);
  }
  service.runtimePublication.assertCurrent(service);
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

export {PARTITION_RUNTIME_PUBLICATION_REFUSED, attachPartitionRuntimePublication,
  bindPartitionRuntimeLifecycle,
  createPartitionRuntimePublication, matchesRuntimeIncarnation, runtimeIncarnation,
  runtimePublicationRefused};
