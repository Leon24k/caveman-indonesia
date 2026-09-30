'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main, parseArgs, UsageError } = require('../bin/cli.js');
const ROOT = path.join(__dirname, '..');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irit-test-'));
  const env = { home: path.join(dir, 'home'), cwd: path.join(dir, 'proj') };
  fs.mkdirSync(env.home);
  fs.mkdirSync(env.cwd);
  const lines = [];
  return { env, lines, log: (l) => lines.push(l), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const skillAt = (p) => path.join(p, 'irit', 'SKILL.md');

test('installs globally into detected agents only', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  fs.mkdirSync(path.join(s.env.home, '.claude'));
  fs.mkdirSync(path.join(s.env.home, '.kiro'));
  main([], s.env, s.log);
  assert.ok(fs.existsSync(skillAt(path.join(s.env.home, '.claude/skills'))));
  assert.ok(fs.existsSync(skillAt(path.join(s.env.home, '.kiro/skills'))));
  assert.ok(!fs.existsSync(path.join(s.env.home, '.codex')));
  const copied = fs.readFileSync(skillAt(path.join(s.env.home, '.claude/skills')), 'utf8');
  assert.equal(copied, fs.readFileSync(path.join(ROOT, 'skills/irit/SKILL.md'), 'utf8'));
});

test('fails with a clear error when no agent is detected', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  assert.throws(() => main([], s.env, s.log), UsageError);
});

test('--agent installs even when the agent folder does not exist', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  main(['install', '--agent', 'codex'], s.env, s.log);
  assert.ok(fs.existsSync(skillAt(path.join(s.env.home, '.codex/skills'))));
});

test('--project writes shared .agents/skills once for several agents', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  main(['-p', '-a', 'codex,cursor,claude-code'], s.env, s.log);
  assert.ok(fs.existsSync(skillAt(path.join(s.env.cwd, '.agents/skills'))));
  assert.ok(fs.existsSync(skillAt(path.join(s.env.cwd, '.claude/skills'))));
  assert.equal(s.lines.filter((l) => l.startsWith('install')).length, 2);
});

test('--dry-run writes nothing', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  main(['--agent', 'kiro', '--dry-run'], s.env, s.log);
  assert.ok(!fs.existsSync(path.join(s.env.home, '.kiro')));
  assert.match(s.lines.join('\n'), /would install/);
});

test('never overwrites or removes a foreign "irit" folder without --force', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  const foreign = path.join(s.env.home, '.claude/skills/irit');
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, 'SKILL.md'), '---\nname: someone-else\n---\n');
  main(['-a', 'claude-code'], s.env, s.log);
  main(['uninstall', '-a', 'claude-code'], s.env, s.log);
  assert.match(fs.readFileSync(path.join(foreign, 'SKILL.md'), 'utf8'), /someone-else/);
  main(['-a', 'claude-code', '--force'], s.env, s.log);
  assert.match(fs.readFileSync(path.join(foreign, 'SKILL.md'), 'utf8'), /^name: irit$/m);
});

test('uninstall removes only our skill', (t) => {
  const s = sandbox();
  t.after(s.cleanup);
  main(['-a', 'kiro'], s.env, s.log);
  const other = path.join(s.env.home, '.kiro/skills/other');
  fs.mkdirSync(other);
  main(['uninstall'], s.env, s.log);
  assert.ok(!fs.existsSync(path.join(s.env.home, '.kiro/skills/irit')));
  assert.ok(fs.existsSync(other));
});

test('rejects unknown agents, options, and commands', () => {
  assert.throws(() => parseArgs(['--agent', 'nope']), /unknown agent/);
  assert.throws(() => parseArgs(['--wat']), /unknown option/);
  assert.throws(() => parseArgs(['explode']), /unknown command/);
  assert.throws(() => parseArgs(['--agent']), /needs a value/);
});

test('versions match across package.json and plugin.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(plugin.version, pkg.version);
  assert.equal(market.plugins[0].name, plugin.name, 'marketplace entry name must equal manifest name');
});
