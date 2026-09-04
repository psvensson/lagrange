const MESSAGE_ROUTER_OWNER = 'messageRouter';
const objectEntries = Object.entries;
const objectHasOwn = Object.hasOwn;

function recordChangedReadinessOwnerDependencies(
  readinessPlanningSnapshotOwner,
  service,
  previousOwnerDependencies,
) {
  for (const [ownerName, previousOwner] of objectEntries(
    previousOwnerDependencies,
  )) {
    if (previousOwner === service[ownerName]) continue;
    readinessPlanningSnapshotOwner?.recordOwnerDependencyReplacement(
      ownerName,
    );
    if (ownerName === MESSAGE_ROUTER_OWNER) {
      service.refreshNodeLivenessSourceSubscriptions();
      service.nodeLivenessSemanticProjectionOwner?.recordAllSourceChanges();
    }
  }
}

function syncNullableOwnerDependency(service, options, ownerName) {
  if (objectHasOwn(options, ownerName)) {
    service[ownerName] = options[ownerName] || null;
  }
}

export {
  recordChangedReadinessOwnerDependencies,
  syncNullableOwnerDependency,
};
