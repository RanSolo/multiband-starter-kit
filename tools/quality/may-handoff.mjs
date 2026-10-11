import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = /^[0-9a-f]{40}$/;

function fail(reason) {
  process.stderr.write(`may-handoff: ${reason}\n`);
  process.exitCode = 1;
}

function parsePair(args) {
  if (args.length !== 2) throw new Error("exactly one --base and one --head are required");
  const pair = new Map();
  for (const arg of args) {
    const match = /^--(base|head)=([0-9a-f]{40})$/.exec(arg);
    if (!match || pair.has(match[1])) throw new Error("invalid or duplicate base/head argument");
    pair.set(match[1], match[2]);
  }
  if (!pair.has("base") || !pair.has("head")) throw new Error("base and head are required");
  return pair;
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 300_000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${options.label ?? program} failed`);
  }
  return result.stdout;
}

function git(args) {
  return run("git", ["--no-pager", ...args], { label: "Git verification" });
}

function isAnchor(path) {
  if (path.startsWith("tools/quality/")) return true;
  if (path === "nx.json" || path === "project.json" || path === "workspace.json") return true;
  if (path === "package.json" || path === "package-lock.json" || path === "npm-shrinkwrap.json") return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return basename === "project.json" || basename === "package.json" ||
    basename === "package-lock.json" || basename === "npm-shrinkwrap.json" ||
    basename === "nx.json" || basename === ".nxignore" || basename === ".npmrc" ||
    basename === "pnpm-workspace.yaml" || basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock" || basename === ".yarnrc" || basename === ".yarnrc.yml" ||
    basename === "lerna.json";
}

try {
  const pair = parsePair(process.argv.slice(2));
  const base = pair.get("base");
  const head = pair.get("head");
  if (!sha.test(base) || !sha.test(head)) throw new Error("invalid revision");
  if (git(["rev-parse", "--show-toplevel"]).trim() !== root) throw new Error("repository root mismatch");
  if (git(["status", "--porcelain=v1", "--untracked-files=all"]).length !== 0) {
    throw new Error("checkout must be clean");
  }
  if (git(["rev-parse", "--verify", "HEAD"]).trim() !== head) throw new Error("head does not match checkout");
  if (git(["rev-parse", "--verify", `${base}^{commit}`]).trim() !== base) throw new Error("base is not a commit");
  git(["merge-base", "--is-ancestor", base, head]);
  if (base === head) throw new Error("base and head must differ");
  const changed = git(["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, head])
    .split("\0").filter(Boolean);
  if (changed.length === 0) throw new Error("base-to-head diff is empty");
  if (changed.some(isAnchor)) throw new Error("base-to-head diff changes a validation trust anchor");

  // The task preflight must exclude anchors before this candidate-owned guard runs.
  const nx = resolve(root, "node_modules/nx/dist/bin/nx.js");
  run(process.execPath, [nx, "run", "multiband-tests:test", "--skip-nx-cache", "--outputStyle=stream"], {
    label: "multiband-tests:test",
    env: { ...process.env, NX_DAEMON: "false", NX_SKIP_NX_CACHE: "true" },
  });
  process.stdout.write("may-handoff: PASS (fixed source tests)\n");
} catch (error) {
  fail(error instanceof Error ? error.message : "validation failed");
}
