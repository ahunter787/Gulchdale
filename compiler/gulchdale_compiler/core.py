from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import quote

import requests
import yaml

from . import __version__

CUBECOBRA_TIMEOUT_SECONDS = 10
SCRYFALL_TIMEOUT_SECONDS = 10
CARD_LINE_RE = re.compile(r"^(?P<name>.+) \((?P<set>[^)]+)\) (?P<number>.+)$")


class CompilerError(RuntimeError):
    """Actionable compiler failure."""


@dataclass(frozen=True)
class CardRow:
    name: str
    set_code: str
    collector_number: str
    tags: tuple[str, ...]
    notes: tuple[str, ...]
    board: str
    maybeboard: bool
    source_index: int

    @property
    def card_line(self) -> str:
        if not self.set_code or not self.collector_number:
            raise CompilerError(f"{self.name}: Set and Collector Number are required.")
        return f"{self.name} ({self.set_code.lower()}) {self.collector_number}"


@dataclass
class CompileResult:
    environment: str
    source_sha256: str
    metadata_sha256: str
    config_sha256: str
    environment_sha256: str
    counts: dict[str, Any]
    warnings: list[str] = field(default_factory=list)

    @property
    def version(self) -> str:
        return f"gch-{self.environment_sha256[:12]}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_config(config_path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise CompilerError(f"Unable to load compiler configuration {config_path}: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise CompilerError("Compiler configuration must be a schema_version 1 mapping.")
    return value


def _column(headers: Iterable[str], *names: str) -> str:
    lowered = {header.strip().lower(): header for header in headers}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    return ""


def _truthy(value: object) -> bool:
    return str(value or "").strip().lower() in {"true", "t", "yes", "y", "1"}


def load_rows(csv_path: Path) -> list[CardRow]:
    try:
        with csv_path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames or []
            name_col = _column(headers, "name", "card name")
            set_col = _column(headers, "set", "set code", "edition")
            number_col = _column(headers, "collector number", "collector #", "number")
            tags_col = _column(headers, "tags", "tag string", "tag list")
            notes_col = _column(headers, "notes", "note", "comments")
            board_col = _column(headers, "board")
            maybe_col = _column(headers, "maybeboard", "maybe board", "maybe_board")
            missing = [
                label
                for label, column in (
                    ("name", name_col),
                    ("Set", set_col),
                    ("Collector Number", number_col),
                    ("tags", tags_col),
                    ("Notes", notes_col),
                )
                if not column
            ]
            if missing:
                raise CompilerError(f"CubeCobra CSV is missing required columns: {', '.join(missing)}")
            rows: list[CardRow] = []
            for index, raw in enumerate(reader, start=2):
                name = str(raw.get(name_col, "") or "").strip()
                if not name:
                    raise CompilerError(f"CSV row {index} has no card name.")
                board = str(raw.get(board_col, "mainboard") or "mainboard").strip().lower() if board_col else "mainboard"
                maybe = _truthy(raw.get(maybe_col, "")) if maybe_col else False
                if maybe and board == "mainboard":
                    raise CompilerError(f"{name}: board=mainboard conflicts with maybeboard=true.")
                if maybe or board not in {"", "mainboard"}:
                    continue
                rows.append(
                    CardRow(
                        name=name,
                        set_code=str(raw.get(set_col, "") or "").strip().lower(),
                        collector_number=str(raw.get(number_col, "") or "").strip(),
                        tags=tuple(item.strip() for item in str(raw.get(tags_col, "") or "").split(";") if item.strip()),
                        notes=tuple(item.strip() for item in str(raw.get(notes_col, "") or "").splitlines() if item.strip()),
                        board=board or "mainboard",
                        maybeboard=False,
                        source_index=index,
                    )
                )
    except OSError as exc:
        raise CompilerError(f"Unable to read source CSV {csv_path}: {exc}") from exc
    if not rows:
        raise CompilerError("CubeCobra CSV contains no mainboard rows.")
    return rows


