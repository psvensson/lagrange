// Deriving one Quest from another.
//
// Two costs this removes, both measured on 2026-07-24: seven cell-placement Quests
// were hand-copied in a single day, byte-identical apart from their sealed statement
// and ids; and fourteen Quests needed a later backfill commit because a child
// inherited nothing from the parent it was authored against.
//
// The hard boundary is the STATEMENT. Structure (class, constraints, verification
// contract, probe shapes) is mechanical and safe to copy. The statement is the sealed
// success predicate: sibling statements differ in precisely the clause a mechanical
// substitution gets wrong — which sources stay inactive, which export binds — and
// validateGoalpostsImmutable refuses every correction once first execution seals it.
// A plausible-looking wrong predicate is therefore unfixable except by authoring a
// successor Quest, which is the exact overhead this module exists to reduce. So the
// caller must supply it, always.

const INHERITED_LINK_KEYS = Object.freeze(['roadmapRow', 'specRef', 'planDoc']);

// A child Quest sits on the same planning row as its parent unless told otherwise.
// An explicitly-passed link always wins; only unset ones are filled in.
export function applyInheritedParentLinks(quest, parent) {
  const inherited = [];
  for (const key of INHERITED_LINK_KEYS) {
    if (!quest.links[key] && parent?.links?.[key]) {
      quest.links[key] = parent.links[key];
      inherited.push(key);
    }
  }
  return inherited;
}

// Copy a probe spec, rewriting only an args value that is exactly the sibling's id
// (its scenario token). Anything else is left alone rather than string-substituted,
// so an unrelated arg that happens to contain the id as a substring is never mangled.
export function retargetProbeSpec(spec, siblingId, questId) {
  if (!spec || typeof spec !== 'object') return null;
  const args = {};
  for (const [key, value] of Object.entries(spec.args || {})) {
    args[key] = value === siblingId ? questId : value;
  }
  return {...spec, args};
}

const SIBLING_STATEMENT_REQUIRED =
  'new --from: --statement "<terminal success condition>" is required. The sealed ' +
  'statement is the one part a sibling must not inherit: it seals on first ' +
  'execution and cannot be corrected afterwards.';

// Mutates `quest` in place with the sibling's structure. Throws before touching
// anything when no statement was supplied.
export function applySiblingSkeleton(quest, sibling, options = {}) {
  const statement = typeof options.statement === 'string' ?
    options.statement.trim() : '';
  if (!statement) throw new Error(SIBLING_STATEMENT_REQUIRED);
  if (options.classExplicit !== true && typeof sibling.class === 'string') {
    quest.class = sibling.class;
  }
  if (Array.isArray(sibling.constraints) && sibling.constraints.length > 0) {
    quest.constraints = sibling.constraints.map((item) => ({...item}));
  }
  if (Number.isInteger(sibling.verificationContractVersion)) {
    quest.verificationContractVersion = sibling.verificationContractVersion;
  }
  quest.doneWhen = retargetProbeSpec(sibling.doneWhen, sibling.id, quest.id) ||
    quest.doneWhen;
  if (Array.isArray(sibling.frontiers) && sibling.frontiers.length > 0) {
    quest.frontiers = sibling.frontiers.map((frontier, index) => ({
      ...frontier,
      id: index === 0 ? `${quest.id}-main` :
        String(frontier.id || '').replace(sibling.id, quest.id),
      metric: retargetProbeSpec(frontier.metric, sibling.id, quest.id) ||
        frontier.metric,
    }));
  }
  return quest;
}
