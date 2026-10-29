import { useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  FolderKanban,
  Pencil,
  Trash2,
  Image,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { useProjects } from "@/hooks/useProjects";
import { buildProjectDeepLink } from "@/lib/deepLink";
import type { Project } from "@/types";

export function ProjectsPage() {
  const projectsQuery = useProjects();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleEdit = (project: Project) => {
    setEditing(project);
    setDialogOpen(true);
  };

  const handleDelete = (project: Project) => {
    setDeleteTarget(project);
    setDeleteOpen(true);
  };

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  // Deep links are generated dynamically — never stored in the DB.
  const buildDeepLink = (slug: string) => buildProjectDeepLink(slug);

  const filtered = useMemo(() => {
    const data = projectsQuery.data ?? [];
    const searchLower = search.trim().toLowerCase();
    if (!searchLower) return data;
    return data.filter((p) => {
      const haystack = [
        p.title,
        p.slug,
        p.channel?.name || "",
        p.channel?.channelId || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchLower);
    });
  }, [projectsQuery.data, search]);

  // Highest-converting projects first, then by total downloads.
  const sortedProjects = useMemo(() => {
    return [...filtered].sort((a, b) => b.downloadCount - a.downloadCount);
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Manage projects for direct Telegram deep-link downloads."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => projectsQuery.refetch()}
              disabled={projectsQuery.isFetching}
            >
              <RefreshCw
                className={
                  projectsQuery.isFetching
                    ? "h-4 w-4 animate-spin"
                    : "h-4 w-4"
                }
              />
              Refresh
            </Button>
            <Button type="button" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search by title, slug, or channel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="text-sm text-muted-foreground">
          {filtered.length} of {projectsQuery.data?.length ?? 0} projects
        </div>
      </div>

      {projectsQuery.isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : projectsQuery.isError ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="Failed to load projects"
          description="There was a problem fetching projects from the API."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="No projects found"
          description={
            search
              ? "Try adjusting your search or create a new project."
              : "Create your first project to get started."
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Thumbnail</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="w-20">Msg ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deep Link</TableHead>
                <TableHead className="w-16 text-right">Views</TableHead>
                <TableHead className="w-20 text-right">Downloads</TableHead>
                <TableHead className="w-16 text-right">Conv %</TableHead>
                <TableHead>Last Download</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProjects.map((p) => {
                const conv =
                  p.viewCount > 0
                    ? ((p.downloadCount / p.viewCount) * 100).toFixed(1)
                    : "0.0";
                const deepLink = buildDeepLink(p.slug);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                          <Image className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.title}
                      <div className="text-xs text-muted-foreground">
                        {p.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.channel ? (
                        <div>
                          <div className="text-sm font-medium">
                            {p.channel.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.channel.channelId}
                          </div>
                        </div>
                      ) : p.telegramFileId || p.telegramMessageLink ? (
                        <Badge variant="outline">Legacy</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p.messageId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.isActive ? "default" : "secondary"}
                      >
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code
                          className="max-w-[160px] truncate rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground"
                          title={deepLink}
                        >
                          {deepLink}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(deepLink);
                            toast.success("Deep link copied!");
                          }}
                          aria-label="Copy deep link"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            window.open(deepLink, "_blank", "noopener,noreferrer")
                          }
                          aria-label="Open deep link"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.viewCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.downloadCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {conv}%
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.lastDownloadedAt
                        ? new Date(p.lastDownloadedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(p)}
                          aria-label={`Edit ${p.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(p)}
                          aria-label={`Delete ${p.title}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        project={editing ?? undefined}
      />

      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTarget(null);
        }}
        project={deleteTarget}
      />
    </>
  );
}
