import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  COMMAND_GROUPS,
  renderCommandList,
} from '../../scripts/list-commands.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const PACKAGE_JSON_ENCODING = 'utf8';
const ORIENTATION_GROUP_TITLE = 'Orientation';
const FOCUSED_VALIDATION_GROUP_TITLE = 'Focused Validation';
const REPORT_TRIAGE_GROUP_TITLE = 'Report And Triage';
const WORK_CONTEXT_COMMAND = 'npm run work:context';
const WORK_ADVANCE_COMMAND = 'npm run work:advance';
const WORK_LLM_START_COMMAND = 'npm run work:llm-start';
const WORK_DIRTY_SCOPE_COMMAND = 'npm run work:dirty-scope';
const WORK_TRACKS_COMMAND = 'npm run work:tracks';
const WORK_SPRINT_REMAINING_COMMAND = 'npm run work:sprint:remaining';
const WORK_SPRINT_PUSH_COMMAND = 'npm run work:sprint:push -- <git-push-args>';
const MODEL_LEDGER_SUMMARY_COMMAND = 'npm run work:model-ledger -- summary';
const PACKAGE_NEW_COMMAND =
  'npm run work:package:new -- --lane <lane> --title <title> --slug <slug> --owner <owner> --boundary <boundary> --dominant-reason <reason> --next-action <action>';
const PACKAGE_ROUTE_AFTER_RERUN_COMMAND =
  'npm run work:package:route-after-rerun -- --artifact <artifact> --successor <active-successor>';
const PACKAGE_SCHEMA_COMMAND = 'npm run work:package:schema';
const SUBAGENT_PROMPT_COMMAND =
  'npm run work:subagent-prompt -- --role <role> --package <package>';
const SUBAGENT_NEXT_COMMAND = 'npm run work:subagent-next';
const GUIDELINE_LITERALS_COMMAND =
  'npm run audit:guideline:literals -- <files...>';
const CONSTANT_NAME_GUARD_COMMAND =
  'npm run guard:guideline:constant-names:file';
const GUIDELINE_DECISION_BOUNDARY_COMMAND =
  'npm run audit:guideline:decision-boundaries -- <files...>';
const GUIDELINE_BOUNDARY_MODE_COMMAND =
  'npm run audit:guideline:boundary-mode-contracts -- <files...>';
const OWNER_BOUNDARY_SEGMENTS_COMMAND =
  'npm run audit:owner-boundary-segments -- <files...>';
const OVERSIZED_NEXT_COMMAND = 'npm run work:oversized-next -- --markdown';
const SCOPED_METRICS_COMMAND = 'npm run test:metrics:scoped -- <files...>';
const DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report <path>';
const TOPOLOGY_CONVERGENCE_COMMAND =
  'npm run analyze:topology-convergence -- <artifact>';
const OWNER_EXPLAIN_COMMAND =
  'npm run analyze:owner-explain -- <artifact> <edge-or-alias>';
const OWNER_DECISIONS_COMMAND = 'npm run analyze:owner-decisions';
const OWNER_GLOSSARY_COMMAND = 'npm run analyze:owner-glossary';
const OWNER_FILES_COMMAND = 'npm run analyze:owner-files -- <owner> [boundary]';
const PRIORITY_RESIDUALS_COMMAND =
  'npm run analyze:priority-recovery-residuals -- <artifact>';
const PACKAGE_EVIDENCE_BLOCK_COMMAND =
  'npm run work:package:evidence-block -- <artifact>';
const SCENARIO_TRIAGE_COMMAND =
  'npm run work:scenario-triage -- <artifact>';
const SCENARIO_ROUTE_COMMAND =
  'npm run work:scenario-route -- <artifact>';
const HARNESS_SUMMARY_COMMAND =
  'npm run summarize:harness -- --report-dir test-output/reports';
const RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file -- <files...>';
const RUNTIME_GRAMMAR_BROAD_COMMAND =
  'npm run audit:runtime-grammar -- <files...>';
const RUNTIME_GRAMMAR_BROAD_SCRIPT = 'audit:runtime-grammar';
const RUNTIME_GRAMMAR_FILE_SCRIPT = 'audit:runtime-grammar:file';
const RUNTIME_GRAMMAR_CHECK_COMMAND =
  'node scripts/check-runtime-grammar-contracts.js';
