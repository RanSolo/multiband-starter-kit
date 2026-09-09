import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const script = "scripts/qa/local-postgres.mjs";

test("local PostgreSQL QA files use the dedicated loopback target", () => {
  const compose = readFileSync("compose.qa.yml", "utf8");
  const example = readFileSync(".env.qa.example", "utf8");
  assert.match(compose, /127\.0\.0\.1:55432:5432/);
  assert.match(compose, /mbsk-nx-qa-postgres-data/);
  assert.match(
    compose,
    /sha256:e62fbf9d3e2b49816a32c400ed2dba83e3b361e6833e624024309c35d334b412/,
  );
  assert.match(example, /127\.0\.0\.1:55432\/multiband_nx_qa/);
  assert.match(readFileSync(script, "utf8"), /refusing to proceed/);
});

test("status is read-only for the dedicated QA service", () => {
  const output = execFileSync("node", [script, "status"], { encoding: "utf8" });
  assert.match(output, /mbsk-nx-qa-postgres|^$/m);
});
