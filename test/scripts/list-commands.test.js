import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  ADVANCED_COMMAND_GROUPS,
  COMMAND_GROUPS,
  renderCommandList,
} from '../../scripts/list-commands.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const PACKAGE_JSON_ENCODING = 'utf8';
const COMMAND_ENTRY_SEPARATOR = ' - ';
const COMMAND_CHAIN_SEPARATOR = ' && ';

const ORIENTATION_GROUP_TITLE = 'Orientation';
const MODEL_CONTRACT_GROUP_TITLE = 'Model And Contract Checks';
const REPORT_TRIAGE_GROUP_TITLE = 'Report And Triage';
const GUIDELINE_GUARDRAILS_GROUP_TITLE = 'Guideline Guardrails';

const COMMANDS_COMMAND = 'npm run commands';
const SOLVE_START_COMMAND = 'npm run solve:start -- --id <quest>';
const SOLVE_CONTINUE_COMMAND = 'npm run solve:continue -- --id <quest>';
const SOLVE_LAND_COMMAND = 'npm run solve:land -- --id <quest>';
const ADVANCED_SOLVE_LAND_COMMAND =
  'npm run solve:land -- --id <quest> [--review <id> --verifier <id> ' +
  '--verdict <approve|reject> --receipt <ref>]';
const QUEST_CONTEXT_COMMAND = 'npm run quest:context -- --id <quest>';
const SOLVE_STATUS_COMMAND = 'npm run solve:status -- --id <quest>';
const SOLVE_STEP_COMMAND = 'npm run solve:step -- --id <quest>';
const SOLVE_STEP_COMMIT_COMMAND =
  'npm run solve:step -- --id <quest> --commit --changeRef diff:<path> --summary "<what changed>"';
const SOLVE_STEP_PENDING_COMMAND =
  'npm run solve:step-pending -- --id <quest>';
const SOLVE_ATTEMPT_COMMAND =
  'npm run solve:attempt -- --id <quest> --frontier <frontier> --changeRef diff:<path> --summary "<what changed>" -- <command...>';
const SOLVE_FINDING_COMMAND =
  'npm run solve:finding -- --id <quest> --frontier <frontier> --claim "<claim>"';
const SOLVE_AUDIT_COMMAND = 'npm run solve:audit -- --id <quest>';
const SOLVE_UPGRADE_COMMAND = 'npm run solve:upgrade -- --id <quest>';
const SOLVE_PROBE_COMMAND =
  'npm run solve:probe -- --probe scenario-harness --scenario <scenario> --reportDir test-output/reports --metric priority';
const SOLVE_REPORT_COMMAND = 'npm run solve:report -- --id <quest>';
const SOLVE_NEW_COMMAND =
  'npm run solve:new -- --id <quest> --statement "<done condition>"';
const SOLVE_INGEST_EVIDENCE_COMMAND =
  'npm run solve:ingest-evidence -- --id <quest> --frontier <frontier> --evidence <path>';
const STEERING_PACK_COMMAND = 'npm run steering:llm:pack';
const TEST_SMOKE_COMMAND = 'npm run test:smoke';

const MODEL_CONTRACT_RECORDS_COMMAND =
  'npm run model:contract-records -- [architecture/contracts/name.md]';
const MODEL_INVARIANTS_COMMAND =
  'npm run model:invariants -- [--json] [architecture/contracts/invariants.json]';

const MODEL_DECISION_TABLES_COMMAND = 'npm run model:decision-tables';
const MODEL_STATECHARTS_COMMAND = 'npm run model:statecharts';
const MODEL_OWNER_TRACES_COMMAND = 'npm run model:owner-traces';
const MODEL_ALLOY_COMMAND = 'npm run model:alloy';
const MODEL_CONTRACTS_COMMAND = 'npm run model:contracts';
const GUIDELINE_LITERALS_COMMAND =
  'npm run audit:guideline:literals -- <files...>';
const CONSTANT_NAME_GUARD_COMMAND =
  'npm run guard:guideline:constant-names:file';
const GUIDELINE_DECISION_BOUNDARY_COMMAND =
  'npm run audit:guideline:decision-boundaries -- <files...>';
