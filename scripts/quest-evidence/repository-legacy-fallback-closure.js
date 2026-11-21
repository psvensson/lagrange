#!/usr/bin/env node
import {runCurrentClosureCli} from '../checks/check-repository-legacy-fallback-closure.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'repository-legacy-fallback-closure';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
} else {
  // The sealed receipt remains historical. This command reports current evidence
  // on stdout, so an incomplete run cannot overwrite the original receipt.
  runCurrentClosureCli();
}
