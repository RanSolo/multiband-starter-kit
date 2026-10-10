import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = readFileSync(join(sourceRoot, "tools/quality/may-handoff.mjs"));
const project = JSON.parse(readFileSync(join(sourceRoot, "tools/quality/project.json"), "utf8"));
const fixtures = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function command(root, program, args, env = {}) {
  return spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

function git(root, ...args) {
  const result = command(root, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function commit(root, message) {
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

function fixture({ realNx = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mbsk-handoff-test-"));
  fixtures.push(root);
  git(root, "init", "-q");
  write(root, ".gitignore", "node_modules\n.nx/\n");
  write(root, "tools/quality/may-handoff.mjs", runner);
  write(root, "tools/quality/project.json", JSON.stringify(project));
  write(root, "tests/project.json", realNx ? JSON.stringify({
    name: "multiband-tests",
    root: "tests",
    targets: {
      test: {
        executor: "nx:run-commands",
        options: { command: "node tests/fixed-test.cjs", cwd: "{workspaceRoot}" },
        cache: false,
      },
    },
  }) : '{"name":"multiband-tests"}\n');
  if (realNx) write(root, "tests/fixed-test.cjs", 'require("node:fs").writeFileSync(process.env.FAKE_NX_LOG, "fixed-source-test\\n");\n');
  write(root, "nx.json", "{}\n");
  write(root, "package.json", '{"name":"fixture","version":"1.0.0","private":true,"nx":{"includedScripts":[]}}\n');
  write(root, "package-lock.json", JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "fixture", version: "1.0.0" } },
  }));
  write(root, "app.txt", "first\n");
  const base = commit(root, "baseline");
  write(root, "app.txt", "second\n");
  const head = commit(root, "source change");
  if (realNx) {
    symlinkSync(join(sourceRoot, "node_modules"), join(root, "node_modules"), "dir");
  } else {
    write(root, "node_modules/nx/dist/bin/nx.js", [
      'const fs = require("node:fs");',
      'fs.writeFileSync(process.env.FAKE_NX_LOG, JSON.stringify(process.argv.slice(2)));',
      'process.exit(Number(process.env.FAKE_NX_EXIT || 0));',
    ].join("\n"));
  }
  mkdirSync(join(root, ".nx"), { recursive: true });
  return { root, base, head, log: join(root, ".nx", "nx-args.json") };
}

function handoff(f, args = [`--base=${f.base}`, `--head=${f.head}`], env = {}) {
  return command(f.root, process.execPath, ["tools/quality/may-handoff.mjs", ...args], {
    FAKE_NX_LOG: f.log,
    ...env,
  });
}

test("Nx exposes exactly the fixed handoff command and disables target caching", () => {
  assert.equal(project.name, "mission-rail-quality");
  assert.deepEqual(Object.keys(project.targets), ["may-handoff"]);
  assert.equal(project.targets["may-handoff"].options.command, "node tools/quality/may-handoff.mjs");
  assert.equal(project.targets["may-handoff"].options.forwardAllArgs, true);
  assert.equal(project.targets["may-handoff"].cache, false);
});

test("clean candidate runs fixed source tests through installed Nx without cache", () => {
  const f = fixture();
  const result = handoff(f);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(f.log, "utf8")), [
    "run", "multiband-tests:test", "--skip-nx-cache", "--outputStyle=stream",
  ]);
  assert.match(result.stdout, /PASS \(fixed source tests\)/);
});

test("exact npm exec entry point forwards the SHA pair through installed Nx", () => {
  const f = fixture({ realNx: true });
  const result = command(f.root, "npm", [
    "exec", "--", "nx", "run", "mission-rail-quality:may-handoff", "--",
    `--base=${f.base}`, `--head=${f.head}`,
  ], {
    FAKE_NX_LOG: f.log,
    npm_config_offline: "true",
    NX_DAEMON: "false",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${git(f.root, "status", "--short", "--untracked-files=all")}`);
  assert.equal(readFileSync(f.log, "utf8"), "fixed-source-test\n");
  assert.match(result.stdout, /may-handoff: PASS/);
});

test("rejects duplicate, malformed, and extra caller arguments before tests", () => {
  const f = fixture();
  for (const args of [
    [`--base=${f.base}`, `--base=${f.base}`],
    [`--base=${f.base.slice(1)}`, `--head=${f.head}`],
    [`--base=${f.base}`, `--head=${f.head}`, "--target=build"],
  ]) assert.notEqual(handoff(f, args).status, 0);
});

test("rejects dirty checkout, stale head, missing base, and empty diff", () => {
  const f = fixture();
  assert.notEqual(handoff(f, [`--base=${f.base}`, `--head=${f.base}`]).status, 0);
  assert.notEqual(handoff(f, [`--base=${"0".repeat(40)}`, `--head=${f.head}`]).status, 0);
  assert.notEqual(handoff(f, [`--base=${f.head}`, `--head=${f.head}`]).status, 0);
  write(f.root, "untracked.txt", "dirty\n");
  assert.match(handoff(f).stderr, /checkout must be clean/);
});

test("rejects a base commit from a divergent branch", () => {
  const f = fixture();
  git(f.root, "checkout", "-q", "-b", "other", f.base);
  write(f.root, "app.txt", "branch change\n");
  const divergent = commit(f.root, "other branch");
  git(f.root, "checkout", "-q", f.head);
  const result = handoff(f, [`--base=${divergent}`, `--head=${f.head}`]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Git verification failed/);
});

test("rejects source delta that touches quality or redirecting configuration", () => {
  for (const path of ["tools/quality/project.json", "tests/project.json", "nx.json", "package.json", ".npmrc"]) {
    const f = fixture();
    write(f.root, path, `changed ${path}\n`);
    const head = commit(f.root, "anchor change");
    const result = handoff(f, [`--base=${f.base}`, `--head=${head}`]);
    assert.notEqual(result.status, 0, path);
    assert.match(result.stderr, /validation trust anchor/, path);
  }
});

test("propagates test failure and never reports a pass", () => {
  const f = fixture();
  const result = handoff(f, undefined, { FAKE_NX_EXIT: "7" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /multiband-tests:test failed/);
  assert.doesNotMatch(result.stdout, /PASS/);
});