const GUIDELINE_BOUNDARY_MODE_COMMAND =
  'npm run audit:guideline:boundary-mode-contracts -- <files...>';
const RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file -- <files...>';
const RUNTIME_GRAMMAR_BROAD_COMMAND =
  'npm run audit:runtime-grammar -- <files...>';

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
const HARNESS_SUMMARY_COMMAND =
  'npm run summarize:harness -- --report-dir test-output/reports';

const QUEST_CONTEXT_SCRIPT = 'quest:context';
const QUEST_CONTEXT_SCRIPT_COMMAND = 'node scripts/quest-context.js';
const COMMANDS_SCRIPT = 'commands';
const COMMANDS_SCRIPT_COMMAND = 'node scripts/list-commands.js';
const MODEL_CONTRACT_RECORDS_SCRIPT = 'model:contract-records';
const MODEL_CONTRACT_RECORDS_SCRIPT_COMMAND =
  'node scripts/check-system-contracts.js';
const MODEL_INVARIANTS_SCRIPT = 'model:invariants';
const MODEL_INVARIANTS_SCRIPT_COMMAND = 'node scripts/check-invariants.js';
const MODEL_ALLOY_SCRIPT = 'model:alloy';
const MODEL_ALLOY_SCRIPT_COMMAND = 'node scripts/check-alloy-models.js';
const MODEL_OWNER_TRACES_SCRIPT = 'model:owner-traces';
const MODEL_OWNER_TRACES_SCRIPT_COMMAND = 'node scripts/check-owner-traces.js';
const SOLVE_SCRIPT = 'solve';
const SOLVE_SCRIPT_COMMAND = 'node scripts/solve.js';
const SOLVE_START_SCRIPT = 'solve:start';
const SOLVE_START_SCRIPT_COMMAND = 'node scripts/solve.js start';
const SOLVE_CONTINUE_SCRIPT = 'solve:continue';
const SOLVE_CONTINUE_SCRIPT_COMMAND = 'node scripts/solve.js continue';
const SOLVE_LAND_SCRIPT = 'solve:land';
const SOLVE_LAND_SCRIPT_COMMAND = 'node scripts/solve.js land';
const SOLVE_STATUS_SCRIPT = 'solve:status';
const SOLVE_STATUS_SCRIPT_COMMAND = 'node scripts/solve.js status';
const SOLVE_STEP_SCRIPT = 'solve:step';
const SOLVE_STEP_SCRIPT_COMMAND = 'node scripts/solve.js step';
const SOLVE_STEP_PENDING_SCRIPT = 'solve:step-pending';
const SOLVE_STEP_PENDING_SCRIPT_COMMAND = 'node scripts/solve.js step-pending';
const SOLVE_ATTEMPT_SCRIPT = 'solve:attempt';
const SOLVE_ATTEMPT_SCRIPT_COMMAND = 'node scripts/solve.js attempt';
const SOLVE_INGEST_EVIDENCE_SCRIPT = 'solve:ingest-evidence';
const SOLVE_INGEST_EVIDENCE_SCRIPT_COMMAND =
  'node scripts/solve.js ingest-evidence';
const SOLVE_AUDIT_SCRIPT = 'solve:audit';
const SOLVE_AUDIT_SCRIPT_COMMAND = 'node scripts/solve.js audit';
const SOLVE_UPGRADE_SCRIPT = 'solve:upgrade';
const SOLVE_UPGRADE_SCRIPT_COMMAND = 'node scripts/solve.js upgrade';
const SOLVE_FINDING_SCRIPT = 'solve:finding';
const SOLVE_FINDING_SCRIPT_COMMAND = 'node scripts/solve.js finding';
const SOLVE_PROBE_SCRIPT = 'solve:probe';
const SOLVE_PROBE_SCRIPT_COMMAND = 'node scripts/solve.js probe';
const SOLVE_REPORT_SCRIPT = 'solve:report';
const SOLVE_REPORT_SCRIPT_COMMAND = 'node scripts/solve.js report';
const RUNTIME_GRAMMAR_BROAD_SCRIPT = 'audit:runtime-grammar';
const RUNTIME_GRAMMAR_FILE_SCRIPT = 'audit:runtime-grammar:file';
const RUNTIME_GRAMMAR_CHECK_COMMAND =
  'node scripts/check-runtime-grammar-contracts.js';
