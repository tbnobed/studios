import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Copy, Trash2, Plus, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StreamShareWithStream } from "@shared/schema";

type ShareWithUrl = StreamShareWithStream & { shareUrl: string };

interface Props {
  streamId: string;
  streamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StreamShareDialog({
  streamId,
  streamName,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sharesKey = ["/api/shares"];

  // All of the current user's share links; we show only the ones for this stream.
  const { data: allShares = [], isLoading } = useQuery<ShareWithUrl[]>({
    queryKey: sharesKey,
    enabled: open,
  });
  const shares = allShares.filter((s) => s.streamId === streamId);

  const createShare = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shares", {
        streamId,
        label: label.trim() || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      return (await res.json()) as ShareWithUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharesKey });
      setLabel("");
      setExpiresAt("");
      toast({ title: "Share link created" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not create link",
        description: error.message.replace(/^\d+:\s*/, "") || "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteShare = useMutation({
    mutationFn: async (shareId: string) => {
      await apiRequest("DELETE", `/api/shares/${shareId}`);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{streamName}”</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Anyone with the link can watch this stream without signing in, until
            it expires or you revoke it.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="stream-share-label" className="text-xs">
                Label (optional)
              </Label>
              <Input
                id="stream-share-label"
                placeholder="e.g. Studio A feed"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                data-testid="input-stream-share-label"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="stream-share-expiry" className="text-xs">
                Expires (optional)
              </Label>
              <Input
                id="stream-share-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                data-testid="input-stream-share-expiry"
              />
            </div>
            <Button
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending}
              data-testid="button-create-stream-share"
            >
              <Plus size={16} className="mr-1" />
              Create
            </Button>
          </div>

          <Separator />

          <ScrollArea className="max-h-56">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : shares.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No links for this stream yet.
              </p>
            ) : (
              <ul className="space-y-2 pr-2" data-testid="list-stream-shares">
                {shares.map((s) => {
                  const expired =
                    !!s.expiresAt &&
                    new Date(s.expiresAt).getTime() <= Date.now();
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.label || "Share link"}
                          {expired && (
                            <span className="ml-2 text-xs text-destructive">
                              (expired)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground font-mono">
                          {s.shareUrl}
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
                        data-testid={`button-copy-stream-share-${s.id}`}
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
                        data-testid={`button-delete-stream-share-${s.id}`}
                        title="Revoke link"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
