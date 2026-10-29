import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SubmitActions } from "@/components/ui/submit-actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  projectFormSchema,
  type ProjectFormValues,
} from "@/lib/projectSchema";
import { toSlug } from "@/lib/slug";
import { useChannels } from "@/hooks/useChannels";
import { buildProjectDeepLink } from "@/lib/deepLink";
import type { Project } from "@/types";

interface ProjectFormProps {
  defaultValues?: Project;
  onSubmit: (values: ProjectFormValues) => Promise<void> | void;
  submitLabel?: string;
  onCancel?: () => void;
}

const EMPTY_DEFAULTS: ProjectFormValues = {
  title: "",
  slug: "",
  description: "",
  channelId: "",
  messageId: "",
  telegramMessageLink: "",
  telegramFileId: "",
  thumbnail: "",
  isActive: true,
};

export function ProjectForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  onCancel,
}: ProjectFormProps) {
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues?.slug));
  const channelsQuery = useChannels();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: defaultValues
      ? mapProjectToForm(defaultValues)
      : EMPTY_DEFAULTS,
    mode: "onTouched",
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // Auto-derive slug from title until the user manually edits it.
  const title = watch("title");
  useEffect(() => {
    if (!slugTouched && title) {
      setValue("slug", toSlug(title), { shouldValidate: true });
    }
  }, [title, slugTouched, setValue]);

  const selectedChannelId = watch("channelId");
  const isActive = watch("isActive");
  const channels = channelsQuery.data ?? [];
  const activeChannels = channels.filter((c) => c.isActive);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Field label="Title" id="title" error={errors.title?.message}>
        <Input
          id="title"
          placeholder="New Project"
          autoComplete="off"
          {...register("title")}
        />
      </Field>

      <Field label="Slug" id="slug" error={errors.slug?.message}>
        <Input
          id="slug"
          placeholder="new-project"
          autoComplete="off"
          {...register("slug", {
            onChange: () => setSlugTouched(true),
          })}
        />
      </Field>

      <Field
        label="Description"
        id="description"
        error={errors.description?.message ?? undefined}
        hint="Optional. Shown to the user on the project preview."
      >
        <Textarea
          id="description"
          placeholder="Optional project description"
          autoComplete="off"
          rows={3}
          {...register("description")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Source Channel"
          id="channelId"
          error={errors.channelId?.message}
          hint="Telegram channel that holds the project file."
        >
          <Select
            value={selectedChannelId || ""}
            onValueChange={(value) =>
              setValue("channelId", value, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="channelId">
              <SelectValue placeholder="Select a channel" />
            </SelectTrigger>
            <SelectContent>
              {activeChannels.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No active channels — add one in Channels
                </SelectItem>
              ) : null}
              {activeChannels.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Message ID"
          id="messageId"
          error={errors.messageId?.message}
          hint="The numeric id of the channel message that holds the file (e.g. 53)."
        >
          <Input
            id="messageId"
            type="number"
            inputMode="numeric"
            placeholder="53"
            autoComplete="off"
            {...register("messageId")}
          />
        </Field>
      </div>

      <details className="rounded-md border border-border/60 bg-muted/30 p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Legacy delivery (telegramFileId / message link)
        </summary>
        <div className="mt-3 grid gap-3">
          <Field
            label="Telegram Message Link"
            id="telegramMessageLink"
            error={errors.telegramMessageLink?.message ?? undefined}
            hint="Used only when no channel/messageId is set. e.g. https://t.me/c/.../..."
          >
            <Input
              id="telegramMessageLink"
              placeholder="https://t.me/c/..."
              autoComplete="off"
              {...register("telegramMessageLink")}
            />
          </Field>
          <Field
            label="Telegram File ID"
            id="telegramFileId"
            error={errors.telegramFileId?.message ?? undefined}
            hint="Used only when no channel/messageId is set."
          >
            <Input
              id="telegramFileId"
              placeholder="Legacy file id"
              autoComplete="off"
              {...register("telegramFileId")}
            />
          </Field>
        </div>
      </details>

      <Field
        label="Thumbnail (optional)"
        id="thumbnail"
        error={errors.thumbnail?.message ?? undefined}
        hint="URL of an image shown in the project table."
      >
        <Input
          id="thumbnail"
          placeholder="https://..."
          autoComplete="off"
          {...register("thumbnail")}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Switch
          id="isActive"
          checked={Boolean(isActive)}
          onCheckedChange={(value) =>
            setValue("isActive", value, { shouldDirty: true })
          }
        />
        <label className="text-sm font-medium" htmlFor="isActive">
          Active
        </label>
        <span className="text-xs text-muted-foreground">
          Inactive projects are unreachable from deep links.
        </span>
      </div>

      <DeepLinkPreview slug={watch("slug")} />

      <SubmitActions
        isSubmitting={isSubmitting}
        submitLabel={submitLabel}
        onCancel={onCancel}
      />
    </form>
  );
}

/**
 * Live preview of the deep link URL built from the current slug. Lets
 * the operator see the exact URL users will click, even before saving.
 */
function DeepLinkPreview({ slug }: { slug: string | undefined }) {
  if (!slug) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Deep link preview will appear once a slug is set.
      </div>
    );
  }

  const url = buildProjectDeepLink(slug);

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        Deep link preview
      </div>
      <div className="flex flex-col gap-2">
        <code className="block w-full break-all rounded bg-background px-2 py-1 text-xs [overflow-wrap:anywhere]">
          {url}
        </code>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("Deep link copied!");
            }}
            aria-label="Copy deep link"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            aria-label="Open deep link"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function mapProjectToForm(project: Project): ProjectFormValues {
  return {
    title: project.title,
    slug: project.slug,
    description: project.description ?? "",
    channelId: project.channelId != null ? String(project.channelId) : "",
    messageId: project.messageId != null ? String(project.messageId) : "",
    telegramMessageLink: project.telegramMessageLink ?? "",
    telegramFileId: project.telegramFileId ?? "",
    thumbnail: project.thumbnail ?? "",
    isActive: project.isActive,
  };
}
