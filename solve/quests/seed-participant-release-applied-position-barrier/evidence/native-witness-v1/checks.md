# Native release boundary witness V1 — static command record

Binding production HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.

The commands below were run once before this freeze record was requested. Their
stdout/stderr was returned to the interactive tool call and was **not**
redirected to raw log files. This file records the commands and observed exit
results; it is not a reconstructed raw transcript.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `node --check test/partition/partition-admitted-group-fixture.js` | 0 | no output |
| `node --check test/partition/partition-release-fixture.js` | 0 | no output |
| `node --check test/partition/participant-release-native-application-order.test.js` | 0 | no output |
| `npx eslint test/partition/partition-admitted-group-fixture.js test/partition/partition-release-fixture.js test/partition/participant-release-native-application-order.test.js` | 0 | no output |
| `git diff --check -- test/partition/partition-admitted-group-fixture.js test/partition/partition-release-fixture.js test/partition/participant-release-native-application-order.test.js` | 0 | no output |
| `npm run -s test:metadata:refresh` | 0 | generated 2,369 tests; primary digest `fnv1a32-f731fa14`; resource digest `fnv1a32-77e2eed6`; subsystem digest `fnv1a32-ebdf0e25`; impact snapshot digest `b2c9623cc9b1fc9553c784d44ecd6f8cdabecf1dee395d34fa07ce111110954c` |

The subsequent whole-worktree `git diff --check` returned exit 0. A read-only
`git diff --quiet -- src` returned exit 0, and `HEAD:src` resolved to tree
`4ff29d950a074768b3bcc40f6df310abda9827c0`.

No behavioral test or lab command was run by this worker.
