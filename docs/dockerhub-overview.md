<!--
  RETIRED PUBLICATION SOURCE (2026-09-13).

  Docker Hub no longer publishes this file. The release workflow publishes the
  root README.md from the exact release tag and verifies Docker Hub reports the
  same prose after relative-link completion.

  release.yml must not use this file as a publication source. New user-facing
  Docker Hub content belongs in README.md.
-->

# Docker Hub overview source retired

The Docker Hub repository overview is owned by the repository root
[`README.md`](https://github.com/psvensson/lagrange/blob/main/README.md).

For a release, `.github/workflows/release.yml` checks out the exact tagged
source, publishes that tag's `README.md` to Docker Hub, completes relative links
against the same tag, and reads the repository metadata back before the release
can succeed.

Do not add product, configuration, quick-start, or release prose here. That
would create a second owner for information that belongs in `README.md`,
`CHANGELOG.md`, or the GitHub Release page.
