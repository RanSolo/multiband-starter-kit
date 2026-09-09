import http from "node:http";

const originValue =
  process.env.MBSK_QA_ORIGIN ?? process.argv[2] ?? "http://127.0.0.1:3000";
const origin = new URL(originValue);
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

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
}

async function request(name, path, host, redirects = 0) {
  const requestPath = new URL(path, origin);
  return await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: origin.port || 80,
        path: `${requestPath.pathname}${requestPath.search}`,
        headers: {
          "cache-control": "no-cache",
          host,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", async () => {
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location &&
            redirects < 3
          ) {
            const next = new URL(response.headers.location, origin);
            resolve(
              await request(
                name,
                next.pathname + next.search,
                host,
                redirects + 1,
              ),
            );
            return;
          }
          resolve({
            name,
            status: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
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

async function main() {
  assertLoopbackOrigin();
  assertRootDomain();

  const root = await request("root", "/", rootDomain);
  expectStatus(root, 200);
  expectBody(root, "Multi-Band");

  const tenant = await request("tenant home", "/", "demo.localhost:3000");
  expectStatus(tenant, 200);
  expectBody(tenant, "MBSK QA Band");
  expectBody(tenant, "MBSK QA Post");
  if (tenant.body.includes("MBSK QA Draft")) {
    throw new Error("tenant home exposed the synthetic draft");
  }

  const login = await request("login", "/login", "app.localhost:3000");
  expectStatus(login, 200);

  const published = await request(
    "published post",
    "/qa-post",
    "demo.localhost:3000",
  );
  expectStatus(published, 200);
  expectBody(published, "MBSK QA Post");
  expectBody(published, "Synthetic local QA content.");

  const draft = await request("draft post", "/qa-draft", "demo.localhost:3000");
  expectStatus(draft, 404);

  const crossTenant = await request(
    "cross-tenant post",
    "/qa-other-post",
    "demo.localhost:3000",
  );
  expectStatus(crossTenant, 404);
  if (crossTenant.body.includes("MBSK QA Other Post")) {
    throw new Error("cross-tenant post content leaked into demo");
  }

  for (const result of [root, tenant, login, published, draft, crossTenant]) {
    console.log(`${result.name}: HTTP ${result.status}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
