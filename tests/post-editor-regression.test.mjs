import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createPostAutosave } from "../lib/post-autosave.mjs";

const [
  createSource,
  cardSource,
  editorSource,
  routeSource,
  actionsSource,
  navSource,
] = await Promise.all([
  readFile("./components/create-post-button.tsx", "utf8"),
  readFile("./components/post-card.tsx", "utf8"),
  readFile("./components/editor.tsx", "utf8"),
  readFile("./app/api/posts/[id]/route.ts", "utf8"),
  readFile("./lib/actions/actions.ts", "utf8"),
  readFile("./components/nav.tsx", "utf8"),
]);
const initial = { title: "Title", description: "Description", content: "Body" };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe("post autosave state", () => {
  it("absorbs canonical initialization and sends zero requests", async () => {
    let requests = 0;
    const autosave = createPostAutosave({
      initial,
      persist: async () => requests++,
      onStatus: () => {},
    });
    assert.equal(autosave.captureContent("Body\n"), false);
    await autosave.requestSave();
    assert.equal(requests, 0);
  });

  it("retains a real first edit instead of absorbing it as hydration", async () => {
    const saved = [];
    const autosave = createPostAutosave({
      initial: { ...initial, content: null },
      persist: async (snapshot) => saved.push(snapshot),
      onStatus: () => {},
    });
    assert.equal(autosave.captureContent("First words"), true);
    await autosave.requestSave();
    assert.deepEqual(
      saved.map(({ content }) => content),
      ["First words"],
    );
  });

  it("coalesces repeated callbacks while one unchanged edit is pending", async () => {
    const pending = deferred();
    let requests = 0;
    const autosave = createPostAutosave({
      initial,
      persist: () => {
        requests++;
        return pending.promise;
      },
      onStatus: () => {},
    });
    autosave.setLatest({ ...initial, title: "Edited" });
    const saving = autosave.requestSave();
    autosave.requestSave();
    autosave.requestSave();
    assert.equal(requests, 1);
    pending.resolve();
    await saving;
    assert.equal(requests, 1);
  });

  it("saves only the newest in-flight edit once, then quiesces", async () => {
    const first = deferred();
    const saved = [];
    const autosave = createPostAutosave({
      initial,
      persist: async (snapshot) => {
        saved.push(snapshot);
        if (saved.length === 1) await first.promise;
      },
      onStatus: () => {},
    });
    autosave.setLatest({ ...initial, title: "First" });
    const saving = autosave.requestSave();
    autosave.setLatest({ ...initial, title: "Second" });
    autosave.requestSave();
    autosave.setLatest({ ...initial, title: "Newest" });
    autosave.requestSave();
    first.resolve();
    await saving;
    await autosave.requestSave();
    assert.deepEqual(
      saved.map(({ title }) => title),
      ["First", "Newest"],
    );
  });

  it("does not retry a failure until an explicit future request", async () => {
    let requests = 0;
    const statuses = [];
    const autosave = createPostAutosave({
      initial,
      persist: async () => {
        requests++;
        if (requests === 1) throw new Error("nope");
      },
      onStatus: (status) => statuses.push(status),
    });
    autosave.setLatest({ ...initial, description: "Edited" });
    await autosave.requestSave();
    assert.equal(requests, 1);
    assert.equal(statuses.at(-1), "error");
    await Promise.resolve();
    assert.equal(requests, 1);
    await autosave.requestSave();
    assert.equal(requests, 2);
    assert.equal(statuses.at(-1), "saved");
  });

  it("saved remount initialization sends no request", async () => {
    let requests = 0;
    const saved = { ...initial, content: "Canonical\n" };
    const autosave = createPostAutosave({
      initial: saved,
      persist: async () => requests++,
      onStatus: () => {},
    });
    autosave.captureContent("Canonical");
    await autosave.requestSave();
    assert.equal(requests, 0);
  });
});

