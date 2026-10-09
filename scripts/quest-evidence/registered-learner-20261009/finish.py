from pathlib import Path
import os
import sys

def replace(path,before,after):
 p=Path(path);s=p.read_text()
 assert s.count(before)==1,(path,'correction anchor drift',before)
 p.write_text(s.replace(before,after))

phase=sys.argv[1]
if phase=='tests':
 p='test/integration/message-group-learner-runtime-authorization.integration.test.js'
 replace(p,"import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';", "import {committedMembershipContext} from '../../src/raft/raft-rs-committed-membership-context.js';\nimport {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';")
 replace(p,"        const joint = {...actual, membership: {...actual.membership,\n          votersOutgoing: [...actual.membership.voters]}};", "        const membership = {...actual.membership,\n          votersOutgoing: [...actual.membership.voters]};\n        membership.configurationKey = raftRsConfStateKey({...membership, autoLeave: false});\n        const joint = {...actual, membership};")
elif phase=='source':
 p='src/rebalancer/replica-operation-message-group-membership-authorization.js'
 replace(p,'COMMITTED_MEMBERSHIP_STAMP_DEFECT}', 'COMMITTED_MEMBERSHIP_STAMP_DEFECT as STAMP_DEFECT}')
 replace(p,'COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT', 'STAMP_DEFECT.JOINT')
elif phase=='tools':
 replace(Path(os.environ['CARRIER'])/'tools.py','COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT','STAMP_DEFECT.JOINT')
else:
 raise ValueError('unknown correction phase')
