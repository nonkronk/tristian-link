#!/usr/bin/env python3
import csv
import pathlib
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: kutt-to-d1.py LINKS.csv VISITS.csv OUT.sql")

links_path, visits_path, out_path = map(pathlib.Path, sys.argv[1:])

def q(value):
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

def b(value):
    return "1" if str(value).lower() in {"t", "true", "1"} else "0"

with links_path.open(newline="", encoding="utf-8") as fh:
    links = list(csv.DictReader(fh))

with visits_path.open(newline="", encoding="utf-8") as fh:
    visits = list(csv.DictReader(fh))

required_links = {
    "id", "address", "target", "description", "expire_at", "visit_count",
    "created_at", "updated_at", "owner_email", "banned",
}
required_visits = {
    "id", "link_id", "created_at", "updated_at", "countries_json",
    "referrers_json", "total", "br_chrome", "br_edge", "br_firefox",
    "br_ie", "br_opera", "br_other", "br_safari", "os_android", "os_ios",
    "os_linux", "os_macos", "os_other", "os_windows", "owner_email",
}
if links and set(links[0]) != required_links:
    raise SystemExit("unexpected Kutt links export schema")
if visits and set(visits[0]) != required_visits:
    raise SystemExit("unexpected Kutt visits export schema")

sql = ["PRAGMA foreign_keys = ON;"]
for row in links:
    values = [
        row["id"], q(row["address"]), q(row["target"]), q(row["description"]),
        "NULL", q(row["expire_at"]), row["visit_count"], q(row["created_at"]),
        q(row["updated_at"]), q(row["owner_email"]), b(row["banned"]),
    ]
    sql.append(
        "INSERT INTO links "
        "(id,address,target,description,password_hash,expire_at,visit_count,created_at,updated_at,owner_email,banned) "
        f"VALUES ({','.join(values)}) "
        "ON CONFLICT(id) DO UPDATE SET "
        "address=excluded.address,target=excluded.target,description=excluded.description,"
        "expire_at=excluded.expire_at,visit_count=excluded.visit_count,"
        "created_at=excluded.created_at,updated_at=excluded.updated_at,"
        "owner_email=excluded.owner_email,banned=excluded.banned;"
    )

numeric_visit = [
    "id", "link_id", "total", "br_chrome", "br_edge", "br_firefox", "br_ie",
    "br_opera", "br_other", "br_safari", "os_android", "os_ios", "os_linux",
    "os_macos", "os_other", "os_windows",
]
for row in visits:
    values = [
        row["id"], row["link_id"], q(row["created_at"]), q(row["updated_at"]),
        q(row["countries_json"]), q(row["referrers_json"]), row["total"],
        row["br_chrome"], row["br_edge"], row["br_firefox"], row["br_ie"],
        row["br_opera"], row["br_other"], row["br_safari"], row["os_android"],
        row["os_ios"], row["os_linux"], row["os_macos"], row["os_other"],
        row["os_windows"], q(row["owner_email"]),
    ]
    sql.append(
        "INSERT INTO legacy_visits "
        "(id,link_id,created_at,updated_at,countries_json,referrers_json,total,"
        "br_chrome,br_edge,br_firefox,br_ie,br_opera,br_other,br_safari,"
        "os_android,os_ios,os_linux,os_macos,os_other,os_windows,owner_email) "
        f"VALUES ({','.join(values)}) "
        "ON CONFLICT(id) DO UPDATE SET "
        "link_id=excluded.link_id,created_at=excluded.created_at,updated_at=excluded.updated_at,"
        "countries_json=excluded.countries_json,referrers_json=excluded.referrers_json,total=excluded.total,"
        "br_chrome=excluded.br_chrome,br_edge=excluded.br_edge,br_firefox=excluded.br_firefox,"
        "br_ie=excluded.br_ie,br_opera=excluded.br_opera,br_other=excluded.br_other,br_safari=excluded.br_safari,"
        "os_android=excluded.os_android,os_ios=excluded.os_ios,os_linux=excluded.os_linux,"
        "os_macos=excluded.os_macos,os_other=excluded.os_other,os_windows=excluded.os_windows,"
        "owner_email=excluded.owner_email;"
    )

sql += [""]
out_path.write_text("\n".join(sql), encoding="utf-8")
print(f"migration SQL generated: links={len(links)} legacy_visits={len(visits)}")
