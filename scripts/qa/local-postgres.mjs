import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const root = resolve(import.meta.dirname, "../..");
const composeFile = resolve(root, "compose.qa.yml");
const envFile = resolve(root, ".env.qa.local");
const project = "mbsk-nx-qa";
const service = "postgres";
const container = "mbsk-nx-qa-postgres";
const volume = "mbsk-nx-qa-postgres-data";
const database = "multiband_nx_qa";
const port = "55432";
const image =
  "postgres@sha256:e62fbf9d3e2b49816a32c400ed2dba83e3b361e6833e624024309c35d334b412";

function loadLocalEnv() {
  if (!existsSync(envFile)) {
    throw new Error(
      "Missing .env.qa.local. Copy .env.qa.example to that ignored path and set a local-only password.",
    );
  }

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
}

function check(command, args) {
  try {
    return run(command, args, { quiet: true }).trim();
  } catch (error) {
    if (command === "lsof" && error.status === 1) return "";
    const detail = error?.stderr?.toString().trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`,
    );
  }
}

function assertExpectedUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== port ||
    url.pathname !== `/${database}`
  ) {
    throw new Error(
      `${name} must target postgresql://127.0.0.1:${port}/${database}`,
    );
  }
}

function assertSafeTarget() {
  loadLocalEnv();
  assertExpectedUrl("POSTGRES_PRISMA_URL");
  assertExpectedUrl("POSTGRES_URL_NON_POOLING");
  if (!process.env.MBSK_QA_POSTGRES_PASSWORD) {
    throw new Error("MBSK_QA_POSTGRES_PASSWORD is required");
  }

  const listener = check("lsof", ["-nP", "-iTCP:55432", "-sTCP:LISTEN"]);
  if (listener)
    throw new Error("Port 55432 is already in use; refusing to proceed");

  const containers = check("docker", [
    "ps",
    "-a",
    "--filter",
    `name=^${container}$`,
    "--format",
    "{{.Names}}",
  ]);
  if (containers.split("\n").filter(Boolean).length > 0) {
    throw new Error(
      `Container ${container} already exists; refusing to reuse it`,
    );
  }
  const volumes = check("docker", [
    "volume",
    "ls",
    "--filter",
    `name=^${volume}$`,
    "--format",
    "{{.Name}}",
  ]);
  if (volumes.split("\n").filter(Boolean).length > 0) {
    throw new Error(`Volume ${volume} already exists; refusing to reuse it`);
  }
}

function assertExistingQaTarget() {
  const names = check("docker", [
    "ps",
    "-a",
    "--filter",
    `name=^${container}$`,
    "--format",
    "{{.Names}}",
  ])
    .split("\n")
    .filter(Boolean);
  if (names.length !== 1 || names[0] !== container) {
    throw new Error(
      `Expected exactly the existing QA container ${container}; refusing fixture writes`,
    );
  }

  const volumeNames = check("docker", [
    "volume",
    "ls",
    "--filter",
    `name=^${volume}$`,
    "--format",
    "{{.Name}}",
  ])
    .split("\n")
    .filter(Boolean);
  if (volumeNames.length !== 1 || volumeNames[0] !== volume) {
    throw new Error(
      `Expected exactly the existing QA volume ${volume}; refusing fixture writes`,
    );
  }

  let inspected;
  try {
    inspected = JSON.parse(
      run("docker", ["inspect", container], { quiet: true }),
    )[0];
  } catch (error) {
    throw new Error(`Unable to inspect ${container}; refusing fixture writes`);
  }

  const labels = inspected?.Config?.Labels ?? {};
  const binding = inspected?.HostConfig?.PortBindings?.["5432/tcp"] ?? [];
  const hasExactPort =
    binding.length === 1 &&
    binding[0]?.HostIp === "127.0.0.1" &&
    binding[0]?.HostPort === port;
  const hasExactVolume = (inspected?.Mounts ?? []).some(
    (mount) =>
      mount.Type === "volume" &&
      mount.Name === volume &&
      mount.Destination === "/var/lib/postgresql/data",
  );
  const failures = [];
  if (inspected?.Name !== `/${container}`) failures.push("container name");
  if (labels["com.docker.compose.project"] !== project)
    failures.push("Compose project label");
  if (labels["com.docker.compose.service"] !== service)
    failures.push("Compose service label");
  if (inspected?.Config?.Image !== image) failures.push("pinned image digest");
  if (inspected?.State?.Status !== "running" || !inspected?.State?.Running)
    failures.push("running state");
  if (inspected?.State?.Health?.Status !== "healthy")
    failures.push("healthy state");
  if (!hasExactPort) failures.push("loopback port binding");
  if (!hasExactVolume) failures.push("named volume mount");
  if (failures.length > 0) {
    throw new Error(
      `QA identity guard failed (${failures.join(", ")}); refusing fixture writes`,
    );
  }
}

