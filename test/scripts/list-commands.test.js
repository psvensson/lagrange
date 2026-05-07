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
const WORK_DIRTY_SCOPE_COMMAND = 'npm run work:dirty-scope';
const MODEL_LEDGER_SUMMARY_COMMAND = 'npm run work:model-ledger -- summary';
const CONSTANT_NAME_GUARD_COMMAND =
  'npm run guard:guideline:constant-names:file';
const OWNER_BOUNDARY_SEGMENTS_COMMAND =
  'npm run audit:owner-boundary-segments -- <files...>';
const SCOPED_METRICS_COMMAND = 'npm run test:metrics:scoped -- <files...>';
const DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report <path>';
const TOPOLOGY_CONVERGENCE_COMMAND =
  'npm run analyze:topology-convergence -- <artifact>';
const OWNER_EXPLAIN_COMMAND =
  'npm run analyze:owner-explain -- <artifact> <edge-or-alias>';
const OWNER_DECISIONS_COMMAND = 'npm run analyze:owner-decisions';
const OWNER_GLOSSARY_COMMAND = 'npm run analyze:owner-glossary';
const PACKAGE_EVIDENCE_BLOCK_COMMAND =
  'npm run work:package:evidence-block -- <artifact>';
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
const WORK_DIRTY_SCOPE_DESCRIPTION =
  'Report dirty worktree entries grouped as package-owned, tracker-generated, or unrelated.';
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
const HARNESS_SUMMARY_DESCRIPTION =
  'List latest harness reports by scenario and status.';
const MODEL_LEDGER_SUMMARY_DESCRIPTION =
  'Summarize recent model and reasoning-effort fit signals.';
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
  t.match(rendered, WORK_DIRTY_SCOPE_COMMAND);
  t.match(rendered, MODEL_LEDGER_SUMMARY_COMMAND);
  t.match(rendered, CONSTANT_NAME_GUARD_COMMAND);
  t.match(rendered, OWNER_BOUNDARY_SEGMENTS_COMMAND);
  t.match(rendered, SCOPED_METRICS_COMMAND);
  t.match(rendered, RUNTIME_GRAMMAR_FILE_COMMAND);
  t.notMatch(rendered, RUNTIME_GRAMMAR_BROAD_COMMAND);
  t.ok(COMMAND_GROUPS.length > 0, 'command groups should be exported for tests');
  t.equal(
    findCommandEntry(WORK_CONTEXT_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    'work context should remain the first orientation entrypoint',
  );
  t.equal(
    findCommandEntry(MODEL_LEDGER_SUMMARY_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    'model-ledger summary should be discoverable from orientation',
  );
  t.equal(
    findCommandEntry(WORK_DIRTY_SCOPE_COMMAND).group.title,
    ORIENTATION_GROUP_TITLE,
    'dirty-scope report should be discoverable from orientation',
  );
  t.equal(
    findCommandEntry(OWNER_BOUNDARY_SEGMENTS_COMMAND).group.title,
    FOCUSED_VALIDATION_GROUP_TITLE,
    'owner-boundary segment guidance should be discoverable from focused validation',
  );
  t.match(
    rendered,
    `${WORK_DIRTY_SCOPE_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      WORK_DIRTY_SCOPE_DESCRIPTION,
  );
  t.match(
    rendered,
    `${MODEL_LEDGER_SUMMARY_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      MODEL_LEDGER_SUMMARY_DESCRIPTION,
  );
  t.match(
    rendered,
    `${OWNER_BOUNDARY_SEGMENTS_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      OWNER_BOUNDARY_SEGMENTS_DESCRIPTION,
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
  t.match(
    rendered,
    `${PACKAGE_EVIDENCE_BLOCK_COMMAND}\`${COMMAND_ENTRY_SEPARATOR}` +
      PACKAGE_EVIDENCE_BLOCK_DESCRIPTION,
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
    findCommandEntry(OWNER_EXPLAIN_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'owner explain should be discoverable from report triage',
  );
  t.equal(
    findCommandEntry(OWNER_DECISIONS_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'owner decision table should be discoverable from report triage',
  );
  t.equal(
    findCommandEntry(OWNER_GLOSSARY_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'owner glossary should be discoverable from report triage',
  );
  t.equal(
    findCommandEntry(PACKAGE_EVIDENCE_BLOCK_COMMAND).group.title,
    REPORT_TRIAGE_GROUP_TITLE,
    'package evidence block should be discoverable from report triage',
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
      scripts['analyze:owner-explain'],
      'node scripts/analyze-topology-convergence.js --explain',
    );
    t.equal(
      scripts['analyze:owner-decisions'],
      'node scripts/analyze-topology-convergence.js --decision-table',
    );
    t.equal(
      scripts['analyze:owner-glossary'],
      'node scripts/analyze-topology-convergence.js --glossary',
    );
    t.equal(
      scripts['work:dirty-scope'],
      'node scripts/work-context.js --dirty-scope',
    );
    t.equal(
      scripts['work:package:evidence-block'],
      'node scripts/analyze-topology-convergence.js --package-evidence-block',
    );
    t.equal(
      scripts['audit:owner-boundary-segments'],
      'node scripts/check-file-size-thresholds.js --owner-boundary-guidance',
    );
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
