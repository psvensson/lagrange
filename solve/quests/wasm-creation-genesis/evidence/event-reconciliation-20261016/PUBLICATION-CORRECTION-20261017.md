# Publication verification correction - 17 October 2026

The first publication produced a complete 103-file downloadable checkpoint, but
its ordinary directory staging respected the repository's log ignore rules.
Only 65 checkpoint files were actually tracked at b7266f3b83fcc6c6afd5a6bc85298e464da0af23;
38 original .log files remained only in the artifact. The original claim that
all 103 were committed was premature. The preserved source commit is unchanged.

This correction stages exactly those 38 hash-verified original text logs, without
changing ignore rules, production source, tests, assertions or prior evidence.
Before publication it reads every one of the 103 members from the proposed Git
tree and compares bytes to the original checkpoint; a clean worktree or complete
Actions artifact alone is no longer treated as evidence of Git completeness.

The source remains e221c8c63ae2baea9614c52db04b05336745f35f on PR #133 ancestry.
All current serving, home-lab, static, corpus and main-merge holds remain open.
No product tests or home-lab jobs execute in this evidence-only correction.
Historical publication records and first attempts remain unchanged; this record
supersedes only their incomplete Git-preservation claim. See the subsequent
verified publication receipt for the final head and all-file tree checks.
