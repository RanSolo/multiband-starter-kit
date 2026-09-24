import { getSiteData } from "@/lib/fetchers";
import { headers } from "next/headers";
import Link from "next/link";

export default async function NotFound() {
  const headersList = headers();
  const domain = (
    headersList.get("x-forwarded-host") || headersList.get("host")
  )?.replace(/\.localhost:\d+$/, `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`);
  const data = await getSiteData(domain as string);
  const message = data?.message404;

  return (
    <div className="mx-auto max-w-2xl py-16 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800 dark:text-amber-300">
        404 / Missing page
      </p>
      <h1 className="mt-5 break-words font-title text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
        {data ? `${data.name}: ` : ""}Page not found
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-stone-600 dark:text-stone-300">
        {message?.trim() &&
        message !== "Blimey! You've found a page that doesn't exist."
          ? message
          : "This page isn't here. Head back to the band homepage to keep exploring."}
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-sm text-sm font-semibold text-amber-800 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-800 dark:text-amber-300 dark:focus-visible:outline-stone-100"
      >
        Back to the homepage
      </Link>
    </div>
  );
}
