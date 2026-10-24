#!/usr/bin/env node
// irit hooks for the Claude Code plugin. Zero dependencies.
//
//   irit.js start    SessionStart: irit is on by default, so inject the rules
//                    for the saved mode (default singkat) without typing /irit.
//   irit.js prompt   UserPromptSubmit: track mode switches, then remind the model
//                    of the active mode every turn so long sessions do not drift.
//
// The mode lives in <claude config dir>/.irit-mode and persists across sessions:
// /irit sunda stays sunda, /irit off stays off until /irit again.
// ponytail: one global mode shared by every open session; key it by session_id
// if people want different modes in parallel sessions.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODES = ['singkat', 'jaksel', 'sunda'];
const DEFAULT = 'singkat';
const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const stateFile = path.join(dir, '.irit-mode');

// Only ever returns a known mode or 'off', so file contents never reach the model.
function readMode() {
  try {
    const m = fs.readFileSync(stateFile, 'utf8').trim();
    if (m === 'off' || MODES.includes(m)) return m;
  } catch {}
  return DEFAULT;
}

// Write a temp file and rename: rename replaces a symlink instead of following it.
function writeMode(mode) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${stateFile}.${process.pid}`;
  fs.writeFileSync(tmp, mode);
  fs.renameSync(tmp, stateFile);
}

// SKILL.md without frontmatter, keeping only the active mode's rules and example.
function rules(mode) {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'irit', 'SKILL.md'), 'utf8');
  const body = skill.replace(/^---[\s\S]*?---\s*/, '');
  const out = [];
  let skipping = false;
  for (const line of body.split(/\r?\n/)) {
    const block = line.match(/^\*\*(\w+)\*\*:/);
    if (block) skipping = block[1] !== mode;
    else if (!line.trim()) skipping = false;
    const example = line.match(/^- (\w+): "/);
    if (skipping || (example && MODES.includes(example[1]) && example[1] !== mode)) continue;
    out.push(line);
  }
  return `irit is ON, mode ${mode}. Follow these rules from the first reply on.\n\n${out.join('\n').replace(/\n{3,}/g, '\n\n')}`;
}

const reminder = (mode) =>
  `irit ON (${mode}): terse, in the user's language, no greeting/closer/hedging/recap, full words not tdk/udh/dgn. ` +
  'Code, commits, PRs, warnings: write normally.';

// A spoken switch only counts in a short message, so a bug report that happens to
// say "mode normal" does not turn irit off for every future session.
// ponytail: word-count heuristic; longer requests to switch need /irit.
const MAX_SPOKEN_WORDS = 5;

// Returns the new mode if the prompt switches irit, else null.
function parseSwitch(prompt) {
  const p = prompt.trim().toLowerCase();
  const slash = p.match(/^\/irit(?::irit)?(?:\s+(\S+)|$)/);
  if (slash) {
    const arg = slash[1];
    if (!arg) return DEFAULT;
    if (arg === 'off' || MODES.includes(arg)) return arg;
    return null;
  }
  if (p.split(/\s+/).length > MAX_SPOKEN_WORDS) return null;
  if (/\b(irit off|mode normal|matikan irit|stop irit)\b/.test(p)) return 'off';
  const named = p.match(/\birit (singkat|jaksel|sunda)\b/);
  if (named) return named[1];
  if (/\bmode irit\b/.test(p)) return DEFAULT;
  return null;
}

function emit(event, context) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
}

function onPrompt(input) {
  const prompt = String(JSON.parse(input || '{}').prompt || '');
  const before = readMode();
  const next = parseSwitch(prompt);
  if (next && next !== before) writeMode(next);
  const mode = next || before;

  if (mode === 'off') {
    if (before !== 'off') emit('UserPromptSubmit', 'irit is OFF. Reply normally from now on.');
    return;
  }
  // A /irit command loads SKILL.md itself; a spoken switch ("irit sunda") does
  // not, and the session only holds the start mode's rules, so send them.
  const spokenSwitch = next && next !== before && !prompt.trim().startsWith('/');
  emit('UserPromptSubmit', spokenSwitch ? rules(mode) : reminder(mode));
}

module.exports = { parseSwitch, rules };

if (require.main === module) {
  try {
    if (process.argv[2] === 'start') {
      const mode = readMode();
      if (mode !== 'off') emit('SessionStart', rules(mode));
    } else {
      let input = '';
      process.stdin.on('data', (c) => { input += c; });
      process.stdin.on('end', () => {
        try { onPrompt(input); } catch {}
      });
    }
  } catch {
    // Never block a session or a prompt over irit.
  }
}
