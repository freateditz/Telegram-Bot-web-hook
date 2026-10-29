import { useEffect, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { SubmitActions } from "@/components/ui/submit-actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { usePlatforms } from "@/hooks/usePlatforms";
import { useCategories } from "@/hooks/useCategories";
import {
  resourceFormSchema,
  type ResourceFormValues,
} from "@/lib/resourceSchema";
import { toSlug } from "@/lib/slug";
import { buildResourceDeepLink } from "@/lib/deepLink";
import type { Resource } from "@/types";

interface ResourceFormProps {
  defaultValues?: Resource;
  onSubmit: (values: ResourceFormValues) => Promise<void> | void;
  submitLabel?: string;
  onCancel?: () => void;
}

const EMPTY_DEFAULTS: ResourceFormValues = {
  name: "",
  slug: "",
  description: null,
  version: null,
  platformId: 0,
  categoryId: 0,
  downloadLink: null,
  fixLink: null,
  tutorialChannelId: null,
  tutorialMessageId: null,
  displayOrder: 0,
  isVisible: true,
};

export function ResourceForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  onCancel,
}: ResourceFormProps) {
  const platformsQuery = usePlatforms();
  const categoriesQuery = useCategories();
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues?.slug));

  const [showDirectDownload, setShowDirectDownload] = useState(true);
  const [showFixLink, setShowFixLink] = useState(false);
  const [showTelegramTutorial, setShowTelegramTutorial] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (defaultValues) {
      setShowDirectDownload(Boolean(defaultValues.downloadLink));
      setShowFixLink(Boolean(defaultValues.fixLink));
      setShowTelegramTutorial(
        Boolean(defaultValues.tutorialChannelId || defaultValues.tutorialMessageId)
      );
    }
  }, [defaultValues]);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: defaultValues
      ? mapResourceToForm(defaultValues)
      : EMPTY_DEFAULTS,
    mode: "onTouched",
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // Auto-derive slug from name until the user manually edits it.
  const name = watch("name");
  const slug = watch("slug");
  
  useEffect(() => {
    if (!slugTouched && name) {
      setValue("slug", toSlug(name), { shouldValidate: true });
    }
  }, [name, slugTouched, setValue]);

  const deepLink = buildResourceDeepLink(slug);

  const copyDeepLink = useCallback(() => {
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [deepLink]);

  const onSubmitWrapper = (values: ResourceFormValues) => {
    const data = { ...values };
    if (!showDirectDownload) data.downloadLink = null;
    if (!showFixLink) data.fixLink = null;
    if (!showTelegramTutorial) {
      data.tutorialChannelId = null;
      data.tutorialMessageId = null;
    }
    onSubmit(data);
  };

  const isLoadingOptions =
    platformsQuery.isLoading || categoriesQuery.isLoading;

  return (
    <form
      onSubmit={handleSubmit(onSubmitWrapper)}
      className="grid gap-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          id="name"
          error={errors.name?.message}
        >
          <Input
            id="name"
            placeholder="Adobe Premiere Pro"
            autoComplete="off"
            {...register("name")}
          />
        </Field>

        <Field label="Slug" id="slug" error={errors.slug?.message}>
          <Input
            id="slug"
            placeholder="adobe-premiere-pro"
            autoComplete="off"
            {...register("slug", {
              onChange: (e) => {
                const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                setValue("slug", val, { shouldValidate: true });
                setSlugTouched(true);
              },
            })}
          />
        </Field>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-4">
        <Label className="mb-2 block text-sm">Deep Link Preview</Label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={deepLink}
            className="font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copyDeepLink}
            disabled={!slug}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <h3 className="text-sm font-medium">Delivery Options</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={showDirectDownload}
              onCheckedChange={(checked: boolean) => setShowDirectDownload(checked)}
            />
            Direct Download
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={showFixLink}
              onCheckedChange={(checked: boolean) => setShowFixLink(checked)}
            />
            Fix Link
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={showTelegramTutorial}
              onCheckedChange={(checked: boolean) => setShowTelegramTutorial(checked)}
            />
            Telegram Tutorial
          </label>
        </div>
      </div>

      <Field
        label="Description"
        id="description"
        error={errors.description?.message}
      >
        <Textarea
          id="description"
          placeholder="Optional short description"
          rows={3}
          {...register("description")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Version" id="version" error={errors.version?.message}>
          <Input
            id="version"
            placeholder="2025 v25.0"
            autoComplete="off"
            {...register("version")}
          />
        </Field>

        <Field
          label="Platform"
          id="platformId"
          error={errors.platformId?.message}
        >
          <Controller
            control={control}
            name="platformId"
            render={({ field }) => (
              <Select
                value={field.value ? String(field.value) : ""}
                onValueChange={(value) => field.onChange(Number(value))}
                disabled={isLoadingOptions}
              >
                <SelectTrigger id="platformId">
                  <SelectValue
                    placeholder={
                      platformsQuery.isLoading
                        ? "Loading..."
                        : "Select platform"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {platformsQuery.data?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          label="Category"
          id="categoryId"
          error={errors.categoryId?.message}
        >
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value ? String(field.value) : ""}
                onValueChange={(value) => field.onChange(Number(value))}
                disabled={isLoadingOptions}
              >
                <SelectTrigger id="categoryId">
                  <SelectValue
                    placeholder={
                      categoriesQuery.isLoading
                        ? "Loading..."
                        : "Select category"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      {showDirectDownload && (
        <Field
          label="Download Link"
          id="downloadLink"
          error={errors.downloadLink?.message}
        >
          <Input
            id="downloadLink"
            placeholder="https://..."
            autoComplete="off"
            {...register("downloadLink")}
          />
        </Field>
      )}

      {showFixLink && (
        <Field
          label="Fix Link"
          id="fixLink"
          error={errors.fixLink?.message}
        >
          <Input
            id="fixLink"
            placeholder="https://..."
            autoComplete="off"
            {...register("fixLink")}
          />
        </Field>
      )}

      {showTelegramTutorial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tutorial Channel ID"
            id="tutorialChannelId"
            error={errors.tutorialChannelId?.message}
          >
            <Input
              id="tutorialChannelId"
              placeholder="@your_channel"
              autoComplete="off"
              {...register("tutorialChannelId")}
            />
          </Field>

          <Field
            label="Tutorial Message ID"
            id="tutorialMessageId"
            error={errors.tutorialMessageId?.message}
          >
            <Input
              id="tutorialMessageId"
              type="number"
              inputMode="numeric"
              placeholder="123"
              autoComplete="off"
              {...register("tutorialMessageId", { valueAsNumber: true })}
            />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Display Order"
          id="displayOrder"
          error={errors.displayOrder?.message}
        >
          <Input
            id="displayOrder"
            type="number"
            inputMode="numeric"
            placeholder="0"
            autoComplete="off"
            {...register("displayOrder", { valueAsNumber: true })}
          />
        </Field>

        <div className="flex items-end pb-1">
          <div className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="isVisible" className="text-sm">
                Visible
              </Label>
              <p className="text-xs text-muted-foreground">
                Hidden resources are not shown to Telegram users.
              </p>
            </div>
            <Controller
              control={control}
              name="isVisible"
              render={({ field }) => (
                <Switch
                  id="isVisible"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </div>
      </div>

      <SubmitActions
        isSubmitting={isSubmitting}
        submitLabel={submitLabel}
        onCancel={onCancel}
      />
    </form>
  );
}

function mapResourceToForm(resource: Resource): ResourceFormValues {
  return {
    name: resource.name,
    slug: resource.slug ?? "",
    description: resource.description,
    version: resource.version,
    platformId: resource.platformId,
    categoryId: resource.categoryId,
    downloadLink: resource.downloadLink,
    fixLink: resource.fixLink,
    tutorialChannelId: resource.tutorialChannelId,
    tutorialMessageId: resource.tutorialMessageId,
    displayOrder: resource.displayOrder,
    isVisible: resource.isVisible,
  };
}
