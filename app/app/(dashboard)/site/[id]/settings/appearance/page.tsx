import prisma from "@/lib/prisma";
import Form from "@/components/form";
import { updateSite } from "@/lib/actions/actions";

export default async function SiteSettingsAppearance({
  params,
}: {
  params: { id: string };
}) {
  const data = await prisma.site.findUnique({
    where: {
      id: decodeURIComponent(params.id),
    },
    include: { socialMediaLinks : true }
  });

  return (
    <div className="flex flex-col space-y-6">
      <Form
        title="Cover image"
        description="Upload a PNG, JPG, or JPEG cover image."
        helpText="Maximum file size: 50 MiB. Recommended dimensions: 1200x630."
        inputAttrs={{
          name: "image",
          type: "file",
          defaultValue: data?.image!,
        }}
        handleSubmit={updateSite}
      />
      <Form
        title="Logo"
        description="Upload a PNG, JPG, or JPEG logo."
        helpText="Maximum file size: 50 MiB. Recommended dimensions: 400x400."
        inputAttrs={{
          name: "logo",
          type: "file",
          defaultValue: data?.logo!,
        }}
        handleSubmit={updateSite}
      />
      <Form
        title="Featured YouTube video"
        description="Paste a YouTube embed URL or the full iframe code from Share → Embed."
        helpText="Leave blank to remove the featured video."
        inputAttrs={{
          name: "featuredEmbed",
          type: "textarea",
          defaultValue: data?.featuredEmbed ?? "",
          required: false,
        }}
        handleSubmit={updateSite}
      />
      <Form
        title="Font"
        description="The font for the heading text your site."
        helpText="Please select a font."
        inputAttrs={{
          name: "font",
          type: "select",
          defaultValue: data?.font!,
        }}
        handleSubmit={updateSite}
      />
      <Form
        title="404 Page Message"
        description="Message to be displayed on the 404 page."
        helpText="Please use 240 characters maximum."
        inputAttrs={{
          name: "message404",
          type: "text",
          defaultValue: data?.message404!,
          placeholder: "Blimey! You've found a page that doesn't exist.",
          maxLength: 240,
        }}
        handleSubmit={updateSite}
      />
    </div>
  );
}
