// Read-only verification mode shared by Quest evidence entrypoints.
// Solver owns the history and currency decision; this mode never runs receipts.
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT, VERIFIER_PREFIX} from '../solve/schema.js';

const CHECK_VERIFICATION_FLAG = '--check-verification';

function exitWithQuestVerification(questId) {
  const state = questState(readLog(process.cwd(), questId));
  const last = state.lastVerification;
  const verifier = typeof last?.verifier === 'string' ? last.verifier : null;
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent && verdictOf(last) === VERDICT.APPROVE &&
    verifier !== null && verifier.startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({
    approved,
    verifier,
    current: state.verificationIsCurrent,
    attempts: state.attempts.length,
  })}\n`);
  process.exit(approved ? 0 : 1);
}

export {CHECK_VERIFICATION_FLAG, exitWithQuestVerification};
