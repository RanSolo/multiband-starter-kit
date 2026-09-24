import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getPostData, getSiteData } from "@/lib/fetchers";
import BlogCard from "@/components/blog-card";
import BlurImage from "@/components/blur-image";
import MDX from "@/components/mdx";
import { placeholderBlurhash, toDateString } from "@/lib/utils";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: { domain: string; slug: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const slug = decodeURIComponent(params.slug);

  const [data, siteData] = await Promise.all([
    getPostData(domain, slug),
    getSiteData(domain),
  ]);
  if (!data || !siteData) {
    return null;
  }
  const { title, description } = data;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@vercel",
    },
    // Optional: Set canonical URL to custom domain if it exists
    ...(params.domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
      siteData.customDomain && {
        alternates: {
          canonical: `https://${siteData.customDomain}/${params.slug}`,
        },
      }),
  };
}

export async function generateStaticParams() {
  const allPosts = await prisma.post.findMany({
    select: {
      slug: true,
      site: {
        select: {
          subdomain: true,
          customDomain: true,
        },
      },
    },
    // feel free to remove this filter if you want to generate paths for all posts
    where: {
      site: {
        subdomain: "demo",
      },
    },
  });

  const allPaths = allPosts
    .flatMap(({ site, slug }) => [
      site?.subdomain && {
        domain: `${site.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
        slug,
      },
      site?.customDomain && {
        domain: site.customDomain,
        slug,
      },
    ])
    .filter(Boolean);

  return allPaths;
}

export default async function SitePostPage({
  params,
}: {
  params: { domain: string; slug: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const slug = decodeURIComponent(params.slug);
  const data = await getPostData(domain, slug);

  if (!data) {
    notFound();
  }
  const coverImage =
    data.image && data.image !== "/placeholder.png" ? data.image : null;

  return (
    <div>
      <header className="mx-auto mb-9 max-w-3xl sm:mb-12">
        <Link
          href="/"
          className="inline-block rounded-sm text-sm font-semibold text-amber-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-800 dark:text-amber-300 dark:focus-visible:outline-stone-100"
        >
          <span aria-hidden="true">←</span> Back to{" "}
          {data.site?.name ?? "the band"}
        </Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">
          Published {toDateString(data.createdAt)}
        </p>
        <h1 className="mt-4 break-words font-title text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          {data.title}
        </h1>
        {data.description?.trim() && (
          <p className="mt-6 break-words text-lg leading-relaxed text-stone-600 sm:text-xl dark:text-stone-300">
            {data.description}
          </p>
        )}
      </header>
      {coverImage && (
        <div className="mx-auto mb-10 aspect-[16/10] max-w-5xl overflow-hidden rounded-lg bg-stone-200 sm:mb-14 sm:aspect-[16/9] dark:bg-stone-800">
          <BlurImage
            alt={`${data.title} cover image`}
            width={1200}
            height={675}
            className="h-full w-full object-cover"
            placeholder="blur"
            blurDataURL={data.imageBlurhash ?? placeholderBlurhash}
            src={coverImage}
          />
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <MDX source={data.mdxSource} />
      </div>

      {data.adjacentPosts.length > 0 && (
        <section
          aria-labelledby="more-stories-heading"
          className="mt-16 border-t border-stone-900/10 pt-8 sm:mt-24 sm:pt-10 dark:border-stone-100/10"
        >
          <h2
            id="more-stories-heading"
            className="mb-7 font-title text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Continue reading
          </h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.adjacentPosts.map((post) => (
              <BlogCard key={post.slug} data={post} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
