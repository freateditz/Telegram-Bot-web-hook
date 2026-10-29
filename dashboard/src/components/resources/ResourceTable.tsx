import { Pencil, Trash2, ArrowUpDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { buildResourceDeepLink } from "@/lib/deepLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package } from "lucide-react";
import type { Resource } from "@/types";

type SortDir = "asc" | "desc";
type SortKey = "name" | "displayOrder";

interface ResourceTableProps {
  resources: Resource[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (resource: Resource) => void;
  onDelete: (resource: Resource) => void;
  onToggleVisible: (resource: Resource) => void;
  togglingId: number | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
}

export function ResourceTable({
  resources,
  isLoading,
  isError,
  onEdit,
  onDelete,
  onToggleVisible,
  togglingId,
  sortKey,
  sortDir,
  onSortChange,
}: ResourceTableProps) {
  if (isLoading) {
    return <ResourceTableSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Package className="h-5 w-5" />}
        title="Failed to load resources"
        description="There was a problem fetching resources from the API."
      />
    );
  }

  if (resources.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-5 w-5" />}
        title="No resources found"
        description="Try adjusting your filters or create a new resource."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortButton
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => onSortChange("name")}
              >
                Name
              </SortButton>
            </TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Visible</TableHead>
            <TableHead className="w-32">
              <SortButton
                active={sortKey === "displayOrder"}
                dir={sortDir}
                onClick={() => onSortChange("displayOrder")}
              >
                Display Order
              </SortButton>
            </TableHead>
            <TableHead className="w-32 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.slug}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {r.platform ? (
                  <Badge variant="secondary">{r.platform.name}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {r.category ? (
                  <Badge variant="outline">{r.category.name}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {r.version || "—"}
              </TableCell>
              <TableCell>
                <Switch
                  checked={r.isVisible}
                  onCheckedChange={() => onToggleVisible(r)}
                  disabled={togglingId === r.id}
                  aria-label={`Toggle visibility for ${r.name}`}
                />
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {r.displayOrder}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {r.slug && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const link = buildResourceDeepLink(r.slug);
                        navigator.clipboard.writeText(link);
                        toast.success("Resource deep link copied!");
                      }}
                      aria-label={`Copy deep link for ${r.name}`}
                      title="Copy Telegram deep link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(r)}
                    aria-label={`Edit ${r.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(r)}
                    aria-label={`Delete ${r.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface SortButtonProps {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}

function SortButton({ active, dir, onClick, children }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowUpDown
        className={
          active
            ? `h-3.5 w-3.5 text-foreground ${dir === "asc" ? "rotate-180" : ""}`
            : "h-3.5 w-3.5 opacity-50"
        }
      />
    </button>
  );
}

function ResourceTableSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="ml-auto h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
