import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = "scripts/qa/local-postgres.mjs";

test("local PostgreSQL QA files use the dedicated loopback target", () => {
  const compose = readFileSync("compose.qa.yml", "utf8");
  const example = readFileSync(".env.qa.example", "utf8");
  const helper = readFileSync(script, "utf8");
  assert.match(compose, /127\.0\.0\.1:55432:5432/);
  assert.match(compose, /container_name: mbsk-nx-qa-postgres/);
  assert.match(compose, /mbsk-nx-qa-postgres-data/);
  assert.match(
    compose,
    /sha256:e62fbf9d3e2b49816a32c400ed2dba83e3b361e6833e624024309c35d334b412/,
  );
  assert.match(
    example,
    /POSTGRES_PRISMA_URL=.*127\.0\.0\.1:55432\/multiband_nx_qa/,
  );
  assert.match(
    example,
    /POSTGRES_URL_NON_POOLING=.*127\.0\.0\.1:55432\/multiband_nx_qa/,
  );
  assert.match(helper, /assertSafeTarget\(\)/);
  assert.match(helper, /Port 55432 is already in use; refusing to proceed/);
  assert.match(helper, /Container .*already exists; refusing to reuse it/);
  assert.match(helper, /Volume .*already exists; refusing to reuse it/);
  assert.match(helper, /POSTGRES_PRISMA_URL/);
  assert.match(helper, /POSTGRES_URL_NON_POOLING/);
  assert.match(helper, /compose\(\["up", "-d", "--wait", service\]\)/);
  assert.doesNotMatch(helper, /db push/);
  assert.doesNotMatch(helper, /docker compose.*down/);
  assert.doesNotMatch(helper, /docker volume rm/);
  assert.doesNotMatch(helper, /prisma migrate reset/);
});
