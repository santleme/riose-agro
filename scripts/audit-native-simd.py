#!/usr/bin/env python3
"""Extract only the production metabolism function from a release library."""
import argparse
import pathlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("library")
parser.add_argument("destination")
parser.add_argument("--ir")
args = parser.parse_args()
destination = pathlib.Path(args.destination)
destination.mkdir(parents=True, exist_ok=True)
symbols = subprocess.check_output(["nm", args.library], text=True).splitlines()
symbol = next(line.split()[-1] for line in symbols
              if "17update_metabolism" in line and "batch" not in line)
assembly = subprocess.check_output(
    ["objdump", "-d", "--disassemble=" + symbol, args.library], text=True)
(destination / "update_metabolism.asm").write_text(assembly)
if args.ir:
    lines = pathlib.Path(args.ir).read_text().splitlines()
    start = next(i for i, line in enumerate(lines)
                 if line.startswith("define ") and "17update_metabolism" in line)
    end = next(i for i in range(start, len(lines)) if lines[i] == "}")
    (destination / "update_metabolism.ll").write_text("\n".join(lines[start:end + 1]) + "\n")
print(assembly)
