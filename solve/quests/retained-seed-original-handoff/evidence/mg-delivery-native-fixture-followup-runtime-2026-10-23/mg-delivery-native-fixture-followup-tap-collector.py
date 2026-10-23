import base64,gzip,hashlib,json,os,pathlib,subprocess
assert os.environ['LAB_HOST']=='tv-dator','original artifact lives on tv-dator'
root=pathlib.Path('/home/peter/.local/state/lagrange-lab-worker/generic/runs/890bbfaa-50ff-4ff7-867c-8defc512040d/work/source')
expected='036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2'
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==expected,'original source identity changed'
relative='.tap/test-results/test/message-group/message-group-native-provisional-route.test.js.tap'
p=root/relative
assert p.is_file() and not p.is_symlink(),'original TAP artifact is unavailable'
data=p.read_bytes(); packed=gzip.compress(data,mtime=0)
print(json.dumps({'schema':'rs-raft-original-tap-artifact/v1','original_job':'890bbfaa50ff4ff7867c8defc512040d','original_host':'tv-dator','original_source_sha':expected,'artifact':relative,'original_bytes':len(data),'original_sha256':hashlib.sha256(data).hexdigest(),'gzip_bytes':len(packed),'gzip_sha256':hashlib.sha256(packed).hexdigest(),'encoding':'gzip-base64','data':base64.b64encode(packed).decode()}))
