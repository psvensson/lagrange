---
audience: evidence
recorded: 2026-11-14
quest: comparative-campaign-explicit-provisioning
---

# Evidence: `comparative-campaign-explicit-provisioning`

This directory contains the in-git evidence artifacts for quest `comparative-campaign-explicit-provisioning`:

- `gen-storage-owner-job.mjs.txt` - Generator script that invokes `deployLagrangeCluster` from the candidate checkout and emits the lab shell job verifying real root (`0:0`) and runtime (`10001:10001`) storage-root ownership preparation and foreign-ownership refusal (`job 238d1907-1d00-4264-86e8-51d8c2ec24df` on `tv-dator` at `d406588e45c42a492e759773e87e2277f5077c32`).
- `independent-verification-d406588e4.md` - Independent verification report (`APPROVE` of `d406588e45c42a492e759773e87e2277f5077c32` by `subagent:d2bd3cd6-dfeb-4572-9756-a1d88a25d27b`, covering closure of prior findings `B1`-`B9` and rules `CP-1`-`CP-12`, all 14 lab mutant kills `H1`-`H14`, storage-owner job `238d1907`, and full 27-file comparative suite `e6483e56`).
- `gcp-shakedown-2026-11-14.md` - Live GCP Class A provisioning shakedown report on `something-2e584` (`us-central1-a`, `e2-standard-4`, `ubuntu-2404-lts-amd64`), proving all 7 live-cloud items from section 4 of `independent-verification-d406588e4.md` and full `--teardown` leaving only `lagrange-ci-runner` (`TERMINATED`).
- `post-closure-applicability-2026-11-15.md` - Post-closure applicability and repair record covering concurrent joiner/standby startup ownership (`Promise.allSettled`), explicit cohort-preserving dataset reset (`created`, `reset-and-routable`, `schema-mismatch`, `reset-unsupported`) with canonical table and index (`idx_orders_customer_latest`) validation, restoration of general `DEFAULT_READINESS.attempts = 120` alongside Lagrange `FORMATION_ATTEMPTS = 420` (`DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS = 420_000`), post-probe deadline/cancellation gating and in-flight SSH settlement before cohort cleanup, watchdog cancellation classification (`failureClass: 'interrupted'`, never `'product_error'`), and cold-formation bootstrap/join timeout bounds.
- `lab-jobs/lab-job-d646f3de-e8a2-425f-b1bf-ebe4e4c9fe11/` and `lab-jobs/lab-job-1034c873-144c-4f88-a6e4-1a85294630c7/` - Retained raw lab job artifacts (`job.json`, `summary.json`, `tap.txt`) for the 15-file comparative and deployer harness suite on `adam-laptop` (`138` assertions) and `adams-gamla` (`135` assertions).
