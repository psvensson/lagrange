# Applied-position controls V5a EOF correction

Status: **TEST CONTENT FROZEN; BEHAVIOR UNRUN**.

V5 incorrectly reported `git diff --check` as a complete four-path proof. The
new applied-position file was untracked then, so that command did not inspect
its bytes. After root staged the explicit four paths, the check correctly
reported one redundant blank line at the new file's EOF.

V5a removes only that final blank line and preserves one terminal newline. No
other source, test, metadata, Quest, evidence history, index, commit, or runtime
state was changed by this correction.

## Exact test hashes

| Path | SHA256 | Lines |
| --- | --- | ---: |
| `test/test-helpers/participant-transaction-fixture.js` | `48c385ffd2ac0df93214af165feb608e679c566faa09b41f473f4a688e5a3e53` | 1172 |
| `test/partition/participant-release-protocol.test.js` | `41c00e05c22a714babbcf0943794d52108ec06114bcb232094ddcba84e719c9c` | 760 |
| `test/node/replica-handler-release-recovery.test.js` | `158bd7f029485af2e98974252b348f35b0a23358197d952210295c4ac7df4095` | 1415 |
| `test/partition/participant-release-applied-position.test.js` | `68d1a5bc9447ca21d92e930cd1a55db6e44f105fb533488e19ce2726a6ae34ab` | 939 |

## Proof

- `git diff --check` passes for the working-tree delta against root's staged V5.
- `git diff HEAD --check -- <all four paths>` passes and includes the corrected
  new file together with the three tracked modifications.
- `git diff --no-index --check /dev/null <new file>` returns the expected code 1
  because the file is new and emits no whitespace diagnostic.
- `node --check` passes for the corrected new file.
- The V5-to-V5a patch contains one deletion: the redundant EOF blank line.

No Git staging operation was performed; the index still contains root's prior
V5 snapshot and therefore shows the new file as `AM` until root restages it.
