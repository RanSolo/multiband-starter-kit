import http from "node:http";
import { encode } from "next-auth/jwt";

const originValue =
  process.env.MBSK_QA_ORIGIN ?? process.argv[2] ?? "http://127.0.0.1:3000";
const origin = new URL(originValue);
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
const maxHops = 5;

function assertLoopbackOrigin() {
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    origin.protocol !== "http:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !isLoopback
  ) {
    throw new Error(
      "MBSK_QA_ORIGIN must be an http loopback origin such as http://127.0.0.1:3000",
    );
  }
}

function assertRootDomain() {
  if (!rootDomain || rootDomain !== "localhost:3000") {
    throw new Error(
      "NEXT_PUBLIC_ROOT_DOMAIN must be localhost:3000 for the isolated QA host recipe",
    );
  }
  if (!process.env.AUTH_SECRET) {
    throw new Error(
      "AUTH_SECRET is required for isolated authenticated route QA",
    );
  }
}

function sanitizeTarget(value) {
  if (!value) return null;
  const target = new URL(value, origin);
  return `${target.pathname}${target.search}`;
}

async function requestHop(path, host, cookie) {
  const requestUrl = new URL(path, origin);
  return await new Promise((resolve, reject) => {
    const headers = { "cache-control": "no-cache", host };
    if (cookie) headers.cookie = cookie;

    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: origin.port || 80,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            location: sanitizeTarget(response.headers.location),
            rewrite: sanitizeTarget(response.headers["x-middleware-rewrite"]),
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

async function request(name, path, host, cookie) {
  const hops = [];
  let effectivePath = path;

  for (let index = 0; index < maxHops; index += 1) {
    const response = await requestHop(effectivePath, host, cookie);
    hops.push({
      path: effectivePath,
      status: response.status,
      location: response.location,
      rewrite: response.rewrite,
    });
    if (response.status >= 300 && response.status < 400 && response.location) {
      effectivePath = response.location;
      continue;
    }
    return { name, ...response, hops, effectivePath };
  }

  throw new Error(`${name} exceeded the ${maxHops}-hop redirect ceiling`);
}

function expectStatus(result, expected) {
  if (result.status !== expected) {
    throw new Error(
      `${result.name} expected HTTP ${expected}, got ${result.status}`,
    );
  }
}

function expectBody(result, text) {
  if (!result.body.includes(text)) {
    throw new Error(`${result.name} did not contain the expected QA marker`);
  }
}

function expectAuthenticatedSession(result) {
  let session;
  try {
    session = JSON.parse(result.body);
  } catch {
    throw new Error(`${result.name} did not return valid JSON`);
  }
  if (
    session?.user?.id !== "qa-user-mbsk-nx" ||
    session?.user?.email !== "mbsk-nx-qa@example.invalid"
  ) {
    throw new Error(`${result.name} did not return the expected QA session`);
  }
}

function expectInitialRedirect(result, path) {
  if (result.hops[0]?.location !== path) {
    throw new Error(
      `${result.name} expected initial redirect to ${path}, got ${result.hops[0]?.location ?? "none"}`,
    );
  }
}

function expectInitialRewrite(result, path) {
  if (result.hops[0]?.rewrite !== path) {
    throw new Error(
      `${result.name} expected initial rewrite to ${path}, got ${result.hops[0]?.rewrite ?? "none"}`,
    );
  }
}

function expectNoRewriteGrowth(result) {
  for (const hop of result.hops) {
    if (
      hop.rewrite?.includes("/home/home") ||
      hop.rewrite?.includes("/app/app")
    ) {
      throw new Error(`${result.name} exposed recursive rewrite growth`);
    }
  }
}

function logResult(result) {
  const trace = result.hops
    .map(
      (hop, index) =>
        `${index}:${hop.path} HTTP ${hop.status}` +
        `${hop.location ? ` location=${hop.location}` : ""}` +
        `${hop.rewrite ? ` rewrite=${hop.rewrite}` : ""}`,
    )
    .join(" -> ");
  console.log(`${result.name}: ${trace}`);
}

async function createSessionCookie() {
  const token = await encode({
    secret: process.env.AUTH_SECRET,
    maxAge: 5 * 60,
    token: {
      sub: "qa-user-mbsk-nx",
      name: "MBSK QA User",
      email: "mbsk-nx-qa@example.invalid",
      user: {
        id: "qa-user-mbsk-nx",
        name: "MBSK QA User",
        email: "mbsk-nx-qa@example.invalid",
      },
    },
  });
  return `next-auth.session-token=${encodeURIComponent(token)}`;
}

async function main() {
  assertLoopbackOrigin();
  assertRootDomain();

  const sessionCookie = await createSessionCookie();
  const results = [];

  const root = await request("root", "/", rootDomain);
  expectStatus(root, 200);
  expectInitialRewrite(root, "/home");
  expectBody(root, "Multi-Band");
  results.push(root);

  const queryRoot = await request(
    "query-bearing root",
    "/?campaign=phase-b",
    rootDomain,
  );
  expectStatus(queryRoot, 200);
  expectInitialRewrite(queryRoot, "/home?campaign=phase-b");
  expectBody(queryRoot, "Multi-Band");
  results.push(queryRoot);

  const login = await request("login", "/login", "app.localhost:3000");
  expectStatus(login, 200);
  expectInitialRewrite(login, "/app/login");
  expectBody(login, "Multi-band Platform logo");
  results.push(login);

  const queryLogin = await request(
    "query-bearing login",
    "/login?error=OAuthCallback",
    "app.localhost:3000",
  );
  expectStatus(queryLogin, 200);
  expectInitialRewrite(queryLogin, "/app/login?error=OAuthCallback");
  expectBody(queryLogin, "Multi-band Platform logo");
  results.push(queryLogin);

  for (const [name, path, redirect] of [
    ["unauthenticated app root", "/", "/login"],
    ["unauthenticated sites", "/sites", "/login"],
    ["unauthenticated internal sites", "/app/sites", "/login"],
  ]) {
    const result = await request(name, path, "app.localhost:3000");
    expectStatus(result, 200);
    expectInitialRedirect(result, redirect);
    expectBody(result, "Multi-band Platform logo");
    results.push(result);
  }

  const authenticatedLogin = await request(
    "authenticated login",
    "/login?callbackUrl=%2Fsites",
    "app.localhost:3000",
    sessionCookie,
  );
  expectStatus(authenticatedLogin, 200);
  expectInitialRedirect(authenticatedLogin, "/?callbackUrl=%2Fsites");
  expectBody(authenticatedLogin, "Top Sites");
  results.push(authenticatedLogin);

  const authenticatedSession = await request(
    "authenticated session",
    "/api/auth/session",
    "app.localhost:3000",
    sessionCookie,
  );
  expectStatus(authenticatedSession, 200);
  expectAuthenticatedSession(authenticatedSession);
  results.push(authenticatedSession);

  for (const [name, path, marker] of [
    ["authenticated sites", "/sites", "All Band Sites"],
    ["authenticated internal sites", "/app/sites", "All Band Sites"],
  ]) {
    const result = await request(
      name,
      path,
      "app.localhost:3000",
      sessionCookie,
    );
    expectStatus(result, 200);
    expectBody(result, marker);
    expectBody(result, "MBSK QA Band");
    results.push(result);
  }

  const tenant = await request("tenant home", "/", "demo.localhost:3000");
  expectStatus(tenant, 200);
  expectBody(tenant, "MBSK QA Band");
  expectBody(tenant, "MBSK QA Post");
  if (tenant.body.includes("MBSK QA Draft")) {
    throw new Error("tenant home exposed the synthetic draft");
  }
  results.push(tenant);

  const published = await request(
    "published post",
    "/qa-post",
    "demo.localhost:3000",
  );
  expectStatus(published, 200);
  expectBody(published, "MBSK QA Post");
  expectBody(published, "Synthetic local QA content.");
  results.push(published);

  const draft = await request("draft post", "/qa-draft", "demo.localhost:3000");
  expectStatus(draft, 404);
  results.push(draft);

  const crossTenant = await request(
    "cross-tenant post",
    "/qa-other-post",
    "demo.localhost:3000",
  );
  expectStatus(crossTenant, 404);
  if (crossTenant.body.includes("MBSK QA Other Post")) {
    throw new Error("cross-tenant post content leaked into demo");
  }
  results.push(crossTenant);

  for (const result of results) {
    expectNoRewriteGrowth(result);
    logResult(result);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
