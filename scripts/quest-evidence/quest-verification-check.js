// The `--check-verification` receipt of a quest evidence harness: the quest
// has at least one attempt and its newest verification is a current approval
// by a subagent verifier. Prints the observation and exits 0 only then.

import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const ZERO_COUNT = 0;

/**
 * Report whether the quest's current verification is a subagent approval,
 * then exit with that verdict.
 * @param {string} questId
 * @return {never}
 */
function exitWithQuestVerificationCheck(questId) {
  const state = questState(readLog(process.cwd(), questId));
  const last = state.lastVerification;
  // A seal review approves no source: an attempt must precede the verdict.
  const approved = state.attempts.length > ZERO_COUNT && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({
    approved,
    verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent,
    attempts: state.attempts.length,
  })}\n`);
  process.exit(approved ? EXIT_OK : EXIT_FAILED);
}

export {CHECK_VERIFICATION_FLAG, exitWithQuestVerificationCheck};
