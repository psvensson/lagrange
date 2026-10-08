#!/usr/bin/env python3
"""Observation-only diagnostic of F-aj; no runtime patch or timeout alteration."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
out = Path(sys.argv[3]).resolve()
out.mkdir(parents=True, exist_ok=False)
path = root / 'test/query/partition-write-answer-consumers.test.js'
original = path.read_bytes()
text = original.decode()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip() == expected

def change(old, new):
    global text
    assert text.count(old) == 1, old[:100]
    text = text.replace(old, new, 1)

change('  await withPartitionedLeader(async ({services, members, partitionId,\n',
       '  const trace = [];\n'
       '  const traceStart = Date.now();\n'
       '  const record = (phase, detail = {}) => trace.push({\n'
       '    elapsedMs: Date.now() - traceStart, phase, ...detail});\n'
       '  try {\n'
       "    record('group-start');\n"
       '  await withPartitionedLeader(async ({services, members, partitionId,\n')
change('    const [r1, r2] = services;\n',
       '    const [r1, r2] = services;\n'
       "    record('group-ready');\n")
change('          sent.push({address, entryId: message.entryId});\n'
       '          return services[members.findIndex((member) =>\n'
       '            addressOf(member) === address)].handleRemoteQuery(message);',
       '          sent.push({address, entryId: message.entryId});\n'
       "          record('delivery-start', {address, entryId: message.entryId});\n"
       '          const response = await services[members.findIndex((member) =>\n'
       '            addressOf(member) === address)].handleRemoteQuery(message);\n'
       "          record('delivery-answer', {address, entryId: message.entryId, response});\n"
       '          return response;')
change('    const startedAtMs = Date.now();\n',
       '    const startedAtMs = Date.now();\n'
       "    record('client-start', {budgetMs: EXECUTOR_BUDGET_MS});\n")
change('          deadlineMs: startedAtMs + EXECUTOR_BUDGET_MS},\n      });',
       '          deadlineMs: startedAtMs + EXECUTOR_BUDGET_MS},\n'
       '      }).then((response) => {\n'
       "        record('client-answer', {response});\n"
       '        return response;\n'
       '      });')
change('    await r2.raft.campaign();',
       "    record('proposals-replicated');\n"
       '    await r2.raft.campaign();\n'
       "    record('campaign-requested');")
change("      RAFT_ROLE.LEADER), true, 'setup: r2 leads');",
       "      RAFT_ROLE.LEADER), true, 'setup: r2 leads');\n"
       "    record('r2-leading');")
change('    blocked.clear();',
       "    record('both-proposals-committed');\n"
       '    blocked.clear();\n'
       "    record('network-healed');")
change('    const held = await heldWrite;',
       '    const held = await heldWrite;\n'
       "    record('answers-joined', {answered, held});")
ending='  });\n});'
assert text.rstrip().endswith(ending)
text=text.rstrip()[:-len(ending)]+'''  });
  } finally {
    console.log('FAJ_TRACE ' + JSON.stringify({trace, executorBudgetMs: EXECUTOR_BUDGET_MS},
      (_key, value) => typeof value === 'bigint' ? value.toString() : value));
  }
});
'''
assert 'const EXECUTOR_BUDGET_MS = 8000;' in text
assert 'const TEST_TIMEOUT_MS = 30000;' in text
# Diagnostics must preserve all original assertion calls and refusal expectations.
assert text.count('assert.') == original.decode().count('assert.')
path.write_text(text)
(out/'instrumentation.patch').write_bytes(subprocess.check_output(['git','diff','--',str(path.relative_to(root))],cwd=root))
(out/'binding.json').write_text(json.dumps({'sourceSha':expected,
    'originalTestSha256':hashlib.sha256(original).hexdigest(),
    'instrumentedTestSha256':hashlib.sha256(text.encode()).hexdigest(),
    'assertionsUnchanged':True,'timeoutBudgetMs':8000,'runtimeChanged':False,
    'limits':'observation-only instrumented test; not uninstrumented pass rate or causal proof'},indent=2)+'\n')
start=time.monotonic()
try:
    with (out/'stdout.txt').open('wb') as output, (out/'stderr.txt').open('wb') as error:
        code=subprocess.run(['npm','run','test:file','--',str(path.relative_to(root))],
            cwd=root,stdout=output,stderr=error,check=False).returncode
    (out/'exit.txt').write_text(str(code)+'\n')
    traces=[]
    for line in (out/'stdout.txt').read_text().splitlines():
        if 'FAJ_TRACE ' in line:
            try: traces.append(json.loads(line.split('FAJ_TRACE ',1)[1]))
            except json.JSONDecodeError: pass
    assert len(traces)==1, 'one complete trace required; failed setup is not a retry diagnosis'
    (out/'trace.json').write_text(json.dumps({'exitCode':code,
        'durationSeconds':round(time.monotonic()-start,3),**traces[0]},indent=2)+'\n')
finally:
    path.write_bytes(original)
    subprocess.run(['git','diff','--exit-code','--','src',str(path.relative_to(root))],cwd=root,check=True)
print(json.dumps({'sha':expected,'exitCode':code,'tracePhases':[x['phase'] for x in traces[0]['trace']]}))
