---
audience: evidence
recorded: 2026-11-14
quest: comparative-campaign-explicit-provisioning
---

# GCP Class A Shakedown Report (`2026-11-14`)

- **Branch / Commit Tested:** `work/comparative-campaign-no-fallback-20261114` at `4301d9b6ba8ef0c9cd93d2d5d7e3b46aa9a82716` (code candidate `d406588e45c42a492e759773e87e2277f5077c32`)
- **GCP Project / Account / Zone / Class:** `something-2e584` (`psvensson@gmail.com`), `us-central1-a`, Class A (`e2-standard-4`, 4 vCPUs, 15.6 GB RAM, `ubuntu-2404-lts-amd64` in `ubuntu-os-cloud`, `50GB pd-ssd`)
- **Evidence Directory:** `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/measurement-prep/gcp-shakedown-2026-11-14/`

## 1. Pre- and Post-Shakedown GCP Safety Audit

- **Before (`before-instances.txt`, `before-firewall.txt`):**
  - Instances: only `lagrange-ci-runner` (`europe-north1-a`, `n2-standard-16`, `TERMINATED`).
  - Firewall rules matching `name~lagrange-bench`: none (`0`).
- **After (`after-instances.txt`, `after-firewall.txt`, `step4-teardown.stdout.txt`):**
  - `provision-gcp.sh --teardown` printed:
    - `[gcp] gcloud account psvensson@gmail.com, project something-2e584`
    - `[gcp] Teardown: VMs lagrange-bench-1 lagrange-bench-2 lagrange-bench-3 lagrange-bench-4 lagrange-bench-5 lagrange-bench-6 and firewall rule lagrange-bench-internal in something-2e584/us-central1-a`
    - `[gcp] deleted VM lagrange-bench-1` .. `lagrange-bench-6`
    - `[gcp] deleted firewall rule lagrange-bench-internal`
    - `[gcp] Teardown complete: no VM of lagrange-bench remains in something-2e584/us-central1-a.`
  - Post-teardown `gcloud compute instances list --project=something-2e584`: only `lagrange-ci-runner` (`europe-north1-a`, `TERMINATED`).
  - Post-teardown `gcloud compute firewall-rules list --project=something-2e584 --filter="name~lagrange-bench"`: empty (`0`).

## 2. Live Proof of the 7 Items in `independent-verification-d406588e4.md` Section 4

1. **Item 1 - `gcloud compute firewall-rules create` & `gcloud compute instances create` (`step1-create.stdout.txt`, `live-instances.txt`, `live-firewall.json`):**
   - `./docs/benchmarks/cloud/provision-gcp.sh` printed the active `gcloud` account and project (`psvensson@gmail.com`, `something-2e584`), created `lagrange-bench-internal` (`tcp:1-65535,udp:1-65535,icmp`, target/source tag `lagrange-bench-node`) and 6 `e2-standard-4` VMs (`lagrange-bench-1..6`) in `us-central1-a` with `ubuntu-2404-lts-amd64` (`ubuntu-os-cloud`), `50GB pd-ssd`, and explicit `ssh-keys` metadata (`bench:<ed25519 pubkey>`), and exported all 8 variables (`HOSTS`, `SSH_HOSTS`, `SSH_USER`, `IMAGE_FAMILY`, `IMAGE_PROJECT`, `BOOT_DISK_SIZE`, `BOOT_DISK_TYPE`, `FIREWALL_ALLOW`).
   - Note: `gcloud compute instances create` emits a standard informational warning on stderr (`Disk size: '50 GB' is larger than image size: '10 GB'`), which Ubuntu 24.04 cloud-init automatically resizes on boot.

2. **Item 2 - Startup script (`apt-get update && apt-get install -y docker.io git && systemctl enable --now docker`) on fresh `ubuntu-2404-lts-amd64` (`step1-operator-prep.txt`):**
   - Completed cleanly on all 6 VMs within ~60-90s of instance creation.
   - Observed versions on all 6 VMs: Docker Server `29.1.3` (`containerd` image store) and `git version 2.43.0`.

3. **Item 3 - Operator Docker group grant & non-interactive SSH login (`step1-operator-prep.txt`):**
   - `sudo usermod -aG docker bench` succeeded on all 6 VMs via GCE's `google-sudoers` group.
   - Verified on the next non-interactive `ssh -o BatchMode=yes` login on every VM: `docker info --format "{{.ServerVersion}}"` returned `29.1.3` without `sudo`.

