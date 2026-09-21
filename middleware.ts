import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /_static (inside /public)
     * 4. all root files inside /public (e.g. /favicon.ico)
     */
    "/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)",
  ],
};

export default async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // Get hostname of request (e.g. demo.vercel.pub, demo.localhost:3000)
  let hostname = req.headers
    .get("host")!
    .replace(".localhost:3000", `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`);

  // special case for Vercel preview deployment URLs
  if (
    hostname.includes("---") &&
    hostname.endsWith(`.${process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_SUFFIX}`)
  ) {
    hostname = `${hostname.split("---")[0]}.${
      process.env.NEXT_PUBLIC_ROOT_DOMAIN
    }`;
  }

  // rewrites for app pages
  if (hostname == `app.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) {
    const isInternalAppPath =
      pathname === "/app" || pathname.startsWith("/app/");
    const isLoginPath = pathname === "/login" || pathname === "/app/login";
    const session = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
    });

    if (!session && !isLoginPath) {
      const loginUrl = url.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    } else if (session && isLoginPath) {
      const appUrl = url.clone();
      appUrl.pathname = "/";
      return NextResponse.redirect(appUrl);
    }

    if (isInternalAppPath) {
      return NextResponse.next();
    }

    const appUrl = url.clone();
    appUrl.pathname = `/app${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(appUrl);
  }

  // special case for `vercel.pub` domain
  if (hostname === "vercel.pub") {
    return NextResponse.redirect(
      "https://vercel.com/blog/platforms-starter-kit",
    );
  }

  // rewrite root application to `/home` folder
  if (
    hostname === "localhost:3000" ||
    hostname === process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ) {
    if (pathname === "/home" || pathname.startsWith("/home/")) {
      return NextResponse.next();
    }

    const homeUrl = url.clone();
    homeUrl.pathname = `/home${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(homeUrl);
  }

  // rewrite everything else to `/[domain]/[slug] dynamic route
  const tenantUrl = url.clone();
  tenantUrl.pathname = `/${hostname}${pathname}`;
  return NextResponse.rewrite(tenantUrl);
}
