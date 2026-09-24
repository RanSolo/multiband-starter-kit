import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  decodeImageTitle,
  encodeImageTitle,
  imageWidth,
} from "../lib/editor-image-size.mjs";

const require = createRequire(import.meta.url);

function loadImageExtension() {
  const source = readFileSync(
    new URL("../components/editor-image-extension.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) =>
    id === "@/lib/editor-image-size.mjs"
      ? { decodeImageTitle, encodeImageTitle, imageWidth }
      : require(id);
  new Function("require", "module", "exports", code)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

function loadPostImage() {
  const source = readFileSync(
    new URL("../components/mdx.tsx", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/editor-image-size.mjs") return { decodeImageTitle };
    if (
      [
        "next-mdx-remote/rsc",
        "@/lib/prisma",
        "@/lib/remark-plugins",
        "react-tweet",
        "@/components/blur-image",
        "./mdx.module.css",
      ].includes(id)
    )
      return {};
    return require(id);
  };
  new Function("require", "module", "exports", code)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports.PostImage;
}

async function makeEditor(content) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3100/",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.innerHeight = dom.window.innerHeight;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.getSelection = dom.window.getSelection.bind(dom.window);
  const { Editor } = require("@tiptap/core");
  const StarterKit = require("@tiptap/starter-kit").default;
  const Image = require("@tiptap/extension-image").default;
  const { Markdown } = await import("tiptap-markdown");
  const extension = loadImageExtension();
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      StarterKit,
      Image,
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
          };
        },
      }),
      extension.createEditorImageExtension(() => {}),
      Markdown,
    ],
  });
  return { editor, extension, dom };
}

test("image width metadata preserves titles and canonical bounds", () => {
  for (const title of [
    "",
    'a "quoted" (title)',
    "雪と🌙",
    "MBSK_IMAGE_V1:literal:WA",
  ]) {
    for (const width of [96, 690, 1200]) {
      assert.deepEqual(decodeImageTitle(encodeImageTitle(title, width)), {
        title,
        width,
        encoded: true,
      });
    }
  }
  assert.equal(imageWidth(10), 96);
  assert.equal(imageWidth(1201), 1200);
  assert.equal(imageWidth(690.6), 691);
  assert.equal(imageWidth(Infinity), null);
  assert.equal(imageWidth(null), null);
});

test("legacy titles, literal collisions and malformed markers", () => {
  for (const title of [
    "plain",
    "a (title)",
    "MBSK_IMAGE_V2:690:WA",
    "MBSK_IMAGE_V1:0690:WA",
    "MBSK_IMAGE_V1:690:////",
    "MBSK_IMAGE_V1:literal:_w",
    "MBSK_IMAGE_V1:690:8J-YgB",
  ]) {
    assert.deepEqual(decodeImageTitle(title), {
      title,
      width: null,
      encoded: false,
    });
    assert.equal(encodeImageTitle(title, null), title);
  }
  for (const title of ["MBSK_IMAGE_V1:690:WA", "MBSK_IMAGE_V1:literal:WA"]) {
    assert.deepEqual(decodeImageTitle(encodeImageTitle(title, null)), {
      title,
      width: null,
      encoded: true,
    });
  }
  const longTitle = "🌱".repeat(10000);
  assert.equal(
    decodeImageTitle(encodeImageTitle(longTitle, 500)).title,
    longTitle,
  );
});

test("Markdown image roundtrip, resize replacement, sibling moves and reset", async () => {
  const title = '雪 "quoted" (parenthesized)';
  const content = `Above\n\n![QA44 alt](/placeholder.png "${encodeImageTitle(title, 690)}")\n\nBelow`;
  const { editor, extension, dom } = await makeEditor(content);
  try {
    const imagePosition = editor.state.doc.child(0).nodeSize;
    const image = editor.state.doc.nodeAt(imagePosition);
    assert.equal(image.attrs.title, title);
    assert.equal(image.attrs.alt, "QA44 alt");
    assert.equal(image.attrs.width, 690);
    assert.equal(editor.storage.markdown.getMarkdown(), content);
    editor.commands.setNodeSelection(imagePosition);
    assert.equal(
      editor.commands.setImage({
        src: new URL("/placeholder.png", document.baseURI).href,
        width: 700,
        height: 500,
      }),
      true,
    );
    let selected = extension.selectedImage(editor);
    assert.equal(selected.node.attrs.alt, "QA44 alt");
    assert.equal(selected.node.attrs.src, "/placeholder.png");
    assert.equal(selected.node.attrs.title, title);
    assert.equal(selected.node.attrs.width, 700);
    assert.equal(selected.node.attrs.height, null);
    assert.equal(extension.moveImage(editor, selected.position, -1), true);
    selected = extension.selectedImage(editor);
    assert.equal(selected.position, 0);
    assert.equal(editor.state.doc.child(1).textContent, "Above");
    assert.equal(extension.moveImage(editor, selected.position, 1), true);
    selected = extension.selectedImage(editor);
    assert.equal(extension.resetImageSize(editor, selected.position), true);
    assert.equal(editor.state.doc.nodeAt(selected.position).attrs.width, null);
    assert.equal(
      editor.storage.markdown.getMarkdown(),
      `Above\n\n![QA44 alt](/placeholder.png "${title.replace(/"/g, '\\"')}")\n\nBelow`,
    );
  } finally {
    editor.destroy();
    dom.window.close();
  }
});

test("public image removes valid metadata and remains responsive", () => {
  const PostImage = loadPostImage();
  const title = '雪 "quoted" (parenthesized)';
  const sized = renderToStaticMarkup(
    createElement(PostImage, {
      src: "/placeholder.png",
      alt: "QA44 alt",
      title: encodeImageTitle(title, 690),
    }),
  );
  assert.match(sized, /alt="QA44 alt"/);
  assert.match(sized, /title="雪 &quot;quoted&quot; \(parenthesized\)"/);
  assert.match(sized, /width="690"/);
  assert.match(sized, /max-width:100%/);
  assert.match(sized, /height:auto/);
  assert.doesNotMatch(sized, /MBSK_IMAGE_V1/);
  const legacy = renderToStaticMarkup(
    createElement(PostImage, {
      src: "/placeholder.png",
      alt: "",
      title: "ordinary title",
    }),
  );
  assert.match(legacy, /title="ordinary title"/);
  assert.doesNotMatch(legacy, /width=|max-width/);
});
