"""Reproduce one inspected WIP correction; not a Solver probe or verifier."""
import hashlib
import json
import subprocess
from pathlib import Path

BASE = '789002b06462c238ac57510b08865c812aa9ac12'
EXPECTED = {
    'src/raft/raft-operation-port.js': 'd7dd5cea4d67e66fcd63e87095b2c06a036dfdbf6796da7eff4469abb6a694c4',
    'src/raft/raft-rs-operation-port.js': '1656c604b0ef26dd90ba15728f29f5060bc3f0528c8ece6f66369746a6c17468',
    'src/partition/partition-consensus-port-opening.js': '721c27fa026ea3f91140157c7f128fe78f2ba99636a97d0a9493a7be8cf62c86',
    'src/message-group/message-group-consensus-port.js': '18950fdf6695f9a03a9bd547d4836a997e0e03ad748b1add7b7ddacea2eecc27',
    'src/wasm-service/wasm-service-consensus-port.js': '0be950d49580286f494e56a5d0988579f7a08656887d3a883738ac28f1cefa5d',
    'test/shards/impact-contracts.json': 'e1d601227bac8aa71f6fda894da7ce68348a00778d7b123ce6bbf0d1a202110a',
    'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js': '08a39cfbc476ad23c1e7dfce1dca97c0a5a367e446a47b1f40d9e13fe17ed900',
    'solve/quests/replicated-transaction-decision-and-apply/design-opening-refusal-20261012.md': '0d289ab772195fadfbc32dc901d83930e79fa6240ffed4e16eba86461ea981b3',
}
for name in list(EXPECTED)[:6]:
    assert Path(name).read_bytes() == subprocess.check_output(['git', 'show', BASE + ':' + name]), name

def once(source, old, new):
    assert source.count(old) == 1, 'changed source anchor: ' + old[:80]
    return source.replace(old, new, 1)

p = Path('src/raft/raft-operation-port.js')
s = p.read_text()
addition = '''// A constructor can refuse semantically, lose the shared core, or fail at
// its host boundary. Every service kind consumes the same failure vocabulary
// and retains the exact consensus answer; unrelated throws are not relabeled.
function isRaftOpeningFailure(error) {
  const result = error?.consensus?.outcome;
  return result === RAFT_OPERATION_OUTCOME.CORE_REFUSED ||
    result === RAFT_OPERATION_OUTCOME.CORE_FATAL ||
    result === RAFT_OPERATION_OUTCOME.HOST_FAILURE;
}

'''
s = once(s, 'function assertRaftOperationSucceeded(result) {', addition + 'function assertRaftOperationSucceeded(result) {')
s = once(s, '  deepFreeze,\n};', '  deepFreeze,\n  isRaftOpeningFailure,\n};')
p.write_text(s)
for name in ['src/partition/partition-consensus-port-opening.js',
             'src/message-group/message-group-consensus-port.js',
             'src/wasm-service/wasm-service-consensus-port.js']:
    p = Path(name); s = p.read_text()
    s = once(s, 'if (error?.consensus?.outcome !== RAFT_OPERATION_OUTCOME.CORE_REFUSED) {', 'if (!isRaftOpeningFailure(error)) {')
    imported = "import {isRaftOpeningFailure} from '../raft/raft-operation-port.js';\n"
    if '/partition/' in name:
        s = once(s, "import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';\n", imported)
    else:
        s = once(s, "import fs from 'node:fs';", imported + "import fs from 'node:fs';")
    p.write_text(s)

p = Path('src/raft/raft-rs-operation-port.js'); s = p.read_text()
registration = '''  const unregisterMembershipOwner = registerPeerIdentityReservationOwner({
    groupId,
    localReplicaIdentity: replicaIdentity,
    reserve: (joiningReplicaIdentity) =>
      registry.registerReplica(joiningReplicaIdentity),
  });
'''
s = once(s, registration, '')
s = once(s, 'const HEARTBEAT_TICK_DIVISOR = 3;', "const HEARTBEAT_TICK_DIVISOR = 3;\nconst ALREADY_CLOSED = 'already-closed';")
start = s.index('    close: () => {\n')
end = s.index('\n  });\n  registerRuntimeLifecycle(port, lifecycle);', start)
old = s[start:end]; assert old.endswith('    },')
body = old[len('    close: () => {\n'):-len('\n    },')]
body = '\n'.join(line[2:] for line in body.splitlines())
body = once(body, "return coreOk('already-closed');", 'return coreOk(ALREADY_CLOSED);')
close = '  function close() {\n' + body + '\n  }\n'
s = s[:start] + '    close,' + s[end:]
comment = '''  // Publish only after construction succeeds. A refused opening must never
  // replace a live same-name owner: unregistering after overwrite would lose
  // that owner's entry rather than restore it. The port's exact close releases
  // only the callback it actually published.
'''
s = once(s, '  registerRuntimeLifecycle(port, lifecycle);', comment + registration + close + '  registerRuntimeLifecycle(port, lifecycle);')
p.write_text(s)

p = Path('test/shards/impact-contracts.json'); j = json.loads(p.read_text())
name = 'raft-rs-runtime-lifecycle-entry'
j['contracts'][name]['description'] += ' A constructor refused before runtime admission publishes no membership reservation owner or native handle; each service initialization retains the exact named consensus failure and releases its own opening resources before reporting refusal.'
j['coupledPairs'][name]['description'] += ' Refused construction leaves earlier exact owners intact and service initialization consumes the canonical failure without bypassing its cleanup.'
ports = ['src/partition/partition-consensus-port-opening.js', 'src/message-group/message-group-consensus-port.js', 'src/wasm-service/wasm-service-consensus-port.js']
core = ['src/raft/raft-operation-port.js', 'src/raft/raft-rs-membership-administration.js']
j['contracts'][name]['owners'].extend(core + ports)
assert len(j['coupledPairs'][name]['endpoints']) == 2
j['coupledPairs'][name]['endpoints'][0]['owners'].extend(ports)
j['coupledPairs'][name]['endpoints'][1]['owners'].extend(core)
witness = 'test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js'
for name in ['raft-rs-runtime-lifecycle-entry', 'raft-rs-runtime-application-transaction', 'partition-raft-operation-port']:
    assert witness not in j['contracts'][name]['tests']
    j['contracts'][name]['tests'].append(witness)
    j['coupledPairs'][name]['witnessTests'].append(witness)
j['contracts']['partition-raft-operation-port']['owners'].append(ports[0])
j['coupledPairs']['partition-raft-operation-port']['endpoints'][1]['owners'].append(ports[0])
p.write_text(json.dumps(j, indent=2, ensure_ascii=False) + '\n')

for name, expected in EXPECTED.items():
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    assert actual == expected, (name, expected, actual)
print(json.dumps({'localMeasuredCandidate': '069ea51cce08f486f8dee77e24dbf3f862986112', 'sha256': EXPECTED, 'exactContentMatched': True}, indent=2))
