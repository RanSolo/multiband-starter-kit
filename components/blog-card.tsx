import Link from "next/link";
import BlurImage from "./blur-image";

import type { Post } from "@prisma/client";
import { placeholderBlurhash, toDateString } from "@/lib/utils";

interface BlogCardProps {
  data: Pick<
    Post,
    "slug" | "image" | "imageBlurhash" | "title" | "description" | "createdAt"
  >;
}

export default function BlogCard({ data }: BlogCardProps) {
  const coverImage =
    data.image && data.image !== "/placeholder.png" ? data.image : null;
  return (
    <Link
      href={`/${data.slug}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-stone-900/10 bg-white/70 transition-colors hover:border-amber-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 dark:border-stone-100/10 dark:bg-stone-900/70 dark:hover:border-amber-300/60 dark:focus-visible:outline-stone-100"
    >
      {coverImage && (
        <div className="aspect-[16/10] overflow-hidden bg-stone-200 dark:bg-stone-800">
          <BlurImage
            src={coverImage}
            alt=""
            width={800}
            height={500}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            placeholder="blur"
            blurDataURL={data.imageBlurhash ?? placeholderBlurhash}
          />
        </div>
      )}
      <div className="flex flex-1 flex-col px-5 py-6 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">
          Published {toDateString(data.createdAt)}
        </p>
        <h3 className="mt-3 break-words font-title text-xl font-bold leading-snug tracking-tight text-stone-900 sm:text-2xl dark:text-stone-100">
          {data.title}
        </h3>
        {data.description?.trim() && (
          <p className="mt-3 line-clamp-3 break-words text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            {data.description}
          </p>
        )}
        <span className="mt-7 text-sm font-semibold text-stone-900 dark:text-stone-100">
          Read story <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
