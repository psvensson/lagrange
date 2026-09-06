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
const EVIDENCE_GROUP_TITLE = 'Evidence Tools';

const COMMANDS_COMMAND = 'npm run commands';
const SOLVE_START_COMMAND = 'npm run solve:start -- --id <quest>';
const SOLVE_NOTE_COMMAND =
  'npm run solve:note -- --id <quest> --attempt "<what changed>"';
const SOLVE_PROBE_COMMAND = 'npm run solve:probe -- --id <quest>';
const SOLVE_LAND_COMMAND = 'npm run solve:land -- --id <quest>';
const SOLVE_EVIDENCE_COMMAND = 'npm run solve:evidence -- add <file> --id <quest>';
const SOLVE_BOARD_COMMAND = 'npm run solve:board';
const RETIRED_STEP_COMMAND = 'npm run solve:step';
const STEERING_PACK_COMMAND = 'npm run steering:generate';
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
const SOLVE_NOTE_SCRIPT = 'solve:note';
const SOLVE_NOTE_SCRIPT_COMMAND = 'node scripts/solve.js note';
const SOLVE_PROBE_SCRIPT = 'solve:probe';
const SOLVE_PROBE_SCRIPT_COMMAND = 'node scripts/solve.js probe';
const SOLVE_LAND_SCRIPT = 'solve:land';
const SOLVE_LAND_SCRIPT_COMMAND = 'node scripts/solve.js land';
const SOLVE_EVIDENCE_SCRIPT = 'solve:evidence';
const SOLVE_EVIDENCE_SCRIPT_COMMAND = 'node scripts/solve.js evidence';
const SOLVE_BOARD_SCRIPT = 'solve:board';
const SOLVE_BOARD_SCRIPT_COMMAND = 'node scripts/solve.js board';
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

test('default command help exposes only the four Quest verbs', (t) => {
  const rendered = renderCommandList();
  const commands = COMMAND_GROUPS.flatMap((group) => group.commands)
    .map((entry) => entry.command);
  t.same(commands, [
    SOLVE_START_COMMAND,
    SOLVE_NOTE_COMMAND,
    SOLVE_PROBE_COMMAND,
    SOLVE_LAND_COMMAND,
  ]);
  t.match(rendered, SOLVE_START_COMMAND);
  t.match(rendered, SOLVE_NOTE_COMMAND);
  t.match(rendered, SOLVE_PROBE_COMMAND);
  t.match(rendered, SOLVE_LAND_COMMAND);
  t.notMatch(rendered, SOLVE_EVIDENCE_COMMAND);
  t.notMatch(rendered, RETIRED_STEP_COMMAND);
  t.end();
});

test('command list is Quest-first and keeps deterministic guardrails', (t) => {
  const rendered = renderCommandList(ADVANCED_COMMAND_GROUPS);

  for (const command of [
    COMMANDS_COMMAND,
    SOLVE_START_COMMAND,
    SOLVE_NOTE_COMMAND,
    SOLVE_PROBE_COMMAND,
    SOLVE_LAND_COMMAND,
    SOLVE_EVIDENCE_COMMAND,
    SOLVE_BOARD_COMMAND,
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
    orientation.commands.slice(1, 5).map((entry) => entry.command),
    [SOLVE_START_COMMAND, SOLVE_NOTE_COMMAND, SOLVE_PROBE_COMMAND, SOLVE_LAND_COMMAND],
    'the start/note/probe/land workflow leads component commands',
  );
  t.equal(findCommandEntry(SOLVE_BOARD_COMMAND).group.title, ORIENTATION_GROUP_TITLE);
  t.equal(findCommandEntry(SOLVE_EVIDENCE_COMMAND).group.title, EVIDENCE_GROUP_TITLE);
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
    `${SOLVE_PROBE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      'Measure the doneWhen probe (or an epic with --epic) and show the delta from the seal-time value.',
  );
  t.match(
    rendered,
    `${SOLVE_BOARD_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      'Print the open epics and quests on demand.',
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
  t.equal(scripts[SOLVE_NOTE_SCRIPT], SOLVE_NOTE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_PROBE_SCRIPT], SOLVE_PROBE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_LAND_SCRIPT], SOLVE_LAND_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_EVIDENCE_SCRIPT], SOLVE_EVIDENCE_SCRIPT_COMMAND);
  t.equal(scripts[SOLVE_BOARD_SCRIPT], SOLVE_BOARD_SCRIPT_COMMAND);
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
