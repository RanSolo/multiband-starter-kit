import { canonicalSocialUrl } from "./social-links.mjs";

const withSiteLock = (prisma, siteId, operation) =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${siteId}::text, 0::bigint))::text AS lock`;
    return operation(tx);
  });

const duplicateExists = async (tx, siteId, link, excludedId) => {
  const rows = await tx.socialMediaLink.findMany({
    where: { siteId, ...(excludedId ? { id: { not: excludedId } } : {}) },
    select: { link: true },
  });
  return rows.some((row) => canonicalSocialUrl(row.link) === link);
};

export const createSocialLink = (prisma, siteId, value) =>
  withSiteLock(prisma, siteId, async (tx) => {
    const link = canonicalSocialUrl(value);
    if (!link) return { error: "Enter a valid HTTP or HTTPS URL." };
    if (await duplicateExists(tx, siteId, link))
      return { error: "This social link already exists." };
    const created = await tx.socialMediaLink.create({
      data: { siteId, link },
      select: { id: true },
    });
    return { link: { id: created.id, link } };
  });

export const updateSocialLink = (prisma, siteId, id, value) =>
  withSiteLock(prisma, siteId, async (tx) => {
    const link = canonicalSocialUrl(value);
    if (typeof id !== "string" || !id || !link)
      return { error: "Enter a valid social link." };
    const current = await tx.socialMediaLink.findFirst({
      where: { id, siteId },
      select: { id: true, link: true },
    });
    if (!current || !current.link?.trim())
      return { error: "Social link not found." };
    if (await duplicateExists(tx, siteId, link, id))
      return { error: "This social link already exists." };
    const updated = await tx.socialMediaLink.update({
      where: { id },
      data: { link },
      select: { id: true },
    });
    return { link: { id: updated.id, link } };
  });

export const deleteSocialLink = (prisma, siteId, id) =>
  withSiteLock(prisma, siteId, async (tx) => {
    if (typeof id !== "string" || !id)
      return { error: "Social link not found." };
    const current = await tx.socialMediaLink.findFirst({
      where: { id, siteId },
      select: { id: true, link: true },
    });
    if (!current || !current.link?.trim())
      return { error: "Social link not found." };
    await tx.socialMediaLink.deleteMany({ where: { id, siteId } });
    return { id };
  });
