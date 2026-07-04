# Self-hosted Forgejo Actions runner (Codeberg)

Runs the `.forgejo/workflows/` pipelines for
[codeberg.org/psvensson/lagrange](https://codeberg.org/psvensson/lagrange) on
your own machine. Needed because Codeberg's **hosted** runners cannot run our
release pipeline: they cap jobs at 10 minutes (`codeberg-tiny/small/medium`
labels), don't offer docker-in-docker, and don't provide the `docker` label
our workflows target — while `release.yml` runs the ~40-60 min `test:ci` and
pushes a Docker image.

## One-time setup

1. **Enable Actions on the repo** (if not already): repo Settings → Units →
   check "Actions".
2. **Create the runner**: repo (or account) Settings → Actions → Runners →
   *Create new runner*. It shows a **UUID** and a **Token** (once only).
   Forgejo 15 has no `register` step — these credentials go straight into the
   daemon config.
3. **Configure + start** (from this directory):
   ```sh
   ./setup.sh <UUID> <TOKEN>
   ```
   The runner should appear as *Idle* under Settings → Actions → Runners.
4. **Add the registry secrets** (release pipeline pushes the Docker image):
   repo Settings → Actions → Secrets — `REGISTRY_USER` (Codeberg username)
   and `REGISTRY_TOKEN` (access token with `package:write`).

## Triggering the release pipeline for an existing tag

Workflows fire on tag *push*. For a tag pushed before the runner existed:

```sh
git push --delete origin v0.1.0
git push origin v0.1.0
```

(Deleting and re-pushing a tag re-fires `release.yml`. The tag object is
unchanged locally — same commit, same annotation.)

## Reading pipeline logs locally

The daemon runs at `log.level: debug`, which duplicates **every job/step
output line** into the runner container's stdout — below debug the runner
discards job output locally (NullLogger) and it exists only in the Codeberg
web UI. Docker retains that stdout in rotated files (compose `logging:` block,
3 × 100 MB ≈ a couple of full release runs), so the latest runs always have a
local copy that overwrites itself over time.

```sh
./job-log.sh          # full log of the most recent job (e.g. after a failure)
./job-log.sh --list   # task ids still retained locally
./job-log.sh 7176575  # one specific task
./job-log.sh -f       # follow the currently running job live
```

Applies from the next daemon restart after changing `data/config.yml`
(`docker compose restart` — but never while a `FORGEJO-ACTIONS-*` job
container is running).

## Design notes

- **Host-socket pattern**: the runner and its job containers share the host
  Docker daemon (`/var/run/docker.sock`), so release steps can
  `docker build`/`docker push` directly. This is a deliberate
  isolation-for-simplicity trade for a personal machine serving its owner's
  own repository. Do NOT reuse this setup for untrusted repos — switch to
  the docker-in-docker sidecar pattern first.
- **capacity: 1** — the repo's gates are load-sensitive (see the project's
  gates-run-solo discipline); one job at a time.
- Job image `ghcr.io/catthehacker/ubuntu:act-latest` ships docker CLI, git,
  curl; `actions/setup-node` installs Node per the workflow.
- The runner connects outbound to codeberg.org; no inbound ports needed.
- `data/` (registration state + config) is gitignored — the `.runner` file
  holds the instance credential.
