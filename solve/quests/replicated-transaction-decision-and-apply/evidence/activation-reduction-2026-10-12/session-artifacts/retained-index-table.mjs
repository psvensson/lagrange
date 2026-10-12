import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('/mnt/data/peter/projects/.worktrees/tx1-work-20261010/solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round11-retained/diagnostic.json', 'utf8'));
const rows = [];
for (const c of d.leaderReleaseCommands) rows.push({first: c.firstIndex, last: c.lastIndex, n: c.occurrences, type: c.type, auth: c.authorizationId?.slice(0, 8) ?? '-', exp: c.expectedControlRevision ?? '-', ret: c.retirementId?.slice(0, 8) ?? '-'});
rows.sort((a, b) => a.first - b.first);
for (const r of rows) console.log(`${r.first}${r.n > 1 ? '-' + r.last : ''}\t${r.type}\t${r.auth}\t${r.exp}\t${r.ret}`);
