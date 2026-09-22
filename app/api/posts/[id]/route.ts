import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

type EditablePost = {
  title: string | null;
  description: string | null;
  content: string | null;
};

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (typeof params.id !== "string" || !params.id) {
    return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !isNullableString((body as EditablePost).title) ||
    !isNullableString((body as EditablePost).description) ||
    !isNullableString((body as EditablePost).content)
  ) {
    return NextResponse.json({ error: "Invalid post fields" }, { status: 400 });
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: {
        userId: true,
        slug: true,
        site: { select: { subdomain: true, customDomain: true } },
      },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { title, description, content } = body as EditablePost;
    await prisma.post.update({
      where: { id: params.id },
      data: { title, description, content },
    });

    await revalidateTag(
      `${post.site?.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}-posts`,
    );
    await revalidateTag(
      `${post.site?.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}-${post.slug}`,
    );
    if (post.site?.customDomain) {
      await revalidateTag(`${post.site.customDomain}-posts`);
      await revalidateTag(`${post.site.customDomain}-${post.slug}`);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save post" }, { status: 500 });
  }
}
