"""Recover compiler fixtures from the approved Phase 1 environment.

This is intentionally a one-way maintenance utility. Runtime compilation never
reads the active environment as an input.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ENVIRONMENT = ROOT / "data/cubes/gulchdale.txt"
CONFIG_DIR = ROOT / "compiler/config"
SOURCE_DIR = ROOT / "data/compiler/source"
FIXTURE_DIR = ROOT / "compiler/tests/fixtures/phase1"

SECTION_RE = re.compile(r"^\[([^]]+)]\s*$", re.MULTILINE)
CARD_LINE_RE = re.compile(r"^(?P<name>.+) \((?P<set>[^)]+)\) (?P<number>.+)$")


def sections(text: str) -> dict[str, str]:
    matches = list(SECTION_RE.finditer(text))
    return {
        match.group(1): text[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(text)].strip()
        for index, match in enumerate(matches)
    }


def parse_card_line(value: str) -> tuple[str, str, str]:
    match = CARD_LINE_RE.match(value.strip())
    if not match:
        return value.strip(), "", ""
    return match.group("name"), match.group("set").lower(), match.group("number")


def main() -> None:
    text = ENVIRONMENT.read_text(encoding="utf-8")
    parsed = sections(text)
    custom_cards: list[dict[str, Any]] = json.loads(parsed["CustomCards"])
    static_cards = [card for card in custom_cards if not card.get("set")]
    dynamic_cards = [card for card in custom_cards if card.get("set")]
    static_names = {str(card["name"]).lower(): card for card in static_cards}

    commander_names = {line.strip().lower() for line in parsed["commander"].splitlines() if line.strip()}
    recovered_static: list[dict[str, Any]] = []
    for card in static_cards:
        recovered = dict(card)
        recovered["include_in"] = ["commander"] if str(card["name"]).lower() in commander_names else []
        recovered_static.append(recovered)

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    (CONFIG_DIR / "static_custom_cards.yml").write_text(
        json.dumps(recovered_static, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    rows: "OrderedDict[tuple[str, str, str], dict[str, str]]" = OrderedDict()

    def ensure_row(card_line: str, tag: str) -> dict[str, str]:
        name, set_code, number = parse_card_line(card_line)
        key = (name.lower(), set_code, number)
        row = rows.setdefault(
            key,
            {
                "name": name,
                "Set": set_code,
                "Collector Number": number,
                "board": "mainboard",
                "maybeboard": "false",
                "tags": "",
                "Notes": "",
            },
        )
        tags = [item for item in row["tags"].split(";") if item]
        if tag and tag not in tags:
            tags.append(tag)
            row["tags"] = ";".join(tags)
        return row

    for sheet in ("commander", "mono", "land"):
        for line in parsed[sheet].splitlines():
            if line.strip() and line.strip().lower() not in static_names:
                ensure_row(line.strip(), sheet)

    tribe_pools: dict[str, list[str]] = {}
    for card in static_cards:
        name = str(card["name"])
        if not name.endswith(" Booster Pack"):
            continue
        tribe = name.removesuffix(" Booster Pack").lower()
        effects = card.get("draft_effects", [])
        pool = list(effects[0].get("cards", [])) if effects else []
        tribe_pools[tribe] = pool
        for card_line in pool:
            ensure_row(str(card_line), tribe)

    dynamic_by_name = {str(card["name"]).lower(): card for card in dynamic_cards}
    for card in dynamic_cards:
        ensure_row(
            f"{card['name']} ({str(card['set']).lower()}) {card['collector_number']}",
            "",
        )
    dynamic_metadata: dict[str, dict[str, str]] = {}
    for key, row in list(rows.items()):
        dynamic = dynamic_by_name.get(key[0])
        if not dynamic:
            continue
        tags = [item for item in row["tags"].split(";") if item]
        if "draftEffect" not in tags:
            tags.append("draftEffect")
        row["tags"] = ";".join(tags)

        notes: list[str] = []
        effects = dynamic.get("draft_effects", [])
        related = dynamic.get("related_cards", [])
        for item in related:
            name = str(item.get("name", "")) if isinstance(item, dict) else str(item)
            if not name:
                continue
            if name.endswith(" Booster Pack"):
                tribe = name.removesuffix(" Booster Pack").lower()
                requested = next(
                    (
                        int(effect.get("count", 0))
                        for effect in effects
                        if effect.get("type") == "AddCards"
                        and set(map(str, effect.get("cards", []))) == set(tribe_pools.get(tribe, []))
                    ),
                    6,
                )
                notes.append(f"{name}, {requested}")
            else:
                if CARD_LINE_RE.match(name):
                    referenced_name = parse_card_line(name)[0]
                    ensure_row(name, "spawnedByDraftEffect")
                    notes.append(referenced_name)
                else:
                    notes.append(name)
        row["Notes"] = "\n".join(dict.fromkeys(notes))

        cache_key = f"{str(dynamic.get('set', '')).lower()}/{dynamic.get('collector_number', '')}"
        dynamic_metadata[cache_key] = {
            "name": str(dynamic["name"]),
            "set": str(dynamic.get("set", "")).lower(),
            "collector_number": str(dynamic.get("collector_number", "")),
            "mana_cost": str(dynamic.get("mana_cost", "")),
            "type_line": str(dynamic.get("type_line") or dynamic.get("type") or "Card"),
            "image": str(dynamic.get("image", "")),
        }

    metadata: dict[str, dict[str, str]] = {
        f"{row['Set']}/{row['Collector Number']}": {
            "name": row["name"],
            "set": row["Set"],
            "collector_number": row["Collector Number"],
            "mana_cost": "",
            "type_line": "Card",
            "image": "",
        }
        for row in rows.values()
    }
    metadata.update(dynamic_metadata)

    fieldnames = ["name", "Set", "Collector Number", "board", "maybeboard", "tags", "Notes"]
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for destination in (SOURCE_DIR / "gulchdale.csv", FIXTURE_DIR / "gulchdale.csv"):
        with destination.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows.values())

    metadata_text = json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (SOURCE_DIR / "scryfall.json").write_text(metadata_text, encoding="utf-8")
    (FIXTURE_DIR / "scryfall.json").write_text(metadata_text, encoding="utf-8")
    (FIXTURE_DIR / "expected-gulchdale.txt").write_text(text, encoding="utf-8")
    print(f"Recovered {len(rows)} rows, {len(static_cards)} static cards, and {len(metadata)} metadata records.")
    print(f"Environment SHA-256: {hashlib.sha256(text.encode()).hexdigest()}")


if __name__ == "__main__":
    main()
