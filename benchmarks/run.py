#!/usr/bin/env python3
"""Token benchmark for the irit skill.

Counts tokens of a verbose "normal" Indonesian reply vs each irit mode,
using OpenAI tiktoken encodings as a tokenizer proxy. Also checks that:
  1. every abbreviation banned in SKILL.md really costs more tokens than the full word
  2. no sample reply in an irit mode uses a banned abbreviation
  3. every irit mode is shorter than the normal reply

Exit code 1 if any check fails, so this doubles as a test.

Usage:
    python benchmarks/run.py            # table + checks
    python benchmarks/run.py --json     # machine-readable output
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import tiktoken

ROOT = Path(__file__).resolve().parent
SAMPLES = ROOT / "samples.json"
ENCODINGS = ["o200k_base", "cl100k_base"]
MODES = ["singkat", "jaksel", "sunda"]

# Banned abbreviation -> full word. Must stay in sync with SKILL.md "Token rules".
BANNED = {
    "tdk": "tidak",
    "udh": "sudah",
    "sdh": "sudah",
    "blm": "belum",
    "dgn": "dengan",
    "krn": "karena",
    "jg": "juga",
    "bgt": "banget",
    "msh": "masih",
    "skrg": "sekarang",
}

# Dialect markers. Samples in a dialect mode must use enough of them, so the
# mode cannot quietly degrade into plain Indonesian with one particle on top.
SUNDA_LOMA = set(
    "teu geus can nu jeung atawa lamun sabab da oge wae pisan aya ieu eta kudu ku ka ti dina "
    "tuluy deui unggal anyar robah hayang beres lila beurat hampang loba boga sorangan mah teh atuh "
    "euy matak ngarah sanajan tetep salila kaluar benerkeun izinkeun dipake kabuka kakontrol "
    "munggaran biasana hasilna datana babagi luhur tur sakuat ngan sababaraha ngablokir ngirim nyimpen".split()
)
SUNDA_FORBIDDEN = set("aing sia abdi anjeun sanes tiasa kedah maneh".split())  # cohag, lemes, direct address
JAKSEL_MARKERS = set(
    "basically literally honestly actually so but even usually least which prefer sense worth safe clean "
    "wrap stay allow fix changes open loaded first initial run full virtualize shared share layer or "
    "reuse trigger push unstage block handle".split()  # English verbs used with di-/ke-/nge- affixes
)
MIN_DIALECT_RATIO = {"sunda": 0.25, "jaksel": 0.10}
MAX_PER_REPLY = {"atuh": 1, "euy": 1}


def count(enc: tiktoken.Encoding, text: str) -> int:
    return len(enc.encode(text))


def check_banned(encs: dict[str, tiktoken.Encoding]) -> list[str]:
    """Return abbreviations that are NOT more expensive in any encoding."""
    wrong = []
    for abbr, full in BANNED.items():
        # Leading space: words mid-sentence are tokenized with their space.
        cheaper_somewhere = any(
            count(e, " " + abbr) > count(e, " " + full) for e in encs.values()
        )
        if not cheaper_somewhere:
            wrong.append(f"{abbr} (vs {full})")
    return wrong


def prose_words(text: str) -> list[str]:
    """Lowercase words outside inline code, keeping affixed forms like datana or file-na split."""
    return re.findall(r"[a-z]+", re.sub(r"`[^`]*`", " ", text).lower())


def dialect_problems(mode: str, text: str) -> list[str]:
    words = prose_words(text)
    if not words or mode not in MIN_DIALECT_RATIO:
        return []
    markers = SUNDA_LOMA if mode == "sunda" else JAKSEL_MARKERS
    ratio = sum(w in markers for w in words) / len(words)
    out = []
    if ratio < MIN_DIALECT_RATIO[mode]:
        out.append(f"dialect too thin: {ratio:.0%} marker words, need {MIN_DIALECT_RATIO[mode]:.0%}")
    if mode == "sunda":
        bad = sorted(set(words) & SUNDA_FORBIDDEN)
        if bad:
            out.append(f"wrong register (cohag/lemes/address): {bad}")
        for w, cap in MAX_PER_REPLY.items():
            if words.count(w) > cap:
                out.append(f"'{w}' used {words.count(w)}x, max {cap}")
    return out


def find_banned(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z]+", re.sub(r"`[^`]*`", " ", text).lower())
    return sorted({w for w in words if w in BANNED})


def skill_banned_list() -> set[str]:
    """Parse the banned list from SKILL.md so the two never drift apart."""
    skill = (ROOT.parent / "skills" / "irit" / "SKILL.md").read_text(encoding="utf-8")
    m = re.search(r"^- Never use `([^`]+)`", skill, re.MULTILINE)
    return set(m.group(1).split()) if m else set()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print JSON result")
    args = parser.parse_args()

    encs = {name: tiktoken.get_encoding(name) for name in ENCODINGS}
    samples = json.loads(SAMPLES.read_text(encoding="utf-8"))
    failures: list[str] = []

    for item in check_banned(encs):
        failures.append(f"banned abbreviation not actually more expensive: {item}")

    in_skill = skill_banned_list()
    if in_skill != set(BANNED):
        failures.append(
            f"SKILL.md banned list out of sync: only in SKILL.md {sorted(in_skill - set(BANNED))}, "
            f"only in run.py {sorted(set(BANNED) - in_skill)}"
        )

    totals = {enc: {m: 0 for m in ["normal", *MODES]} for enc in ENCODINGS}
    rows = []
    for s in samples:
        row = {"id": s["id"]}
        for enc_name, enc in encs.items():
            n = count(enc, s["normal"])
            totals[enc_name]["normal"] += n
            row[f"{enc_name}:normal"] = n
            for m in MODES:
                k = count(enc, s[m])
                totals[enc_name][m] += k
                row[f"{enc_name}:{m}"] = k
                if k >= n:
                    failures.append(f"{s['id']}/{m}: {k} tokens >= normal {n} ({enc_name})")
        for m in MODES:
            hit = find_banned(s[m])
            if hit:
                failures.append(f"{s['id']}/{m}: uses banned abbreviation {hit}")
            for problem in dialect_problems(m, s[m]):
                failures.append(f"{s['id']}/{m}: {problem}")
        rows.append(row)

    summary = {
        enc: {
            m: {
                "tokens": totals[enc][m],
                "saved_pct": round(100 * (1 - totals[enc][m] / totals[enc]["normal"]), 1),
            }
            for m in MODES
        }
        | {"normal": {"tokens": totals[enc]["normal"], "saved_pct": 0.0}}
        for enc in ENCODINGS
    }

    if args.json:
        print(json.dumps({"rows": rows, "summary": summary, "failures": failures}, indent=2))
    else:
        enc = ENCODINGS[0]
        print(f"Per sample ({enc}):")
        print(f"{'sample':<18}{'normal':>8}" + "".join(f"{m:>10}" for m in MODES))
        for r in rows:
            print(
                f"{r['id']:<18}{r[f'{enc}:normal']:>8}"
                + "".join(f"{r[f'{enc}:{m}']:>10}" for m in MODES)
            )
        print("\nTotal (tokens, % saved vs normal):")
        for enc_name in ENCODINGS:
            parts = [f"normal {summary[enc_name]['normal']['tokens']}"] + [
                f"{m} {summary[enc_name][m]['tokens']} (-{summary[enc_name][m]['saved_pct']}%)"
                for m in MODES
            ]
            print(f"  {enc_name:<12} " + " | ".join(parts))
        print()
        if failures:
            print("FAIL")
            for f in failures:
                print("  - " + f)
        else:
            print(f"PASS: {len(BANNED)} banned abbreviations verified, {len(samples)} samples checked")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
