import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const [nav, settingsNav, appearance, form, actions] = await Promise.all([
  readFile("./components/nav.tsx", "utf8"),
  readFile("./app/app/(dashboard)/site/[id]/settings/nav.tsx", "utf8"),
  readFile(
    "./app/app/(dashboard)/site/[id]/settings/appearance/page.tsx",
    "utf8",
  ),
  readFile("./components/form/index.tsx", "utf8"),
  readFile("./lib/actions/actions.ts", "utf8"),
]);

describe("site settings navigation", () => {
  it("uses the authenticated site namespace in the dashboard nav", () => {
    assert.match(nav, /href: `\/app\/site\/\$\{id\}`/);
    assert.match(nav, /href: `\/app\/site\/\$\{id\}\/analytics`/);
    assert.match(nav, /href: `\/app\/site\/\$\{id\}\/settings`/);
    assert.match(nav, /siteId \? `\/app\/site\/\$\{siteId\}` : "\/sites"/);
    assert.doesNotMatch(nav, /href:\s*`\/site\/\$\{id\}(?:`|\/)/);
    assert.match(nav, /isActive: segments\.length === 2/);
    assert.match(nav, /isActive: segments\.includes\("analytics"\)/);
    assert.match(nav, /isActive: segments\.includes\("settings"\)/);
  });

  it("uses canonical links for every settings tab", () => {
    assert.match(settingsNav, /`\/app\/site\/\$\{id\}\/settings`/);
    assert.match(settingsNav, /`\/app\/site\/\$\{id\}\/settings\/domains`/);
    assert.match(settingsNav, /`\/app\/site\/\$\{id\}\/settings\/appearance`/);
    assert.doesNotMatch(
      settingsNav,
      /href:\s*`\/site\/\$\{id\}\/settings(?:`|\/)/,
    );
    assert.match(settingsNav, /segment === item\.segment/);
  });
});

describe("optional featured embed", () => {
  it("renders an empty optional ordinary input", () => {
    const featured = appearance.match(
      /name: "featuredEmbed"[\s\S]*?handleSubmit/,
    );
    assert.ok(featured);
    assert.match(featured[0], /defaultValue: data\?\.featuredEmbed \?\? ""/);
    assert.match(featured[0], /required: false/);
    assert.match(form, /required\?: boolean/);
    assert.match(form, /required=\{inputAttrs\.required \?\? true\}/);
  });

  it("does not change required textarea, subdomain, domain, or file branches", () => {
    assert.match(
      form,
      /inputAttrs\.name === "subdomain"[\s\S]*?<input[\s\S]*?required/,
    );
    assert.match(
      form,
      /inputAttrs\.name === "description" \|\| inputAttrs\.name === "bio"[\s\S]*?<textarea[\s\S]*?required/,
    );
    assert.match(form, /inputAttrs\.name === "customDomain"/);
    assert.match(
      form,
      /inputAttrs\.name === "image" \|\| inputAttrs\.name === "logo"/,
    );
  });

  it("normalizes only an empty featuredEmbed value to null", () => {
    assert.match(
      actions,
      /\[key\]: key === "featuredEmbed" && value === "" \? null : value/,
    );
    const normalize = (key, value) =>
      key === "featuredEmbed" && value === "" ? null : value;
    assert.equal(normalize("featuredEmbed", ""), null);
    assert.equal(normalize("featuredEmbed", "embed-code"), "embed-code");
    assert.equal(normalize("description", ""), "");
    assert.equal(normalize("bio", ""), "");
  });
});
