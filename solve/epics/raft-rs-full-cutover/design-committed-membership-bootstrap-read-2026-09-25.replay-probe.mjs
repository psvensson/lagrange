// Raw raft-rs core: replay a conf-change history over different bootstrap
// configurations with apply_conf_change (what resolveCommittedEntryConfState
// does for every committed conf-change entry). Read-only; no store.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const {loadRaftRsCore} = await import(path.join(W, 'test/raft/raft-rs-backend/raw-raft-rs-test-core.js'));
const core = loadRaftRsCore();
const ADD = 0; const REMOVE = 1;
const cc = (type, id) => ({transition: 0, changes: [{changeType: type, nodeId: String(id)}]});
function replay(label, self, bootstrapVoters, history) {
  const h = core.create_node({id: String(self), peers: bootstrapVoters.map(String), learners: [],
    applied: '0', electionTick: 10, heartbeatTick: 3, preVote: false, checkQuorum: false});
  const trace = [];
  let error = null;
  for (const [type, id] of history) {
    try {
      const cs = core.apply_conf_change(h, cc(type, id));
      core.set_conf_state(h, cs);
      trace.push(cs.voters.slice().sort().join(','));
    } catch (e) {
      error = `${type === ADD ? '+' : '-'}${id}: ${String(e.message || e)}`; break;
    }
  }
  console.log(label.padEnd(44), 'bootstrap', JSON.stringify(bootstrapVoters), '->', trace.map((v) => `{${v}}`).join(' '), error ? `ERROR ${error}` : '');
}
// History H1: genesis {1}; +2, -2, +2, -1  => final {2}
const H1 = [[ADD, 2], [REMOVE, 2], [ADD, 2], [REMOVE, 1]];
replay('H1 genesis bootstrap {1} (real)', 9, [1], H1);
replay('H1 current committed {2}, target excluded', 9, [2], H1);
replay('H1 current committed {2} + self 9', 9, [2, 9], H1);
// History H2: genesis {1,2,3}; +4, -1 (REPLACE 1->4) ; a later joiner
const H2 = [[ADD, 4], [REMOVE, 1]];
replay('H2 genesis {1,2,3}', 9, [1, 2, 3], H2);
replay('H2 current {2,3,4}', 9, [2, 3, 4], H2);
replay('H2 rows omit founder 2: {3,4}', 9, [3, 4], H2);
