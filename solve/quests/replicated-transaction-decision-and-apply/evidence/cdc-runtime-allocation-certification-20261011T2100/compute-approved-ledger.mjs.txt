const KiB = 1024;
const MiB = 1024 * KiB;

const Wbase = {
  Aactive: 8 * 448 * KiB,
  Adrop: 512 * KiB,
  Iout: 4 * 1536 * KiB,
  Iin: 4 * 1536 * KiB,
};
Wbase.total = Object.values(Wbase).reduce((sum, value) => sum + value, 0);

function operation(rowBytes) {
  // The approved design's source and consumer envelopes for the supported
  // single-large-row case. These are target admission equations, not claims
  // about the current base64 implementation.
  const S = 2 * rowBytes + 2 * MiB;
  const H = 2 * MiB;
  const C = 3 * rowBytes + MiB;
  const K = 16 * MiB;
  const controls = 8 * MiB;
  const total = Wbase.total + S + H + C + K + controls;
  return {rowBytes, Wbase: Wbase.total, S, H, C, K, controls, total,
    pool: 128 * MiB, margin: 128 * MiB - total};
}

const windowMs = 30000;
const minimumRetryMs = 100;
const Bsend = 320 * KiB;
const bootstrap = 1400 * KiB;
const cadenceOnlyTurns = Math.floor(windowMs / minimumRetryMs);

const output = {
  schema: 'cdc-approved-allocation-ledger/1',
  units: 'bytes',
  Wbase: {...Wbase, expected: 16 * MiB, exactFit: Wbase.total === 16 * MiB},
  semanticControlTerm: {
    ceiling: 8 * MiB,
    bootstrap,
    afterBootstrap: 8 * MiB - bootstrap,
    Bsend,
    windowMs,
    minimumRetryMs,
    cadenceOnlyTurns,
    counterexampleIfEveryCadenceTurnRetainsOneBsend:
      bootstrap + cadenceOnlyTurns * Bsend,
    certified: false,
    reason: 'deadline/cadence does not define the actual callback/send-credit population',
  },
  supportedCases: {
    eightMiB: operation(8 * MiB),
    sixteenMiBPlusOne: operation(16 * MiB + 1),
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