const STATE_MACHINE_PRESSURE_COMMAND = 'npm run audit:state-machine-pressure';
const GUIDELINE_GUARDRAILS_GROUP_TITLE = 'Guideline Guardrails';
const WORK_DIRTY_SCOPE_DESCRIPTION =
  'Report dirty worktree entries grouped as package-owned, tracker-generated, or unrelated.';
const WORK_TRACKS_DESCRIPTION =
  'Print current tracks with status, active sprints, upcoming sprints, and track relation.';
const WORK_SPRINT_REMAINING_DESCRIPTION =
  'Print active and todo packages left in the current sprint.';
const WORK_SPRINT_PUSH_DESCRIPTION =
  'Push with git, then print packages left in the current sprint after a successful push.';
const OWNER_BOUNDARY_SEGMENTS_DESCRIPTION =
  'Print extraction guidance for oversized owner-boundary segment files.';
const DISTRIBUTED_FAILURE_DESCRIPTION =
  'Print consolidated distributed report and triage diagnostics.';
const TOPOLOGY_CONVERGENCE_DESCRIPTION =
  'Render topology convergence evidence from report or playback artifacts.';
const OWNER_EXPLAIN_DESCRIPTION =
  'Explain topology evidence snapshot to owner decision outcome.';
const OWNER_DECISIONS_DESCRIPTION =
  'Print the topology owner decision table/state-machine index.';
const OWNER_GLOSSARY_DESCRIPTION =
  'Print canonical topology owner, boundary, reason, and semantic-state glossary.';
const PACKAGE_EVIDENCE_BLOCK_DESCRIPTION =
  'Generate a package migration/evidence block from topology analyzer output.';
const PACKAGE_ROUTE_AFTER_RERUN_DESCRIPTION =
  'Combine post-rerun routing, required sprint/current-blocker refresh steps, and the package migration transaction.';
const HARNESS_SUMMARY_DESCRIPTION =
  'List latest harness reports by scenario and status.';
const MODEL_LEDGER_SUMMARY_DESCRIPTION =
  'Summarize recent model, reasoning-effort, and output-profile fit signals.';
const LLM_START_DESCRIPTION =
  'Print combined LLM handoff, doctor suggestions, dirty scope, model ledger, and evidence summary.';
const WORK_ADVANCE_DESCRIPTION =
  'Refresh orientation around the active package, doctor findings, validation, and next subagent role.';
const WORK_SUBAGENT_NEXT_DESCRIPTION =
  'Detect the next required subagent role for the active package and print its bounded prompt.';
const SCENARIO_TRIAGE_DESCRIPTION =
  'Combine representative evidence and priority residual grouping into one scenario handoff.';
const SCENARIO_ROUTE_DESCRIPTION =
  'Combine evidence, causal routing, residuals, owner files, and capped proof into one handoff.';
const COMMAND_ENTRY_SEPARATOR = ' - ';
const COMMAND_CHAIN_SEPARATOR = ' && ';
const NONEMPTY_COMMAND_GROUP_COUNT = 0;
const ORIENTATION_GUARDRAILS_TEST_NAME =
  'command list includes orientation and deterministic guardrails';
const REPORT_TRIAGE_TEST_NAME =
  'command list includes report and triage discovery commands';
const UNIQUE_COMMANDS_TEST_NAME = 'command discovery entries are unique';
const RUNTIME_GRAMMAR_TEST_NAME =
  'runtime grammar scripts keep broad gate and file-scoped entrypoint';
const COMMAND_GROUPS_EXPORTED_MESSAGE =
  'command groups should be exported for tests';
const WORK_CONTEXT_ORIENTATION_MESSAGE =
  'work context should remain the first orientation entrypoint';
const MODEL_LEDGER_ORIENTATION_MESSAGE =
  'model-ledger summary should be discoverable from orientation';
const LLM_START_ORIENTATION_MESSAGE =
  'combined llm-start handoff should be discoverable from orientation';
const WORK_ADVANCE_ORIENTATION_MESSAGE =
  'advance handoff should be discoverable from orientation';
const DIRTY_SCOPE_ORIENTATION_MESSAGE =
  'dirty-scope report should be discoverable from orientation';
const WORK_TRACKS_ORIENTATION_MESSAGE =
  'track status summary should be discoverable from orientation';
const WORK_SPRINT_REMAINING_ORIENTATION_MESSAGE =
  'sprint remaining package summary should be discoverable from orientation';
const WORK_SPRINT_PUSH_ORIENTATION_MESSAGE =
  'sprint push wrapper should be discoverable from orientation';
