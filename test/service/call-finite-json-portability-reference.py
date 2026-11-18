#!/usr/bin/env python3
"""Independent stdlib reference for the Q1b value-only finite-JSON contract.

This deliberately does not call Node or import the Lagrange codec. It consumes
input values, not expected answers, and emits actual results for comparison by
the external conformance witness. Versioned envelopes, group keys and schemas
are outside this reference's contract.
"""

import json
import math
import sys
from decimal import Decimal
from pathlib import Path


MAX_SAFE_INTEGER = (1 << 53) - 1
DEFAULT_LIMITS = {
    "maxDepth": 16,
    "maxArrayLength": 1024,
    "maxRecordFields": 128,
    "maxStringBytes": 16384,
    "maxContributionBytes": 65536,
}


class PortabilityError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _pairs_to_record(pairs):
    record = {}
    for key, value in pairs:
        if key in record:
            raise PortabilityError("duplicate_object_key")
        record[key] = value
    return record


def _refuse_constant(_text):
    raise PortabilityError("invalid_partial_value")


def _parse(text):
    try:
        return json.loads(
            text,
            object_pairs_hook=_pairs_to_record,
            parse_constant=_refuse_constant,
        )
    except (json.JSONDecodeError, RecursionError) as exc:
        raise PortabilityError("malformed_partial_wire") from exc


def _well_formed(text):
    return all(not 0xD800 <= ord(ch) <= 0xDFFF for ch in text)


def _check_string(text, limits):
    if not _well_formed(text):
        raise PortabilityError("invalid_unicode_string")
    if len(text.encode("utf-8")) > limits["maxStringBytes"]:
        raise PortabilityError("partial_byte_overflow")


def _decimal_text(value):
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            raise PortabilityError("unsafe_integer_value")
        return str(value)
    if not math.isfinite(value):
        raise PortabilityError("invalid_partial_value")
    if value == 0:
        return "0"
    if value.is_integer():
        if abs(value) > MAX_SAFE_INTEGER:
            raise PortabilityError("unsafe_integer_value")
        return str(int(value))

    # repr(binary64) is shortest-round-tripping. Reapply ECMAScript's decimal
    # placement thresholds (fixed at exponent -6..20, scientific otherwise).
    decimal = Decimal(repr(value))
    adjusted = decimal.adjusted()
    if -6 <= adjusted < 21:
        return format(decimal, "f")
    parts = decimal.as_tuple()
    digits = "".join(str(digit) for digit in parts.digits)
    mantissa = digits[0] + (("." + digits[1:]) if len(digits) > 1 else "")
    prefix = "-" if parts.sign else ""
    exponent = ("+" if adjusted >= 0 else "") + str(adjusted)
    return prefix + mantissa + "e" + exponent


def _encode_node(value, limits, depth):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _decimal_text(value)
    if isinstance(value, str):
        _check_string(value, limits)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, dict)):
        if depth + 1 > limits["maxDepth"]:
            raise PortabilityError("partial_depth_overflow")
        next_depth = depth + 1
        if isinstance(value, list):
            if len(value) > limits["maxArrayLength"]:
                raise PortabilityError("partial_element_count_overflow")
            return "[" + ",".join(
                _encode_node(item, limits, next_depth) for item in value
            ) + "]"
        if len(value) > limits["maxRecordFields"]:
            raise PortabilityError("partial_element_count_overflow")
        pairs = []
        for key in value:
            _check_string(key, limits)
        for key in sorted(value, key=lambda text: text.encode("utf-16-be")):
            key_text = json.dumps(
                key, ensure_ascii=False, separators=(",", ":")
            )
            pairs.append(
                key_text + ":" + _encode_node(value[key], limits, next_depth)
            )
        return "{" + ",".join(pairs) + "}"
    raise PortabilityError("invalid_partial_value")


def encode(value, limits=DEFAULT_LIMITS):
    wire = _encode_node(value, limits, 0)
    if len(wire.encode("utf-8")) > limits["maxContributionBytes"]:
        raise PortabilityError("partial_byte_overflow")
    return wire


def _check_wire_depth(wire, max_depth):
    depth = 0
    inside_string = False
    escaped = False
    for char in wire:
        if inside_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                inside_string = False
        elif char == '"':
            inside_string = True
        elif char in "[{":
            depth += 1
            if depth > max_depth:
                raise PortabilityError("partial_depth_overflow")
        elif char in "]}":
            depth -= 1


def decode(wire, limits=DEFAULT_LIMITS):
    if not isinstance(wire, str) or not wire:
        raise PortabilityError("malformed_partial_wire")
    if not _well_formed(wire):
        raise PortabilityError("invalid_unicode_string")
    if len(wire.encode("utf-8")) > limits["maxContributionBytes"]:
        raise PortabilityError("partial_byte_overflow")
    _check_wire_depth(wire, limits["maxDepth"])
    value = _parse(wire)
    if encode(value, limits) != wire:
        raise PortabilityError("non_canonical_partial_wire")
    return value


def evaluate_vectors(vectors):
    limits = vectors["defaultLimits"]
    results = []
    for case in vectors["encode"]:
        try:
            wire = encode(_parse(case["inputJson"]), limits)
            results.append({"id": case["id"], "kind": "encode", "wire": wire})
        except PortabilityError as exc:
            results.append({
                "id": case["id"], "kind": "encode", "error": exc.code
            })
    for case in vectors["rejectWire"]:
        try:
            decode(case["wire"], limits)
            results.append({"id": case["id"], "kind": "decode", "accepted": True})
        except PortabilityError as exc:
            results.append({
                "id": case["id"], "kind": "decode", "error": exc.code
            })
    return results


def main(argv):
    if len(argv) != 2:
        raise SystemExit("usage: portability-reference.py <vectors.json|->")
    if argv[1] == "-":
        vectors = json.load(sys.stdin)
    else:
        vectors = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    print(json.dumps({"results": evaluate_vectors(vectors)}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv)
