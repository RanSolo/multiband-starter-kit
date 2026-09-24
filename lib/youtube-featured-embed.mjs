const allowedHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const allowedAttributes = new Set([
  "src",
  "width",
  "height",
  "title",
  "frameborder",
  "allow",
  "allowfullscreen",
  "referrerpolicy",
  "loading",
]);

const booleanQueryKeys = new Set([
  "autoplay",
  "controls",
  "loop",
  "mute",
  "playsinline",
  "rel",
  "modestbranding",
  "enablejsapi",
]);

function invalid() {
  throw new TypeError("Enter a valid YouTube embed URL or iframe code.");
}

function iframeSource(value) {
  const match =
    /^<iframe\b((?:[^<>"']|"[^"]*"|'[^']*')*)>\s*<\/iframe\s*>$/i.exec(value);
  if (!match) invalid();

  const attributes = match[1];
  const seen = new Set();
  let source;
  let offset = 0;
  const attribute = /\s+([a-z][a-z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/iy;
  while (attributes.slice(offset).trim()) {
    attribute.lastIndex = offset;
    const part = attribute.exec(attributes);
    if (!part) invalid();
    offset = attribute.lastIndex;
    const name = part[1].toLowerCase();
    if (
      seen.has(name) ||
      !allowedAttributes.has(name) ||
      name.startsWith("on") ||
      name === "srcdoc"
    )
      invalid();
    seen.add(name);
    const attributeValue = part[2] ?? part[3];
    if (name !== "allowfullscreen" && attributeValue === undefined) invalid();
    if (name === "src") source = attributeValue?.replace(/&amp;/g, "&");
  }
  if (!source) invalid();
  return source;
}

export function normalizeYouTubeFeaturedEmbed(value) {
  if (typeof value !== "string") invalid();
  const trimmed = value.trim();
  if (!trimmed) return null;

  const source = /^<iframe\b/i.test(trimmed) ? iframeSource(trimmed) : trimmed;
  const rawUrl = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?$/i.exec(source);
  if (
    !rawUrl ||
    /[\s\u0000-\u001f\u007f<>"'\\]/.test(source) ||
    !allowedHosts.has(rawUrl[1].toLowerCase())
  )
    invalid();

  let url;
  try {
    url = new URL(source);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    rawUrl[2] !== url.pathname
  )
    invalid();

  const video = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
  const videoSeries = url.pathname === "/embed/videoseries";
  const playlist = url.pathname === "/embed";
  if (!video && !videoSeries && !playlist) invalid();

  const seenQuery = new Set();
  const query = new URLSearchParams();
  for (const [key, entry] of url.searchParams) {
    if (seenQuery.has(key)) invalid();
    seenQuery.add(key);
    if (booleanQueryKeys.has(key)) {
      if (entry !== "0" && entry !== "1") invalid();
    } else if (key === "start" || key === "end") {
      if (!/^\d{1,8}$/.test(entry)) invalid();
    } else if (key === "list") {
      if (!/^[A-Za-z0-9_-]{2,150}$/.test(entry)) invalid();
    } else if (key === "listType") {
      if (entry !== "playlist") invalid();
    } else if (key === "si") {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(entry)) invalid();
    } else {
      invalid();
    }
    query.append(key, entry);
  }
  if ((videoSeries || playlist) && !seenQuery.has("list")) invalid();
  if (playlist && url.searchParams.get("listType") !== "playlist") invalid();
  if (!playlist && seenQuery.has("listType")) invalid();
  if (videoSeries && seenQuery.has("listType")) invalid();

  const host = url.hostname.toLowerCase();
  return `https://${host}${url.pathname}${query.size ? `?${query}` : ""}`;
}

export function safeYouTubeFeaturedEmbed(value) {
  try {
    return normalizeYouTubeFeaturedEmbed(value);
  } catch {
    return null;
  }
}