const GUIDELINE_LITERALS_GROUP_MESSAGE =
  'literal guideline checks should be discoverable from guideline guardrails';
const GUIDELINE_DECISION_BOUNDARY_GROUP_MESSAGE =
  'decision-boundary checks should be discoverable from guideline guardrails';
const GUIDELINE_BOUNDARY_MODE_GROUP_MESSAGE =
  'boundary-mode checks should be discoverable from guideline guardrails';
const OWNER_BOUNDARY_SEGMENTS_GROUP_MESSAGE =
  'owner-boundary segment guidance should be discoverable from focused validation';
const OVERSIZED_NEXT_GROUP_MESSAGE =
  'oversized file package candidates should be discoverable from focused validation';
const DISTRIBUTED_FAILURE_GROUP_MESSAGE =
  'distributed report analyzer should be discoverable from report triage';
const TOPOLOGY_CONVERGENCE_GROUP_MESSAGE =
  'topology triage analyzer should be discoverable from report triage';
const OWNER_EXPLAIN_GROUP_MESSAGE =
  'owner explain should be discoverable from report triage';
const OWNER_DECISIONS_GROUP_MESSAGE =
  'owner decision table should be discoverable from report triage';
const OWNER_GLOSSARY_GROUP_MESSAGE =
  'owner glossary should be discoverable from report triage';
const OWNER_FILES_GROUP_MESSAGE =
  'owner file index should be discoverable from report triage';
const PRIORITY_RESIDUALS_GROUP_MESSAGE =
  'priority residual extraction should be discoverable from report triage';
const PACKAGE_EVIDENCE_BLOCK_GROUP_MESSAGE =
  'package evidence block should be discoverable from report triage';
const SCENARIO_TRIAGE_GROUP_MESSAGE =
  'combined scenario triage should be discoverable from report triage';
const SCENARIO_ROUTE_GROUP_MESSAGE =
  'scenario route should be discoverable from report triage';
const HARNESS_SUMMARY_GROUP_MESSAGE =
  'harness summary should be discoverable from report triage';
const ANALYZE_OWNER_EXPLAIN_SCRIPT = 'analyze:owner-explain';
const ANALYZE_OWNER_EXPLAIN_SCRIPT_COMMAND =
  'node scripts/analyze-topology-convergence.js --explain';
const ANALYZE_OWNER_DECISIONS_SCRIPT = 'analyze:owner-decisions';
const ANALYZE_OWNER_DECISIONS_SCRIPT_COMMAND =
  'node scripts/analyze-topology-convergence.js --decision-table';
const ANALYZE_OWNER_GLOSSARY_SCRIPT = 'analyze:owner-glossary';
const ANALYZE_OWNER_GLOSSARY_SCRIPT_COMMAND =
  'node scripts/analyze-topology-convergence.js --glossary';
const WORK_DIRTY_SCOPE_SCRIPT = 'work:dirty-scope';
const WORK_DIRTY_SCOPE_SCRIPT_COMMAND = 'node scripts/work-context.js --dirty-scope';
const WORK_TRACKS_SCRIPT = 'work:tracks';
const WORK_TRACKS_SCRIPT_COMMAND = 'node scripts/work-track-summary.js';
const WORK_SPRINT_REMAINING_SCRIPT = 'work:sprint:remaining';
const WORK_SPRINT_REMAINING_SCRIPT_COMMAND =
  'node scripts/work-sprint-remaining.js';
const WORK_SPRINT_PUSH_SCRIPT = 'work:sprint:push';
const WORK_SPRINT_PUSH_SCRIPT_COMMAND = 'node scripts/work-sprint-push.js';
const WORK_LLM_START_SCRIPT = 'work:llm-start';
const WORK_LLM_START_SCRIPT_COMMAND = 'node scripts/work-llm-start.js';
const WORK_ADVANCE_SCRIPT = 'work:advance';
const WORK_ADVANCE_SCRIPT_COMMAND = 'node scripts/work-advance.js';
const WORK_PACKAGE_NEW_SCRIPT = 'work:package:new';
const WORK_PACKAGE_NEW_SCRIPT_COMMAND = 'node scripts/work-package-new.js';
const WORK_PACKAGE_ROUTE_AFTER_RERUN_SCRIPT = 'work:package:route-after-rerun';
const WORK_PACKAGE_ROUTE_AFTER_RERUN_SCRIPT_COMMAND =
  'node scripts/work-package-route-after-rerun.js';
