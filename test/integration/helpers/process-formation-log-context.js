// Interpret node identity only at LoggingService's console-payload boundary.
function matchesNodeContext(entry, {emitterNodeId, subjectNodeId}) {
  return entry.nodeId === emitterNodeId &&
    (entry.contextNodeId === subjectNodeId ||
      (subjectNodeId === emitterNodeId && entry.contextNodeId === undefined));
}

export {matchesNodeContext};
