const WASM_HEADER_BYTES = 8;
const WASM_MEMORY_SECTION_ID = 5;
const WASM_PAGE_BYTES = 64 * 1024;
const WASM_LIMIT_HAS_MAXIMUM = 0x01;
const WASM_LIMIT_MEMORY64 = 0x04;
const WASM_FILE_SUFFIX = '.wasm';
const VARUINT_DATA_MASK = 0x7f;
const VARUINT_CONTINUATION_FLAG = 0x80;
const VARUINT_BITS_PER_BYTE = 7;
const VARUINT32_MAX_SHIFT = 35;
const REQUEST_CELL_BUDGET_ERROR_CODE = 'request_cell_budget_exhausted';
const MEMORY_BUDGET_FIELD = 'memory_bytes';
const MEMORY64_UNSUPPORTED =
  'memory64 is unavailable for request Cell Components';
const CORE_MEMORY_ERROR_MESSAGE = Object.freeze({
  CORE_MODULE_INVALID: 'invalid WebAssembly core module',
  MEMORY_SECTION_INVALID: 'invalid WebAssembly memory section',
  SECTION_LENGTH_INVALID: 'invalid WebAssembly section length',
  VARUINT32_INVALID: 'invalid WebAssembly varuint32',
});

class ComponentMemoryBudgetError extends Error {
  constructor(message) {
    super(message);
    this.code = REQUEST_CELL_BUDGET_ERROR_CODE;
  }
}

function memoryBudgetFailure(actual, limit) {
  return new ComponentMemoryBudgetError(
    `Binding ${MEMORY_BUDGET_FIELD} budget exhausted (${actual} > ${limit})`,
  );
}

function readVarUint32(bytes, start) {
  let cursor = start;
  let result = 0;
  let shift = 0;
  while (cursor < bytes.length && shift < VARUINT32_MAX_SHIFT) {
    const byte = bytes[cursor++];
    result += (byte & VARUINT_DATA_MASK) * (2 ** shift);
    if ((byte & VARUINT_CONTINUATION_FLAG) === 0) {
      return {next: cursor, value: result};
    }
    shift += VARUINT_BITS_PER_BYTE;
  }
  throw new Error(CORE_MEMORY_ERROR_MESSAGE.VARUINT32_INVALID);
}

function encodeVarUint32(value) {
  const encoded = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & VARUINT_DATA_MASK;
    remaining >>>= VARUINT_BITS_PER_BYTE;
    if (remaining !== 0) byte |= VARUINT_CONTINUATION_FLAG;
    encoded.push(byte);
  } while (remaining !== 0);
  return encoded;
}

function readMemoryType(bytes, start) {
  const flagsResult = readVarUint32(bytes, start);
  if ((flagsResult.value & WASM_LIMIT_MEMORY64) !== 0) {
    throw new ComponentMemoryBudgetError(MEMORY64_UNSUPPORTED);
  }
  const minimumResult = readVarUint32(bytes, flagsResult.next);
  const hasMaximum =
    (flagsResult.value & WASM_LIMIT_HAS_MAXIMUM) !== 0;
  const maximumResult = hasMaximum ?
    readVarUint32(bytes, minimumResult.next) :
    null;
  return {
    flags: flagsResult.value,
    maximum: maximumResult?.value ?? null,
    minimum: minimumResult.value,
    next: maximumResult?.next ?? minimumResult.next,
  };
}

function readMemorySection(bytes, payloadStart, payloadEnd) {
  const countResult = readVarUint32(bytes, payloadStart);
  const types = [];
  let cursor = countResult.next;
  for (let index = 0; index < countResult.value; index += 1) {
    const type = readMemoryType(bytes, cursor);
    types.push(type);
    cursor = type.next;
  }
  if (cursor !== payloadEnd) {
    throw new Error(CORE_MEMORY_ERROR_MESSAGE.MEMORY_SECTION_INVALID);
  }
  return types;
}

function inspectCoreModule(bytes) {
  if (bytes.length < WASM_HEADER_BYTES) {
    throw new Error(CORE_MEMORY_ERROR_MESSAGE.CORE_MODULE_INVALID);
  }
  const sections = [];
  let cursor = WASM_HEADER_BYTES;
  while (cursor < bytes.length) {
    const sectionStart = cursor;
    const id = bytes[cursor++];
    const sizeResult = readVarUint32(bytes, cursor);
    const payloadStart = sizeResult.next;
    const payloadEnd = payloadStart + sizeResult.value;
    if (payloadEnd > bytes.length) {
      throw new Error(CORE_MEMORY_ERROR_MESSAGE.SECTION_LENGTH_INVALID);
    }
    sections.push({
      id,
      payloadEnd,
      payloadStart,
      sectionStart,
      types: id === WASM_MEMORY_SECTION_ID ?
        readMemorySection(bytes, payloadStart, payloadEnd) :
        null,
    });
    cursor = payloadEnd;
  }
  return {bytes, sections};
}

function encodeMemoryType(type) {
  const flags = type.flags | WASM_LIMIT_HAS_MAXIMUM;
  return [
    ...encodeVarUint32(flags),
    ...encodeVarUint32(type.minimum),
    ...encodeVarUint32(type.budgetMaximum),
  ];
}

function encodeMemorySection(types) {
  return Uint8Array.from([
    ...encodeVarUint32(types.length),
    ...types.flatMap(encodeMemoryType),
  ]);
}

function rebuildCoreModule(module) {
  const chunks = [module.bytes.subarray(0, WASM_HEADER_BYTES)];
  for (const section of module.sections) {
    if (section.id !== WASM_MEMORY_SECTION_ID) {
      chunks.push(
        module.bytes.subarray(section.sectionStart, section.payloadEnd),
      );
      continue;
    }
    const payload = encodeMemorySection(section.types);
    chunks.push(Uint8Array.from([
      WASM_MEMORY_SECTION_ID,
      ...encodeVarUint32(payload.length),
      ...payload,
    ]));
  }
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const rebuilt = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    rebuilt.set(chunk, offset);
    offset += chunk.length;
  }
  return rebuilt;
}

function capComponentCoreMemory(files, memoryBytes) {
  const modules = Object.entries(files)
    .filter(([name]) => name.endsWith(WASM_FILE_SUFFIX))
    .map(([name, bytes]) => [name, inspectCoreModule(bytes)]);
  const memories = modules.flatMap(([, module]) =>
    module.sections.flatMap((section) => section.types || []));
  const maximumPages = Math.floor(memoryBytes / WASM_PAGE_BYTES);
  const minimumPages = memories.reduce(
    (total, memory) => total + memory.minimum,
    0,
  );
  if (minimumPages > maximumPages) {
    throw memoryBudgetFailure(
      minimumPages * WASM_PAGE_BYTES,
      memoryBytes,
    );
  }
  let growthPages = maximumPages - minimumPages;
  for (const memory of memories) {
    const declaredGrowth = memory.maximum === null ?
      growthPages :
      Math.max(0, memory.maximum - memory.minimum);
    const allowedGrowth = Math.min(growthPages, declaredGrowth);
    memory.budgetMaximum = memory.minimum + allowedGrowth;
    growthPages -= allowedGrowth;
  }
  return Object.fromEntries(modules.map(([name, module]) => [
    name,
    rebuildCoreModule(module),
  ]));
}

export {
  capComponentCoreMemory,
};