def load_metadata(path: Path) -> dict[str, dict[str, str]]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise CompilerError(f"Unable to load Scryfall metadata {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CompilerError("Scryfall metadata must be a mapping.")
    return {str(key): dict(item) for key, item in value.items() if isinstance(item, dict)}


def load_static_cards(config_path: Path, config: Mapping[str, Any]) -> list[dict[str, Any]]:
    filename = str(config.get("static_custom_cards", ""))
    if not filename:
        raise CompilerError("static_custom_cards is required in compiler configuration.")
    path = config_path.parent / filename
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise CompilerError(f"Unable to load static custom cards {path}: {exc}") from exc
    if not isinstance(value, list):
        raise CompilerError("Static custom cards must be a YAML list.")
    return [dict(card) for card in value]


def card_name_from_line(value: str) -> str:
    match = CARD_LINE_RE.match(value)
    return match.group("name") if match else value


def _canonical_tag_map(config: Mapping[str, Any]) -> tuple[dict[str, str], str, str, dict[str, dict[str, Any]]]:
    tags = dict(config["tags"])
    sheets = {str(name): str(tag) for name, tag in dict(tags["sheets"]).items()}
    tribes = {str(name): dict(value) for name, value in dict(config["tribes"]).items()}
    return sheets, str(tags["draft_effect"]), str(tags["spawned"]), tribes


def _metadata_for(row: CardRow, metadata: Mapping[str, Mapping[str, str]]) -> Mapping[str, str]:
    key = f"{row.set_code}/{row.collector_number}"
    item = metadata.get(key)
    if not item:
        raise CompilerError(f"{row.name}: missing cached Scryfall metadata for {key}.")
    if item.get("name", "").lower() != row.name.lower():
        raise CompilerError(f"{row.name}: Scryfall metadata for {key} resolves to {item.get('name', 'unknown')}.")
    if item.get("set", row.set_code).lower() != row.set_code or str(item.get("collector_number", row.collector_number)) != row.collector_number:
        raise CompilerError(f"{row.name}: cached Scryfall printing does not match exact identifier {key}.")
    return item


def _dedupe(values: Iterable[Any]) -> list[Any]:
    result: list[Any] = []
    seen: set[str] = set()
    for value in values:
        key = json.dumps(value, sort_keys=True, ensure_ascii=False) if isinstance(value, dict) else str(value).lower()
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result


def _render_settings(payload: Mapping[str, Any]) -> str:
    """Render the legacy settings shape byte-for-byte while values remain YAML-owned."""
    booster = list(payload["boosterSettings"])[0]
    layouts = dict(payload["layouts"])
    layout_names = list(layouts)
    lines = [
        "{",
        f'    "cubeCobraID": {json.dumps(payload["cubeCobraID"])},',
        '    "boosterSettings": [',
        "    {",
        f'\t"picks": {int(booster["picks"])},',
        f'\t"burns": {int(booster["burns"])}',
        "\t\t}",
        "        ],",
        '    "layouts": {',
    ]
    for index, name in enumerate(layout_names):
        slots = dict(layouts[name]["slots"])
        if index == 0:
            lines.extend([f'        "{name}": {{ ', '            "weight": 1, ', '            "slots": {'])
            for slot_index, (sheet, count) in enumerate(slots.items()):
                comma = "," if slot_index + 1 < len(slots) else ""
                space = " " if comma else ""
                lines.append(f'                "{sheet}": {int(count)}{comma}{space}')
            lines.extend(["            }", "        },"])
        else:
            lines.append(f'        "{name}": {{ "weight": 1, "slots": {{')
            for slot_index, (sheet, count) in enumerate(slots.items()):
                comma = "," if slot_index + 1 < len(slots) else ""
                if len(slots) == 1 and name == "landpack":
                    lines.append(f'            "{sheet}":{int(count)}')
                else:
                    space = " " if comma else ""
                    lines.append(
                        f'                "{sheet}"{(" " if name == "pack2" and sheet == "mono" else "")}: '
                        f'{int(count)}{comma}{space}'
                    )
            lines.extend(["            } " if len(slots) == 1 and name == "landpack" else "            }", "        },"])
    lines.extend(
        [
            "    },",
            '    "predeterminedLayouts": '
            + json.dumps(payload["predeterminedLayouts"], separators=(",", ":"))
            + ",",
            "}",
        ]
    )
    return "\n".join(lines)


def compile_environment(source_path: Path, metadata_path: Path, config_path: Path) -> CompileResult:
    config = load_config(config_path)
    rows = load_rows(source_path)
    metadata = load_metadata(metadata_path)
    static_cards = load_static_cards(config_path, config)
    sheets, draft_tag, spawned_tag, tribes = _canonical_tag_map(config)
    try:
        pack_re = re.compile(str(config["note_grammar"]["tribal_booster"]), re.I)
    except (KeyError, re.error) as exc:
        raise CompilerError(f"Invalid tribal booster note grammar: {exc}") from exc
    sheet_tags = {tag.lower(): name for name, tag in sheets.items()}
    tribe_tags = {str(value["tag"]).lower(): name for name, value in tribes.items()}
    known_tags = set(sheet_tags) | set(tribe_tags) | {draft_tag.lower(), spawned_tag.lower()}

    unknown = sorted({tag for row in rows for tag in row.tags if tag.lower() not in known_tags})
    if unknown:
        raise CompilerError(f"Unknown Gulchdale tags: {', '.join(unknown)}")

    for row in rows:
        _metadata_for(row, metadata)

    name_lookup: dict[str, list[CardRow]] = {}
    for row in rows:
        name_lookup.setdefault(row.name.lower(), []).append(row)

    static_by_name = {str(card["name"]).lower(): card for card in static_cards}
    if len(static_by_name) != len(static_cards):
        raise CompilerError("Static custom-card names must be unique.")

    tribe_pools: dict[str, list[str]] = {}
    for tribe_name, tribe in tribes.items():
        tag = str(tribe["tag"]).lower()
        tribe_pools[tribe_name] = [row.card_line for row in rows if tag in {item.lower() for item in row.tags}]
        if not tribe_pools[tribe_name]:
            raise CompilerError(f"Tribal pool '{tribe_name}' is empty.")

    aliases: dict[str, str] = {}
    for tribe_name, tribe in tribes.items():
        aliases[tribe_name.lower()] = tribe_name
        for alias in tribe.get("aliases", []):
            aliases[str(alias).lower()] = tribe_name

    dynamic_cards: list[dict[str, Any]] = []
    referenced_support: set[str] = set()
    referenced_customs: set[str] = set()
    draft_rows = [row for row in rows if draft_tag.lower() in {tag.lower() for tag in row.tags}]
    priority = {str(name).lower(): index for index, name in enumerate(config.get("custom_card_priority", []))}
    draft_rows.sort(key=lambda row: (priority.get(row.name.lower(), len(priority)), row.source_index))
    for row in draft_rows:
        combined_cards: list[str] = []
        inline_customs: list[dict[str, Any]] = []
        pack_requests: list[tuple[str, int]] = []
        for note in row.notes:
            pack_match = pack_re.match(note)
            if pack_match and pack_match.group("tribe").lower() in aliases:
                tribe_name = aliases[pack_match.group("tribe").lower()]
                default_count = int(tribes[tribe_name].get("default_count", 6))
                pack_requests.append((tribe_name, int(pack_match.group("count") or default_count)))
                referenced_customs.add(str(tribes[tribe_name]["custom_card"]).lower())
                continue
            static = static_by_name.get(note.lower())
            if static:
                combined_cards.append(str(static["name"]))
                inline_customs.append(static)
                referenced_customs.add(str(static["name"]).lower())
                continue
            matches = name_lookup.get(note.lower(), [])
            if len(matches) != 1:
                detail = "not found" if not matches else "ambiguous"
                raise CompilerError(f"{row.name}: note reference '{note}' is {detail} in the mainboard source.")
            combined_cards.append(matches[0].card_line)
            referenced_support.add(matches[0].name.lower())

        effects: list[dict[str, Any]] = []
        combined_cards = _dedupe(combined_cards)
        if combined_cards:
            effects.append(
                {
                    "type": "AddCards",
                    "count": len(combined_cards),
                    "cards": combined_cards,
                    "duplicateProtection": True,
                }
            )
        for custom in inline_customs:
            effects.extend(dict(effect) for effect in custom.get("draft_effects", []))
        for tribe_name, requested in pack_requests:
            pool = tribe_pools[tribe_name]
            if requested <= 0 or requested > len(pool):
                raise CompilerError(
                    f"{row.name}: requested {requested} {tribe_name} cards from a pool of {len(pool)}."
                )
            effects.append(
                {
                    "type": "AddCards",
                    "count": requested,
                    "cards": pool,
                    "duplicateProtection": True,
                }
            )
            referenced_support.update(card_name_from_line(card).lower() for card in pool)

        if not effects:
            raise CompilerError(f"{row.name}: draftEffect tag requires at least one valid note effect.")
        card_metadata = _metadata_for(row, metadata)
        related: list[Any] = []
        for value in combined_cards:
            static = static_by_name.get(value.lower())
            if static:
                face: dict[str, str] = {"name": str(static["name"])}
                if static.get("image"):
                    face["image"] = str(static["image"])
                face["type"] = str(static.get("type_line") or static.get("type") or "Card")
                related.append(face)
            else:
                related.append(value)
        related.extend(str(tribes[name]["custom_card"]) for name, _ in pack_requests)
        labels = [
            f"{tribes[name]['custom_card']}{f' (x{count})' if count != int(tribes[name].get('default_count', 6)) else ''}"
            for name, count in pack_requests
        ]
        oracle_text = (
            "Drafting this card also drafts: " + ", ".join(labels)
            if labels
            else "Selecting this card automatically adds cards to your draft pool"
        )
        if labels and combined_cards:
            oracle_text += " (and adds any listed cards/effects)."
        entry: dict[str, Any] = {
            "name": row.name,
            "set": row.set_code,
            "collector_number": row.collector_number,
            "image": card_metadata.get("image")
            or f"https://api.scryfall.com/cards/{quote(row.set_code)}/{quote(row.collector_number)}?format=image&version=border_crop",
            "oracle_text": oracle_text,
            "mana_cost": card_metadata.get("mana_cost", ""),
            "type_line": card_metadata.get("type_line", "Card"),
            "type": card_metadata.get("type_line", "Card"),
            "draft_effects": effects,
        }
        if related:
            entry["related_cards"] = _dedupe(related)
        dynamic_cards.append(entry)

    output_static: list[dict[str, Any]] = []
    for card in static_cards:
        rendered = {key: value for key, value in card.items() if key != "include_in"}
        for tribe_name, tribe in tribes.items():
            if str(rendered.get("name", "")).lower() == str(tribe["custom_card"]).lower():
                rendered["draft_effects"] = [
                    {
                        "type": "AddCards",
                        "count": int(tribe.get("default_count", 6)),
                        "cards": tribe_pools[tribe_name],
                        "duplicateProtection": True,
                    }
                ]
        if not rendered.get("image"):
            raise CompilerError(f"Static custom card {rendered.get('name', '<unknown>')} has no image.")
        output_static.append(rendered)

    custom_names = [str(card["name"]).lower() for card in output_static + dynamic_cards]
    if len(custom_names) != len(set(custom_names)):
        raise CompilerError("Compiled custom-card names are not unique.")

    sheet_lines: dict[str, list[str]] = {name: [] for name in sheets}
    for row in rows:
        row_tags = {tag.lower() for tag in row.tags}
        for tag, sheet_name in sheet_tags.items():
            if tag in row_tags:
                sheet_lines[sheet_name].append(row.card_line)
    for card in static_cards:
        for sheet_name in card.get("include_in", []):
            if sheet_name not in sheet_lines:
                raise CompilerError(f"Static custom card {card['name']} references unknown sheet {sheet_name}.")
            sheet_lines[str(sheet_name)].append(str(card["name"]))

    settings = dict(config["settings"])
    layout_config = dict(settings["layouts"])
    required: dict[str, int] = {name: 0 for name in sheets}
    for layout_name in settings["predeterminedLayouts"]:
        if layout_name not in layout_config:
            raise CompilerError(f"Predetermined layout {layout_name} is not declared.")
        for sheet_name, count in dict(layout_config[layout_name]).items():
            if sheet_name not in sheet_lines or int(count) <= 0:
                raise CompilerError(f"Layout {layout_name} has invalid sheet {sheet_name} or count {count}.")
            required[sheet_name] += int(count) * 8
    for sheet_name, count in required.items():
        if len(sheet_lines[sheet_name]) < count:
            raise CompilerError(
                f"Sheet {sheet_name} contains {len(sheet_lines[sheet_name])} cards but eight players require {count}."
            )

    settings_payload = {
        "cubeCobraID": str(config["cube"]["id"]),
        "boosterSettings": settings["boosterSettings"],
        "layouts": {
            name: {"weight": 1, "slots": {sheet: int(count) for sheet, count in dict(slots).items()}}
            for name, slots in layout_config.items()
        },
        "predeterminedLayouts": [[name] for name in settings["predeterminedLayouts"]],
    }
    parts = [
        "[Settings]\n" + _render_settings(settings_payload),
        "[CustomCards]\n" + json.dumps(output_static + dynamic_cards, ensure_ascii=False, indent=2),
    ]
    for sheet_name in sheets:
        parts.append(f"[{sheet_name}]\n" + "\n".join(sheet_lines[sheet_name]))
    environment = "\n\n".join(parts)

    unused_support = sorted(
        row.name
        for row in rows
        if spawned_tag.lower() in {tag.lower() for tag in row.tags} and row.name.lower() not in referenced_support
    )
    warnings = [f"Unreferenced spawnedByDraftEffect card: {name}" for name in unused_support]
    warnings.extend(
        f"Recognized but unreferenced custom object: {card['name']}"
        for card in static_cards
        if not card.get("include_in") and str(card["name"]).lower() not in referenced_customs
    )
    static_path = config_path.parent / str(config["static_custom_cards"])
    config_hash = sha256_bytes(config_path.read_bytes() + b"\0" + static_path.read_bytes())
    counts: dict[str, Any] = {
        "sourceRows": len(rows),
        "sheets": {name: len(lines) for name, lines in sheet_lines.items()},
        "customCards": len(output_static) + len(dynamic_cards),
        "draftEffectCards": len(dynamic_cards),
        "warnings": len(warnings),
    }
    return CompileResult(
        environment=environment,
        source_sha256=sha256_file(source_path),
        metadata_sha256=sha256_file(metadata_path),
        config_sha256=config_hash,
        environment_sha256=sha256_bytes(environment.encode("utf-8")),
        counts=counts,
        warnings=warnings,
    )


def manifest_for(result: CompileResult, cube_id: str, fetched_at: str, recovered: bool = False) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "compilerVersion": __version__,
        "version": result.version,
        "cube": {
            "id": cube_id,
            "sourceSha256": result.source_sha256,
            "fetchedAt": fetched_at,
            "recoveredPhase1Source": recovered,
        },
        "configSha256": result.config_sha256,
        "scryfallSha256": result.metadata_sha256,
        "environmentSha256": result.environment_sha256,
        "compiledAt": utc_now(),
        "counts": result.counts,
        "warnings": result.warnings,
    }


