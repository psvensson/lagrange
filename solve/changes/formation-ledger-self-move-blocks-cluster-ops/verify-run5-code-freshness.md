# Verify — run-5 code freshness (stale-code provenance audit)

Read-only provenance audit. No source changed. Answers the UNCONFIRMED flag in
`eval-path-a-root.md` §1 / §3: did the last demo run ("run-5") execute the binary
that includes the four recent fixes on `main`, or was it a stale-code run?

## VERDICT: (A) run-5 included every source fix. Residual is REAL — proceed.

Confidence: **very high** (cryptographic content-fingerprint match, not a timing
inference). The self-move limit cycle chased by this quest was measured against
code that already contains all committed fixes; no fresh re-run is required before
building the next fix.

---

## The run under audit ("run-5")

- Artifacts: `data/examples/service-data-affinity-demo/node-{0..4}.log`
  (+ per-node data dirs). This is the LATEST demo run — `find` shows **no** demo
  output (`node-*.log`, `events.ndjson`, `*.report.json`) newer than it.
- Wall window (from node-0 log, times are **UTC / `Z`**):
  - Seed boot: `2026-07-05T21:00:41.154Z` ("Distributed Database System starting")
  - Followers boot: `21:01:09.187–.233Z`
  - Shutdown (SIGTERM clean drain): `21:16:51.923Z`
  - Duration ≈ 16 min (matches the memory note's "ran 900s"). In local `+0200`
    this is **23:00:41 → 23:16:51 CEST**.

## How the code identity is pinned — `bootedSrcFingerprint`

Every node self-verifies the source it booted from and stamps it into its startup
log line. Mechanism:

- `src/index.js:708–727` (`resolveBootSourceProvenance`) calls
  `computeSourceFingerprint(dirname(import.meta.url))` = a fingerprint of the live
  `src/` directory the entrypoint loaded from, logged as `bootedSrcFingerprint`
  (`src/index.js:828`).
- `src/diagnostics/source-fingerprint.js` — `sha256-content-v1`: a **content**
  hash (not mtime/size) over every regular file under `src/`, order- and
  location-independent, first 16 hex chars. Its header comment states its exact
  purpose: proving "the container ran stale code (the fast-local reuse trap)."

All five nodes logged the **identical** fingerprint:

```
node-0..4 bootedSrcFingerprint = 55f3d546b06359b8
```

## Reproduction — matching the fingerprint to a commit

Computed `computeSourceFingerprint('src')` (the project's own algorithm) against
`git archive`-extracted `src/` trees:

| src tree state | fingerprint | == recorded? |
| --- | --- | --- |
| recorded in run-5 logs | `55f3d546b06359b8` | — |
| HEAD (`69c7039c`, src == `c78833f0`) | `55f3d546b06359b8` | **YES** |
| `ab15e03e` (BEFORE c78833f0's src change) | `2ae88bc1fd1d067b` | no |
| live working tree `src/` (currently clean) | `55f3d546b06359b8` | YES |

The recorded fingerprint matches the src tree **that includes** `c78833f0`'s change
and does **not** match the pre-`c78833f0` tree. Definitive.

## Per-fix determination

Commit times below are **UTC**; run-5 window is `21:00:41Z → 21:16:51Z`.

| Fix | Committed (UTC) | Touches `src/`? | In run-5? | Basis |
| --- | --- | --- | --- | --- |
| `56ebbedb` logging poison | 2026-07-05 19:25:26 | yes (`src/logging/logs-table-service.js`) | **YES** | committed 95 min before boot; folded into HEAD fingerprint match |
| `ab15e03e` create-lane slot | 2026-07-05 20:32:45 | yes (`src/rebalancer/*`) | **YES** | committed 28 min before boot; folded into HEAD fingerprint match |
| `c78833f0` over-target drain-REPLACE credit | 2026-07-05 21:20:04 | yes (`src/rebalancer/in-flight-aware-replica-count.js`) | **YES** | commit landed 3m13s AFTER run END, BUT the change was already in the working tree at boot — **proven** by fingerprint (recorded == HEAD, != pre-c78833f0) |
| `69c7039c` diagnose self-move cycle | 2026-07-05 21:38:21 | **no** (only `solve/` docs + quest JSON) | N/A | not a code change; cannot affect the running binary |

### The trap that looked real but wasn't

`c78833f0` was **committed after run-5 ended** — the naive timing check
("commit timestamp > run end ⇒ stale") would have (wrongly) flagged run-5 as
missing the over-target fix. It does not: this is the ordinary "run the demo to
verify, then commit the verified fix" workflow. The content fingerprint cuts
through the timing ambiguity — the edited
`src/rebalancer/in-flight-aware-replica-count.js` was present in the working tree
at 21:00:41Z boot, so all five nodes booted it.

## Stale-build risk assessment (build-vs-source path)

**No cached-build stale-code risk exists for this harness.** Nodes boot directly
from the repo `src/` (node process, `version 0.1.0`, dataDir under the repo:
`.../data/examples/service-data-affinity-demo/node-N`). There is no `dist/`,
prebuilt image tag, or `prepare`-hook artifact in the boot path — `src/index.js`
runs the live source. The `bootedSrcFingerprint` is computed at boot from the
actually-loaded `src/` directory, so even a hypothetical cache would be caught.
`srcFingerprintMatches` was `null` only because `SRC_FINGERPRINT` (the harness→
container expected-value channel) is unset in the local direct-source run — that
is the local (non-Docker) mode, not a mismatch.

## Bottom line

- All four commits: three are source fixes and **all three were in the booted
  code**; the fourth (`69c7039c`) is docs/diagnosis with no runtime effect.
- The measured residual — the ledger self-move limit cycle (~25 self-moves on
  `replica_operations-p1`, plateau at 53–54 completions) — was produced by the
  **post-c78833f0** code. It is a genuine residual, not a stale-code artifact.
- **Proceed** with fix selection for this quest (eval notes recommend Path B). No
  fresh demo re-run is needed on freshness grounds.

### Evidence pointers
- `data/examples/service-data-affinity-demo/node-{0..4}.log` — boot lines with
  `bootedSrcFingerprint`, boot/shutdown timestamps.
- `src/index.js:708–836`, `src/diagnostics/source-fingerprint.js` — fingerprint
  mechanism.
- `git show --name-only c78833f0` → `src/rebalancer/in-flight-aware-replica-count.js`.
- `git show --name-only 69c7039c` → `solve/` docs + quest JSON only (no `src/`).
