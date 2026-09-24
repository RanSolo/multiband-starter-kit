import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { placeholderBlurhash, toDateString } from "@/lib/utils";
import { getPostsForSite, getSiteData } from "@/lib/fetchers";
import Image from "next/image";
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

  return (
    <>
      <div className="mb-20 mt-20 w-full">
        <div className="relative h-fit w-full pb-5">
          <div className="group relative mx-auto h-full w-full overflow-hidden">
            <Image
              alt="band photo"
              blurDataURL={placeholderBlurhash}
              className="h-full w-full object-cover group-hover:scale-105 group-hover:duration-300"
              width={1300}
              height={630}
              placeholder="blur"
              src={data.image ?? "/placeholder.png"}
            />
          </div>
        </div>

        {data.bio?.trim() && (
          <section className="mx-auto mb-12 w-5/6 max-w-screen-xl text-center">
            <p className="text-lg leading-relaxed text-stone-700 md:text-xl dark:text-stone-300">
              {data.bio}
            </p>
          </section>
        )}

        {data.socialMediaLinks.length > 0 && (
          <nav
            aria-label="Social links"
            className="mx-auto mb-12 flex w-5/6 max-w-screen-xl flex-wrap justify-center gap-4"
          >
            {data.socialMediaLinks.map(({ id, link }) => (
              <a
                key={id}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-700 underline dark:text-stone-300"
              >
                {socialLabel(link)}
              </a>
            ))}
          </nav>
        )}

        <div className="mx-auto w-1/2 max-w-screen-xl md:mb-28 lg:w-5/6">
          {posts.map((post) => (
            <Link key={post.slug} href={`/${post.slug}`}>
              <div className="mx-auto mt-10 w-5/6 lg:w-full">
                <h2 className="my-10 font-title text-4xl md:text-6xl dark:text-white">
                  {post.title}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      </div>
      {featuredEmbedSrc && (
        <div className="mx-auto mb-20 aspect-video w-5/6 max-w-screen-xl">
          <iframe
            src={featuredEmbedSrc}
            title="Featured YouTube video"
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
    </>
  );
}
