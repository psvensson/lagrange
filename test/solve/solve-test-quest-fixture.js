import fs from 'node:fs';
import path from 'node:path';

import {saveQuest} from '../../scripts/solve/store.js';

export function makeOracleQuest(root, id = 'demo') {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}
