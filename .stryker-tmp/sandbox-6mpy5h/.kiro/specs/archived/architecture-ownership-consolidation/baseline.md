# Baseline Checks

Baseline captured before ownership-refactor edits for this spec.

## Targeted test command

```bash
npm test -- \
  test/bootstrap/bootstrap-sequence.test.js \
  test/bootstrap/node-joining-service.test.js \
  test/message-group/cdc-handler.test.js \
  test/cache/system-table-cache.test.js \
  test/query/callback-runtime-driver-registry.test.js
```

## Result (2026-02-12)

- `test/bootstrap/bootstrap-sequence.test.js`: pass (55 assertions)
- `test/bootstrap/node-joining-service.test.js`: pass (40 assertions)
- `test/cache/system-table-cache.test.js`: pass (162 assertions)
- `test/message-group/cdc-handler.test.js`: pass (41 assertions)
- `test/query/callback-runtime-driver-registry.test.js`: pass (26 assertions)

Total: 324 assertions passed.

## Notes

- Several tests intentionally exercise failure paths and therefore emit error
  logs while still passing their assertions.
- This baseline is used as the parity checkpoint before and during ownership
  consolidation tasks.