function compose(args) {
  loadLocalEnv();
  run("docker", ["compose", "-p", project, "-f", composeFile, ...args]);
}

async function seed() {
  loadLocalEnv();
  assertExpectedUrl("POSTGRES_PRISMA_URL");
  assertExpectedUrl("POSTGRES_URL_NON_POOLING");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { id: "qa-user-mbsk-nx" },
      update: { name: "MBSK QA User", email: "mbsk-nx-qa@example.invalid" },
      create: {
        id: "qa-user-mbsk-nx",
        name: "MBSK QA User",
        email: "mbsk-nx-qa@example.invalid",
      },
    });
    const site = await prisma.site.upsert({
      where: { id: "qa-site-mbsk-nx" },
      update: {
        name: "MBSK QA Band",
        bandName: "MBSK QA Band",
        subdomain: "demo",
        userId: user.id,
      },
      create: {
        id: "qa-site-mbsk-nx",
        name: "MBSK QA Band",
        bandName: "MBSK QA Band",
        description: "Synthetic local QA band site.",
        bio: "Synthetic local QA data.",
        subdomain: "demo",
        userId: user.id,
      },
    });
    await prisma.post.upsert({
      where: { slug_siteId: { slug: "qa-post", siteId: site.id } },
      update: {
        title: "MBSK QA Post",
        description: "Synthetic local QA post.",
        content: "# MBSK QA Post\n\nSynthetic local QA content.",
        published: true,
        userId: user.id,
      },
      create: {
        id: "qa-post-mbsk-nx",
        slug: "qa-post",
        title: "MBSK QA Post",
        description: "Synthetic local QA post.",
        content: "# MBSK QA Post\n\nSynthetic local QA content.",
        published: true,
        siteId: site.id,
        userId: user.id,
      },
    });
    await prisma.post.upsert({
      where: { slug_siteId: { slug: "qa-draft", siteId: site.id } },
      update: {
        title: "MBSK QA Draft",
        description: "Synthetic local QA draft.",
        content: "# MBSK QA Draft\n\nThis draft must not be public.",
        published: false,
        userId: user.id,
      },
      create: {
        id: "qa-draft-mbsk-nx",
        slug: "qa-draft",
        title: "MBSK QA Draft",
        description: "Synthetic local QA draft.",
        content: "# MBSK QA Draft\n\nThis draft must not be public.",
        published: false,
        siteId: site.id,
        userId: user.id,
      },
    });

    const alternateSite = await prisma.site.upsert({
      where: { id: "qa-site-mbsk-nx-alt" },
      update: {
        name: "MBSK QA Alternate Band",
        bandName: "MBSK QA Alternate Band",
        subdomain: "qa-alt",
        userId: user.id,
      },
      create: {
        id: "qa-site-mbsk-nx-alt",
        name: "MBSK QA Alternate Band",
        bandName: "MBSK QA Alternate Band",
        description: "Synthetic local QA alternate tenant.",
        bio: "Synthetic local QA alternate data.",
        subdomain: "qa-alt",
        userId: user.id,
      },
    });
    await prisma.post.upsert({
      where: {
        slug_siteId: { slug: "qa-other-post", siteId: alternateSite.id },
      },
      update: {
        title: "MBSK QA Other Post",
        description: "Synthetic local QA alternate post.",
        content: "# MBSK QA Other Post\n\nThis belongs to another tenant.",
        published: true,
        userId: user.id,
      },
      create: {
        id: "qa-other-post-mbsk-nx",
        slug: "qa-other-post",
        title: "MBSK QA Other Post",
        description: "Synthetic local QA alternate post.",
        content: "# MBSK QA Other Post\n\nThis belongs to another tenant.",
        published: true,
        siteId: alternateSite.id,
        userId: user.id,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const command = process.argv[2] ?? "status";
  if (command === "status") {
    run("docker", [
      "ps",
      "-a",
      "--filter",
      `name=^${container}$`,
      "--format",
      "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
    ]);
    return;
  }
  if (command === "up") {
    assertSafeTarget();
    compose(["up", "-d", "--wait", service]);
    return;
  }
  if (command === "setup") {
    assertSafeTarget();
    compose(["up", "-d", "--wait", service]);
    loadLocalEnv();
    assertExpectedUrl("POSTGRES_PRISMA_URL");
    assertExpectedUrl("POSTGRES_URL_NON_POOLING");
    run("npx", ["prisma", "migrate", "deploy"]);
    assertExistingQaTarget();
    await seed();
    return;
  }
  if (command === "fixture") {
    loadLocalEnv();
    assertExpectedUrl("POSTGRES_PRISMA_URL");
    assertExpectedUrl("POSTGRES_URL_NON_POOLING");
    assertExistingQaTarget();
    await seed();
    return;
  }
  throw new Error(
    `Unknown command ${command}; use status, up, setup, or fixture`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
