// What the repository HOLDS, observed - the audit's replacement for two
// hand-written booleans (quest overflow-budget-audit-evidence-binding, D1).
//
// Round 3 carried `finding.open` and `requiredExternalArtifact.exists` as
// values someone typed. The verifier demonstrated the consequence: item 8 -
// whose own note says the quest it waits on does not exist at this head -
// could be made `demonstrated` by editing those two fields. Nothing in this
// module can be edited into truth: a finding is resolved only by a resolution
// artifact that exists, parses, names THAT finding and asserts a compatible
// result, and a required external artifact is satisfied only by a repository
// object of the required kind that names the requirement it satisfies and,
// for a quest, is sealed and independently approved.
//
// Every observation takes a repository ROOT. That is what lets a mutant run
// the real derivation against a fixture tree - a forged quest, a substituted
// resolution artifact, a manifest with the wrong bytes - without the audit's
// own repository being touched.
import fs from 'node:fs';
import path from 'node:path';

const UTF8 = 'utf8';
const NEWLINE = '\n';
const DEFAULT_ROOT = '.';
const QUEST_KIND = 'quest';
// A closed enum: what a repository object must BE for it to resolve a
// finding or satisfy a gate requirement.
const ARTIFACT_KINDS = Object.freeze(['quest']);
const RESOLUTION_KINDS = Object.freeze(['owner-repair-quest']);
const QUEST_FILE = 'quest.json';
const LOG_FILE = 'log.ndjson';
const SEAL_KIND = 'decision';
const FINDING_TYPE = 'finding';
const VERIFICATION_TYPE = 'verification';
const TERMINAL_TYPE = 'terminal';
const APPROVE = 'approve';
const SOLVED = 'solved';

function readJsonUnder(root, relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), UTF8));
  } catch (error) {
    return {parseError: String(error?.message || error)};
  }
}

function readLogUnder(root, relative) {
  try {
    return fs.readFileSync(path.join(root, relative), UTF8).split(NEWLINE)
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return {parseError: String(error?.message || error)};
        }
      });
  } catch (error) {
    return [{parseError: String(error?.message || error)}];
  }
}

/**
 * Observe one required external artifact from repository state alone.
 * A quest satisfies its requirement only when it is present, sealed, closed
 * solved, independently approved, and names the gate requirement it is
 * required for. Absence, corruption and forgery all read as unsatisfied.
 * @param {Object} artifact the declared requirement {id, kind, path}
 * @param {string} [root] the repository root to observe
 * @return {Object} a structured observation; satisfied is the only verdict
 */
function observeExternalArtifact(artifact, root = DEFAULT_ROOT) {
  const declaredPath = typeof artifact?.path === 'string' ? artifact.path : '';
  const present = declaredPath.length > 0 &&
    fs.existsSync(path.join(root, declaredPath));
  const observation = {id: artifact?.id ?? null, kind: artifact?.kind ?? null,
    kindIsKnown: ARTIFACT_KINDS.includes(artifact?.kind), present,
    sealed: false, approved: false, closed: false,
    namesRequirement: false, satisfied: false};
  if (!present || !observation.kindIsKnown || artifact.kind !== QUEST_KIND) {
    return Object.freeze(observation);
  }
  const quest = readJsonUnder(root, path.join(declaredPath, QUEST_FILE));
  const log = readLogUnder(root, path.join(declaredPath, LOG_FILE));
  // A DECLARED field, never a substring of the document: a quest satisfies a
  // gate requirement only by naming it in a field meant for that.
  observation.namesRequirement =
    Array.isArray(quest.satisfiesGateRequirements) &&
    quest.satisfiesGateRequirements.includes(String(artifact.id));
  observation.sealed = log.some((entry) =>
    entry.type === FINDING_TYPE && entry.kind === SEAL_KIND && Boolean(entry.seal));
  // Append-only: LINE ORDER decides what came later, never a `ts` field a
  // forger controls.
  const verifications = log
    .map((entry, index) => ({...entry, lineIndex: index}))
    .filter((entry) => entry.type === VERIFICATION_TYPE);
  const approval = verifications
    .filter((entry) => entry.verdict === APPROVE).pop();
  const rejectionAfter = approval !== undefined && verifications
    .some((entry) => entry.verdict !== APPROVE &&
      entry.lineIndex > approval.lineIndex);
  observation.approved = approval !== undefined && !rejectionAfter;
  observation.closed = log.some((entry) =>
    entry.type === TERMINAL_TYPE && entry.status === SOLVED);
  observation.satisfied = observation.namesRequirement && observation.sealed &&
    observation.approved && observation.closed;
  return Object.freeze(observation);
}

/**
 * Observe whether one finding's resolution artifact resolves IT. A finding
 * with no artifact, an unparseable artifact, another finding's artifact, an
 * artifact of the wrong kind or one whose asserted result is not a resolution
 * is OPEN, whatever the matrix says about it.
 * @param {Object} finding the finding, carrying resolution {artifact, kind}
 * @param {string} [root] the repository root to observe
 * @return {Object} a structured observation; resolved is the only verdict
 */
function observeFindingResolution(finding, root = DEFAULT_ROOT) {
  const declared = finding?.resolution;
  const observation = {id: finding?.id ?? null,
    kindIsKnown: RESOLUTION_KINDS.includes(declared?.kind),
    present: false, sealed: false, approved: false, closed: false,
    namesThisFinding: false, resolved: false};
  if (!observation.kindIsKnown) {
    return Object.freeze(observation);
  }
  // A finding is resolved by the same thing a gate requirement is satisfied
  // by: a quest the repository holds, sealed, closed solved and
  // independently approved - which names THIS finding in a declared field.
  const quest = observeExternalArtifact(
    {id: finding.id, kind: QUEST_KIND, path: declared.path}, root);
  observation.present = quest.present;
  observation.sealed = quest.sealed;
  observation.approved = quest.approved;
  observation.closed = quest.closed;
  if (!quest.present) {
    return Object.freeze(observation);
  }
  const document = readJsonUnder(root, path.join(declared.path, QUEST_FILE));
  observation.namesThisFinding =
    Array.isArray(document.resolvesFindings) &&
    document.resolvesFindings.includes(finding.id);
  observation.resolved = observation.namesThisFinding && quest.sealed &&
    quest.approved && quest.closed;
  return Object.freeze(observation);
}

export {observeExternalArtifact, observeFindingResolution};
