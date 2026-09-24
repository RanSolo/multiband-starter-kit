import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import CTA from "@/components/cta";
import ReportAbuse from "@/components/report-abuse";
import { notFound, redirect } from "next/navigation";
import { getSiteData } from "@/lib/fetchers";
import { fontMapper } from "@/styles/fonts";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { domain: string };
}): Promise<Metadata | null> {
  const domain = decodeURIComponent(params.domain);
  const data = await getSiteData(domain);
  if (!data) {
    return null;
  }
  const {
    name: title,
    description,
    image,
    logo,
  } = data as {
    name: string;
    description: string;
    image: string;
    logo: string;
  };

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@vercel",
    },
    icons: [logo],
    metadataBase: new URL(`https://${domain}`),
    // Optional: Set canonical URL to custom domain if it exists
    ...(params.domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
      data.customDomain && {
        alternates: {
          canonical: `https://${data.customDomain}`,
        },
      }),
  };
}

export default async function SiteLayout({
  params,
  children,
}: {
  params: { domain: string };
  children: ReactNode;
}) {
  const domain = decodeURIComponent(params.domain);
  const data = await getSiteData(domain);

  if (!data) {
    notFound();
  }

  // Optional: Redirect to custom domain if it exists
  if (
    domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
    data.customDomain &&
    process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS === "true"
  ) {
    return redirect(`https://${data.customDomain}`);
  }
  const logo = data.logo && data.logo !== "/placeholder.png" ? data.logo : null;
  return (
    <div
      className={`${fontMapper[data.font]} min-h-screen bg-[#f7f5ef] text-stone-900 dark:bg-stone-950 dark:text-stone-100`}
    >
      <header className="border-b border-stone-900/10 dark:border-stone-100/10">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-4 sm:gap-5 sm:px-8 sm:py-5 lg:px-12">
          <Link
            href="/"
            aria-label={`${data.name} home`}
            className="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-800 sm:gap-4 dark:focus-visible:outline-stone-100"
          >
            {logo && (
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-stone-200 sm:h-14 sm:w-14 dark:bg-stone-800">
                <Image
                  alt=""
                  fill
                  className="object-cover"
                  sizes="56px"
                  src={logo}
                />
              </span>
            )}
            <span className="min-w-0">
              <span className="block break-words font-title text-lg font-bold leading-tight tracking-tight sm:text-xl">
                {data.name}
              </span>
              {data.description?.trim() && (
                <span className="mt-1 block break-words text-xs leading-snug text-stone-600 sm:text-sm dark:text-stone-300">
                  {data.description}
                </span>
              )}
            </span>
          </Link>
        </div>
      </header>

      <main
        id="content"
        className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12 lg:px-12"
      >
        {children}
      </main>

      {domain == `demo.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` ||
      domain == `multi-band.com` ? (
        <CTA />
      ) : (
        <ReportAbuse />
      )}
    </div>
  );
}
