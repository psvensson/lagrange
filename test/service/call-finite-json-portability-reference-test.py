#!/usr/bin/env python3
"""Source-free tests of the independent finite-JSON Python reference defaults.

These call the reference's public encode/decode functions without overriding
their default limits. Neither the production JS codec nor expected vector
results are imported into this witness.
"""

import importlib.util
from pathlib import Path
import sys
import unittest


REFERENCE_PATH = Path(__file__).with_name(
    "call-finite-json-portability-reference.py"
)
SPEC = importlib.util.spec_from_file_location("finite_json_reference", REFERENCE_PATH)
REFERENCE = importlib.util.module_from_spec(SPEC)
sys.dont_write_bytecode = True
SPEC.loader.exec_module(REFERENCE)


class DefaultFiniteJsonLimits(unittest.TestCase):
    def assert_refusal(self, operation, code):
        with self.assertRaises(REFERENCE.PortabilityError) as context:
            operation()
        self.assertEqual(context.exception.code, code)

    def test_default_constants_are_independent_of_manifest(self):
        self.assertEqual(REFERENCE.DEFAULT_LIMITS, {
            "maxDepth": 16,
            "maxArrayLength": 1024,
            "maxRecordFields": 128,
            "maxStringBytes": 16384,
            "maxContributionBytes": 65536,
        })

    def test_depth_at_and_above_default(self):
        at = 0
        above = 0
        for _ in range(16):
            at = [at]
            above = [above]
        above = [above]
        self.assertEqual(REFERENCE.encode(at), "[" * 16 + "0" + "]" * 16)
        self.assert_refusal(
            lambda: REFERENCE.encode(above), "partial_depth_overflow"
        )
        self.assert_refusal(
            lambda: REFERENCE.decode("[" * 12000 + "0" + "]" * 12000),
            "partial_depth_overflow",
        )

    def test_array_count_at_and_above_default(self):
        self.assertEqual(REFERENCE.decode(REFERENCE.encode([0] * 1024)), [0] * 1024)
        self.assert_refusal(
            lambda: REFERENCE.encode([0] * 1025),
            "partial_element_count_overflow",
        )

    def test_record_count_at_and_above_default(self):
        at = {f"k{number:03d}": 0 for number in range(128)}
        self.assertEqual(REFERENCE.decode(REFERENCE.encode(at)), at)
        above = {f"k{number:03d}": 0 for number in range(129)}
        self.assert_refusal(
            lambda: REFERENCE.encode(above), "partial_element_count_overflow"
        )

    def test_string_utf8_bytes_at_and_above_default(self):
        for char, length in (("a", 16384), ("é", 8192)):
            value = char * length
            self.assertEqual(REFERENCE.decode(REFERENCE.encode(value)), value)
            self.assert_refusal(
                lambda value=value, char=char: REFERENCE.encode(value + char),
                "partial_byte_overflow",
            )

    def test_contribution_bytes_at_and_above_default(self):
        at = {"a": "a" * 16384, "b": "b" * 16384,
              "c": "c" * 16384, "d": "d" * 16355}
        wire = REFERENCE.encode(at)
        self.assertEqual(len(wire.encode("utf-8")), 65536)
        self.assertEqual(REFERENCE.decode(wire), at)
        above = {**at, "d": "d" * 16356}
        self.assert_refusal(
            lambda: REFERENCE.encode(above), "partial_byte_overflow"
        )
        self.assert_refusal(
            lambda: REFERENCE.decode(wire[:-2] + "dd\"}"),
            "partial_byte_overflow",
        )

    def test_non_json_constants_are_malformed_wire(self):
        for token in ("NaN", "Infinity", "-Infinity"):
            self.assert_refusal(
                lambda token=token: REFERENCE.decode(token),
                "malformed_partial_wire",
            )

    def test_binary64_overflow_integer_tokens_do_not_crash(self):
        for digits in (310, 5000):
            self.assert_refusal(
                lambda digits=digits: REFERENCE.decode("9" * digits),
                "invalid_partial_value",
            )

    def test_binary64_integer_safety_boundary(self):
        self.assertEqual(REFERENCE.decode("9007199254740991"), 9007199254740991)
        self.assert_refusal(
            lambda: REFERENCE.decode("9007199254740992"),
            "unsafe_integer_value",
        )

    def test_noncanonical_wire_is_distinct_from_malformed(self):
        self.assert_refusal(
            lambda: REFERENCE.decode('{"b":2,"a":1}'),
            "non_canonical_partial_wire",
        )
        self.assert_refusal(
            lambda: REFERENCE.decode("[1,]"), "malformed_partial_wire"
        )


if __name__ == "__main__":
    unittest.main()
