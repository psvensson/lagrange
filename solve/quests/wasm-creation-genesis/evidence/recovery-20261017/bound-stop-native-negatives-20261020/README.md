# Bound STOP controlled negatives

These are isolated experimental source mutations, not production changes.
The unchanged positive witness was measured at
`0e19f5e07da01d6d8fe59131b7617ac8ed33b758` on the same locked adams-gamla.
Both mutations were measured with zero retries and identical test bytes.

- B1 `aa66604f7e9dbfecd952d30e8e124317175c4dea`: replacing full-origin
  targeting with service-ID targeting closed the published successor's real DB.
  The second close-debt case still passed. Its now-unused helper/import were
  removed to satisfy normal hooks, after independent review.
- B2 `4654c81a5e50326f9cded41bedf0cc6e0db0384a`: returning FINAL from an
  actually blocked native close falsely completed REMOVE. The first replay
  isolation case still passed.

Each packet contains the original controller/native output and result ledger.
`source-patch.json` encodes exact original patch text without trailing-whitespace
problems in a repository artifact; its original SHA-256 validates the decoded
bytes. `original-SHA256SUMS.txt` is the original packet manifest; `SHA256SUMS`
validates the files in this preserved representation. No historical files or
assertions were changed. These single-process component witnesses do not close
U1, generic legacy cleanup, abrupt-crash or cross-host authority requirements.
