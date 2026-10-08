#!/usr/bin/env python3
"""Apply the known cache-test baseline and its T1 extension, not sibling source."""
from pathlib import Path
import hashlib
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
upstream = '38cd8d4c913ccc3bd20d1914377cc528d1be8d1c'
relative = 'test/integration/message-group-membership-claim-cache.integration.test.js'
raw = subprocess.check_output(['git', 'show', upstream + ':' + relative], cwd=root)
blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
assert blob == '03fe9eabe7f13ee72537044f45b78fee6b7be37e'
assert not (root / relative).exists(), 'do not overwrite an independently advanced test'
text = raw.decode()
anchor = "import {SERVICE_TYPE} from '../../src/constants/service.js';"
assert text.count(anchor) == 1
imports = """import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
"""
text = text.replace(anchor, imports + anchor, 1)
text = text.replace('repository NULL-lease claim becomes visible through real SystemTableCache',
    'repository claim and T1 terminal abandonment reach real SystemTableCache', 1)
anchor = "      assert.equal(cache.getAll(TABLE).filter((row) => row.operation_id === id).length, 1);"
assert text.count(anchor) == 1
text = text.replace(anchor, Path(__file__).with_name('t1-cache-extension.js').read_text() + anchor, 1)
text = text.replace(' * Actual SQL/Raft/CDC/SystemTableCache integration for the repository claim.',
    ' * Actual SQL/Raft/CDC/SystemTableCache integration for claim and terminal abandonment.')
(root / relative).write_text(text)
# The same classification is already introduced by the original cache-test PR.
# Reuse its semantic home rather than treating this fixture as membership acceptance.
registry = root / 'scripts/checks/test-subsystem-classification-constants.js'
text = registry.read_text()
anchor = 'export const SUBSYSTEM_OVERRIDES = Object.freeze({\n'
assert text.count(anchor) == 1 and relative not in text
text = text.replace(anchor, anchor + """  'test/integration/message-group-membership-claim-cache.integration.test.js': {
    subsystem: SUBSYSTEM_CDC_METADATA,
    reason: 'proves repository mutation visibility in SystemTableCache; seed and message group supply the fixture, not the asserted responsibility',
  },
""", 1)
registry.write_text(text)
print('Reused exact cache fixture ' + upstream + ' / ' + blob + '; added T1 only.')
