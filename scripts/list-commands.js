#!/usr/bin/env node

const COMMAND_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Orientation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run work:context',
        description: 'Print current blocker, first-read files, proof ladder, and dirty worktree.',
      }),
      Object.freeze({
        command: 'npm run work:advance',
        description: 'Refresh orientation around the active package, doctor findings, validation, and next subagent role.',
      }),
      Object.freeze({
        command: 'npm run work:llm-start',
        description: 'Print combined LLM handoff, doctor suggestions, dirty scope, model ledger, and evidence summary.',
      }),
      Object.freeze({
        command: 'npm run work:dirty-scope',
        description: 'Report dirty worktree entries grouped as package-owned, tracker-generated, or unrelated.',
      }),
      Object.freeze({
        command: 'npm run work:tracks',
        description: 'Print current tracks with status, active sprints, upcoming sprints, and track relation.',
      }),
      Object.freeze({
        command: 'npm run work:sprint:remaining',
        description: 'Print active and todo packages left in the current sprint.',
      }),
      Object.freeze({
        command: 'npm run work:sprint:push -- <git-push-args>',
        description: 'Push with git, then print packages left in the current sprint after a successful push.',
      }),
      Object.freeze({
        command: 'npm run work:model-ledger -- summary',
        description: 'Summarize recent model, reasoning-effort, and output-profile fit signals.',
      }),
      Object.freeze({
        command: 'npm run work:validate -- --entry|--pre-impl|--closure',
        description: 'Validate active work-package metadata, checklist state, and lane-required subagent proof at a workflow phase.',
      }),
      Object.freeze({
        command: 'npm run work:package:new -- --lane <lane> --title <title> --slug <slug> --owner <owner> --boundary <boundary> --dominant-reason <reason> --next-action <action>',
        description: 'Scaffold a schema-valid package with Model Fit defaults from the model ledger.',
      }),
      Object.freeze({
        command: 'npm run work:package:route-after-rerun -- --artifact <artifact> --successor <active-successor>',
        description: 'Combine post-rerun routing, required sprint/current-blocker refresh steps, and the package migration transaction.',
      }),
      Object.freeze({
        command: 'npm run work:package:schema',
        description: 'Print the shared work-package schema enums used by templates and validation.',
      }),
      Object.freeze({
        command: 'npm run work:subagent-prompt -- --role <role> --package <package>',
        description: 'Generate bounded subagent prompts plus sequencing and progress ledger guidance.',
      }),
      Object.freeze({
        command: 'npm run work:subagent-next',
        description: 'Detect the next required subagent role for the active package and print its bounded prompt.',
      }),
      Object.freeze({
        command: 'npm run steering:llm:pack',
        description: 'Regenerate compact steering packs for prompt loading.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Focused Validation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm test -- test/path/to/file.test.js',
        description: 'Run one focused TAP test file.',
      }),
      Object.freeze({
        command: 'npm run test:metrics:scoped -- <files...>',
        description: 'Run scoped cyclomatic and cognitive complexity ratchets.',
      }),
      Object.freeze({
        command: 'npm run audit:file-size',
        description: 'Report oversized production and test files.',
      }),
      Object.freeze({
        command: 'npm run audit:owner-boundary-segments -- <files...>',
        description: 'Print extraction guidance for oversized owner-boundary segment files.',
      }),
      Object.freeze({
        command: 'npm run work:oversized-next -- --markdown',
        description: 'Turn oversized owner-boundary files into package-ready extraction candidates.',
      }),
      Object.freeze({
        command: 'npm run work:oversized-refactor -- --run',
        description: 'List oversized files, then run gpt-5.3-codex direct refactors without creating work packages.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Report And Triage',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run analyze:distributed-failure -- --report <path>',
        description: 'Print consolidated distributed report and triage diagnostics.',
      }),
      Object.freeze({
        command: 'npm run analyze:topology-convergence -- <artifact>',
        description: 'Render topology convergence evidence from report or playback artifacts.',
      }),
      Object.freeze({
        command: 'npm run analyze:owner-explain -- <artifact> <edge-or-alias>',
        description: 'Explain topology evidence snapshot to owner decision outcome.',
      }),
      Object.freeze({
        command: 'npm run analyze:owner-decisions',
        description: 'Print the topology owner decision table/state-machine index.',
      }),
      Object.freeze({
        command: 'npm run analyze:owner-glossary',
        description: 'Print canonical topology owner, boundary, reason, and semantic-state glossary.',
      }),
      Object.freeze({
        command: 'npm run analyze:owner-files -- <owner> [boundary]',
        description: 'Find files most associated with an owner and optional boundary.',
      }),
      Object.freeze({
        command: 'npm run analyze:priority-recovery-residuals -- <artifact>',
        description: 'Extract priority-recovery residual witnesses grouped by owner and boundary.',
      }),
      Object.freeze({
        command: 'npm run work:package:evidence-block -- <artifact>',
        description: 'Generate a package migration/evidence block from topology analyzer output.',
      }),
      Object.freeze({
        command: 'npm run work:scenario-triage -- <artifact>',
        description: 'Combine representative evidence and priority residual grouping into one scenario handoff.',
      }),
      Object.freeze({
        command: 'npm run work:scenario-route -- <artifact>',
        description: 'Combine evidence, causal routing, residuals, owner files, and capped proof into one handoff.',
      }),
      Object.freeze({
        command: 'npm run summarize:harness -- --report-dir test-output/reports',
        description: 'List latest harness reports by scenario and status.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Guideline Guardrails',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run audit:guideline:literals -- <files...>',
        description: 'Check write-scope files for new unowned runtime literals.',
      }),
      Object.freeze({
        command: 'npm run guard:guideline:constant-names:file -- <files...>',
        description: 'Reject opaque generated constant names in clean explicit files.',
      }),
      Object.freeze({
        command: 'npm run audit:guideline:decision-boundaries -- <files...>',
        description: 'Check semantic decision boundaries for independent branch piles.',
      }),
      Object.freeze({
        command: 'npm run audit:guideline:boundary-mode-contracts -- <files...>',
        description: 'Check boundary-mode contracts for combinable policy options.',
      }),
      Object.freeze({
        command: 'npm run audit:runtime-grammar:file -- <files...>',
        description: 'Check runtime owner-contract and grammar drift.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Broad Gates',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run test:static',
        description: 'Run unused, dependency, complexity, metadata, and runtime grammar checks.',
      }),
      Object.freeze({
        command: 'npm run test:fast',
        description: 'Run non-bootstrap, non-integration TAP tests.',
      }),
      Object.freeze({
        command: 'npm run distributed:all',
        description: 'Run distributed scenarios with verbose output.',
      }),
    ]),
  }),
]);

const NEWLINE = '\n';
const EMPTY_TEXT = '';
const SECTION_PREFIX = '## ';
const LIST_PREFIX = '- ';
const DESCRIPTION_SEPARATOR = ' - ';
const OUTPUT_TITLE = '# Useful Commands';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_FILE_NAME = 'list-commands.js';

function renderCommandList(groups = COMMAND_GROUPS) {
  const lines = [OUTPUT_TITLE, EMPTY_TEXT];
  for (const group of groups) {
    lines.push(`${SECTION_PREFIX}${group.title}`, EMPTY_TEXT);
    for (const entry of group.commands) {
      lines.push(
        `${LIST_PREFIX}\`${entry.command}\`${DESCRIPTION_SEPARATOR}` +
        entry.description,
      );
    }
    lines.push(EMPTY_TEXT);
  }
  return lines.join(NEWLINE);
}

function main() {
  process.stdout.write(renderCommandList());
}

if (
  process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
  process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_FILE_NAME)
) {
  main();
}

export {
  COMMAND_GROUPS,
  renderCommandList,
};
