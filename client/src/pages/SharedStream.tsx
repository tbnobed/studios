import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { Stream } from "@shared/schema";
import { StreamPlayer } from "@/components/StreamPlayer";

interface SharedStreamResponse {
  stream: Stream;
  label: string | null;
  expiresAt: string | null;
}

export default function SharedStream() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, isError } = useQuery<SharedStreamResponse>({
    queryKey: ["/api/share", token],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Loading stream…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-center text-lg">Stream Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-share-error">
              This share link is invalid or has expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const title = data.label || data.stream.name;

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h1 className="text-base font-semibold text-white truncate" data-testid="text-share-title">
          {title}
        </h1>
        {data.expiresAt && (
          <span className="text-xs text-white/50 whitespace-nowrap ml-3">
            Available until {new Date(data.expiresAt).toLocaleString()}
          </span>
        )}
      </header>
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-6xl aspect-video">
          <StreamPlayer
            stream={data.stream}
            className="w-full h-full"
            controls
            autoPlay
            showOverlay
            muted={false}
          />
        </div>
      </main>
    </div>
  );
}