const WORK_PACKAGE_SCHEMA_SCRIPT = 'work:package:schema';
const WORK_PACKAGE_SCHEMA_SCRIPT_COMMAND = 'node scripts/work-package-schema.js';
const WORK_SUBAGENT_PROMPT_SCRIPT = 'work:subagent-prompt';
const WORK_SUBAGENT_PROMPT_SCRIPT_COMMAND = 'node scripts/work-subagent-prompt.js';
const WORK_SUBAGENT_NEXT_SCRIPT = 'work:subagent-next';
const WORK_SUBAGENT_NEXT_SCRIPT_COMMAND = 'node scripts/work-subagent-next.js';
const PACKAGE_EVIDENCE_BLOCK_SCRIPT = 'work:package:evidence-block';
const PACKAGE_EVIDENCE_BLOCK_SCRIPT_COMMAND =
  'node scripts/analyze-topology-convergence.js --package-evidence-block';
const SCENARIO_TRIAGE_SCRIPT = 'work:scenario-triage';
const SCENARIO_TRIAGE_SCRIPT_COMMAND = 'node scripts/work-scenario-triage.js';
const SCENARIO_ROUTE_SCRIPT = 'work:scenario-route';
const SCENARIO_ROUTE_SCRIPT_COMMAND = 'node scripts/work-scenario-route.js';
const OWNER_BOUNDARY_SEGMENTS_SCRIPT = 'audit:owner-boundary-segments';
const OWNER_BOUNDARY_SEGMENTS_SCRIPT_COMMAND =
  'node scripts/check-file-size-thresholds.js --owner-boundary-guidance';
const OVERSIZED_NEXT_SCRIPT = 'work:oversized-next';
const OVERSIZED_NEXT_SCRIPT_COMMAND = 'node scripts/work-oversized-next.js';
const ANALYZE_OWNER_FILES_SCRIPT = 'analyze:owner-files';
const ANALYZE_OWNER_FILES_SCRIPT_COMMAND = 'node scripts/analyze-owner-files.js';
const ANALYZE_PRIORITY_RESIDUALS_SCRIPT = 'analyze:priority-recovery-residuals';
const ANALYZE_PRIORITY_RESIDUALS_SCRIPT_COMMAND =
  'node scripts/analyze-priority-recovery-residuals.js';

function findCommandEntry(command) {
  for (const group of COMMAND_GROUPS) {
    const entry = group.commands.find((candidate) =>
      candidate.command === command);
    if (entry) {
      return {group, entry};
    }
  }
  return undefined;
}

function readPackageScripts() {
  const packageJson = JSON.parse(
    fs.readFileSync(PACKAGE_JSON_URL, PACKAGE_JSON_ENCODING),
  );
  return packageJson.scripts;
}

