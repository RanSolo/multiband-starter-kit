import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const GitHubProvider = require("next-auth/providers/github").default;

describe("GitHub OAuth provider", () => {
  it("declares GitHub's issuer without changing its OAuth endpoints", () => {
    const provider = GitHubProvider({
      clientId: "synthetic-client-id",
      clientSecret: "synthetic-client-secret",
    });

    assert.equal(provider.id, "github");
    assert.equal(provider.type, "oauth");
    assert.equal(provider.issuer, "https://github.com/login/oauth");
    assert.equal(
      provider.authorization.url,
      "https://github.com/login/oauth/authorize",
    );
    assert.equal(provider.token, "https://github.com/login/oauth/access_token");
    assert.equal(provider.userinfo.url, "https://api.github.com/user");
  });

  it("uses the stock provider without an app-level issuer override", async () => {
    const authSource = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");

    assert.match(authSource, /GitHubProvider\(\{/);
    assert.doesNotMatch(authSource, /\bissuer\s*:/);
  });
});
