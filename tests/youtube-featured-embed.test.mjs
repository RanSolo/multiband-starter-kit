import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  normalizeYouTubeFeaturedEmbed,
  safeYouTubeFeaturedEmbed,
} from "../lib/youtube-featured-embed.mjs";

const video = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const code = `<iframe width="560" height="315" src="${video}?si=abc_DEF-123" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

describe("YouTube featured embed normalization", () => {
  it("accepts a full YouTube share iframe and a direct embed URL", () => {
    assert.equal(
      normalizeYouTubeFeaturedEmbed(code),
      `${video}?si=abc_DEF-123`,
    );
    assert.equal(
      normalizeYouTubeFeaturedEmbed(
        `<iframe src="${video}" allowfullscreen ></iframe>`,
      ),
      video,
    );
    assert.equal(
      normalizeYouTubeFeaturedEmbed(
        `<iframe src="${video}?autoplay=1&amp;mute=1"></iframe>`,
      ),
      `${video}?autoplay=1&mute=1`,
    );
    assert.equal(normalizeYouTubeFeaturedEmbed(video), video);
    assert.equal(normalizeYouTubeFeaturedEmbed(`  ${video}  `), video);
    assert.equal(normalizeYouTubeFeaturedEmbed(" \n "), null);
  });

  it("accepts supported playlist and privacy enhanced embed URLs", () => {
    assert.equal(
      normalizeYouTubeFeaturedEmbed(
        "https://www.youtube-nocookie.com/embed/videoseries?list=PLabc_123&autoplay=1",
      ),
      "https://www.youtube-nocookie.com/embed/videoseries?list=PLabc_123&autoplay=1",
    );
    assert.equal(
      normalizeYouTubeFeaturedEmbed(
        "https://youtube.com/embed?listType=playlist&list=PLabc_123",
      ),
      "https://youtube.com/embed?listType=playlist&list=PLabc_123",
    );
  });

  it("rejects hostile or malformed iframe markup", () => {
    for (const value of [
      `<iframe src="${video}" onload="alert(1)"></iframe>`,
      `<iframe src="${video}" srcdoc="hello"></iframe>`,
      `<iframe src="${video}" src="${video}"></iframe>`,
      `<iframe src=${video}></iframe>`,
      `<iframe src="${video}"></iframe><script>alert(1)</script>`,
      `<div><iframe src="${video}"></iframe></div>`,
      `<iframe src="${video}" bad="x"></iframe>`,
      `<iframe src="${video}">anything</iframe>`,
    ])
      assert.throws(
        () => normalizeYouTubeFeaturedEmbed(value),
        TypeError,
        value,
      );
  });

  it("rejects unsafe URLs and unsupported paths or query parameters", () => {
    for (const value of [
      "javascript:alert(1)",
      "http://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com.evil.test/embed/dQw4w9WgXcQ",
      "https://user@youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com:443/embed/dQw4w9WgXcQ",
      `${video}#fragment`,
      `${video}?autoplay=1&autoplay=0`,
      `${video}?onload=alert(1)`,
      `${video}?listType=playlist`,
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/embed/videoseries",
      "https://youtube.com/embed?list=PLabc_123",
      "https://youtube.com/embed/dQw4w9WgXcQ/../dQw4w9WgXcQ",
      "https://youtube.com/embed/short",
    ])
      assert.throws(
        () => normalizeYouTubeFeaturedEmbed(value),
        TypeError,
        value,
      );
  });

  it("omits invalid saved legacy data from public rendering", () => {
    assert.equal(safeYouTubeFeaturedEmbed(code), `${video}?si=abc_DEF-123`);
    assert.equal(safeYouTubeFeaturedEmbed("<script>alert(1)</script>"), null);
    assert.equal(safeYouTubeFeaturedEmbed(null), null);
  });
});

describe("public homepage integration", () => {
  it("renders a responsive native iframe only with a safe source", async () => {
    const page = await readFile("./app/[domain]/page.tsx", "utf8");
    assert.match(page, /safeYouTubeFeaturedEmbed\(data\.featuredEmbed\)/);
    assert.match(page, /\{featuredEmbedSrc && \(/);
    assert.match(page, /aspect-video/);
    assert.match(
      page,
      /<iframe[\s\S]*?src=\{featuredEmbedSrc\}[\s\S]*?title="Featured YouTube video"[\s\S]*?allowFullScreen/,
    );
    assert.doesNotMatch(page, /dangerouslySetInnerHTML|react-iframe/);
  });
});
