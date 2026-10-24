#!/usr/bin/env python3
"""Relocate the exact preserved builder's digest-checked contract directory."""
import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('preserved_lab_builder',
    root / 'measurement-and-static/mg-delivery-candidate-lab-request.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.RELEASE = root / 'lab-contract'
builder.main()
