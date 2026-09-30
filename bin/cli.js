#!/usr/bin/env node
// caveman-indonesia installer: copies the irit skill into coding agent skill folders.
// Zero dependencies. Node >= 18.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SKILL_NAME = 'irit';
const SKILL_SRC = path.join(__dirname, '..', 'skills', SKILL_NAME);
const PKG = require('../package.json');

// Agent id -> skills directories. `detect` is the folder whose presence means the agent is installed.
// Paths follow the vercel-labs/skills CLI conventions.
const AGENTS = {
  'claude-code': { global: '.claude/skills', project: '.claude/skills', detect: '.claude' },
  kiro: { global: '.kiro/skills', project: '.kiro/skills', detect: '.kiro' },
  codex: { global: '.codex/skills', project: '.agents/skills', detect: '.codex' },
  cursor: { global: '.cursor/skills', project: '.agents/skills', detect: '.cursor' },
  'gemini-cli': { global: '.gemini/skills', project: '.agents/skills', detect: '.gemini' },
  antigravity: { global: '.gemini/antigravity/skills', project: '.agents/skills', detect: '.gemini/antigravity' },
  opencode: { global: '.config/opencode/skills', project: '.agents/skills', detect: '.config/opencode' },
  'github-copilot': { global: '.copilot/skills', project: '.agents/skills', detect: '.copilot' },
};

const HELP = `caveman-indonesia ${PKG.version}
Install the irit skill (terse Indonesian replies) into your coding agents.

Usage:
  npx caveman-indonesia [install] [options]
  npx caveman-indonesia uninstall [options]
  npx caveman-indonesia list

Options:
  -a, --agent <ids>   Comma-separated agents (default: every detected agent)
                      ${Object.keys(AGENTS).join(', ')}
  -p, --project       Install into the current project instead of your home directory
  -f, --force         Overwrite a folder named "${SKILL_NAME}" that is not this skill
  -n, --dry-run       Print what would happen without writing anything
  -h, --help          Show this help
  -v, --version       Show version`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { command: 'install', agents: null, project: false, force: false, dryRun: false };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) opts.command = args.shift();
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '-a':
      case '--agent': {
        const v = args.shift();
        if (!v || v.startsWith('-')) throw new UsageError(`${a} needs a value`);
        opts.agents = v.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      }
      case '-p':
      case '--project': opts.project = true; break;
      case '-f':
      case '--force': opts.force = true; break;
      case '-n':
      case '--dry-run': opts.dryRun = true; break;
      case '-h':
      case '--help': opts.command = 'help'; break;
      case '-v':
      case '--version': opts.command = 'version'; break;
      default: throw new UsageError(`unknown option: ${a}`);
    }
  }
  if (!['install', 'uninstall', 'list', 'help', 'version'].includes(opts.command)) {
    throw new UsageError(`unknown command: ${opts.command}`);
  }
  if (opts.agents) {
    const bad = opts.agents.filter((id) => !AGENTS[id]);
    if (bad.length) throw new UsageError(`unknown agent: ${bad.join(', ')}. Known: ${Object.keys(AGENTS).join(', ')}`);
  }
  return opts;
}

function baseDir(opts, env) {
  return opts.project ? env.cwd : env.home;
}

function skillsDir(id, opts, env) {
  return path.join(baseDir(opts, env), opts.project ? AGENTS[id].project : AGENTS[id].global);
}

function detectedAgents(env) {
  return Object.keys(AGENTS).filter((id) => fs.existsSync(path.join(env.home, AGENTS[id].detect)));
}

// True if dir holds our skill (frontmatter name matches), so we never touch someone else's folder.
function isOurSkill(dir) {
  const file = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(file)) return false;
  const head = fs.readFileSync(file, 'utf8').slice(0, 500);
  return new RegExp(`^name:\\s*${SKILL_NAME}\\s*$`, 'm').test(head);
}

// Resolve targets once; project installs share `.agents/skills`, so dedupe by path.
function targets(opts, env) {
  const ids = opts.agents || (opts.project ? Object.keys(AGENTS) : detectedAgents(env));
  const seen = new Map();
  for (const id of ids) {
    const dest = path.join(skillsDir(id, opts, env), SKILL_NAME);
    if (!seen.has(dest)) seen.set(dest, []);
    seen.get(dest).push(id);
  }
  return [...seen].map(([dest, agentIds]) => ({ dest, agentIds }));
}

function install(opts, env, log) {
  if (!opts.agents && !opts.project && detectedAgents(env).length === 0) {
    throw new UsageError(`no supported agent found in ${env.home}. Pass --agent, e.g. --agent claude-code`);
  }
  // Project install without --agent: only write to folders whose agent config already exists in the project.
  let list = targets(opts, env);
  if (opts.project && !opts.agents) {
    list = list.filter(({ dest }) => fs.existsSync(path.dirname(path.dirname(dest))));
    if (list.length === 0) throw new UsageError('no agent folder (.claude, .kiro, .agents) in this project. Pass --agent');
  }
  let count = 0;
  for (const { dest, agentIds } of list) {
    const label = agentIds.join(', ');
    if (fs.existsSync(dest) && !isOurSkill(dest) && !opts.force) {
      log(`skip   ${dest} (${label}): folder exists and is not the irit skill, use --force`);
      continue;
    }
    log(`${opts.dryRun ? 'would install' : 'install'} ${dest} (${label})`);
    if (!opts.dryRun) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(SKILL_SRC, dest, { recursive: true });
    }
    count++;
  }
  if (opts.dryRun) log('Dry run, nothing written.');
  else log(count ? 'Done. Start a new session and type /irit (or "mode irit").' : 'Nothing installed.');
  return count;
}

function uninstall(opts, env, log) {
  const ids = opts.agents || Object.keys(AGENTS);
  let count = 0;
  for (const { dest, agentIds } of targets({ ...opts, agents: ids }, env)) {
    if (!fs.existsSync(dest)) continue;
    if (!isOurSkill(dest)) {
      log(`skip   ${dest}: not the irit skill, left untouched`);
      continue;
    }
    log(`${opts.dryRun ? 'would remove' : 'remove'} ${dest} (${agentIds.join(', ')})`);
    if (!opts.dryRun) fs.rmSync(dest, { recursive: true, force: true });
    count++;
  }
  log(count ? 'Done.' : 'irit is not installed in any known location.');
  return count;
}

function list(opts, env, log) {
  const detected = new Set(detectedAgents(env));
  for (const id of Object.keys(AGENTS)) {
    const g = path.join(skillsDir(id, { project: false }, env), SKILL_NAME);
    const p = path.join(skillsDir(id, { project: true }, env), SKILL_NAME);
    const where = [isOurSkill(g) && 'global', isOurSkill(p) && 'project'].filter(Boolean).join('+') || '-';
    log(`${id.padEnd(15)} ${detected.has(id) ? 'detected' : '        '}  installed: ${where}`);
  }
}

function main(argv = process.argv.slice(2), env = { home: os.homedir(), cwd: process.cwd() }, log = console.log) {
  const opts = parseArgs(argv);
  if (opts.command === 'help') return log(HELP);
  if (opts.command === 'version') return log(PKG.version);
  if (opts.command === 'list') return list(opts, env, log);
  if (opts.command === 'uninstall') return uninstall(opts, env, log);
  return install(opts, env, log);
}

module.exports = { main, parseArgs, AGENTS, SKILL_NAME, UsageError };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\nRun with --help for usage.`);
      process.exit(2);
    }
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
