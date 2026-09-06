#!/usr/bin/env node

const ADVANCED_COMMAND_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Orientation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run commands',
        description: 'Print the Quest-first command index with diagnostic, triage, and validation entrypoints.',
      }),
      Object.freeze({
        command: 'npm run solve:start -- --id <quest>',
        description: 'Seal a quest: validate quest.json and its epic, refuse a green probe, record sealedAt and the seal-time metric.',
      }),
      Object.freeze({
        command: 'npm run solve:note -- --id <quest> --attempt "<what changed>"',
        description: 'Append a log entry: --finding (kinds theory, altitude-check, decision, ruled-out, evidence), --attempt, --verification with --verifier subagent:<id> --verdict approve|reject, or --blocked/--exhausted/--superseded.',
      }),
      Object.freeze({
        command: 'npm run solve:probe -- --id <quest>',
        description: 'Measure the doneWhen probe (or an epic with --epic) and show the delta from the seal-time value.',
      }),
      Object.freeze({
        command: 'npm run solve:land -- --id <quest>',
        description: 'Land: green probe, last verdict, src/ verification, altitude budget, epic scope, coupled-pair guard, static checkers, npm test, then commit; never pushes.',
      }),
      Object.freeze({
        command: 'npm run solve:board',
        description: 'Print the open epics and quests on demand.',
      }),
      Object.freeze({
        command: 'npm run steering:generate',
        description: 'Regenerate compact steering packs for prompt loading.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Model And Contract Checks',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run model:contract-records -- [architecture/contracts/name.md]',
        description: 'Validate System Contract Records and their runtime, model, Quest, archived trace, and theory-ledger bindings.',
      }),
      Object.freeze({
        command: 'npm run model:invariants -- [--json] [architecture/contracts/invariants.json]',
        description: 'Validate the machine-readable invariant registry: unique ids, valid kinds, symmetric coupling, existing modelRef/contractRef.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Evidence Tools',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run solve:evidence -- add <file> --id <quest>',
        description: 'Upload a file to the solve-evidence pre-release, verify by re-download, and record an evidence finding.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Focused Validation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run test:smoke',
        description: 'Run the versioned short developer proof through the fail-closed acceptance executor.',
      }),
      Object.freeze({
        command: 'npm run test:file -- test/path/to/file.test.js',
        description: 'Run one focused TAP test file via the fail-closed ' +
          'runner (npm test ignores file arguments and runs the full ' +
          'sharded suite).',
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
        command: 'npm run test:topology-failure-gates',
        description: 'Run topology failure gates against operation, publication, and coverage invariants.',
      }),
      Object.freeze({
        command: 'npm run audit:owner-boundary-segments -- <files...>',
        description: 'Print extraction guidance for oversized owner-boundary segment files.',
      }),
      Object.freeze({
        command: 'npm run audit:operation-progress-authority',
        description: 'Block retired operation-progress source vocabulary and new rebalancer ordinal files outside the owner-map ledger.',
      }),
      Object.freeze({
        command: 'npm run model:decision-tables',
        description: 'Validate executable decision-table specs and prove every input combination has exactly one canonical outcome.',
      }),
      Object.freeze({
        command: 'npm run model:statecharts',
        description: 'Validate lifecycle and owner-state statecharts for reachability, terminal states, evidence, and forbidden transitions.',
      }),
      Object.freeze({
        command: 'npm run model:owner-traces',
        description: 'Validate owner trace suites so valid traces satisfy invariants and forbidden traces violate declared invariants.',
      }),
      Object.freeze({
        command: 'npm run model:alloy',
        description: 'Validate architecture-owned Alloy models and their declared assertions, check commands, and run commands.',
      }),
      Object.freeze({
        command: 'npm run model:contracts',
        description: 'Run contract records, decision tables, statecharts, Alloy, and protocol model checks as one model-contract gate.',
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
        command: 'npm run analyze:formation-release-phases -- <report-dir> [--json]',
        description: 'Print per-node formation-release phases (W -> handoff observed -> barrier release -> READY with deltas) and the analyzer-classified outcome for one five-node GCP run directory.',
      }),
      Object.freeze({
        command: 'npm run summarize:harness -- --report-dir test-output/reports',
        description: 'List latest harness reports by scenario and status.',
      }),
      Object.freeze({
        command: 'npm run analyze:latent-blockers -- [--markdown|--json]',
        description: 'Census the masked blocker distribution the serial gate hides: peel-order + emerging/masked candidates + grounding pack across the whole report corpus (Phase 0/L5 of the latent-blocker census).',
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
        command: 'npm run release:preflight',
        description: 'Evaluate the five release-exit checks (clean release content, HEAD is origin/main, ci gate green on the exact sha, versions and changelog agree, tag absent) and print the exact tag commands; never tags.',
      }),
      Object.freeze({
        command: 'npm run check:formation',
        description: 'Local seed-starvation gate: form five local nodes through schema admission and fail unless the formation verdict is PASS within the seed event-loop budget.',
      }),
      Object.freeze({
        command: 'npm run health:formation -- [--gcp] [--summary]',
        description: 'Record one formation-verdict trend record from a formation-only run (local or GCP) or print the recent trend and pass rate.',
      }),
      Object.freeze({
        command: 'npm run distributed:all',
        description: 'Run distributed scenarios with verbose output.',
      }),
      Object.freeze({
        command: 'npm run distributed:stop-containers -- [--dry-run|--remove|--containers-only|--processes-only]',
        description: 'Stop local Docker containers and Node processes created by the distributed harness.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Maintenance',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run test-output:prune:dry',
        description: 'Preview which old test-harness artifacts would be pruned, without deleting.',
      }),
      Object.freeze({
        command: 'npm run test-output:prune',
        description: 'Delete old test-harness artifacts; keeps pinned names, recent items, and a few per category.',
      }),
      Object.freeze({
        command: 'npm run summarize:harness',
        description: 'Summarize distributed harness runs across reports.',
      }),
    ]),
  }),
]);

const COMMAND_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Quest Workflow',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run solve:start -- --id <quest>',
        description: 'Seal a quest against a red probe.',
      }),
      Object.freeze({
        command: 'npm run solve:note -- --id <quest> --attempt "<what changed>"',
        description: 'Record an attempt, finding, verification or blocked entry.',
      }),
      Object.freeze({
        command: 'npm run solve:probe -- --id <quest>',
        description: 'Measure the doneWhen probe.',
      }),
      Object.freeze({
        command: 'npm run solve:land -- --id <quest>',
        description: 'Land the quest: guards, npm test, commit; never push.',
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
  const groups = process.argv.includes('--advanced') ?
    ADVANCED_COMMAND_GROUPS : COMMAND_GROUPS;
  process.stdout.write(renderCommandList(groups));
}

if (
  process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
  process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_FILE_NAME)
) {
  main();
}

export {
  ADVANCED_COMMAND_GROUPS,
  COMMAND_GROUPS,
  renderCommandList,
};
