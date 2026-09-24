import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const [appearance, uploader, actions] = await Promise.all([
  readFile(
    "./app/app/(dashboard)/site/[id]/settings/appearance/page.tsx",
    "utf8",
  ),
  readFile("./components/form/uploader.tsx", "utf8"),
  readFile("./lib/actions/actions.ts", "utf8"),
]);

const maxBytes = 50 * 1024 * 1024;
const validate = ({ type, size }) => {
  if (size === 0) return "empty";
  if (type !== "image/png" && type !== "image/jpeg") return "type";
  if (size > maxBytes) return "size";
  return "allowed";
};

describe("branding upload boundaries", () => {
  it("allows exact PNG/JPEG MIME types and the exact size limit", () => {
    assert.equal(validate({ type: "image/png", size: 1 }), "allowed");
    assert.equal(validate({ type: "image/jpeg", size: maxBytes }), "allowed");
  });

  it("rejects empty, unsupported, deceptive, and oversized files", () => {
    assert.equal(validate({ type: "image/png", size: 0 }), "empty");
    assert.equal(validate({ type: "image/gif", size: 1 }), "type");
    assert.equal(validate({ type: "image/jpg", size: 1 }), "type");
    assert.equal(validate({ type: "image/png; charset=x", size: 1 }), "type");
    assert.equal(validate({ type: "image/jpeg", size: maxBytes + 1 }), "size");
  });
});

describe("branding upload source contract", () => {
  it("shows exact cover/logo format, size, and dimension guidance", () => {
    assert.match(appearance, /title="Cover image"/);
    assert.match(appearance, /PNG, JPG, or JPEG cover image/);
    assert.match(appearance, /50 MiB\. Recommended dimensions: 1200x630/);
    assert.match(appearance, /PNG, JPG, or JPEG logo/);
    assert.match(appearance, /50 MiB\. Recommended dimensions: 400x400/);
  });

  it("uses exact client MIME and byte checks and clears only invalid input", () => {
    assert.match(uploader, /accept="image\/png,image\/jpeg"/);
    assert.match(uploader, /accept="image\/png,image\/jpeg"[\s\S]*?required/);
    assert.match(
      uploader,
      /file\.type !== "image\/png" && file\.type !== "image\/jpeg"/,
    );
    assert.match(uploader, /file\.size > 50 \* 1024 \* 1024/);
    assert.match(uploader, /inputRef\.current\.value = ""/);
    const invalidSection = uploader.slice(
      uploader.indexOf("const handleUpload"),
      uploader.indexOf("const reader"),
    );
    assert.doesNotMatch(invalidSection, /setData/);
  });

  it("uses field-specific accessible labels and exact size copy", () => {
    assert.match(
      uploader,
      /const label = name === "image" \? "Cover image" : "Logo"/,
    );
    assert.match(
      uploader,
      /<span className="sr-only">\{label\} upload<\/span>/,
    );
    assert.match(uploader, /alt=\{`\$\{label\} preview`\}/);
    assert.match(uploader, /Max file size: 50 MiB/);
    assert.doesNotMatch(uploader, /50MB/);
    assert.doesNotMatch(uploader, /Photo upload/);
    assert.doesNotMatch(uploader, /alt="Preview"/);
  });

  it("validates server input before credentials and upload", () => {
    const start = actions.indexOf('key === "image" || key === "logo"');
    const branch = actions.slice(
      start,
      actions.indexOf("} else {", start + 100),
    );
    const fileCheck = branch.indexOf("entry instanceof File");
    const mimeCheck = branch.indexOf('entry.type !== "image/png"');
    const sizeCheck = branch.indexOf("entry.size > 50 * 1024 * 1024");
    const tokenCheck = branch.indexOf("BLOB_READ_WRITE_TOKEN");
    const upload = branch.indexOf("await put");
    assert.ok(fileCheck >= 0 && fileCheck < mimeCheck);
    assert.ok(mimeCheck < sizeCheck && sizeCheck < tokenCheck);
    assert.ok(tokenCheck < upload);
    assert.match(branch, /file\.type === "image\/png" \? "png" : "jpg"/);
    assert.match(branch, /const blurhash = key === "image"/);
    assert.match(branch, /data: \{[\s\S]*?\[key\]: url/);
  });
});
