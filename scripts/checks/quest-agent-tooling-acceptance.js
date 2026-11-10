#!/usr/bin/env node
// Read-only capability observer. Missing implementation is a measured negative;
// missing execution/review evidence is unavailable, never a fabricated red run.
import fs from 'node:fs';
import path from 'node:path';
import {requiredProofArtifacts} from '../solve/probes.js';
import {admit} from '../agent-tooling/evidence.js';

const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayReduce = Function.call.bind(Array.prototype.reduce);

const CAPABILITIES = Object.freeze({
  'quest-tooling-owner-and-profile': 'scripts/agent-tooling/profile.json',
  'quest-tooling-serena-navigation': '.agents/skills/quest-navigate/SKILL.md',
  'quest-tooling-systematic-investigation': '.agents/skills/quest-investigate/SKILL.md',
  'quest-tooling-review-and-evidence': '.agents/skills/quest-review/SKILL.md',
  'quest-tooling-verified-learning': '.agents/skills/quest-learn/SKILL.md',
  'quest-tooling-versioned-documentation': '.agents/skills/quest-library-docs/SKILL.md',
  'quest-tooling-lifecycle-and-upgrades': 'scripts/agent-tooling/configuration.js',
  'quest-tooling-real-pilot-acceptance': 'docs/development/agent-tooling.md',
});

function observe(root, id) {
  if (!Object.hasOwn(CAPABILITIES, id)) throw new Error(`unknown tooling Quest: ${id}`);
  const quest = JSON.parse(fs.readFileSync(
    path.join(root, 'solve/quests', id, 'quest.json'), 'utf8'));
  const artifacts = requiredProofArtifacts(quest.doneWhen);
  if (artifacts.length === 0) throw new Error(`${id}: no retained artifacts declared`);
  const capability = CAPABILITIES[id];
  if (!fs.existsSync(path.join(root, capability))) {
    return {id, measuring: true, metric: 1, reason: `capability absent: ${capability}`};
  }
  try {
    return admit(root, quest);
  } catch (error) {
    return {id, measuring: false, metric: null, reason: error.message};
  }
}

const root = process.cwd();
const questFlag = arrayIndexOf(process.argv, '--quest');
try {
  const ids = questFlag < 0 ? Object.keys(CAPABILITIES) : [process.argv[questFlag + 1]];
  const results = arrayMap(ids, (id) => observe(root, id));
  console.log(JSON.stringify({results}, null, 2));
  if (arrayEvery(results, (result) => result.measuring)) {
    const metric = arrayReduce(results, (sum, result) => sum + result.metric, 0);
    console.log(metric);
    process.exitCode = metric === 0 ? 0 : 1;
  } else {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`tooling_evidence_unavailable: ${error.message}`);
  process.exitCode = 2;
}
