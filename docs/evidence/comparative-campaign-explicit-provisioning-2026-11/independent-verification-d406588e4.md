---
audience: evidence
recorded: 2026-11-14
quest: comparative-campaign-explicit-provisioning
---

# Independent Verification (`d406588e45c42a492e759773e87e2277f5077c32`)

VERDICT: APPROVE for d406588e45c42a492e759773e87e2277f5077c32

Scope: between candidate code commit `d406588e45c42a492e759773e87e2277f5077c32` (tree `5eac1f714d104b35d8b7923cc5e9ab6ddcb82231`) and `dcdaec5c94843cd7b47004872c3d0478def474e7` (`HEAD`), only `solve/quests/comparative-campaign-explicit-provisioning/{evidence/receipt.json,log.ndjson}` changed.

## 1. Closure of All Prior Verifier Rejections (B1-B9) and Rules CP-1-CP-12

- **B1 & B2 (GCP provisioning in code and awaited harness identity):**
  - `docs/benchmarks/cloud/provision-gcp.sh:65-77` (`--place`) invokes `docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp --provision`.
  - `run-comparative-benchmarks.mjs:448-465` (`provisionGcpHosts`) awaits `harnessIdentity(manifest)` (`:454`), reads the reference-client lockfile at `gitCommit` (`readReferenceClientLock(REPO_ROOT, gitCommit)`), derives the plan from `campaignImagesByRole`, and runs `provisionComparativeHosts` (`test/distributed/harness/comparative-benchmark-provisioning.js:234-260`).
  - Every placed artifact is re-verified with the campaign's own checks (`ensureProductImages`, `resolvePinnedImage`, `git rev-parse HEAD === harnessCommit`, `installReferenceClient`).
- **B3, B4 & CP-7 (Storage preparation and real-ownership witnesses):**
  - `test/distributed/harness/real-product-deployer-lagrange.js:161-187` prepares each node's `--storage-root` directory via a throwaway `postgres:17-alpine` container (`--pull=never`), refusing non-empty foreign-owned directories (`deployment_command_failed`, reason `storage_foreign_owner`, exit 3) and surfacing any non-foreign container failure (`storage_owner_unprepared`).
  - `test/distributed/harness/__tests__/comparative-benchmark-generated-commands.test.js:84-146` executes the deployer's generated command lines through `comparative-benchmark-local-shell-fixture.js` (real `sh`, `stat`, `ls`, `mkdir`) covering absent, empty, foreign-owned non-empty, runtime-owned non-empty (`runtimeOwner: '10001:10001'`), and helper-container failure (`images: []`).
  - `docs/evidence/comparative-campaign-explicit-provisioning-2026-11/gen-storage-owner-job.mjs.txt` captures the exact production deployer command lines from `deployLagrangeCluster`. Running `gen-storage-owner-job.mjs` against `d406588e4` matches the `user.sh` payload in `measurement-prep/storage-owner-generated-d406588e/intent.json` (job `238d1907-1d00-4264-86e8-51d8c2ec24df` on `tv-dator`, `COMPLETE`, `exit_code: 0`) byte-for-byte, and matches job `1795d38a-00a8-4b86-8f00-3dfe0679d944` at `7ecc336c9` byte-for-byte modulo the candidate SHA header.
- **B5 (Root `npm ci` failure guard witnessed):**
  - `test/distributed/harness/comparative-benchmark-provisioning.js:197-203` throws `provisioning_dependencies_not_installed` on non-zero `npm ci` exit; witnessed through the real CLI entrypoint in `comparative-benchmark-provisioning-entrypoint.test.js:264-274`.
- **B6, B8 & CP-12 (No SSH key search, no `$USER` fallback, no `gcloud config` project fallback, planted-value witness fidelity):**
  - `docs/benchmarks/cloud/provision-gcp.sh:87,172-177` requires `PROJECT_ID`, `SSH_USER`, and `SSH_PUBLIC_KEY_FILE` (`-f`, `-r`, `-s`), refusing with `usage` (`exit 2`) before any `gcloud` call, and always passes `--metadata="ssh-keys=${SSH_USER}:${SSH_PUB_KEY}"` (`:218`).
  - `docs/benchmarks/cloud/run-comparative-benchmarks.mjs:253` uses `sshUser: env.SSH_USER || ''` with no `env.USER` fallback.
  - `test/distributed/harness/__tests__/provision-gcp-script.test.js:39-42,110-120,206-220` plants `id_ecdsa.pub`, `id_rsa.pub`, and `google_compute_engine.pub` in `${HOME}/.ssh`, sets `USER: 'probed-user'`, and makes the `gcloud` stand-in answer `probed-project` and `lagrange-distributed-harness-v1`. Mutants restoring any fallback (`H9`, `H10`, `H11`) are killed.