def write_candidate(root: Path, result: CompileResult, source: Path, metadata: Path, manifest: Mapping[str, Any]) -> Path:
    candidate = root / ".gulchdale/build" / result.version
    if candidate.exists():
        shutil.rmtree(candidate)
    candidate.mkdir(parents=True)
    (candidate / "gulchdale.txt").write_text(result.environment, encoding="utf-8")
    shutil.copy2(source, candidate / "gulchdale.csv")
    shutil.copy2(metadata, candidate / "scryfall.json")
    (candidate / "manifest.json").write_text(
        json.dumps(dict(manifest), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return candidate


def validate_with_engine(root: Path, environment: Path) -> None:
    validator = Path(
        os.environ.get("GULCHDALE_VALIDATOR", str(root / "dist/src/tools/validateGulchdaleCandidate.js"))
    )
    if not validator.exists():
        raise CompilerError("Draftmancer validator is not built. Run `npm run build-server` first.")
    completed = subprocess.run(
        ["node", "--experimental-json-modules", str(validator), str(environment)],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "unknown parser failure"
        raise CompilerError(f"Draftmancer rejected {environment}: {detail}")


def fetch_csv(url: str, destination: Path) -> str:
    try:
        response = requests.get(
            url,
            timeout=CUBECOBRA_TIMEOUT_SECONDS,
            headers={"User-Agent": f"GulchdaleCompiler/{__version__}"},
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise CompilerError(f"Unable to download CubeCobra CSV: {exc}") from exc
    if not response.content.startswith(b"name,"):
        raise CompilerError("CubeCobra returned an unexpected response instead of a CSV export.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(response.content)
    load_rows(destination)
    return utc_now()


def sync_metadata(source: Path, destination: Path, existing: Path | None, config_path: Path) -> None:
    load_config(config_path)
    rows = load_rows(source)
    cache = load_metadata(existing) if existing and existing.exists() else {}
    session = requests.Session()
    session.headers["User-Agent"] = f"GulchdaleCompiler/{__version__} (https://github.com/ahunter787/Gulchdale)"
    missing = [
        row
        for row in rows
        if cache.get(f"{row.set_code}/{row.collector_number}", {}).get("name", "").lower() != row.name.lower()
    ]
    for offset in range(0, len(missing), 75):
        batch = missing[offset : offset + 75]
        try:
            response = session.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": [{"set": row.set_code, "collector_number": row.collector_number} for row in batch]},
                timeout=SCRYFALL_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise CompilerError(f"Unable to resolve Scryfall metadata batch at source row {batch[0].source_index}: {exc}") from exc
        if payload.get("not_found"):
            raise CompilerError(f"Scryfall could not resolve exact printings: {payload['not_found']}")
        returned = list(payload.get("data", []))
        if len(returned) != len(batch):
            raise CompilerError("Scryfall returned an incomplete collection response.")
        returned_by_key = {
            (str(item.get("set", "")).lower(), str(item.get("collector_number", ""))): item for item in returned
        }
        for row in batch:
            item = returned_by_key.get((row.set_code, row.collector_number))
            if not item:
                raise CompilerError(f"Scryfall omitted exact printing {row.set_code}/{row.collector_number}.")
            image_uris = item.get("image_uris") or (item.get("card_faces") or [{}])[0].get("image_uris") or {}
            key = f"{row.set_code}/{row.collector_number}"
            cache[key] = {
                "name": str(item.get("name", row.name)),
                "set": str(item.get("set", row.set_code)),
                "collector_number": str(item.get("collector_number", row.collector_number)),
                "mana_cost": str(item.get("mana_cost") or (item.get("card_faces") or [{}])[0].get("mana_cost", "")),
                "type_line": str(item.get("type_line", "Card")),
                "image": str(image_uris.get("border_crop") or image_uris.get("large") or ""),
            }
        time.sleep(0.1)
    used_keys = {f"{row.set_code}/{row.collector_number}" for row in rows}
    normalized_cache = {key: cache[key] for key in sorted(used_keys)}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(normalized_cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def verify_candidate(root: Path, version: str) -> tuple[Path, dict[str, Any]]:
    candidate = root / ".gulchdale/build" / version
    manifest_path = candidate / "manifest.json"
    if not manifest_path.exists():
        raise CompilerError(f"Candidate {version} does not exist.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != version:
        raise CompilerError(f"Candidate manifest version does not match {version}.")
    environment = candidate / "gulchdale.txt"
    if sha256_file(environment) != manifest.get("environmentSha256"):
        raise CompilerError("Candidate environment hash no longer matches its manifest.")
    rebuilt = compile_environment(
        candidate / "gulchdale.csv", candidate / "scryfall.json", root / "compiler/config/gulchdale.yml"
    )
    expected = {
        "version": rebuilt.version,
        "environmentSha256": rebuilt.environment_sha256,
        "configSha256": rebuilt.config_sha256,
        "scryfallSha256": rebuilt.metadata_sha256,
        "sourceSha256": rebuilt.source_sha256,
    }
    actual = {
        "version": manifest.get("version"),
        "environmentSha256": manifest.get("environmentSha256"),
        "configSha256": manifest.get("configSha256"),
        "scryfallSha256": manifest.get("scryfallSha256"),
        "sourceSha256": manifest.get("cube", {}).get("sourceSha256"),
    }
    if actual != expected or rebuilt.environment != environment.read_text(encoding="utf-8"):
        raise CompilerError("Candidate inputs, configuration, output, and manifest are no longer consistent.")
    validate_with_engine(root, environment)
    return candidate, manifest


def promote_candidate(root: Path, version: str) -> None:
    candidate, _manifest = verify_candidate(root, version)
    environment = candidate / "gulchdale.txt"
    manifest_path = candidate / "manifest.json"
    targets = {
        environment: root / "data/cubes/gulchdale.txt",
        candidate / "gulchdale.csv": root / "data/compiler/source/gulchdale.csv",
        candidate / "scryfall.json": root / "data/compiler/source/scryfall.json",
        manifest_path: root / "data/cubes/gulchdale.manifest.json",
    }
    (root / "data").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gulchdale-promotion-", dir=root / "data") as temporary_dir:
        backup_dir = Path(temporary_dir)
        backups: dict[Path, Path | None] = {}
        staged: dict[Path, Path] = {}
        for index, (source, target) in enumerate(targets.items()):
            target.parent.mkdir(parents=True, exist_ok=True)
            backup = backup_dir / f"backup-{index}"
            if target.exists():
                shutil.copy2(target, backup)
                backups[target] = backup
            else:
                backups[target] = None
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                staged[target] = Path(handle.name)
                handle.write(source.read_bytes())
        replaced: list[Path] = []
        try:
            for target, staged_path in staged.items():
                os.replace(staged_path, target)
                replaced.append(target)
        except OSError:
            for target in replaced:
                restored_backup = backups[target]
                if restored_backup:
                    shutil.copy2(restored_backup, target)
                else:
                    target.unlink(missing_ok=True)
            raise
        finally:
            for staged_path in staged.values():
                staged_path.unlink(missing_ok=True)


def environment_summary(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    headers = list(re.finditer(r"^\[([^]]+)]$", text, re.MULTILINE))
    sections = {
        match.group(1): text[match.end() : headers[index + 1].start() if index + 1 < len(headers) else len(text)].strip()
        for index, match in enumerate(headers)
    }
    custom_cards = json.loads(sections["CustomCards"])
    return {
        "sha256": sha256_bytes(text.encode()),
        "customCards": len(custom_cards),
        "customCardNames": sorted(str(card["name"]) for card in custom_cards),
        "draftEffects": sum(len(card.get("draft_effects", [])) for card in custom_cards),
        "effectSignatures": {
            str(card["name"]): sha256_bytes(
                json.dumps(card.get("draft_effects", []), ensure_ascii=False, sort_keys=True).encode()
            )
            for card in custom_cards
            if card.get("draft_effects")
        },
        "sheets": {
            name: len([line for line in sections.get(name, "").splitlines() if line.strip()])
            for name in ("commander", "mono", "land")
        },
        "sheetCards": {
            name: [line for line in sections.get(name, "").splitlines() if line.strip()]
            for name in ("commander", "mono", "land")
        },
    }


def source_summary(path: Path) -> dict[str, Any]:
    rows = load_rows(path)
    tags: dict[str, int] = {}
    for row in rows:
        for tag in row.tags:
            tags[tag] = tags.get(tag, 0) + 1
    return {
        "sha256": sha256_file(path),
        "rows": len(rows),
        "tags": dict(sorted(tags.items())),
        "cards": sorted(row.card_line for row in rows),
    }
