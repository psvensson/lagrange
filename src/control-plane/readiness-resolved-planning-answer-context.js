// Which planning answers have already been resolved, and for exactly which
// context.
//
// A resolved answer is marked with the owner, node, observation time and the
// FINAL direct membership-publication object it was resolved against, so a
// later consumer can recognise a completed answer instead of merging it a
// second time. The registry is a WeakMap keyed on the answer itself: an
// answer that falls out of use takes its context with it, and two logically
// equal answers are never conflated, because identity is the contract.

const resolvedNodePlanningAnswerContext = new WeakMap();

function rememberResolvedNodePlanningAnswer(
  owner,
  nodeId,
  observedAt,
  membershipPublication,
  answer,
) {
  if (answer && typeof answer === 'object') {
    resolvedNodePlanningAnswerContext.set(answer, {
      membershipPublication,
      nodeId: nodeId || owner.nodeId,
      observedAt,
      owner,
    });
  }
  return answer;
}

function isResolvedNodePlanningAnswerForContext(
  owner,
  provided,
  context,
  membershipPublication,
) {
  const resolvedContext = resolvedNodePlanningAnswerContext.get(provided);
  return resolvedContext?.owner === owner &&
    resolvedContext.nodeId === (context?.nodeId || owner.nodeId) &&
    resolvedContext.observedAt === context?.observedAt &&
    resolvedContext.membershipPublication === membershipPublication;
}

export {
  isResolvedNodePlanningAnswerForContext,
  rememberResolvedNodePlanningAnswer,
};
