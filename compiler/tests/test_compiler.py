from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
from pathlib import Path

import pytest

from gulchdale_compiler import core
from gulchdale_compiler import cli


REPOSITORY = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures/phase1"
CONFIG = REPOSITORY / "compiler/config/gulchdale.yml"
EXPECTED_HASH = "faa043e37114b395869ef7a2d426167e632f3e3f471370f957d1c17cf9523fac"


def compile_fixture() -> core.CompileResult:
    return core.compile_environment(FIXTURE / "gulchdale.csv", FIXTURE / "scryfall.json", CONFIG)


def custom_cards(environment: str) -> list[dict[str, object]]:
    match = re.search(r"\[CustomCards]\n(.*?)\n\n\[commander]", environment, re.DOTALL)
    assert match
    return json.loads(match.group(1))


def test_phase1_fixture_is_byte_identical_and_deterministic() -> None:
    first = compile_fixture()
    second = compile_fixture()
    expected = (FIXTURE / "expected-gulchdale.txt").read_text(encoding="utf-8")
    assert first.environment == expected == second.environment
    assert first.environment_sha256 == EXPECTED_HASH
    assert hashlib.sha256(expected.encode()).hexdigest() == EXPECTED_HASH
    assert first.counts["sheets"] == {"commander": 147, "mono": 658, "land": 160}


def test_partners_tribes_adornments_and_custom_images_compile() -> None:
    cards = {card["name"]: card for card in custom_cards(compile_fixture().environment)}
    emry = cards["Emry, Lurker of the Loch"]
    effect_cards = [value for effect in emry["draft_effects"] for value in effect.get("cards", [])]
    assert "Looking For Group!" in effect_cards
    for tribe in ("Elf", "Goblin", "Zombie", "Faerie", "Human"):
        booster = cards[f"{tribe} Booster Pack"]
        effect = booster["draft_effects"][0]
        assert effect["type"] == "AddCards"
        assert effect["count"] == 6
        assert len(effect["cards"]) >= 19
    assert cards["Sapphire Adornment"]["image"].startswith("https://")


def test_csv_multiline_notes_and_mainboard_filtering(tmp_path: Path) -> None:
    source = tmp_path / "source.csv"
    source.write_text(
        'name,Set,Collector Number,board,maybeboard,tags,Notes\n'
        'Main,tst,1,mainboard,false,mono,"one\ntwo"\n'
        'Maybe,tst,2,maybeboard,true,mono,\n',
        encoding="utf-8",
    )
    rows = core.load_rows(source)
    assert len(rows) == 1
    assert rows[0].notes == ("one", "two")


def test_conflicting_board_fields_fail(tmp_path: Path) -> None:
    source = tmp_path / "source.csv"
    source.write_text(
        "name,Set,Collector Number,board,maybeboard,tags,Notes\nBad,tst,1,mainboard,true,mono,\n",
        encoding="utf-8",
    )
    with pytest.raises(core.CompilerError, match="conflicts"):
        core.load_rows(source)


def test_unresolved_note_reference_fails(tmp_path: Path) -> None:
    source = tmp_path / "gulchdale.csv"
    rows = list(csv.DictReader((FIXTURE / "gulchdale.csv").open(encoding="utf-8")))
    for row in rows:
        if row["name"] == "The Watcher in the Water":
            row["Notes"] = "Definitely Missing"
            break
    with source.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(core.CompilerError, match="not found"):
        core.compile_environment(source, FIXTURE / "scryfall.json", CONFIG)


def test_complete_metadata_cache_rebuilds_offline(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def unexpected_request(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("Scryfall should not be called for a complete cache")

    monkeypatch.setattr("requests.Session.post", unexpected_request)
    destination = tmp_path / "metadata.json"
    core.sync_metadata(FIXTURE / "gulchdale.csv", destination, FIXTURE / "scryfall.json", CONFIG)
    assert destination.read_bytes() == (FIXTURE / "scryfall.json").read_bytes()


def test_promotion_revalidates_and_replaces_all_active_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    root = tmp_path / "repository"
    shutil.copytree(REPOSITORY / "compiler/config", root / "compiler/config")
    result = compile_fixture()
    config = core.load_config(CONFIG)
    manifest = core.manifest_for(
        result,
        "f1c8be0f-7ac3-420f-81eb-ec8933ce45fa",
        "2026-09-30T00:00:00Z",
        True,
        config["profile"],
    )
    assert manifest["environmentProfile"]["id"] == "classic"
    assert [stage["layout"] for stage in manifest["environmentProfile"]["stages"]] == [
        "pack1",
        "pack2",
        "pack3",
        "landpack",
    ]
    core.write_candidate(root, result, FIXTURE / "gulchdale.csv", FIXTURE / "scryfall.json", manifest)
    monkeypatch.setattr(core, "validate_with_engine", lambda *_args: None)
    core.promote_candidate(root, result.version)
    assert (root / "data/cubes/gulchdale.txt").read_text(encoding="utf-8") == result.environment
    assert json.loads((root / "data/cubes/gulchdale.manifest.json").read_text())["version"] == result.version


def test_markdown_diff_is_a_human_readable_promotion_report() -> None:
    report = {
        "activeVersion": "gch-old",
        "candidateVersion": "gch-new",
        "sourceChanged": True,
        "environmentChanged": True,
        "source": {
            "active": {"sha256": "source-old", "rows": 1},
            "candidate": {"sha256": "source-new", "rows": 2},
            "cardsAdded": ["New Card (tst) 2"],
            "cardsRemoved": [],
        },
        "environment": {
            "active": {"sha256": "environment-old", "customCards": 1, "draftEffects": 1},
            "candidate": {"sha256": "environment-new", "customCards": 2, "draftEffects": 2},
        },
        "sheets": {"commander": {"added": ["New Card (tst) 2"], "removed": []}},
        "customCards": {"added": ["New Custom"], "removed": []},
        "effects": {"changed": ["Effect Card"]},
        "warnings": ["Review this support card"],
    }
    rendered = cli.markdown_diff(report)
    assert "# Gulchdale promotion report: gch-new" in rendered
    assert "| Version | `gch-old` | `gch-new` |" in rendered
    assert "- New Card (tst) 2" in rendered
    assert "- New Custom" in rendered
    assert "- Review this support card" in rendered