- **B7 & H12/t1 (Teardown failure reporting and delete tally):**
  - `docs/benchmarks/cloud/provision-gcp.sh:127-170` calls `print_account`, lists existing campaign VMs, deletes present VMs while tallying any failed delete (`failed+=("VM ${node}")`), lists and deletes the firewall rule while tallying any failure, re-lists VMs to confirm none remain, and exits 1 (`fail "teardown incomplete; may still be billed: ..."`) if `failed` is non-empty. Witnessed in `provision-gcp-script.test.js:263-317` and mutant `H12` (`cbe151b0`).
- **B9 & CP-8 (Firewall rule never reused):**
  - `docs/benchmarks/cloud/provision-gcp.sh:187-197` checks `firewall_rule_names` and fails closed (`exit 1`) before creating anything whenever `${FIREWALL_RULE}` already exists, directing the operator to run `--teardown`. Witnessed in `provision-gcp-script.test.js:224-249` and mutant `H1` (`7ef29275`).
- **CP-9 (Every fixed value is an explicit, printed, exported, and recorded default):**
  - `BOOT_DISK_SIZE` (`50GB`), `BOOT_DISK_TYPE` (`pd-ssd`), and `FIREWALL_ALLOW` (`tcp:1-65535,udp:1-65535,icmp`) are documented in `provision-gcp.sh:38-41` and `docs/benchmarks/cloud-reproduction-guide.md:135-136,148-150,169-170`, printed before the first create (`provision-gcp.sh:182`), passed to `gcloud` (`:194,227-228`), exported (`:259-261`), required by `--place` (`:67-69`) and `--provision` (`run-comparative-benchmarks.mjs:171-173,232-236`), and recorded per host in `provisioned.data[*].vm` and `provisioned.client.vm` (`comparative-benchmark-provisioning.js:243,255`). Witnessed by `provision-gcp-script.test.js`, `comparative-benchmark-provisioning.test.js`, `comparative-benchmark-provisioning-entrypoint.test.js`, and mutants `H2`, `H3`, `H4`, `H5`.
- **CP-10 (`--place` requires all 8 variables and exits 2 via `usage`):**
  - `docs/benchmarks/cloud/provision-gcp.sh:65-77` checks `HOSTS SSH_HOSTS SSH_USER IMAGE_FAMILY IMAGE_PROJECT BOOT_DISK_SIZE BOOT_DISK_TYPE FIREWALL_ALLOW` and calls `usage` (`exit 2`) before invoking `node` or `gcloud`. Witnessed in `provision-gcp-script.test.js:319-344` and mutants `H6` (`1a8dc7b5`) and `H13` (`f8049d51`).
- **CP-11 (`print_account` on both create and `--teardown`):**
  - `docs/benchmarks/cloud/provision-gcp.sh:120-125,128,179` reads `gcloud config get-value account`, fails closed (`exit 1`) before any create or delete when unreadable or empty, and prints `[gcp] gcloud account ${account}, project ${PROJECT_ID}`. Witnessed in `provision-gcp-script.test.js:153-161,180-184,268-271,310-314` and mutants `H7` (`20896053`), `H8` (`3560e38f`), and `H14` (`3e2cc682`).

## 2. Independent Verification of Lab Mutants (`H1`-`H14`) and Full Test Suite

All 14 mutant directories under `measurement-prep/rule-mutant-*` were inspected against their git commits, `job.json`, `summary.json`, and `full.log`:

| Mutant dir | Commit | Mutation | Lab job | Host | Result |
|---|---|---|---|---|---|
| `rule-mutant-928e26d0-H1` | `a4fd96181` | Existing firewall rule reused (`CP-8`) | `7ef29275` | `adams-gamla` | `FAILED` (`exit 1`, test 4) |
| `rule-mutant-928e26d0-H2` | `12c533d94` | `--boot-disk-type="pd-ssd"` literal restored (`CP-9`) | `589c5fb1` | `adams-gamla` | `FAILED` (`exit 1`, test 1) |
| `rule-mutant-928e26d0-H3` | `11bfd202c` | Boot disk and firewall values not printed (`CP-9`) | `0351243d` | `adam-laptop` | `FAILED` (`exit 1`, test 1) |
| `rule-mutant-928e26d0-H4` | `42a1da1dc` | `FIREWALL_ALLOW` not exported (`CP-9`) | `85668d6d` | `adam-laptop` | `FAILED` (`exit 1`, test 1) |
| `rule-mutant-928e26d0-H5` / `-carina` | `7ee2f5d02` | `firewallAllow` not recorded in `--provision` (`CP-9`) | `701147e9` / `19e30b8d` | `adam-laptop` / `carinas-windows` | `FAILED` (`exit 1`, entrypoint test 1) |
| `rule-mutant-928e26d0-H6` | `744d035a0` | `--place` missing value calls `fail` (`exit 1`) instead of `usage` (`exit 2`) (`CP-10`) | `1a8dc7b5` | `carinas-windows` | `FAILED` (`exit 1`, test 7) |
| `rule-mutant-928e26d0-H7` | `f31abe182` | `print_account` omitted on create (`CP-11`) | `20896053` | `carinas-windows` | `FAILED` (`exit 1`, test 1) |
| `rule-mutant-928e26d0-H8` | `92d909d37` | Empty active `gcloud` account tolerated (`CP-11`) | `3560e38f` | `carinas-windows` | `FAILED` (`exit 1`, test 1) |
| `rule-mutant-928e26d0-H9` | `29e315621` | `~/.ssh` key search fallback restored (`CP-12`, verifier `k1`) | `220c63e9` | `carinas-windows` | `FAILED` (`exit 1`, test 3) |
| `rule-mutant-928e26d0-H10` | `5649f41f9` | `PROJECT_ID` looked up from `gcloud config` (`CP-12`) | `bdf9ab17` | `tv-dator` | `FAILED` (`exit 1`, tests 3 & 6) |
| `rule-mutant-928e26d0-H11` | `66ff20067` | `SSH_USER` falls back to `$USER` (`CP-12`) | `525ae3b9` | `adams-gamla` | `FAILED` (`exit 1`, test 3) |
| `rule-mutant-928e26d0-H12` | `60e0387d5` | Failed VM delete omitted from `failed` tally (`B7`, verifier `t1`) | `cbe151b0` | `carinas-windows` | `FAILED` (`exit 1`, test 6) |
| `rule-mutant-d406588e-H13` | `b7dcf919a` | `IMAGE_PROJECT` omitted from `--place` required check (`CP-10`) | `f8049d51` | `carinas-windows` | `FAILED` (`exit 1`, test 7) |
| `rule-mutant-d406588e-H14` | `d4af32b4f` | `print_account` omitted on `--teardown` (`CP-11`) | `3e2cc682` | `carinas-windows` | `FAILED` (`exit 1`, test 6) |

*(Note: in `log.ndjson` line 18 and `receipt.json` line 23, the short job IDs for `H2`, `H10`, and `H11` were transposed among those three rows; the table above records the exact `job.json`/`summary.json` pairing, and all three mutants were killed on the lab.)*

- **Full comparative suite on the lab (`script-green-d406588e`):** job `e6483e56-0a1f-49f7-9fee-4e8b214b21af` on `carinas-windows` at commit `d406588e45c42a492e759773e87e2277f5077c32` (tree `5eac1f714d104b35d8b7923cc5e9ab6ddcb82231`) finished `COMPLETE`, `exit_code: 0`, 27/27 test files, 260 assertions passing.
- **Local verification runs:** `node scripts/solve.js probe --id comparative-campaign-explicit-provisioning` reports `metric 1 target 0` (only `independent-verification` pending); local execution of `provision-gcp-script.test.js`, `comparative-benchmark-runner-lab-default.test.js`, `comparative-benchmark-provisioning.test.js`, `comparative-benchmark-provisioning-entrypoint.test.js`, and `comparative-benchmark-generated-commands.test.js` passed (37/37 tests, 0 failures), and `npx eslint` on all touched JS/MJS files and `npm run audit:quest-log-append-only` are clean.

## 3. `harness-fidelity` Checklist

