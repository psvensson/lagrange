#!/usr/bin/env python3
"""One-shot lossless restoration of the user's saved C0 packet; no network."""
import base64
import hashlib
import io
import json
import lzma
from pathlib import Path
import sys
import zipfile

EXPECTED = '516ae2032ce70f01adec2daf95188e44e9bb43e3a94562c881c2d82f146da586'
HERE = Path(__file__).resolve().parents[2]
PARTS = HERE / 'solve/quests/cutover-transition-authority-review/evidence/preservation-transfer'
TARGET = Path(sys.argv[1]).resolve()
REPORT = Path(sys.argv[2]).resolve()

def digest(data):
    return hashlib.sha256(data).hexdigest()

encoded = ''.join((PARTS / f'part{i:02}.b64').read_text().strip() for i in range(1, 7))
raw = base64.b64decode(encoded, validate=True)
assert digest(raw) == EXPECTED, 'transfer bytes do not match the local packet'
decoder = lzma.LZMADecompressor(memlimit=128 * 1024 * 1024)
plain = decoder.decompress(raw, max_length=2 * 1024 * 1024)
assert decoder.eof and not decoder.unused_data, 'invalid or oversized packet'
packet = json.loads(plain)
assert packet['schema'] == 'c0-preservation-transfer/1'
assert packet['base'] == '41a8cdfb33ddc4acddafa192f7f5141a6ae38119'
assert len(packet['files']) == 19
cache = {}

def materialize(key):
    if key in cache:
        return cache[key]
    entry = packet['blobs'][key]
    if entry['kind'] == 'text':
        result = entry['content'].encode('utf-8')
    elif entry['kind'] == 'binary':
        result = base64.b64decode(entry['content'], validate=True)
    else:
        assert entry['kind'] == 'zip'
        stream = io.BytesIO()
        level = entry['compression_level']
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED,
                             compresslevel=level) as archive:
            archive.comment = base64.b64decode(entry['comment'])
            for member in entry['members']:
                info = zipfile.ZipInfo(member['name'], tuple(member['date_time']))
                for field in ['compress_type', 'create_system', 'create_version',
                              'extract_version', 'reserved', 'flag_bits', 'volume',
                              'internal_attr', 'external_attr']:
                    setattr(info, field, member[field])
                info.comment = base64.b64decode(member['comment'])
                info.extra = base64.b64decode(member['extra'])
                archive.writestr(info, materialize(member['blob']), compresslevel=level)
        result = stream.getvalue()
    assert digest(result) == key, f'content reconstruction mismatch: {key}'
    cache[key] = result
    return result

# Validate every path and all reconstructed bytes before writing anything.
writes = []
for name, key in packet['files'].items():
    relative = Path(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    allowed = (name == 'scripts/quest-evidence/cutover-workflow-crash-projection-baseline.js'
               or name == 'solve/quests/cutover-transition-authority-review/self-review-20261008.md'
               or name.startswith('solve/quests/cutover-transition-authority-review/evidence/self-review-20261008/'))
    assert allowed, f'path outside preservation scope: {name}'
    destination = TARGET / relative
    assert destination.resolve().is_relative_to(TARGET)
    assert not any(p.is_symlink() for p in [destination, *destination.parents])
    content = materialize(key)
    if destination.exists():
        assert destination.is_file() and destination.read_bytes() == content, f'overwrite refused: {name}'
    writes.append((destination, content, name, key))
for destination, content, _, _ in writes:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        with destination.open('xb') as handle:
            handle.write(content)
    assert destination.read_bytes() == content
REPORT.parent.mkdir(parents=True, exist_ok=True)
report = {'schema': 'c0-saved-packet-restoration/1', 'transferSha256': EXPECTED,
          'originalBase': packet['base'], 'files': {name: key for _, _, name, key in writes},
          'originalZipSha256': 'b0236d31651f8b4abee45c90e8d8e2afb75bb5eaad04489586f98714c02d3071',
          'overwrites': 0, 'runtimeChanges': False, 'allFileHashesVerified': True}
REPORT.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
