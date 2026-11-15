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
