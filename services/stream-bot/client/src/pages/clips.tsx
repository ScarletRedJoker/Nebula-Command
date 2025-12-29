import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, 
  Star, 
  Trash2, 
  RefreshCw, 
  Eye, 
  Clock, 
  Filter,
  ArrowUpDown,
  ExternalLink,
  Loader2 
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface StreamClip {
  id: string;
  userId: string;
  platform: string;
  clipId: string;
  title: string;
  url: string;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  duration: number;
  viewCount: number;
  gameId: string | null;
  gameName: string | null;
  broadcasterName: string | null;
  broadcasterId: string | null;
  isHighlight: boolean;
  clipCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ClipsResponse {
  clips: StreamClip[];
  total: number;
  limit: number;
  offset: number;
}

interface FetchResponse {
  success: boolean;
  message: string;
  inserted: number;
  updated: number;
  total: number;
}

export default function Clips() {
  const { toast } = useToast();
  const [selectedClip, setSelectedClip] = useState<StreamClip | null>(null);
  const [clipToDelete, setClipToDelete] = useState<StreamClip | null>(null);
  const [platform, setPlatform] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [showHighlightsOnly, setShowHighlightsOnly] = useState(false);

  const { data: clipsData, isLoading, refetch } = useQuery<ClipsResponse>({
    queryKey: ["/api/clips", { platform, sortBy, sortOrder, showHighlightsOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platform !== "all") params.append("platform", platform);
      if (sortBy === "views") params.append("sort", "views");
      params.append("order", sortOrder);
      if (showHighlightsOnly) params.append("highlights", "true");
      const res = await fetch(`/api/clips?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clips");
      return res.json();
    },
  });

  const fetchMutation = useMutation({
    mutationFn: async (platformName: string) => {
      const res = await apiRequest("POST", "/api/clips/fetch", { platform: platformName });
      return res.json() as Promise<FetchResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clips"] });
      toast({
        title: "Clips synced",
        description: `${data.inserted} new clips, ${data.updated} updated`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to fetch clips from platform",
        variant: "destructive",
      });
    },
  });

  const highlightMutation = useMutation({
    mutationFn: async ({ id, isHighlight }: { id: string; isHighlight: boolean }) => {
      const res = await apiRequest("POST", `/api/clips/${id}/highlight`, { isHighlight });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clips"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update highlight",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/clips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clips"] });
      setClipToDelete(null);
      toast({
        title: "Clip deleted",
        description: "The clip has been removed from your library",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete clip",
        variant: "destructive",
      });
    },
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case "twitch":
        return "bg-purple-500";
      case "youtube":
        return "bg-red-500";
      case "kick":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const clips = clipsData?.clips || [];
  const highlightCount = clips.filter(c => c.isHighlight).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stream Clips</h1>
          <p className="text-muted-foreground">
            Manage and highlight your stream moments
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => fetchMutation.mutate("twitch")}
            disabled={fetchMutation.isPending}
          >
            {fetchMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Twitch Clips
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Clips</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clipsData?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highlightCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clips.reduce((sum, c) => sum + c.viewCount, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1">
              {Array.from(new Set(clips.map(c => c.platform))).map(p => (
                <Badge key={p} className={getPlatformColor(p)}>
                  {p}
                </Badge>
              ))}
              {clips.length === 0 && <span className="text-muted-foreground">None</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Your Clips</CardTitle>
              <CardDescription>
                Click on a clip to preview, star to highlight
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="twitch">Twitch</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="kick">Kick</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[120px]">
                  <ArrowUpDown className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="views">Views</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={sortOrder === "desc" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              >
                {sortOrder === "desc" ? "Newest" : "Oldest"}
              </Button>

              <Button
                variant={showHighlightsOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHighlightsOnly(!showHighlightsOnly)}
              >
                <Star className={`mr-2 h-4 w-4 ${showHighlightsOnly ? "fill-current" : ""}`} />
                Highlights
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : clips.length === 0 ? (
            <div className="text-center py-12">
              <Play className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No clips yet</h3>
              <p className="text-muted-foreground">
                Click "Sync Twitch Clips" to import your clips from Twitch
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="group relative rounded-lg border bg-card overflow-hidden hover:border-primary transition-colors"
                >
                  <div
                    className="relative aspect-video cursor-pointer"
                    onClick={() => setSelectedClip(clip)}
                  >
                    {clip.thumbnailUrl ? (
                      <img
                        src={clip.thumbnailUrl}
                        alt={clip.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Play className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="h-12 w-12 text-white" />
                    </div>
                    <Badge className={`absolute top-2 left-2 ${getPlatformColor(clip.platform)}`}>
                      {clip.platform}
                    </Badge>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {formatDuration(clip.duration)}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium line-clamp-2 text-sm mb-2">{clip.title}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {clip.viewCount.toLocaleString()}
                        </span>
                        {clip.clipCreatedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(clip.clipCreatedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            highlightMutation.mutate({ id: clip.id, isHighlight: !clip.isHighlight });
                          }}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              clip.isHighlight
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setClipToDelete(clip);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedClip} onOpenChange={() => setSelectedClip(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedClip?.title}
              {selectedClip?.isHighlight && (
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedClip && (
            <div className="space-y-4">
              <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                {selectedClip.embedUrl ? (
                  <iframe
                    src={`${selectedClip.embedUrl}&parent=${window.location.hostname}`}
                    className="w-full h-full"
                    allowFullScreen
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Button asChild>
                      <a href={selectedClip.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in {selectedClip.platform}
                      </a>
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <Badge className={getPlatformColor(selectedClip.platform)}>
                    {selectedClip.platform}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    {selectedClip.viewCount.toLocaleString()} views
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDuration(selectedClip.duration)}
                  </span>
                  {selectedClip.clipCreatedAt && (
                    <span>
                      {format(new Date(selectedClip.clipCreatedAt), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      highlightMutation.mutate({
                        id: selectedClip.id,
                        isHighlight: !selectedClip.isHighlight,
                      })
                    }
                  >
                    <Star
                      className={`mr-2 h-4 w-4 ${
                        selectedClip.isHighlight
                          ? "fill-yellow-400 text-yellow-400"
                          : ""
                      }`}
                    />
                    {selectedClip.isHighlight ? "Remove Highlight" : "Add to Highlights"}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={selectedClip.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Original
                    </a>
                  </Button>
                </div>
              </div>
              {selectedClip.gameName && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Game: </span>
                  {selectedClip.gameName}
                </div>
              )}
              {selectedClip.broadcasterName && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Channel: </span>
                  {selectedClip.broadcasterName}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!clipToDelete} onOpenChange={() => setClipToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{clipToDelete?.title}" from your library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clipToDelete && deleteMutation.mutate(clipToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
