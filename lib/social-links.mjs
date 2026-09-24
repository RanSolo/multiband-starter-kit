export const MAX_SOCIAL_LINK_LENGTH = 2048;

/**
 * Canonicalize a public social link.
 * @param {unknown} value
 * @returns {string | null}
 */
export function canonicalSocialUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_SOCIAL_LINK_LENGTH)
    return null;
  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.href.length > MAX_SOCIAL_LINK_LENGTH
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