test(ORIENTATION_GUARDRAILS_TEST_NAME, (t) => {
  const rendered = renderCommandList();

  t.match(rendered, WORK_CONTEXT_COMMAND);
  t.match(rendered, WORK_ADVANCE_COMMAND);
  t.match(rendered, WORK_LLM_START_COMMAND);
  t.match(rendered, WORK_DIRTY_SCOPE_COMMAND);
  t.match(rendered, WORK_TRACKS_COMMAND);
  t.match(rendered, WORK_SPRINT_REMAINING_COMMAND);
  t.match(rendered, WORK_SPRINT_PUSH_COMMAND);
  t.match(rendered, MODEL_LEDGER_SUMMARY_COMMAND);
  t.match(rendered, PACKAGE_NEW_COMMAND);
  t.match(rendered, PACKAGE_ROUTE_AFTER_RERUN_COMMAND);
  t.match(rendered, PACKAGE_SCHEMA_COMMAND);
  t.match(rendered, SUBAGENT_PROMPT_COMMAND);
  t.match(rendered, SUBAGENT_NEXT_COMMAND);
  t.match(rendered, GUIDELINE_LITERALS_COMMAND);
  t.match(rendered, CONSTANT_NAME_GUARD_COMMAND);
  t.match(rendered, GUIDELINE_DECISION_BOUNDARY_COMMAND);
  t.match(rendered, GUIDELINE_BOUNDARY_MODE_COMMAND);
  t.match(rendered, OWNER_BOUNDARY_SEGMENTS_COMMAND);
  t.match(rendered, OVERSIZED_NEXT_COMMAND);
  t.match(rendered, SCOPED_METRICS_COMMAND);
  t.match(rendered, RUNTIME_GRAMMAR_FILE_COMMAND);
  t.notMatch(rendered, RUNTIME_GRAMMAR_BROAD_COMMAND);
  t.ok(
    COMMAND_GROUPS.length > NONEMPTY_COMMAND_GROUP_COUNT,
    COMMAND_GROUPS_EXPORTED_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_CONTEXT_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    WORK_CONTEXT_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_ADVANCE_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    WORK_ADVANCE_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(MODEL_LEDGER_SUMMARY_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    MODEL_LEDGER_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_LLM_START_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    LLM_START_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_DIRTY_SCOPE_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    DIRTY_SCOPE_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_TRACKS_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    WORK_TRACKS_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_SPRINT_REMAINING_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    WORK_SPRINT_REMAINING_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(WORK_SPRINT_PUSH_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    WORK_SPRINT_PUSH_ORIENTATION_MESSAGE,
  );
  t.equal(
    findCommandEntry(GUIDELINE_LITERALS_COMMAND).group.title,
    GUIDELINE_GUARDRAILS_GROUP_TITLE,
    GUIDELINE_LITERALS_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(GUIDELINE_DECISION_BOUNDARY_COMMAND).group.title,
    GUIDELINE_GUARDRAILS_GROUP_TITLE,
    GUIDELINE_DECISION_BOUNDARY_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(GUIDELINE_BOUNDARY_MODE_COMMAND).group.title,
    GUIDELINE_GUARDRAILS_GROUP_TITLE,
    GUIDELINE_BOUNDARY_MODE_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OWNER_BOUNDARY_SEGMENTS_COMMAND).group.title,
    FOCUSED_VALIDATION_GROUP_TITLE,
    OWNER_BOUNDARY_SEGMENTS_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OVERSIZED_NEXT_COMMAND).group.title,
    FOCUSED_VALIDATION_GROUP_TITLE,
    OVERSIZED_NEXT_GROUP_MESSAGE,
  );
  t.match(
    rendered,
    `${WORK_DIRTY_SCOPE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_DIRTY_SCOPE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${WORK_TRACKS_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_TRACKS_DESCRIPTION,
  );
  t.match(
    rendered,
    `${WORK_SPRINT_REMAINING_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_SPRINT_REMAINING_DESCRIPTION,
  );
  t.match(
    rendered,
    `${WORK_SPRINT_PUSH_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_SPRINT_PUSH_DESCRIPTION,
  );
  t.match(
    rendered,
    `${MODEL_LEDGER_SUMMARY_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      MODEL_LEDGER_SUMMARY_DESCRIPTION,
  );
  t.match(
    rendered,
    `${WORK_LLM_START_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      LLM_START_DESCRIPTION,
  );
  t.match(
    rendered,
    `${WORK_ADVANCE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_ADVANCE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${SUBAGENT_NEXT_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_SUBAGENT_NEXT_DESCRIPTION,
  );
  t.match(
    rendered,
    `${OWNER_BOUNDARY_SEGMENTS_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      OWNER_BOUNDARY_SEGMENTS_DESCRIPTION,
  );
  t.end();
});

test(REPORT_TRIAGE_TEST_NAME, (t) => {
  const rendered = renderCommandList();

  t.match(rendered, REPORT_TRIAGE_GROUP_TITLE);
  t.match(
    rendered,
    `${DISTRIBUTED_FAILURE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      DISTRIBUTED_FAILURE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${TOPOLOGY_CONVERGENCE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      TOPOLOGY_CONVERGENCE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${OWNER_EXPLAIN_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      OWNER_EXPLAIN_DESCRIPTION,
  );
  t.match(
    rendered,
    `${OWNER_DECISIONS_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      OWNER_DECISIONS_DESCRIPTION,
  );
  t.match(
    rendered,
    `${OWNER_GLOSSARY_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      OWNER_GLOSSARY_DESCRIPTION,
  );
  t.match(rendered, OWNER_FILES_COMMAND);
  t.match(rendered, PRIORITY_RESIDUALS_COMMAND);
  t.match(rendered, SCENARIO_TRIAGE_COMMAND);
  t.match(rendered, SCENARIO_ROUTE_COMMAND);
  t.match(
    rendered,
    `${PACKAGE_EVIDENCE_BLOCK_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      PACKAGE_EVIDENCE_BLOCK_DESCRIPTION,
  );
  t.match(
    rendered,
    `${SCENARIO_TRIAGE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      SCENARIO_TRIAGE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${SCENARIO_ROUTE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      SCENARIO_ROUTE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${HARNESS_SUMMARY_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      HARNESS_SUMMARY_DESCRIPTION,
  );
  t.equal(
    findCommandEntry(DISTRIBUTED_FAILURE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    DISTRIBUTED_FAILURE_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(TOPOLOGY_CONVERGENCE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    TOPOLOGY_CONVERGENCE_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OWNER_EXPLAIN_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    OWNER_EXPLAIN_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OWNER_DECISIONS_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    OWNER_DECISIONS_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OWNER_GLOSSARY_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    OWNER_GLOSSARY_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(OWNER_FILES_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    OWNER_FILES_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(PRIORITY_RESIDUALS_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    PRIORITY_RESIDUALS_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(PACKAGE_EVIDENCE_BLOCK_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    PACKAGE_EVIDENCE_BLOCK_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(SCENARIO_TRIAGE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    SCENARIO_TRIAGE_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(SCENARIO_ROUTE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    SCENARIO_ROUTE_GROUP_MESSAGE,
  );
  t.equal(
    findCommandEntry(HARNESS_SUMMARY_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    HARNESS_SUMMARY_GROUP_MESSAGE,
  );
  t.end();
});

test(UNIQUE_COMMANDS_TEST_NAME, (t) => {
  const commands = COMMAND_GROUPS.flatMap((group) =>
    group.commands.map((entry) => entry.command));
  const uniqueCommands = new Set(commands);

  t.equal(uniqueCommands.size, commands.length);
  t.end();
});

test(RUNTIME_GRAMMAR_TEST_NAME,
  (t) => {
    const scripts = readPackageScripts();

    t.equal(
      scripts[ANALYZE_OWNER_EXPLAIN_SCRIPT],
      ANALYZE_OWNER_EXPLAIN_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[ANALYZE_OWNER_DECISIONS_SCRIPT],
      ANALYZE_OWNER_DECISIONS_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[ANALYZE_OWNER_GLOSSARY_SCRIPT],
      ANALYZE_OWNER_GLOSSARY_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_DIRTY_SCOPE_SCRIPT],
      WORK_DIRTY_SCOPE_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_TRACKS_SCRIPT],
      WORK_TRACKS_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_SPRINT_REMAINING_SCRIPT],
      WORK_SPRINT_REMAINING_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_SPRINT_PUSH_SCRIPT],
      WORK_SPRINT_PUSH_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_LLM_START_SCRIPT],
      WORK_LLM_START_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_ADVANCE_SCRIPT],
      WORK_ADVANCE_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_PACKAGE_NEW_SCRIPT],
      WORK_PACKAGE_NEW_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_PACKAGE_ROUTE_AFTER_RERUN_SCRIPT],
      WORK_PACKAGE_ROUTE_AFTER_RERUN_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_PACKAGE_SCHEMA_SCRIPT],
      WORK_PACKAGE_SCHEMA_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_SUBAGENT_PROMPT_SCRIPT],
      WORK_SUBAGENT_PROMPT_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[WORK_SUBAGENT_NEXT_SCRIPT],
      WORK_SUBAGENT_NEXT_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[PACKAGE_EVIDENCE_BLOCK_SCRIPT],
      PACKAGE_EVIDENCE_BLOCK_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[SCENARIO_TRIAGE_SCRIPT],
      SCENARIO_TRIAGE_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[SCENARIO_ROUTE_SCRIPT],
      SCENARIO_ROUTE_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[OVERSIZED_NEXT_SCRIPT],
      OVERSIZED_NEXT_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[ANALYZE_OWNER_FILES_SCRIPT],
      ANALYZE_OWNER_FILES_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[ANALYZE_PRIORITY_RESIDUALS_SCRIPT],
      ANALYZE_PRIORITY_RESIDUALS_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[OWNER_BOUNDARY_SEGMENTS_SCRIPT],
      OWNER_BOUNDARY_SEGMENTS_SCRIPT_COMMAND,
    );
    t.equal(
      scripts[RUNTIME_GRAMMAR_FILE_SCRIPT],
      RUNTIME_GRAMMAR_CHECK_COMMAND,
    );
    t.equal(
      scripts[RUNTIME_GRAMMAR_BROAD_SCRIPT],
      RUNTIME_GRAMMAR_CHECK_COMMAND +
        COMMAND_CHAIN_SEPARATOR +
        STATE_MACHINE_PRESSURE_COMMAND,
    );
    t.end();
  });
