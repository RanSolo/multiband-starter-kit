import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createSocialLink,
  updateSocialLink,
} from "../lib/social-link-store.mjs";

const connection = process.env.POSTGRES_PRISMA_URL;
if (!connection) throw new Error("POSTGRES_PRISMA_URL is required");
const target = new URL(connection);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "55432" ||
  target.pathname !== "/multiband_nx_qa"
)
  throw new Error("Refusing non-isolated PostgreSQL target");

const prisma = new PrismaClient();
const siteId = "qa-site-mbsk-nx";
const original = await prisma.socialMediaLink.findMany({
  where: { siteId },
  orderBy: { id: "asc" },
});

const restore = async () => {
  await prisma.socialMediaLink.deleteMany({ where: { siteId } });
  if (original.length)
    await prisma.socialMediaLink.createMany({ data: original });
};

const barrier = async () => {
  let release;
  let acquired;
  const acquiredPromise = new Promise((resolve) => {
    acquired = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  const holding = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${siteId}::text, 0::bigint))::text AS lock`;
    acquired();
    await releasePromise;
  });
  await acquiredPromise;
  return { release, holding };
};

try {
  const [identity] =
    await prisma.$queryRaw`SELECT current_database() AS database, inet_server_port() AS port`;
  assert.equal(identity.database, "multiband_nx_qa");
  assert.equal(identity.port, 5432);

  for (let iteration = 0; iteration < 20; iteration++) {
    await prisma.socialMediaLink.deleteMany({ where: { siteId } });
    const gate = await barrier();
    const url = `https://example.invalid/create-${iteration}`;
    const first = createSocialLink(prisma, siteId, ` ${url} `);
    const second = createSocialLink(
      prisma,
      siteId,
      `${url}/../create-${iteration}`,
    );
    gate.release();
    const results = await Promise.all([first, second, gate.holding]);
    const mutations = results.slice(0, 2);
    assert.equal(mutations.filter((result) => "link" in result).length, 1);
    assert.equal(
      mutations.filter(
        (result) => result.error === "This social link already exists.",
      ).length,
      1,
    );
    assert.equal(
      await prisma.socialMediaLink.count({ where: { siteId, link: `${url}` } }),
      1,
    );
  }

  for (let iteration = 0; iteration < 20; iteration++) {
    await prisma.socialMediaLink.deleteMany({ where: { siteId } });
    const existing = await prisma.socialMediaLink.create({
      data: { siteId, link: `https://example.invalid/source-${iteration}` },
    });
    const gate = await barrier();
    const targetUrl = `https://example.invalid/target-${iteration}`;
    const create = createSocialLink(prisma, siteId, targetUrl);
    const update = updateSocialLink(prisma, siteId, existing.id, targetUrl);
    gate.release();
    const results = await Promise.all([create, update, gate.holding]);
    const mutations = results.slice(0, 2);
    assert.equal(mutations.filter((result) => "link" in result).length, 1);
    assert.equal(
      mutations.filter(
        (result) => result.error === "This social link already exists.",
      ).length,
      1,
    );
    assert.equal(
      await prisma.socialMediaLink.count({
        where: { siteId, link: targetUrl },
      }),
      1,
    );
  }

  console.log(
    "social-links concurrency QA passed: 20 create/create + 20 create/update",
  );
} finally {
  await restore();
  const restored = await prisma.socialMediaLink.findMany({
    where: { siteId },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(restored, original);
  await prisma.$disconnect();
}
