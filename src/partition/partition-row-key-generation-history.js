// The committed row-key generation history of one partition service, as the
// participant session owner retains it: the scoped generations and, per row
// key, the latest generation that wrote it. Pure operations on those two
// collections; the session owner holds them and decides when to prune.

export function applyHydratedGenerationRow(row, expectedGen, scopedGens, committedGenMap) {
  const gen = Number(row.generation);
  if (gen !== expectedGen || Number(row.scoped) !== 1) return false;
  const keys = JSON.parse(row.row_keys_text);
  if (!Array.isArray(keys) || keys.length === 0) return false;
  scopedGens.add(gen);
  for (const rk of keys) {
    if ((committedGenMap.get(rk) ?? 0) < gen) committedGenMap.set(rk, gen);
  }
  return true;
}

export function deleteCommittedRowKeysAtOrBelow(committedGenMap, maxGen) {
  if (!committedGenMap) return;
  for (const [rk, gen] of [...committedGenMap.entries()]) {
    if (gen <= maxGen) committedGenMap.delete(rk);
  }
}

export function findLowestGeneration(scopedGens) {
  let lowestGen = Infinity;
  for (const gen of scopedGens ?? []) {
    if (gen < lowestGen) lowestGen = gen;
  }
  return lowestGen;
}

export function pruneEntriesBelowMinGen(scopedGens, committedGenMap, minGen) {
  if (scopedGens) for (const gen of [...scopedGens]) if (gen <= minGen) scopedGens.delete(gen);
  deleteCommittedRowKeysAtOrBelow(committedGenMap, minGen);
}
