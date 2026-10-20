---
audience: development
documentClass: evidence
---

# Evidence representation and verification

Native TAP output includes whitespace on otherwise blank lines. The raw
outputs are preserved without trimming in `verbatim-utf8-evidence/1` JSON:
`utf8Text` re-encodes to the exact original bytes, with byte count and SHA-256
recorded alongside it. Each packet's `encoded-logs.json` maps original names
to these records.

The existing B manifests retain their original raw-log names and hashes.
Decode the corresponding JSON record before comparing those hashes.
Other new packet manifests directly hash their stored JSON records.
No transcript, result, timeout, assertion or source patch is normalized to
make a failure pass.

From a checkout containing this checkpoint, verify actual committed blobs:

```sh
python3 solve/epics/raft-rs-full-cutover/evidence/insight-execution-2026-10-20/verify-evidence.py HEAD
```

This reads Git objects, checks each preserved checksum manifest, validates
every encoded log and verifies the runtime files against the measured
candidate. It also refuses a subsequent change to source, tests, scripts or
package manifests relative to that candidate. It runs no product tests and
does not produce a Quest, corpus or release acceptance.

The [execution input manifest](execution-inputs.json) includes canonical
Solver upload references for the complete seed trace, exact raw/structured
static-audit archives, and a Git bundle of the controlled candidates. Solver
recorded each upload only after download and hash verification.

The Git bundle requires `be93c7e5d9a76a39e76a530c93715521b2281356`, retained in
this branch's ancestry. It preserves six named local control refs, including
deliberately defective mutants, as archival data. It publishes no mutant Git
branch and authorizes no mutant execution, integration or production use.
Its [verification output](control-source-bundle-verification.txt.json) lists
the exact refs and prerequisite. The blocked retry mutation has no commit;
its exact patch and hook failure remain in the A preparation packet.

The static archives preserve historical diagnostic output verbatim outside
the live repository documentation surface. Their original findings remain
red. The independent attribution packet and its terminology correction stay
separate from the measured runtime candidate.