describe("post editor integration", () => {
  it("keeps authenticated routes and guarded creation", () => {
    assert.match(createSource, /router\.push\(`\/app\/post\/\$\{post\.id\}`\)/);
    assert.match(createSource, /if \("error" in post\)/);
    assert.match(cardSource, /href=\{`\/app\/post\/\$\{data\.id\}`\}/);
  });
  it("uses PATCH autosave instead of the removed Server Action", () => {
    assert.match(editorSource, /fetch\(`\/api\/posts\/\$\{post\.id\}`/);
    assert.match(editorSource, /method: "PATCH"/);
    assert.doesNotMatch(editorSource, /\bupdatePost\b/);
    assert.doesNotMatch(actionsSource, /export const updatePost =/);
  });
  it("rejects failed, invalid-JSON, and error-object responses", () => {
    assert.match(editorSource, /result = await response\.json\(\)/);
    assert.match(editorSource, /!response\.ok/);
    assert.match(editorSource, /"error" in result/);
  });
  it("keeps publish errors guarded and displays explicit state", () => {
    assert.match(editorSource, /if \("error" in response\)/);
    assert.match(editorSource, /data\.published \? "Published" : "Draft"/);
    assert.match(editorSource, /data\.published \? "Unpublish" : "Publish"/);
  });
  it("limits PATCH to authenticated owned editable fields", () => {
    assert.match(routeSource, /const session = await getSession\(\)/);
    assert.match(routeSource, /post\.userId !== session\.user\.id/);
    assert.match(routeSource, /data: \{ title, description, content \}/);
    assert.match(routeSource, /NextResponse\.json\(\{ ok: true \}\)/);
  });
});

describe("post navigation lookup", () => {
  it("links editor and settings through the authenticated namespace", () => {
    assert.match(navSource, /href: `\/app\/post\/\$\{id\}`/);
    assert.match(navSource, /href: `\/app\/post\/\$\{id\}\/settings`/);
    assert.match(navSource, /const segment = segments\[0\]/);
    assert.match(navSource, /\}, \[segment, id\]\);/);
    assert.match(navSource, /if \(!cancelled\) setSiteId/);
    assert.match(navSource, /const siteLookupInFlight = new Map/);
    assert.match(navSource, /siteLookupInFlight\.get\(postId\) === request/);
    assert.match(navSource, /siteLookupInFlight\.delete\(postId\)/);
    assert.doesNotMatch(navSource, /sessionStorage|localStorage|setTimeout/);
  });

  it("coalesces replayed instances, evicts settled requests, and ignores stale subscribers", async () => {
    const dom = new JSDOM('<div id="one"></div><div id="two"></div>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    let calls = 0;
    const pending = new Map();
    const lookup = (id) => {
      calls++;
      const result = deferred();
      pending.set(id, result);
      return result.promise;
    };
    const inFlight = new Map();
    const coalescedLookup = (id) => {
      const existing = inFlight.get(id);
      if (existing) return existing;
      const request = lookup(id);
      inFlight.set(id, request);
      request.then(
        () => inFlight.get(id) === request && inFlight.delete(id),
        () => inFlight.get(id) === request && inFlight.delete(id),
      );
      return request;
    };

    function NavLookupProbe({ segments, id }) {
      const segment = segments[0];
      const [siteId, setSiteId] = useState(null);
      useEffect(() => {
        let cancelled = false;
        if (segment === "post" && id) {
          coalescedLookup(id).then(
            (resolvedSiteId) => {
              if (!cancelled) setSiteId(resolvedSiteId ?? null);
            },
            () => {
              if (!cancelled) setSiteId(null);
            },
          );
        } else {
          setSiteId(null);
        }
        return () => {
          cancelled = true;
        };
      }, [segment, id]);
      return React.createElement("output", null, siteId ?? "");
    }

    const firstRoot = createRoot(document.getElementById("one"));
    const activeRoot = createRoot(document.getElementById("two"));
    await act(async () =>
      firstRoot.render(
        React.createElement(NavLookupProbe, { segments: ["post"], id: "A" }),
      ),
    );
    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, { segments: ["post"], id: "A" }),
      ),
    );
    assert.equal(calls, 1);
    await act(async () => firstRoot.unmount());
    await act(async () => pending.get("A").resolve("site-A"));
    assert.equal(document.querySelector("#two output").textContent, "site-A");

    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, { segments: ["post"], id: "A" }),
      ),
    );
    assert.equal(calls, 1, "same mounted scalar dependency must stay stable");
    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, { segments: ["post"], id: "B" }),
      ),
    );
    assert.equal(calls, 2, "separate id gets its own request");
    await act(async () => pending.get("B").resolve("site-B"));

    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, { segments: ["post"], id: "A" }),
      ),
    );
    assert.equal(calls, 3, "settled A is evicted rather than cached");
    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, { segments: ["site"], id: "A" }),
      ),
    );
    await act(async () => pending.get("A").resolve("stale-A"));
    assert.equal(document.querySelector("#two output").textContent, "");

    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, {
          segments: ["post"],
          id: "reject",
        }),
      ),
    );
    assert.equal(calls, 4);
    await act(async () => pending.get("reject").reject(new Error("nope")));
    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, {
          segments: ["site"],
          id: "reject",
        }),
      ),
    );
    await act(async () =>
      activeRoot.render(
        React.createElement(NavLookupProbe, {
          segments: ["post"],
          id: "reject",
        }),
      ),
    );
    assert.equal(calls, 5, "rejected request is evicted and retried once");

    await act(async () => activeRoot.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
});
