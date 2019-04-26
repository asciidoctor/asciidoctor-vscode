#!/usr/bin/env python3
import sys
import yaml
from os import path
from plistlib import dumps


def generated_comment():
    return "This file is auto-generated from %s, do not edit it by hand!" \
        % path.basename(in_path)


def convert(yaml):
    lines = dumps(yaml).decode('utf-8').splitlines()
    lines.insert(3, "<!--\n |\t%s\n-->" % generated_comment())
    lines.append('')
    return "\n".join(lines)


if len(sys.argv) < 3:
    print("Usage: yaml-to-plist <input-file> <output-file>")
    sys.exit(1)

in_path = sys.argv[1]
out_path = sys.argv[2]

with open(in_path, 'r', encoding='utf-8') as in_file:
    with open(out_path, 'w', encoding='utf-8') as out_file:
        out_file.writelines(convert(yaml.load(in_file)))