4. **Item 4 - Registry `docker pull` on GCE VMs via `./docs/benchmarks/cloud/provision-gcp.sh --place` (`step2-place.stdout.txt`):**
   - Pulled and verified all 6 data-role images on each of the 3 data VMs (`10.128.15.193`, `10.128.15.192`, `10.128.15.195`):
     - `postgres:17-alpine` (`sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065`)
     - `psvensson/lagrange@sha256:c0fcc0d3df37e3b1c4760edea289ac5fb9ad9fd745e489b0f1b44b4e31da46fb` (`imageId: sha256:c0fcc0d3...`, `imageStore: "containerd"`, `contentIdentity: "sha256:3c263af6030eea3c663dcd863813bcbcb03acdeb3c7ded8870199f4c251e2270"`)
     - `pingcap/pd:v8.5.8` (`sha256:424e896800e42e1b7eb585b604c8daa3454110d0f0df5ab41f7c5f49164d3aef`)
     - `pingcap/tikv:v8.5.8` (`sha256:ab84580b6795868940231aa778a34b082d19e4417e6d66f755c609bebdbbfd69`)
     - `pingcap/tidb:v8.5.8` (`sha256:df168c764bf2dfdb166dc37a5c3b0e210d29d5f3ab2d33317fd0fdf7b32037f5`)
     - `mysql:8.4.11` (`sha256:0f51e63e537a1f176423fa03ef559aabe6fa4372a53160a44bc7e75da7d15364`)
   - Pulled and verified `postgres:17-alpine` on the client VM (`10.128.0.62`).

5. **Item 5 - `git push` over real `ssh` with `GIT_SSH_COMMAND` (`step2-place.stdout.txt`):**
   - `provision-gcp.sh --place` initialized `/home/bench/lagrange` on the client VM (`10.128.0.62` / `104.197.215.84`), pushed controller `HEAD` (`4301d9b6ba8ef0c9cd93d2d5d7e3b46aa9a82716`) over OpenSSH to `+4301d9b6...:refs/bench/harness`, checked out `--detach`, and verified `head: "4301d9b6ba8ef0c9cd93d2d5d7e3b46aa9a82716"`.

6. **Item 6 - Root `npm ci` on a fresh `ubuntu-2404-lts-amd64` VM (`step2-place.stdout.txt`):**
   - With `node-v22.23.2-linux-x64.tar.gz` unpacked to `/home/bench/node-v22.23.2-linux-x64` (`--client-node /home/bench/node-v22.23.2-linux-x64/bin/node`, `node v22.23.2`, `npm 10.9.8`), root `npm ci` in `/home/bench/lagrange` succeeded on **attempt 1** (`exit 0`) on fresh `ubuntu-2404-lts-amd64` with **no** extra apt packages (`build-essential`/`python3` were not required because prebuilt Linux x64 binaries are used).
   - `npmPathPrefix(host.nodePath)` in `comparative-benchmark-workload-call-site.js` properly prepended `/home/bench/node-v22.23.2-linux-x64/bin` to `PATH` so `npm`'s `#!/usr/bin/env node` shebang resolved `node` even when Node was not installed in `/usr/bin`.

7. **Item 7 - `npm cache add` from `registry.npmjs.org` serving `npm ci --offline` (`step2-place.stdout.txt`, `step3-live-prep-verify.json`):**
   - `provision-gcp.sh --place` added all 12 tarballs from `test/distributed/reference-client/package-lock.json` via `npm cache add` (`npm 10.9.8`) and verified `npm ci --offline --prefix test/distributed/reference-client --ignore-scripts` (`driverInstall: "installed"`).
   - In Step 3b (`step3-live-prep-verify.json`), `prepareLoadGeneratorCheckout` created a detached campaign worktree `/home/bench/lagrange/test-output/bench-worktrees/gcp-shakedown-verify` at `4301d9b6...`, ran `npm ci --offline --prefix test/distributed/reference-client --ignore-scripts` (`status: "installed"`, `exitCode: 0`, `added 12 packages, and audited 13 packages in 559ms`, `missing: []`), and cleanly removed/pruned the worktree (`closure: {status: "complete", error: null}`).

## 3. Step 3a `--dry-run` Verification (`step3-dry-run.json`)

- `node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp ... --dry-run` exited `0` with empty stderr and emitted a `lagrange-comparative-campaign-plan/v3` plan binding data hosts `10.128.15.193`, `10.128.15.192`, `10.128.15.195` and client host `10.128.0.62` (`manifestDigest: sha256:1d0c914aab2e1f0602f02a9da1fa77ecbdcd2da0f4b4b5095b6f1709a6c1c82f`).
