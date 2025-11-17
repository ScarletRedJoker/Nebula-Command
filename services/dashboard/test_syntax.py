#!/usr/bin/env python3
"""
Test to identify syntax errors in Python files
Run on server: python3 test_syntax.py
"""
import py_compile
import os
import sys

files_to_test = [
    'app.py',
    'main.py',
    'routes/web.py',
    'utils/auth.py',
]

print("=" * 60)
print("Python Syntax Test")
print("=" * 60)
print(f"Python version: {sys.version}")
print()

all_ok = True
for filepath in files_to_test:
    full_path = os.path.join(os.path.dirname(__file__), filepath)
    if not os.path.exists(full_path):
        print(f"⚠️  File not found: {filepath}")
        continue
    
    try:
        py_compile.compile(full_path, doraise=True)
        print(f"✅ {filepath} - OK")
    except py_compile.PyCompileError as e:
        print(f"❌ {filepath} - SYNTAX ERROR:")
        print(f"   {e}")
        all_ok = False

print()
print("=" * 60)
if all_ok:
    print("✅ All files have valid syntax!")
else:
    print("❌ Syntax errors found - see above")
print("=" * 60)
