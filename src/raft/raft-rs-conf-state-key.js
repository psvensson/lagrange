// The canonical, role-aware key of one applied ConfState. It is frozen data
// carried by the committed-membership boundary; callers never reconstruct it
// from cache rows or peer ordering.
function raftRsConfStateKey(confState) {
  const sorted = (ids) => [...(ids || [])].map(String).sort();
  return JSON.stringify([
    sorted(confState?.voters),
    sorted(confState?.votersOutgoing),
    sorted(confState?.learners),
    sorted(confState?.learnersNext),
    confState?.autoLeave === true,
  ]);
}

export {raftRsConfStateKey};
