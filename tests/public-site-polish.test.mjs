import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const [layout, home, post, card, cta, notFound, fetchers] = await Promise.all(
  [
    "app/[domain]/layout.tsx",
    "app/[domain]/page.tsx",
    "app/[domain]/[slug]/page.tsx",
    "components/blog-card.tsx",
    "components/cta.tsx",
    "app/[domain]/[slug]/not-found.tsx",
    "lib/fetchers.ts",
  ].map((path) => readFile(path, "utf8")),
);

describe("public band site rendering contracts", () => {
  it("renders optional branding and article media only when present", () => {
    assert.match(layout, /\{logo && \(/);
    assert.match(home, /\{coverImage && \(/);
    assert.match(post, /\{coverImage && \(/);
    assert.match(card, /\{coverImage && \(/);
    for (const source of [layout, home, post, card]) {
      assert.match(source, /!== "\/placeholder\.png"/);
    }
    for (const source of [layout, home, post, card]) {
      assert.doesNotMatch(source, /src=\{[^}]+\|\| ""\}|src=\{data\.image\}/);
    }
  });

  it("keeps public post links data driven and has a real empty state", () => {
    assert.match(home, /getPostsForSite\(domain\)/);
    assert.match(home, /posts\.length > 0 \? \(/);
    assert.match(
      home,
      /posts\.map\(\(post\) => \(\s*<BlogCard key=\{post\.slug\} data=\{post\} \/>\s*\)\)/,
    );
    assert.match(card, /href=\{`\/\$\{data\.slug\}`\}/);
    assert.match(
      post,
      /data\.adjacentPosts\.map\(\(post\) => \(\s*<BlogCard key=\{post\.slug\} data=\{post\} \/>\s*\)\)/,
    );
    assert.match(fetchers, /published: true/);
  });

  it("retains tenant routing, safe embeds, reporting, and demo attribution", () => {
    assert.match(layout, /getSiteData\(domain\)/);
    assert.match(layout, /REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS/);
    assert.match(layout, /<CTA \/>/);
    assert.match(layout, /<ReportAbuse \/>/);
    assert.match(home, /safeYouTubeFeaturedEmbed\(data\.featuredEmbed\)/);
    assert.match(home, /\{featuredEmbedSrc && \(/);
    assert.match(notFound, /getSiteData\(domain as string\)/);
    assert.match(notFound, /headersList\.get\("x-forwarded-host"\)\s*\|\|\s*headersList\.get\("host"\)/);
    assert.match(notFound, /const message = data\?\.message404/);
    assert.match(notFound, /message\?\.trim\(\)/);
    assert.match(notFound, /message !== "Blimey! You've found a page that doesn't exist\."/);
    assert.match(notFound, /\? message\s*: "This page isn't here/);
    assert.match(cta, /Multi Band Platform/);
    assert.doesNotMatch(cta, /\bfixed\b|\bsticky\b/);
  });
});
