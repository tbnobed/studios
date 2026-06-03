import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Copy,
  Trash2,
  Plus,
  Link2,
  Users,
  Check,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MultiviewerShare } from "@shared/schema";

type ShareWithUrl = MultiviewerShare & { shareUrl: string };
type ShareTargets = {
  users: { id: string; username: string }[];
  groups: { id: string; name: string }[];
};
type InternalShares = { userIds: string[]; groupIds: string[] };

interface Props {
  layoutId: string;
  layoutName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MultiviewerShareDialog({
  layoutId,
  layoutName,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sharesKey = ["/api/multiviewer-layouts", layoutId, "shares"];
  const internalKey = ["/api/multiviewer-layouts", layoutId, "internal-shares"];

  const { data: shares = [], isLoading: sharesLoading } = useQuery<ShareWithUrl[]>({
    queryKey: sharesKey,
    enabled: open,
  });

  const { data: targets } = useQuery<ShareTargets>({
    queryKey: ["/api/share-targets"],
    enabled: open,
  });

  const { data: internal } = useQuery<InternalShares>({
    queryKey: internalKey,
    enabled: open,
  });

  // Local working copy of the internal selection, seeded from the server.
  const [userIds, setUserIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  useEffect(() => {
    if (internal) {
      setUserIds(internal.userIds);
      setGroupIds(internal.groupIds);
    }
  }, [internal]);

  const createShare = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/multiviewer-layouts/${layoutId}/shares`,
        {
          label: label.trim() || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }
      );
      return (await res.json()) as ShareWithUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharesKey });
      setLabel("");
      setExpiresAt("");
      toast({ title: "Public link created" });
    },
    onError: () =>
      toast({
        title: "Could not create link",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteShare = useMutation({
    mutationFn: async (shareId: string) => {
      await apiRequest(
        "DELETE",
        `/api/multiviewer-layouts/${layoutId}/shares/${shareId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharesKey });
      toast({ title: "Link revoked" });
    },
    onError: () =>
      toast({
        title: "Could not revoke link",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const saveInternal = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PUT",
        `/api/multiviewer-layouts/${layoutId}/internal-shares`,
        { userIds, groupIds }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: internalKey });
      // The recipients' layout lists change; refresh ours too for consistency.
      queryClient.invalidateQueries({
        queryKey: ["/api/multiviewer-layouts"],
      });
      toast({ title: "Sharing updated" });
    },
    onError: () =>
      toast({
        title: "Could not update sharing",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const copyLink = async (share: ShareWithUrl) => {
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopiedId(share.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast({
        title: "Could not copy",
        description: share.shareUrl,
        variant: "destructive",
      });
    }
  };

  const toggle = (
    id: string,
    list: string[],
    setter: (v: string[]) => void
  ) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{layoutName}”</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="external" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="external" data-testid="tab-share-external">
              <Link2 size={14} className="mr-1" />
              Public link
            </TabsTrigger>
            <TabsTrigger value="internal" data-testid="tab-share-internal">
              <Users size={14} className="mr-1" />
              People &amp; groups
            </TabsTrigger>
          </TabsList>

          {/* EXTERNAL: token links anyone can open with no account */}
          <TabsContent value="external" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Anyone with the link can watch this multiview without signing in,
              until it expires or you revoke it.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="share-label" className="text-xs">
                  Label (optional)
                </Label>
                <Input
                  id="share-label"
                  placeholder="e.g. Game day feed"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  data-testid="input-share-label"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="share-expiry" className="text-xs">
                  Expires (optional)
                </Label>
                <Input
                  id="share-expiry"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  data-testid="input-share-expiry"
                />
              </div>
              <Button
                onClick={() => createShare.mutate()}
                disabled={createShare.isPending}
                data-testid="button-create-share"
              >
                <Plus size={16} className="mr-1" />
                Create
              </Button>
            </div>

            <Separator />

            <ScrollArea className="max-h-56">
              {sharesLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : shares.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No public links yet.
                </p>
              ) : (
                <ul className="space-y-2 pr-2" data-testid="list-shares">
                  {shares.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.label || "Public link"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.expiresAt
                            ? `Expires ${new Date(s.expiresAt).toLocaleString()}`
                            : "Never expires"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyLink(s)}
                        data-testid={`button-copy-share-${s.id}`}
                        title="Copy link"
                      >
                        {copiedId === s.id ? (
                          <Check size={16} className="text-green-500" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => deleteShare.mutate(s.id)}
                        disabled={deleteShare.isPending}
                        data-testid={`button-delete-share-${s.id}`}
                        title="Revoke link"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          {/* INTERNAL: grant view-only access to logged-in users / groups */}
          <TabsContent value="internal" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Pick who can see this multiview (read-only) in their own
              Multiviewer page.
            </p>

            <ScrollArea className="max-h-64">
              <div className="space-y-4 pr-2">
                {targets?.groups && targets.groups.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Groups
                    </p>
                    <div className="space-y-1">
                      {targets.groups.map((g) => (
                        <label
                          key={g.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            checked={groupIds.includes(g.id)}
                            onCheckedChange={() =>
                              toggle(g.id, groupIds, setGroupIds)
                            }
                            data-testid={`check-group-${g.id}`}
                          />
                          <span className="text-sm">{g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    People
                  </p>
                  <div className="space-y-1">
                    {targets?.users.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          checked={userIds.includes(u.id)}
                          onCheckedChange={() =>
                            toggle(u.id, userIds, setUserIds)
                          }
                          data-testid={`check-user-${u.id}`}
                        />
                        <span className="text-sm">{u.username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end">
              <Button
                onClick={() => saveInternal.mutate()}
                disabled={saveInternal.isPending}
                data-testid="button-save-internal-shares"
              >
                {saveInternal.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
