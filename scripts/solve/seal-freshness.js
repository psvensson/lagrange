// Seal-freshness advisory: warn when a Quest's sealed evidence predates src/ changes.
//
// Incident class (formation-promoted-voter-not-voter-ready-routable-60s, c7057af4): a
// quest sealed against evidence from an older HEAD spent a full disambiguation rung
// before discovering the sealed symptom no longer reproduces — fixes landed between
// the seal evidence and the work. `new` stamps `links.sealedAtCommit`; this advisory
// fires while (a) src/ has changed since that commit and (b) no `repro-on-head`
// finding exists, steering the driver to a cheap reproduce-on-HEAD check as the first
// move. Advisory-only (repo pattern: advisory-not-gate) and silent for legacy quests
// without the stamp. A raw "HEAD moved" check would fire on every quest immediately
// (attempts auto-commit), so the trigger is scoped to a nonempty src/ diff.

import {execFileSync} from 'node:child_process';

import {EVENT_FINDING} from './constants.js';

export const REPRO_ON_HEAD_FINDING_KIND = 'repro-on-head';

// Default git runner: the src/-scoped name-only diff since the seal commit. Returns
// null on any git failure (not a repo, unknown sha, git unavailable) so the advisory
// degrades to silence instead of breaking status/step/report output.
function gitDiffNamesSince(root, commit) {
  try {
    return execFileSync(
      'git', ['diff', '--name-only', `${commit}..HEAD`, '--', 'src/'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
  } catch {
    return null;
  }
}

function hasReproOnHeadFinding(log) {
  return (log || []).some((event) =>
    event.type === EVENT_FINDING && event.kind === REPRO_ON_HEAD_FINDING_KIND);
}

/**
 * The seal-freshness advisory for one quest, or null when it does not apply.
 * `diffNamesSince` is injectable for tests; it must return the newline-separated
 * changed paths, '' for no drift, or null when the answer is unknowable.
 * @param {Object} quest
 * @param {Array<Object>} log The quest's event log.
 * @param {{root: string, diffNamesSince?: Function}} options
 * @return {Object|null}
 */
export function buildSealFreshnessAdvisory(quest, log, options) {
  const sealedAtCommit = quest?.links?.sealedAtCommit;
  if (typeof sealedAtCommit !== 'string' || !sealedAtCommit.trim()) return null;
  if (hasReproOnHeadFinding(log)) return null;
  const diff = (options.diffNamesSince || gitDiffNamesSince)(
    options.root, sealedAtCommit.trim());
  if (diff === null) return null;
  const changed = diff.split('\n').map((line) => line.trim()).filter(Boolean);
  if (changed.length === 0) return null;
  const shortSha = sealedAtCommit.trim().slice(0, 8);
  return {
    kind: 'seal-freshness',
    severity: 'advisory',
    sealedAtCommit: sealedAtCommit.trim(),
    changedSrcFiles: changed.length,
    message:
      `src/ has changed in ${changed.length} file(s) since this quest was sealed ` +
      `(${shortSha}) and no repro-on-head finding exists — reproduce the sealed ` +
      'symptom on current HEAD before spending a disambiguation rung on it; a ' +
      'symptom fixed in the meantime exhausts the quest immediately',
    command:
      `node scripts/solve.js finding --id ${quest.id} --frontier <frontierId> ` +
      `--kind ${REPRO_ON_HEAD_FINDING_KIND} ` +
      '--claim "<sealed symptom does/does not reproduce on HEAD>" ' +
      '--evidence <run artifact>',
  };
}
