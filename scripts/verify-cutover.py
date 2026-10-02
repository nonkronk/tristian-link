#!/usr/bin/env python3
import json
import subprocess
import sys

query = (
    "SELECT COALESCE(json_agg(json_build_object('address',address,'target',target) ORDER BY id)::text,'[]') "
    "FROM links WHERE banned IS FALSE AND (expire_in IS NULL OR expire_in > now())"
)
db = subprocess.run(
    ["docker","exec","kutt_pg","psql","-X","-U","ritb","-d","ur_postgres","-Atc",query],
    text=True,capture_output=True,check=True,
)
rows = json.loads(db.stdout.strip())
if not rows:
    raise SystemExit("no active Kutt links found")

for row in rows:
    proc = subprocess.run(
        ["curl","--silent","--show-error","--max-redirs","0","--dump-header","-","--output","/dev/null",
         "https://link.tristian.id/" + row["address"]],
        text=True,capture_output=True,check=False,
    )
    if proc.returncode != 0:
        raise SystemExit("live redirect request failed")
    header_lines = proc.stdout.splitlines()
    if not header_lines:
        raise SystemExit("live redirect returned no headers")
    parts = header_lines[0].split()
    status = parts[1] if len(parts) > 1 else ""
    locations = [
        line.split(":",1)[1].strip()
        for line in header_lines
        if line.lower().startswith("location:")
    ]
    if status != "302" or len(locations) != 1 or locations[0] != row["target"]:
        raise SystemExit("migrated redirect parity failed")

print(f"Migrated redirect parity: PASS ({len(rows)} active links)")