1. **A control that detects the claimed defect:** Red lab jobs `527c983f` (`44dabbfa5`) and `ae0b1bae` (`baab5f6a0`) fail on the original fallback code; 80+ lab mutant jobs across rounds (`m1`-`m12`, `x1`-`x2b`, `s1`-`s5`, `H1`-`H2`, `L1`-`L4`, `W1`-`W6`, `R1`-`R2`, `D1`-`D6`, `P1`-`P17`, `C1`-`C9`, `S1`-`S3`, `I1`-`I3`, `G1`-`G25`, and `H1`-`H14` above) fail on named assertions when individual guards are removed or fallbacks restored.
2. **Stub honesty at the binding seam:** `provision-gcp-script.test.js` runs `provision-gcp.sh` with real `bash` against a `gcloud` stand-in that plants fallback values (`probed-project`, `lagrange-distributed-harness-v1`, `~/.ssh/id_*.pub`) to catch any probe or search; `comparative-benchmark-provisioning-entrypoint.test.js` runs `run-comparative-benchmarks.mjs` with only `ssh` and `git push` shimmed on `PATH`; `comparative-benchmark-generated-commands.test.js` executes generated shell commands with real `sh`, `stat`, `git`, and `npm`.
3. **Time fidelity:** Inapplicable to provisioning/refusal guards; readiness poll budgets in topology/generated-commands tests use explicit test options (`attempts: 2, intervalMs: 0`) without altering production defaults.
4. **Field fidelity and producer conformance:** `thermalExclusion` (`comparative-benchmark-lab-hosts.js:158-164`) reads `decision.reason` as produced by `checkedThermalObservation` (`scripts/checks/wait-for-thermal-headroom.js`); `installReferenceClient` (`comparative-benchmark-workload-call-site.js:228-237`) parses npm 10's exact `ENOTCACHED` line format, verified against real `npm ci --offline` in `comparative-benchmark-generated-commands.test.js:231-257`.
5. **Vacuous assertions:** Planted keys in `HOME/.ssh`, `USER=probed-user`, and `gcloud` stand-in responses ensure no refusal passes merely because a fallback lookup returned empty (`CP-12`).
6. **Entry-path and owner fidelity:** Verified through the public entrypoints `docs/benchmarks/cloud/provision-gcp.sh` and `docs/benchmarks/cloud/run-comparative-benchmarks.mjs`, as well as `deployComparativeTarget('lagrange', ...)`.
7. **Evidence ceiling:** Explicitly stated in `solve/quests/comparative-campaign-explicit-provisioning/evidence/receipt.json` and `docs/benchmarks/cloud-reproduction-guide.md:171-175`.
8. **Failure and progress fidelity:** Every refusal and provisioning failure carries a distinct typed `code` and structured `diagnostic` (host, role, missing item/step), and exits before mutating subsequent state.

## 4. What Only a Real GCP Class A Shakedown Run Can Prove

Because no commands were executed against live GCP infrastructure in this quest prior to the shakedown, the following items required a real GCP Class A shakedown run (subsequently completed and recorded in `gcp-shakedown-2026-11-14.md`):
1. **Live `gcloud` CLI & API interaction:** Whether `gcloud compute instances create`, `instances describe`, `instances list`, `firewall-rules list`, `firewall-rules create`, and `firewall-rules delete` succeed under the operator's real GCP project IAM permissions, quotas, and VPC network configuration.
2. **VM startup script completion & package installation:** Whether `apt-get update -y && apt-get install -y docker.io git && systemctl enable --now docker` completes cleanly against the Ubuntu archive on `ubuntu-2404-lts-amd64` before the operator grants Docker access and runs `--place`, and what unpinned `docker.io` and `git` versions it installs.
3. **Operator prerequisite steps on fresh VMs:** Whether granting `SSH_USER` access to the Docker socket takes effect on a fresh non-interactive `ssh` login (`docker info`), and whether the operator-installed Node binary at `--client-node` (and the `npm` alongside it in `npmPathPrefix`) satisfies the repository's `engines` floor (`>=22.12.0`).
4. **Real registry pulls on GCE VMs:** Whether `docker pull --quiet` succeeds from Docker Hub for the digest-pinned `psvensson/lagrange@sha256:...` image and comparator tags (`pingcap/pd:v8.5.8`, `pingcap/tikv:v8.5.8`, `pingcap/tidb:v8.5.8`, `mysql:8.4.11`, `postgres:17-alpine`) without rate-limit or credential failures, and matches `--lagrange-image-content` when specified.
5. **Real `git push` over SSH to the client VM:** Whether `git push --quiet ssh://<user>@<ip><client-checkout> +<head>:refs/bench/harness` with `GIT_SSH_COMMAND` succeeds over real network SSH from a non-shallow controller repository into a freshly `git init`ed remote directory.
6. **Root `npm ci` on a fresh client VM:** Whether root `npm ci` in `--client-checkout` succeeds on a fresh Ubuntu VM (including native addon prebuilds such as `better-sqlite3` without `build-essential`/`python3`, and the repository's `prepare` lifecycle script).
7. **Offline reference-client install served by `npm cache add`:** Whether seeding the load generator's npm cache via `npm cache add <resolved-tarball-url>` for every package in `test/distributed/reference-client/package-lock.json` is sufficient for `npm ci --offline --prefix test/distributed/reference-client --ignore-scripts` to succeed inside the campaign's detached worktree without network access.