const STATE_MACHINE_PRESSURE_COMMAND = 'npm run audit:state-machine-pressure';

function findCommandEntry(command) {
  for (const group of ADVANCED_COMMAND_GROUPS) {
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

test('default command help exposes only the three Quest verbs', (t) => {
  const rendered = renderCommandList();
  const commands = COMMAND_GROUPS.flatMap((group) => group.commands)
    .map((entry) => entry.command);
  t.same(commands, [
    SOLVE_START_COMMAND,
    SOLVE_CONTINUE_COMMAND,
    SOLVE_LAND_COMMAND,
  ]);
  t.match(rendered, SOLVE_START_COMMAND);
  t.match(rendered, SOLVE_CONTINUE_COMMAND);
  t.match(rendered, SOLVE_LAND_COMMAND);
  t.notMatch(rendered, SOLVE_STEP_COMMAND);
  t.end();
});

test('command list is Quest-first and keeps deterministic guardrails', (t) => {
  const rendered = renderCommandList(ADVANCED_COMMAND_GROUPS);

  for (const command of [
    COMMANDS_COMMAND,
    SOLVE_START_COMMAND,
    SOLVE_CONTINUE_COMMAND,
    ADVANCED_SOLVE_LAND_COMMAND,
    QUEST_CONTEXT_COMMAND,
    SOLVE_STATUS_COMMAND,
    SOLVE_STEP_COMMAND,
    SOLVE_STEP_COMMIT_COMMAND,
    SOLVE_STEP_PENDING_COMMAND,
    SOLVE_ATTEMPT_COMMAND,
    SOLVE_FINDING_COMMAND,
    SOLVE_AUDIT_COMMAND,
    SOLVE_UPGRADE_COMMAND,
    SOLVE_PROBE_COMMAND,
    SOLVE_REPORT_COMMAND,
    SOLVE_NEW_COMMAND,
    SOLVE_INGEST_EVIDENCE_COMMAND,
    STEERING_PACK_COMMAND,
    TEST_SMOKE_COMMAND,
    MODEL_CONTRACT_RECORDS_COMMAND,
    MODEL_INVARIANTS_COMMAND,
    MODEL_DECISION_TABLES_COMMAND,
    MODEL_STATECHARTS_COMMAND,
    MODEL_OWNER_TRACES_COMMAND,
    MODEL_ALLOY_COMMAND,
    MODEL_CONTRACTS_COMMAND,
    GUIDELINE_LITERALS_COMMAND,
    CONSTANT_NAME_GUARD_COMMAND,
    GUIDELINE_DECISION_BOUNDARY_COMMAND,
    GUIDELINE_BOUNDARY_MODE_COMMAND,
    RUNTIME_GRAMMAR_FILE_COMMAND,
  ]) {
    t.match(rendered, command);
  }

  t.notMatch(rendered, RUNTIME_GRAMMAR_BROAD_COMMAND);
  const orientation = ADVANCED_COMMAND_GROUPS.find((group) =>
    group.title === ORIENTATION_GROUP_TITLE);
  t.same(
    orientation.commands.slice(2, 5).map((entry) => entry.command),
    [SOLVE_START_COMMAND, SOLVE_CONTINUE_COMMAND, ADVANCED_SOLVE_LAND_COMMAND],
    'the primary start/continue/land workflow leads component commands',
  );
  t.equal(findCommandEntry(QUEST_CONTEXT_COMMAND).group.title, ORIENTATION_GROUP_TITLE);
  t.equal(findCommandEntry(SOLVE_STEP_COMMAND).group.title, ORIENTATION_GROUP_TITLE);
  t.equal(
    findCommandEntry(MODEL_CONTRACT_RECORDS_COMMAND).group.title,
    MODEL_CONTRACT_GROUP_TITLE,
  );
  t.equal(
    findCommandEntry(GUIDELINE_LITERALS_COMMAND).group.title,
    GUIDELINE_GUARDRAILS_GROUP_TITLE,
  );
  t.match(
    rendered,
    `${QUEST_CONTEXT_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      'Print Quest status, model guidance, source-change verifier rule, pending step, latest probe, findings, and dirty worktree.',
  );
  t.match(
    rendered,
    `${SOLVE_FINDING_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      'Record durable Quest memory for a frontier.',
  );
  t.match(
    rendered,
    `${SOLVE_AUDIT_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      'Validate Quest workflow integrity, source-change verifier evidence, and git handoff readiness.',
  );
  t.end();
});

test('command list includes report and triage discovery commands', (t) => {
  const rendered = renderCommandList(ADVANCED_COMMAND_GROUPS);

  for (const command of [
    DISTRIBUTED_FAILURE_COMMAND,
    TOPOLOGY_CONVERGENCE_COMMAND,
    OWNER_EXPLAIN_COMMAND,
    OWNER_DECISIONS_COMMAND,
    OWNER_GLOSSARY_COMMAND,
    OWNER_FILES_COMMAND,
    PRIORITY_RESIDUALS_COMMAND,
    HARNESS_SUMMARY_COMMAND,
  ]) {
    t.match(rendered, command);
    t.equal(findCommandEntry(command).group.title, REPORT_TRIAGE_GROUP_TITLE);
  }
  t.end();
});

test('command discovery entries are unique', (t) => {
  const commands = ADVANCED_COMMAND_GROUPS.flatMap((group) =>
    group.commands.map((entry) => entry.command));
  const uniqueCommands = new Set(commands);

  t.equal(uniqueCommands.size, commands.length);
  t.end();
});

test('package scripts expose Quest aliases and runtime grammar guards', (t) => {
  const scripts = readPackageScripts();

  t.equal(scripts[COMMANDS_SCRIPT], COMMANDS_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_SCRIPT], SOLVE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_START_SCRIPT], SOLVE_START_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_CONTINUE_SCRIPT], SOLVE_CONTINUE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_LAND_SCRIPT], SOLVE_LAND_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_STATUS_SCRIPT], SOLVE_STATUS_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_STEP_SCRIPT], SOLVE_STEP_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_STEP_PENDING_SCRIPT], SOLVE_STEP_PENDING_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_ATTEMPT_SCRIPT], SOLVE_ATTEMPT_SCRIPT_COMMAND);
  t.equal(
    scripts[SOLVE_INGEST_EVIDENCE_SCRIPT],
    SOLVE_INGEST_EVIDENCE_SCRIPT_COMMAND,
  );
  t.equal(scripts[SOLVE_AUDIT_SCRIPT], SOLVE_AUDIT_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_UPGRADE_SCRIPT], SOLVE_UPGRADE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_FINDING_SCRIPT], SOLVE_FINDING_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_PROBE_SCRIPT], SOLVE_PROBE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_REPORT_SCRIPT], SOLVE_REPORT_SCRIPT_COMMAND);
  t.equal(scripts[QUEST_CONTEXT_SCRIPT], QUEST_CONTEXT_SCRIPT_COMMAND);
  t.equal(
    scripts[MODEL_CONTRACT_RECORDS_SCRIPT],
    MODEL_CONTRACT_RECORDS_SCRIPT_COMMAND,
  );
  t.equal(scripts[MODEL_INVARIANTS_SCRIPT], MODEL_INVARIANTS_SCRIPT_COMMAND);
  t.equal(
    scripts[MODEL_OWNER_TRACES_SCRIPT],
    MODEL_OWNER_TRACES_SCRIPT_COMMAND,
  );
  t.equal(scripts[MODEL_ALLOY_SCRIPT], MODEL_ALLOY_SCRIPT_COMMAND);
  for (const scriptName of Object.keys(scripts)) {
    t.notMatch(scriptName, /^work:/u);
  }
  t.equal(scripts[RUNTIME_GRAMMAR_FILE_SCRIPT], RUNTIME_GRAMMAR_CHECK_COMMAND);
  t.equal(
    scripts[RUNTIME_GRAMMAR_BROAD_SCRIPT],
    RUNTIME_GRAMMAR_CHECK_COMMAND +
      COMMAND_CHAIN_SEPARATOR +
      STATE_MACHINE_PRESSURE_COMMAND,
  );
  t.end();
});
