// The seed a raft-rs group's core draws its randomized election timeouts
// from (owner decision O2). The randomness a hosted replica was GIVEN reaches
// its consensus port as the request substrate's `randomSource` - the seam
// the consensus election timer has always drawn from. The port takes ONE
// draw from it when the group opens and hands the core that draw as the
// group's election seed; the core mixes in the replica's raft id and keeps a
// stream of its own per node, so the group's timeouts no longer depend on any
// other group's draws or on the order cores are entered in.
//
// A substrate without a randomSource - every production replica - yields no
// seed, and the core draws from the platform entropy source exactly as it did
// before this seam existed.

// A draw in [0, 1) scaled to a 32-bit integer: a SeededRandomSource draw is a
// uint32 divided by 2^32, so this recovers its whole state word.
const ELECTION_SEED_SPAN = 2 ** 32;

const RAFT_RS_ELECTION_SEED_ERROR_MSG = Object.freeze({
  invalidDraw: (draw) =>
    `the substrate randomSource drew ${String(draw)}, not a number in [0, 1)`,
});

/**
 * The election seed the core is given for a group opened on this substrate.
 * @param {Object} substrate - The port request's SUBSTRATE.
 * @return {string|null} A decimal u64, or null when no randomness was given.
 */
function electionSeedOf(substrate) {
  const source = substrate?.randomSource;
  if (!source || typeof source.random !== 'function') {
    return null;
  }
  const draw = source.random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new Error(RAFT_RS_ELECTION_SEED_ERROR_MSG.invalidDraw(draw));
  }
  return String(Math.floor(draw * ELECTION_SEED_SPAN));
}

export {electionSeedOf};
