import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteSettingsSource = await readFile(
  "app/app/(dashboard)/site/[id]/settings/page.tsx",
  "utf8",
);
const sharedFormSource = await readFile("components/form/index.tsx", "utf8");

test("site settings Bio form writes to Site.bio", () => {
  const bioFormStart = siteSettingsSource.indexOf('title="Bio"');
  assert.notEqual(bioFormStart, -1, "Bio form should exist");

  const deleteFormStart = siteSettingsSource.indexOf("<DeleteSiteForm", bioFormStart);
  assert.notEqual(deleteFormStart, -1, "Bio form should appear before delete form");

  const bioFormSource = siteSettingsSource.slice(bioFormStart, deleteFormStart);

  assert.match(
    bioFormSource,
    /name:\s*"bio"/,
    "Bio form should submit the bio field",
  );
  assert.match(
    bioFormSource,
    /defaultValue:\s*data\?\.bio!?/,
    "Bio form should load Site.bio as its default value",
  );
  assert.doesNotMatch(
    bioFormSource,
    /name:\s*"description"/,
    "Bio form should not submit the description field",
  );
});

test("shared form renders Bio as a textarea", () => {
  assert.match(
    sharedFormSource,
    /inputAttrs\.name === "description" \|\| inputAttrs\.name === "bio"/,
    "Bio should use the same textarea path as Description",
  );
});
