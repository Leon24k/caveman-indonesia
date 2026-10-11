#!/usr/bin/env python3
"""Live eval for the irit skill: real Claude replies, not hand-written samples.

Sends every prompt in samples.json to Claude once without the skill and once
per irit mode (SKILL.md as the system prompt), then reports:
  - reply tokens: the visible answer, counted with Claude's tokenizer
  - billed output tokens: what the API charged, thinking included
  - the run.py checks on every live reply: banned abbreviations, dialect density
    and register, and whether the irit reply came out shorter than the baseline

The baseline has no system prompt. Coding agents ship their own system prompt
that already asks for some brevity, so real savings will be lower than here.

Costs money: prompts x (1 + 3 modes) x --runs requests.

Usage:
    export ANTHROPIC_API_KEY=...
    python benchmarks/live.py                    # claude-opus-5-5, 1 run
    python benchmarks/live.py --model claude-sonnet-5-5 --runs 3
    python benchmarks/live.py --json > live.json # every reply, for reading
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys

import anthropic

from run import CLAUDE_MODEL, MODES, ROOT, SAMPLES, claude_counter, dialect_problems, find_banned

SKILL = (ROOT.parent / "skills" / "irit" / "SKILL.md").read_text(encoding="utf-8")
SKILL_BODY = SKILL.split("---", 2)[2].strip()


def ask(client: anthropic.Anthropic, model: str, effort: str, prompt: str, system: str | None) -> dict:
    # No server-side `fallbacks`: a refused request must show up as a refusal,
    # not as a reply from a different model mixed into this model's numbers.
    resp = client.messages.create(
        model=model,
        max_tokens=16000,
        output_config={"effort": effort},
        messages=[{"role": "user", "content": prompt}],
        **({"system": system} if system else {}),
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    return {"text": text, "billed": resp.usage.output_tokens, "stop": resp.stop_reason}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=CLAUDE_MODEL)
    parser.add_argument("--effort", default="medium", help="same effort for baseline and irit (default medium)")
    parser.add_argument("--runs", type=int, default=1, help="repeat each request to average out variance")
    parser.add_argument("--json", action="store_true", help="print every reply and the summary as JSON")
    args = parser.parse_args()

    client = anthropic.Anthropic()
    count = claude_counter(args.model)
    samples = json.loads(SAMPLES.read_text(encoding="utf-8"))
    variants = {"normal": None} | {m: f"{SKILL_BODY}\n\nActive mode: {m}." for m in MODES}

    replies, failures = [], []
    for s in samples:
        for run in range(args.runs):
            base = None
            for mode, system in variants.items():
                r = ask(client, args.model, args.effort, s["prompt"], system)
                r |= {"id": s["id"], "mode": mode, "run": run, "tokens": count(r["text"]) if r["text"] else 0}
                replies.append(r)
                tag = f"{s['id']}/{mode}#{run}"
                print(f"  {tag:<28} {r['tokens']:>5} reply tok  {r['billed']:>5} billed  {r['stop']}", file=sys.stderr)
                if r["stop"] != "end_turn":
                    failures.append(f"{tag}: stop_reason {r['stop']}")
                if mode == "normal":
                    base = r["tokens"]
                    continue
                if base and r["tokens"] >= base:
                    failures.append(f"{tag}: {r['tokens']} tokens >= baseline {base}")
                if hit := find_banned(r["text"]):
                    failures.append(f"{tag}: uses banned abbreviation {hit}")
                failures += [f"{tag}: {p}" for p in dialect_problems(mode, r["text"])]

    summary = {}
    for mode in variants:
        rs = [r for r in replies if r["mode"] == mode]
        summary[mode] = {"reply_tokens": statistics.mean(r["tokens"] for r in rs),
                         "billed_output": statistics.mean(r["billed"] for r in rs)}
    for mode in MODES:
        summary[mode]["saved_pct"] = round(100 * (1 - summary[mode]["reply_tokens"] / summary["normal"]["reply_tokens"]), 1)

    if args.json:
        print(json.dumps({"model": args.model, "effort": args.effort, "summary": summary,
                          "replies": replies, "failures": failures}, indent=2, ensure_ascii=False))
    else:
        print(f"\n{args.model}, effort {args.effort}, {len(samples)} prompts x {args.runs} run(s), mean per reply:")
        for mode, v in summary.items():
            saved = f"  (-{v['saved_pct']}%)" if "saved_pct" in v else ""
            print(f"  {mode:<8} {v['reply_tokens']:>7.1f} reply tok{saved:<10} {v['billed_output']:>7.1f} billed output")
        print("\n" + ("FAIL\n" + "\n".join("  - " + f for f in failures) if failures else "PASS"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
