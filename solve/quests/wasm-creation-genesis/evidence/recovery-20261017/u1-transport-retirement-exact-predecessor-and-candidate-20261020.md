# U1 transport handler / routing red comparison (2026-10-20)

**Bounded direct differential**: [GitHub Actions #39408645094](https://github.com/psvensson/lagrange/actions/runs/39408645094)
ran **the same three original test-file blobs**, with Node 22
and the unchanged classified runner, on BOTH immutable source commits.
No GCP VM was provisioned or spent in this hosted comparison.

| Exact test file | Pre-U1 `381750de` | Current U1 `be25caa5` |
| --- | --- | --- |
| `test/node/replica-transport-handler-identity.test.js` | FAIL, 22 reported assertions | FAIL, 22 reported assertions |
| `test/partition/raft-rs-transport-demux.test.js` | FAIL, 16 reported assertions | FAIL, 16 reported assertions |
| `test/address/address-manager-peer-location-authority.test.js` | FAIL, 28 reported assertions | FAIL, 28 reported assertions |
| **Total** | **0/3 PASS, 66 assertions** | **0/3 PASS, 66 assertions** |

The exact old-source and candidate-source raw execution logs
remain in [old-source artifact 12258470632](https://github.com/psvensson/lagrange/actions/runs/39408645094/artifacts/12258470632)
and [candidate artifact 12257738985](https://github.com/psvensson/lagrange/actions/runs/39408645094/artifacts/12257738985).

All three failed filenames and their file-level TAP counts therefore
**predate** the U1 implementation, independently of the bulk
predecessor 119-file run. This is **not** proof of identical exact
failed assertions or causes: read both complete logs or a focused
first-substantive-error comparison before calling the specific
defect inherited. In particular the transport-handler retirement
boundary may still have changed under U1, even where the test was
already red. Do not weaken any retirement / address / demux
assertion.

This note extends the accepted review's **failure provenance only**.
The GCP all-selected cone is still genuinely RED
(1,779 PASS / 119 FAIL). The bundled direct predecessor run
[#39405963549](https://github.com/psvensson/lagrange/actions/runs/39405963549)
remains the owner of the complete 119-file predecessor outcome
when terminal. U1 whole combined 55-item review, multi-host
certification, U2 and `main` merge all remain blocked.
