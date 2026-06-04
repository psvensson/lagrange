export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function normalizeProbeSpec(spec) {
  if (!spec) return {probe: null, args: null};
  return {
    probe: spec.probe || null,
    args: spec.args || null,
  };
}

export function stableProbeKey(spec) {
  const normalized = normalizeProbeSpec(spec);
  if (!normalized.probe) return null;
  return stableStringify(normalized);
}

export function probeSpecFromIdentity(identity) {
  if (!identity) return null;
  return {
    probe: identity.probe || null,
    args: identity.args || null,
  };
}

export function eventProbeKey(event, side = 'after') {
  if (!event) return null;
  if (side === 'before' && event.beforeProbeKey) return event.beforeProbeKey;
  if (side === 'after' && event.afterProbeKey) return event.afterProbeKey;
  if (event.probeKey) return event.probeKey;
  const identity = side === 'before' ?
    event.beforeEvidenceIdentity || null :
    event.evidenceIdentity || null;
  return stableProbeKey(probeSpecFromIdentity(identity));
}

export function metricKindFromProbeSpec(spec) {
  return spec?.args?.metric || null;
}

export function probeKeysMatch(left, right) {
  const leftKey = typeof left === 'string' ? left : stableProbeKey(left);
  const rightKey = typeof right === 'string' ? right : stableProbeKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function isFrontierProbeEvent(event) {
  const scope = event?.probeScope || 'frontier';
  return scope !== 'doneWhen' && scope !== 'closure';
}
