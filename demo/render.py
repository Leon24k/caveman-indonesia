#!/usr/bin/env python3
"""Render README media for irit.

Outputs (all in assets/):
  demo.gif     scripted terminal replay of one benchmark sample in every mode
  modes.png    static card: same question, normal vs singkat vs jaksel vs sunda
  install.gif  real output of the npm installer, run in a throwaway HOME

The replies come from benchmarks/samples.json and token counts from tiktoken,
so the media never drift from the benchmark. This is a replay, not a live
model session, and the frames say so.

Usage:
    .venv/bin/pip install -r requirements.txt
    .venv/bin/python demo/render.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import tiktoken
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SAMPLES = json.loads((ROOT / "benchmarks" / "samples.json").read_text(encoding="utf-8"))
SAMPLE_ID = "react-rerender"
ENC = tiktoken.get_encoding("o200k_base")
MODES = ["singkat", "jaksel", "sunda"]

FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 17
LINE_H = 25
PAD = 26
BAR_H = 38

C = {
    "bg": (30, 31, 36),
    "bar": (44, 46, 53),
    "fg": (215, 218, 224),
    "dim": (127, 132, 144),
    "code": (121, 192, 255),
    "you": (126, 231, 135),
    "agent": (227, 179, 65),
    "red": (255, 107, 107),
    "good": (126, 231, 135),
    "white": (255, 255, 255),
}


def tokens(text: str) -> int:
    return len(ENC.encode(text))


def font(size: int = FONT_SIZE, bold: bool = False) -> ImageFont.FreeTypeFont:
    # Menlo.ttc index 1 is bold.
    return ImageFont.truetype(FONT_PATH, size, index=1 if bold else 0)


F = font()
FB = font(bold=True)
CHAR_W = F.getlength("M")


# ---------- text layout ----------

Span = tuple[str, tuple[int, int, int]]


def spans(text: str, color: tuple[int, int, int]) -> list[tuple[str, tuple[int, int, int]]]:
    """Split on backticks: inline code gets the code color, backticks are dropped."""
    out, in_code = [], False
    for part in re.split(r"(`)", text):
        if part == "`":
            in_code = not in_code
        elif part:
            out.append((part, C["code"] if in_code else color))
    return out


def wrap(parts: list[Span], cols: int) -> list[list[Span]]:
    """Word-wrap colored spans into lines of at most `cols` characters."""
    words: list[list[Span]] = [[]]
    for text, color in parts:
        for chunk in re.split(r"( )", text):
            if chunk == " ":
                words.append([])
            elif chunk:
                words[-1].append((chunk, color))
    lines: list[list[Span]] = [[]]
    width = 0
    for w in words:
        wlen = sum(len(t) for t, _ in w)
        if width and width + 1 + wlen > cols:
            lines.append([])
            width = 0
        if width:
            lines[-1].append((" ", C["fg"]))
            width += 1
        lines[-1].extend(w)
        width += wlen
    return lines


# ---------- terminal renderer ----------


@dataclass
class Terminal:
    width: int = 980
    height: int = 500
    title: str = "irit · caveman-indonesia"
    lines: list[list[Span]] = field(default_factory=list)
    frames: list[Image.Image] = field(default_factory=list)
    durations: list[int] = field(default_factory=list)

    @property
    def cols(self) -> int:
        return int((self.width - 2 * PAD) // CHAR_W)

    @property
    def rows(self) -> int:
        return (self.height - BAR_H - 2 * PAD) // LINE_H

    def render(self, cursor: bool = False) -> Image.Image:
        img = Image.new("RGB", (self.width, self.height), C["bg"])
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, self.width, BAR_H], fill=C["bar"])
        for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            d.ellipse([18 + i * 22, 13, 30 + i * 22, 25], fill=col)
        tw = F.getlength(self.title)
        d.text(((self.width - tw) / 2, 10), self.title, font=F, fill=C["dim"])
        visible = self.lines[-self.rows:]
        y = BAR_H + PAD
        x = PAD
        for line in visible:
            x = PAD
            for text, color in line:
                d.text((x, y), text, font=F, fill=color)
                x += F.getlength(text)
            y += LINE_H
        if cursor:
            cy = y - LINE_H if visible else BAR_H + PAD
            d.rectangle([x + 2, cy + 3, x + 2 + CHAR_W * 0.6, cy + LINE_H - 4], fill=C["fg"])
        return img

    def snap(self, ms: int, cursor: bool = False) -> None:
        self.frames.append(self.render(cursor))
        self.durations.append(ms)

    def clear(self) -> None:
        self.lines = []

    def println(self, parts: list[Span] | str = "", color=None) -> None:
        if isinstance(parts, str):
            parts = spans(parts, color or C["fg"])
        self.lines.extend(wrap(parts, self.cols) if parts else [[]])

    def type_line(self, prefix: list[Span], text: str, color, step: int = 2, ms: int = 45) -> None:
        """Type `text` character by character after a fixed prefix."""
        self.lines.append(list(prefix))
        for i in range(step, len(text) + step, step):
            self.lines[-1] = list(prefix) + [(text[:i], color)]
            self.snap(ms, cursor=True)

    def stream(self, text: str, color, words_per_frame: int = 1, ms: int = 55) -> None:
        """Print a reply word by word, like a streaming model response."""
        words = text.split(" ")
        start = len(self.lines)
        for i in range(words_per_frame, len(words) + words_per_frame, words_per_frame):
            del self.lines[start:]
            self.println(" ".join(words[:i]), color)
            self.snap(ms)

    def save(self, path: Path) -> None:
        # One shared palette built from a strip of sampled frames, so no color is missing.
        sample = self.frames[:: max(1, len(self.frames) // 12)] + [self.frames[-1]]
        strip = Image.new("RGB", (self.width, self.height * len(sample)))
        for i, f in enumerate(sample):
            strip.paste(f, (0, i * self.height))
        palette = strip.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in self.frames]
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=self.durations, loop=0, optimize=True)


# ---------- media ----------

YOU = [("you", C["you"]), (" › ", C["dim"])]


def agent_header(label: str) -> list[Span]:
    return [("agent", C["agent"]), (f" [{label}]", C["dim"])]


def demo_gif() -> None:
    s = next(x for x in SAMPLES if x["id"] == SAMPLE_ID)
    n_normal = tokens(s["normal"])
    t = Terminal()

    t.println("replay of benchmark sample, not a live session", C["dim"])
    t.println()
    t.snap(700)
    t.type_line(YOU, s["prompt"], C["fg"])
    t.snap(500)
    t.println(agent_header("normal"))
    t.stream(s["normal"], C["fg"], words_per_frame=4, ms=40)
    t.println([(f"{n_normal} tokens", C["red"])])
    t.snap(2200)

    for mode in MODES:
        cmd = "/irit" if mode == "singkat" else f"/irit {mode}"
        n = tokens(s[mode])
        t.clear()
        t.println(f"mode: {mode}", C["dim"])
        t.println()
        t.type_line(YOU, cmd, C["code"], step=1, ms=70)
        t.snap(350)
        t.type_line(YOU, s["prompt"], C["fg"], step=3, ms=35)
        t.snap(350)
        t.println(agent_header(mode))
        t.stream(s[mode], C["fg"], words_per_frame=1, ms=55)
        pct = round(100 * (1 - n / n_normal))
        t.println([(f"{n} tokens", C["good"]), (f"  (normal {n_normal}, -{pct}%)", C["dim"])])
        t.snap(2400)

    # Summary across all benchmark samples.
    totals = {m: sum(tokens(x[m]) for x in SAMPLES) for m in ["normal", *MODES]}
    t.clear()
    t.println(f"benchmark: {len(SAMPLES)} samples, o200k_base", C["dim"])
    t.println()
    for m in ["normal", *MODES]:
        bar = "#" * round(40 * totals[m] / totals["normal"])
        saved = "" if m == "normal" else f"-{100 * (1 - totals[m] / totals['normal']):.1f}%"
        color = C["red"] if m == "normal" else C["good"]
        t.println([(f"{m:<8} ", C["fg"]), (f"{totals[m]:>4}  ", C["fg"]), (f"{bar:<41}", color), (saved, color)])
    t.println()
    t.println("npx caveman-indonesia", C["code"])
    t.snap(4500)
    t.save(ASSETS / "demo.gif")


def modes_png() -> None:
    s = next(x for x in SAMPLES if x["id"] == SAMPLE_ID)
    width = 1200
    title_f, label_f = font(26, bold=True), font(17, bold=True)
    body_cols = int((width - 60 - 40) // CHAR_W)
    blocks = [("normal", s["normal"], C["red"])] + [(m, s[m], C["good"]) for m in MODES]
    layouts = []
    for name, text, _ in blocks:
        lines = wrap(spans(text, C["fg"] if name != "normal" else C["dim"]), body_cols)
        if name == "normal" and len(lines) > 4:
            lines = lines[:4] + [[("… (+ closing pleasantries)", C["dim"])]]
        layouts.append(lines)
    height = 40 + 44 + 36 + sum(34 + len(ls) * LINE_H + 22 for ls in layouts) + 60
    img = Image.new("RGB", (width, height), C["bg"])
    d = ImageDraw.Draw(img)
    y = 40
    d.text((40, y), "Same question, four replies", font=title_f, fill=C["white"])
    y += 44
    d.text((40, y), f"“{s['prompt']}”", font=F, fill=C["dim"])
    y += 36
    n_normal = tokens(s["normal"])
    for (name, text, accent), lines in zip(blocks, layouts):
        n = tokens(text)
        cmd = {"normal": "without irit", "singkat": "/irit", "jaksel": "/irit jaksel", "sunda": "/irit sunda"}[name]
        d.rounded_rectangle([40, y, 46, y + 30 + len(lines) * LINE_H], radius=3, fill=accent)
        d.text((60, y), name, font=label_f, fill=accent)
        x = 60 + label_f.getlength(name) + 14
        d.text((x, y + 1), cmd, font=F, fill=C["code"])
        badge = f"{n} tokens" if name == "normal" else f"{n} tokens  -{round(100 * (1 - n / n_normal))}%"
        bw = F.getlength(badge)
        d.text((width - 40 - bw, y + 1), badge, font=F, fill=accent)
        y += 34
        for line in lines:
            x = 60
            for chunk, color in line:
                d.text((x, y), chunk, font=F, fill=color)
                x += F.getlength(chunk)
            y += LINE_H
        y += 22
    foot = "tiktoken o200k_base · replies from benchmarks/samples.json · /irit off to stop"
    d.text((40, y + 10), foot, font=F, fill=C["dim"])
    img.save(ASSETS / "modes.png", optimize=True)


def install_gif() -> None:
    """Run the real installer in a throwaway HOME with Claude Code and Kiro present."""
    with tempfile.TemporaryDirectory() as home:
        for d in (".claude", ".kiro"):
            os.makedirs(os.path.join(home, d))
        env = {**os.environ, "HOME": home}

        def run(*args: str) -> list[str]:
            out = subprocess.run(
                ["node", str(ROOT / "bin" / "cli.js"), *args], env=env, capture_output=True, text=True, check=True
            ).stdout
            return [line.replace(os.path.realpath(home), "~").replace(home, "~") for line in out.splitlines()]

        steps = [("npx caveman-indonesia", run()), ("npx caveman-indonesia list", run("list"))]

    t = Terminal(height=500, title="npx caveman-indonesia")
    shell = [("$ ", C["you"])]
    t.snap(600, cursor=True)
    for cmd, output in steps:
        t.type_line(shell, cmd, C["fg"], step=1, ms=60)
        t.snap(500)
        for line in output:
            color = C["good"] if line.startswith(("install", "Done")) else C["fg"]
            t.println(line, color)
            t.snap(180)
        t.println()
        t.snap(1500)
    t.snap(3000)
    t.save(ASSETS / "install.gif")


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    demo_gif()
    modes_png()
    install_gif()
    for name in ("demo.gif", "modes.png", "install.gif"):
        p = ASSETS / name
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
