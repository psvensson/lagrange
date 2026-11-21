#!/usr/bin/env node
// Q11 (repository-legacy-fallback-closure) evidence entry point.
//
// --check-verification reads the Quest's verification state, as before.
// The default mode ran the label-based closure checker
// (scripts/checks/check-repository-legacy-fallback-closure.js), retired on
// 2026-11-21: labels and free-text reasons are not evidence that an arm is
// needed. Current measurement is the one-way ratchet
// scripts/checks/fallback-read-closure.js (supplementary, never the proof)
// and executed trap runs (scripts/checks/fallback-necessity-trap.js). The
// Q11 seal and receipt remain historical evidence; this mode now refuses.
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'repository-legacy-fallback-closure';
const RETIRED_EXIT_CODE = 1;
const RETIRED_TEXT = 'repository-legacy-fallback-closure: the label-based closure checker ' +
  'was retired on 2026-11-21; measure with scripts/checks/fallback-read-closure.js ' +
  '(supplementary ratchet) and prove with executed trap runs ' +
  '(scripts/checks/fallback-necessity-trap.js)\n';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
} else {
  process.stderr.write(RETIRED_TEXT);
  process.exitCode = RETIRED_EXIT_CODE;
}
