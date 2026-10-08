#!/usr/bin/env python3
"""Observe the restart witness's independent SQLite reads, without caching them."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=False)
p = root / 'test/raft/raft-rs-backend/committed-membership-oracles.js'
original = p.read_bytes()
blob = hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest()
assert blob == '4eee7c31404b1e173aa5d6b3e65d864fba8697be', blob
before = '''function readOnly(dbFile, read) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}'''
after = '''const oracleProfile = {calls: 0, openMs: 0, readMs: 0, closeMs: 0};
const oracleProfileStart = performance.now();
process.once('exit', () => fs.writeFileSync(PROFILE_FILE,
  JSON.stringify({...oracleProfile, totalProcessMs: performance.now() - oracleProfileStart},
    null, 2) + '\\n'));
function readOnly(dbFile, read) {
  const started = performance.now();
  const independent = new Database(dbFile, {readonly: true});
  const opened = performance.now();
  oracleProfile.calls += 1;
  oracleProfile.openMs += opened - started;
  try {
    return read(independent);
  } finally {
    const readAt = performance.now();
    oracleProfile.readMs += readAt - opened;
    independent.close();
    oracleProfile.closeMs += performance.now() - readAt;
  }
}'''.replace('PROFILE_FILE', json.dumps(str(out / 'oracle-profile.json')))
s = original.decode()
assert s.count(before) == 1
p.write_text(s.replace(before, after))
try:
    subprocess.run(['node','--check',str(p)],check=True)
    (out / 'instrumentation.patch').write_bytes(subprocess.check_output(
        ['git','diff','--',str(p.relative_to(root))],cwd=root))
    started = time.monotonic()
    with (out / 'stdout.txt').open('wb') as stdout, (out / 'stderr.txt').open('wb') as stderr:
        code = subprocess.run(['npm','run','test:file','--',
          'test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js'],
          cwd=root,stdout=stdout,stderr=stderr,check=False).returncode
    (out / 'result.json').write_text(json.dumps({'exitCode':code,
      'elapsedMs':round((time.monotonic()-started)*1000), 'profileOnly':True,
      'testAssertionsChanged':False,'durabilityPragmasChanged':False,
      'sourceBlob':blob,'instrumentedBlobSha256':hashlib.sha256(p.read_bytes()).hexdigest()},indent=2)+'\n')
    if not (out / 'oracle-profile.json').exists():
        raise RuntimeError('profile did not engage; inspect retained output')
    print((out / 'oracle-profile.json').read_text())
finally:
    p.write_bytes(original)
    assert p.read_bytes() == original
