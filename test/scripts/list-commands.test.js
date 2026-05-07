import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  COMMAND_GROUPS,
  renderCommandList,
} from '../../scripts/list-commands.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const PACKAGE_JSON_ENCODING = 'utf8';
const ORIENTATION_GROUP_TITLE = 'Orientation';
const REPORT_TRIAGE_GROUP_TITLE = 'Report And Triage';
const WORK_CONTEXT_COMMAND = 'npm run work:context';
const CONSTANT_NAME_GUARD_COMMAND =
  'npm run guard:guideline:constant-names:file';
const SCOPED_METRICS_COMMAND = 'npm run test:metrics:scoped -- <files...>';
const DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report <path>';
const TOPOLOGY_CONVERGENCE_COMMAND =
  'npm run analyze:topology-convergence -- <artifact>';
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
const DISTRIBUTED_FAILURE_DESCRIPTION =
  'Print consolidated distributed report and triage diagnostics.';
const TOPOLOGY_CONVERGENCE_DESCRIPTION =
  'Render topology convergence evidence from report or playback artifacts.';
const HARNESS_SUMMARY_DESCRIPTION =
  'List latest harness reports by scenario and status.';
const COMMAND_ENTRY_SEPARATOR = ' - ';

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

test('command list includes LLM orientation and focused guardrails', (t) => {
  const rendered = renderCommandList();

  t.match(rendered, WORK_CONTEXT_COMMAND);
  t.match(rendered, CONSTANT_NAME_GUARD_COMMAND);
  t.match(rendered, SCOPED_METRICS_COMMAND);
  t.match(rendered, RUNTIME_GRAMMAR_FILE_COMMAND);
  t.notMatch(rendered, RUNTIME_GRAMMAR_BROAD_COMMAND);
  t.ok(COMMAND_GROUPS.length > 0, 'command groups should be exported for tests');
  t.equal(
    findCommandEntry(WORK_CONTEXT_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    'work context should remain the first orientation entrypoint',
  );
  t.end();
});

test('command list includes report and triage discovery commands', (t) => {
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
    `${HARNESS_SUMMARY_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      HARNESS_SUMMARY_DESCRIPTION,
  );
  t.equal(
    findCommandEntry(DISTRIBUTED_FAILURE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'distributed report analyzer should be discoverable from report triage',
  );
  t.equal(
    findCommandEntry(TOPOLOGY_CONVERGENCE_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'topology triage analyzer should be discoverable from report triage',
  );
  t.equal(
    findCommandEntry(HARNESS_SUMMARY_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'harness summary should be discoverable from report triage',
  );
  t.end();
});

test('command discovery entries are unique', (t) => {
  const commands = COMMAND_GROUPS.flatMap((group) =>
    group.commands.map((entry) => entry.command));
  const uniqueCommands = new Set(commands);

  t.equal(uniqueCommands.size, commands.length);
  t.end();
});

test('runtime grammar scripts keep broad gate and file-scoped entrypoint',
  (t) => {
    const scripts = readPackageScripts();

    t.equal(
      scripts[RUNTIME_GRAMMAR_FILE_SCRIPT],
      RUNTIME_GRAMMAR_CHECK_COMMAND,
    );
    t.equal(
      scripts[RUNTIME_GRAMMAR_BROAD_SCRIPT],
      RUNTIME_GRAMMAR_CHECK_COMMAND + ' && ' + STATE_MACHINE_PRESSURE_COMMAND,
    );
    t.end();
  });
