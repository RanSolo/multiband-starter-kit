import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getPostsForSite, getSiteData } from "@/lib/fetchers";
import Image from "next/image";
import BlogCard from "@/components/blog-card";
import { safeYouTubeFeaturedEmbed } from "@/lib/youtube-featured-embed.mjs";

const socialLabel = (href: string) => {
  const hostname = new URL(href).hostname.toLowerCase();
  const labels: Record<string, string> = {
    "instagram.com": "Instagram",
    "www.instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "www.facebook.com": "Facebook",
    "youtube.com": "YouTube",
    "www.youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "x.com": "X",
    "www.x.com": "X",
    "twitter.com": "X",
    "www.twitter.com": "X",
    "tiktok.com": "TikTok",
    "www.tiktok.com": "TikTok",
    "spotify.com": "Spotify",
    "open.spotify.com": "Spotify",
    "soundcloud.com": "SoundCloud",
    "www.soundcloud.com": "SoundCloud",
    "bandcamp.com": "Bandcamp",
  };
  return labels[hostname] ?? hostname;
};

export async function generateStaticParams() {
  const allSites = await prisma.site.findMany({
    select: {
      subdomain: true,
      customDomain: true,
    },
    // feel free to remove this filter if you want to generate paths for all sites
    where: {
      subdomain: "demo",
    },
  });

  const allPaths = allSites
    .flatMap(({ subdomain, customDomain }) => [
      subdomain && {
        domain: `${subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
      },
      customDomain && {
        domain: customDomain,
      },
    ])
    .filter(Boolean);

  return allPaths;
}

export default async function SiteHomePage({
  params,
}: {
  params: { domain: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const [data, posts] = await Promise.all([
    getSiteData(domain),
    getPostsForSite(domain),
  ]);

  if (!data) {
    notFound();
  }
  const featuredEmbedSrc = safeYouTubeFeaturedEmbed(data.featuredEmbed);
  const coverImage =
    data.image && data.image !== "/placeholder.png" ? data.image : null;

  return (
    <div className="space-y-16 sm:space-y-24">
      <section
        aria-labelledby="band-name"
        className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12"
      >
        <div
          className={`${coverImage ? "lg:col-span-5" : "lg:col-span-9"} min-w-0`}
        >
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800 dark:text-amber-300">
            The band
          </p>
          <h1
            id="band-name"
            className="break-words font-title text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            {data.name}
          </h1>
          {data.description?.trim() && (
            <p className="mt-6 max-w-xl break-words text-lg leading-relaxed text-stone-700 sm:text-xl dark:text-stone-300">
              {data.description}
            </p>
          )}
          <div
            className="mt-8 h-px w-24 bg-amber-800/60 dark:bg-amber-300/70"
            aria-hidden="true"
          />
        </div>
        {coverImage && (
          <div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg bg-stone-200 shadow-sm sm:aspect-[16/10] lg:col-span-7 dark:bg-stone-800">
            <Image
              alt={`${data.name} cover image`}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 58vw"
              priority
              src={coverImage}
            />
          </div>
        )}
      </section>

      {(data.bio?.trim() || data.socialMediaLinks.length > 0) && (
        <section
          aria-labelledby="about-heading"
          className="grid gap-6 border-t border-stone-900/10 pt-8 sm:grid-cols-12 sm:gap-10 sm:pt-10 dark:border-stone-100/10"
        >
          <h2
            id="about-heading"
            className="font-title text-2xl font-bold tracking-tight sm:col-span-4 sm:text-3xl"
          >
            About
          </h2>
          <div className="min-w-0 space-y-7 sm:col-span-8">
            {data.bio?.trim() && (
              <p className="whitespace-pre-line break-words text-base leading-8 text-stone-700 sm:text-lg dark:text-stone-300">
                {data.bio}
              </p>
            )}
            {data.socialMediaLinks.length > 0 && (
              <nav aria-label="Social links" className="flex flex-wrap gap-2.5">
                {data.socialMediaLinks.map(({ id, link }) => (
                  <a
                    key={id}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-stone-900/20 px-4 py-2 text-sm font-medium text-stone-800 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 dark:border-stone-100/30 dark:text-stone-100 dark:hover:border-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-950 dark:focus-visible:outline-stone-100"
                  >
                    {socialLabel(link)} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </nav>
            )}
          </div>
        </section>
      )}

      {featuredEmbedSrc && (
        <section
          aria-labelledby="featured-heading"
          className="border-t border-stone-900/10 pt-8 sm:pt-10 dark:border-stone-100/10"
        >
          <h2
            id="featured-heading"
            className="mb-7 font-title text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Featured video
          </h2>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-stone-900">
            <iframe
              src={featuredEmbedSrc}
              title="Featured YouTube video"
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </section>
      )}

      <section
        aria-labelledby="latest-heading"
        className="border-t border-stone-900/10 pt-8 sm:pt-10 dark:border-stone-100/10"
      >
        <div className="mb-7 flex items-baseline justify-between gap-4">
          <h2
            id="latest-heading"
            className="font-title text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Latest stories
          </h2>
          {posts.length > 0 && (
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              From the band
            </span>
          )}
        </div>
        {posts.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCard key={post.slug} data={post} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-stone-900/10 bg-white/50 px-6 py-10 sm:px-10 dark:border-stone-100/10 dark:bg-stone-900/50">
            <p className="font-title text-xl font-semibold">
              Stories are on their way.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Check back for the latest from {data.name}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
