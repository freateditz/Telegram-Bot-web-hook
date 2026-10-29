import { useState } from "react";
import { Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { EntityDialog } from "@/components/ui/entity-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "./ProjectForm";
import {
  useCreateProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import type { Project, ProjectInput } from "@/types";
import type { ProjectFormValues } from "@/lib/projectSchema";
import { buildProjectDeepLink } from "@/lib/deepLink";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: ProjectDialogProps) {
  const isEdit = Boolean(project);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const create = useCreateProject({
    onSuccess: (data) => {
      // For brand-new projects, surface the deep link in a confirmation
      // dialog so the operator can copy/open it without leaving the page.
      if (!isEdit) {
        setCreatedSlug(data.slug);
        return; // keep the form dialog open — the success dialog is layered on top
      }
      onOpenChange(false);
    },
  });
  const update = useUpdateProject({
    onSuccess: () => onOpenChange(false),
  });

  const handleSubmit = async (values: ProjectFormValues) => {
    const input: ProjectInput = {
      title: values.title,
      slug: values.slug,
      description: values.description?.trim() ? values.description.trim() : null,
      channelId: values.channelId ? Number(values.channelId) : null,
      messageId: values.messageId ? Number(values.messageId) : null,
      telegramMessageLink: values.telegramMessageLink || null,
      telegramFileId: values.telegramFileId || null,
      thumbnail: values.thumbnail || null,
      isActive: values.isActive ?? true,
    };

    if (isEdit && project) {
      await update.mutateAsync({ id: project.id, input: input });
    } else {
      await create.mutateAsync(input);
    }
  };

  return (
    <>
      <EntityDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "Edit Project" : "Create Project"}
        description={
          isEdit
            ? "Update the fields below and save your changes."
            : "Pick a channel and message id, then we'll generate a deep link for you."
        }
      >
        <ProjectForm
          defaultValues={project}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={isEdit ? "Save changes" : "Create project"}
        />
      </EntityDialog>

      <CreatedDialog
        slug={createdSlug}
        onClose={() => {
          setCreatedSlug(null);
          onOpenChange(false);
        }}
      />
    </>
  );
}

/**
 * Success dialog shown right after a project is created. Puts the
 * deep link front-and-center with copy / open buttons so the operator
 * can paste it straight into a YouTube description.
 */
function CreatedDialog({
  slug,
  onClose,
}: {
  slug: string | null;
  onClose: () => void;
}) {
  if (!slug) return null;
  const url = buildProjectDeepLink(slug);

  return (
    <Dialog open={Boolean(slug)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <DialogTitle>Project created</DialogTitle>
          </div>
          <DialogDescription>
            Your project is live. Share this deep link to deliver the file.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/20 p-3">
          <code className="block break-all text-xs">{url}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Deep link copied!");
              }}
            >
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
