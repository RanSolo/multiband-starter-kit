import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  MAX_SOCIAL_LINK_LENGTH,
  canonicalSocialUrl as canonical,
} from "../lib/social-links.mjs";

const [settings, component, actions, fetchers, publicPage] = await Promise.all([
  readFile("./app/app/(dashboard)/site/[id]/settings/page.tsx", "utf8"),
  readFile("./components/form/social-links.tsx", "utf8"),
  readFile("./lib/actions/actions.ts", "utf8"),
  readFile("./lib/fetchers.ts", "utf8"),
  readFile("./app/[domain]/page.tsx", "utf8"),
]);

describe("social URL contract", () => {
  it("exports the frozen maximum", () => {
    assert.equal(MAX_SOCIAL_LINK_LENGTH, 2048);
  });
  it("canonicalizes valid input exactly with meaningful distinctions", () => {
    assert.equal(
      canonical(" https://example.com/path "),
      "https://example.com/path",
    );
    assert.equal(canonical("https://example.com"), "https://example.com/");
    assert.notEqual(
      canonical("https://example.com/a"),
      canonical("https://example.com/a/"),
    );
    assert.notEqual(
      canonical("https://example.com"),
      canonical("https://www.example.com"),
    );
  });
  it("rejects boundaries, unsafe schemes, credentials, and missing hosts", () => {
    assert.equal(canonical(""), null);
    assert.equal(canonical("x".repeat(2049)), null);
    assert.equal(canonical("javascript:alert(1)"), null);
    assert.equal(canonical("https://user:pass@example.com"), null);
    assert.equal(canonical("/relative"), null);
    assert.ok(
      canonical(`https://example.com/${"a".repeat(2020)}`)?.length <= 2048,
    );
  });
});

describe("social link ownership and UI linkage", () => {
  it("queries ordered links and filters blank dashboard rows", () => {
    assert.match(
      settings,
      /socialMediaLinks: \{[\s\S]*?select: \{ id: true, link: true \}[\s\S]*?orderBy: \{ id: "asc" \}/,
    );
    assert.match(settings, /\.flatMap\(\(item\) => \{/);
    assert.match(settings, /canonicalSocialUrl\(item\.link\)/);
    assert.doesNotMatch(settings, /item\.link!?\.trim\(\)/);
    assert.match(settings, /<SocialLinks/);
  });
  it("supports pending add, edit, confirmed remove, and success-only state", () => {
    assert.match(component, /createSocialLink/);
    assert.match(component, /updateSocialLink/);
    assert.match(component, /deleteSocialLink/);
    assert.match(component, /confirm\("Remove this social link\?"\)/);
    assert.match(component, /pendingId/);
    assert.match(component, /localeCompare\(b\.id\)/);
    assert.match(component, /catch \{/);
  });
  it("uses fixed authenticated actions with membership and duplicate guards", () => {
    for (const name of [
      "createSocialLink",
      "updateSocialLink",
      "deleteSocialLink",
    ])
      assert.match(actions, new RegExp(`export const ${name} = withSiteAuth`));
    assert.match(
      actions,
      /findFirst\(\{[\s\S]*?where: \{ id, siteId: site\.id \}/,
    );
    assert.match(actions, /id: \{ not: id \}/);
    assert.match(actions, /!current\.link\?\.trim\(\)/);
    assert.match(actions, /revalidateSiteMetadata\(site\)/);
  });
  it("filters and canonicalizes cached public data before safe anchor rendering", () => {
    assert.match(fetchers, /socialMediaLinks:[\s\S]*?orderBy: \{ id: "asc" \}/);
    assert.match(fetchers, /canonicalSocialUrl\(item\.link\)/);
    assert.match(publicPage, /aria-label="Social links"/);
    assert.match(publicPage, /href=\{link\}/);
    assert.match(
      publicPage,
      /target="_blank"[\s\S]*?rel="noopener noreferrer"/,
    );
    assert.doesNotMatch(publicPage, /dangerouslySetInnerHTML/);
  });

  it("uses the shared production canonicalizer in all three data consumers", () => {
    assert.match(actions, /from "@\/lib\/social-links\.mjs"/);
    assert.match(fetchers, /from "@\/lib\/social-links\.mjs"/);
    assert.match(settings, /from "@\/lib\/social-links\.mjs"/);
    assert.doesNotMatch(actions, /const canonicalSocialUrl/);
    assert.doesNotMatch(fetchers, /const safeSocialUrl/);
  });
});
