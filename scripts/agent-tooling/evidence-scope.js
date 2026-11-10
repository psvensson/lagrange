// Applicability is declared by the capability owner, never by a receipt author.
// Broad captured snapshots remain audit context; unrelated edits do not rebind
// or invalidate an immutable observation of another capability.

import {TOOLING_QUEST} from './evidence-contract.js';

const PATH_SEPARATOR = '/';
const PARENT_DIRECTORY = '..';
const RUNTIME_FILES = ['profile.json', 'profile.js', 'host-protocol.js', 'cli.js', 'configuration.js',
  'serena-config.py', 'paths.js', 'lifecycle-lock.js', 'runtime.js', 'process.js']
  .map((file) => `scripts/agent-tooling/${file}`);
const PROOF_FILES = ['scripts/agent-tooling/evidence.js',
  'scripts/agent-tooling/evidence-contract.js',
  'scripts/agent-tooling/evidence-scope.js', 'scripts/agent-tooling/evidence-records.js',
  'scripts/agent-tooling/component-evidence.js', 'scripts/checks/quest-agent-tooling-acceptance.js',
  'scripts/quest-evidence/quest-agent-tooling.js',
  'scripts/quest-evidence/quest-agent-tooling-receipt.js',
  'scripts/solve/commands.js', 'scripts/solve/store.js', 'scripts/solve/guards.js',
  'scripts/solve/evidence-store.js', 'scripts/solve/probes.js', 'scripts/solve/schema.js',
  'scripts/solve/script-artifacts.js', 'scripts/publish-head.js'];
const COMPONENT_FILES = Object.freeze({
  'quest-tooling-owner-and-profile': ['scripts/agent-tooling/NOTICE.md',
    'docs/development/agent-tooling.md'],
  'quest-tooling-serena-navigation': ['.agents/skills/quest-navigate/SKILL.md'],
  'quest-tooling-systematic-investigation': ['.agents/skills/quest-investigate/SKILL.md'],
  'quest-tooling-review-and-evidence': ['.agents/skills/quest-review/SKILL.md', ...PROOF_FILES],
  'quest-tooling-verified-learning': ['.agents/skills/quest-learn/SKILL.md'],
  'quest-tooling-versioned-documentation': ['.agents/skills/quest-library-docs/SKILL.md'],
  'quest-tooling-lifecycle-and-upgrades': [
    'scripts/quest-evidence/quest-agent-tooling-lifecycle.py'],
});

function applicableFiles(questId, observation = null) {
  const component = questId === TOOLING_QUEST.PILOT ?
    Object.values(COMPONENT_FILES).flat() : COMPONENT_FILES[questId];
  if (!component) throw new Error(`tooling_unknown_applicability: ${questId}`);
  const files = new Set([...RUNTIME_FILES, ...component]);
  // A retained canonical test result follows the exact test implementation too.
  if (observation !== null) {
    for (const argument of observation.command) {
      if (/^test\/[a-zA-Z0-9_./-]+\.test\.js$/u.test(argument) &&
        !argument.split(PATH_SEPARATOR).includes(PARENT_DIRECTORY)) files.add(argument);
    }
  }
  return [...files].sort();
}

export {applicableFiles, PROOF_FILES};
