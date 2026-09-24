"use client";

import {
  createSocialLink,
  deleteSocialLink,
  updateSocialLink,
} from "@/lib/actions/actions";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type SocialLink = { id: string; link: string };

export default function SocialLinks({
  siteId,
  initialLinks,
}: {
  siteId: string;
  initialLinks: SocialLink[];
}) {
  const [links, setLinks] = useState(initialLinks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sortLinks = (items: SocialLink[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));

  const run = (id: string, operation: () => Promise<void>) => {
    setPendingId(id);
    startTransition(async () => {
      try {
        await operation();
      } catch {
        toast.error("Unable to save social link.");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 sm:p-10 dark:border-stone-700 dark:bg-black">
      <h2 className="font-cal text-xl dark:text-white">Social links</h2>
      <p className="mt-2 text-sm text-stone-500">
        Add public HTTP or HTTPS links for this band.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          run("new", async () => {
            const result = await createSocialLink(form, siteId, null);
            if ("error" in result) {
              toast.error(result.error);
              return;
            }
            setLinks((items) => sortLinks([...items, result.link]));
            formElement.reset();
          });
        }}
      >
        <input
          name="link"
          type="url"
          minLength={1}
          maxLength={2048}
          required
          placeholder="https://example.com/band"
          className="w-full rounded-md border-stone-300 text-sm dark:bg-black dark:text-white"
        />
        <button
          disabled={pendingId === "new"}
          className="rounded-md bg-black px-4 text-sm text-white"
        >
          Add
        </button>
      </form>
      <div className="mt-4 space-y-3">
        {links.map((item) => (
          <form
            key={item.id}
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              form.set("id", item.id);
              run(item.id, async () => {
                const result = await updateSocialLink(form, siteId, null);
                if ("error" in result) {
                  toast.error(result.error);
                  return;
                }
                setLinks((items) =>
                  sortLinks(
                    items.map((current) =>
                      current.id === item.id ? result.link : current,
                    ),
                  ),
                );
              });
            }}
          >
            <input
              name="link"
              type="url"
              minLength={1}
              maxLength={2048}
              required
              defaultValue={item.link}
              className="w-full rounded-md border-stone-300 text-sm dark:bg-black dark:text-white"
            />
            <button
              disabled={pendingId === item.id}
              className="rounded-md border px-3 text-sm"
            >
              Save
            </button>
            <button
              type="button"
              disabled={pendingId === item.id}
              className="rounded-md border px-3 text-sm text-red-600"
              onClick={() => {
                if (!confirm("Remove this social link?")) return;
                run(item.id, async () => {
                  const form = new FormData();
                  form.set("id", item.id);
                  const result = await deleteSocialLink(form, siteId, null);
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  setLinks((items) =>
                    items.filter((current) => current.id !== result.id),
                  );
                });
              }}
            >
              Remove
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
