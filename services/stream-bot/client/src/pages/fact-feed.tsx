import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Lightbulb, Bot, Sparkles, Clock, ArrowUp, ArrowDown, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface PublicFact {
  id: string;
  content: string;
  source: string;
  tags: string[];
  createdAt: string;
}

interface PublicFactsResponse {
  success: boolean;
  facts: PublicFact[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  availableTags: string[];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

function getSourceIcon(source: string) {
  switch (source) {
    case "openai":
      return <Sparkles className="h-3 w-3" />;
    case "stream-bot":
      return <Bot className="h-3 w-3" />;
    default:
      return <Lightbulb className="h-3 w-3" />;
  }
}

function getSourceColor(source: string) {
  switch (source) {
    case "openai":
      return "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "stream-bot":
      return "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30";
    default:
      return "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
  }
}

export default function FactFeed() {
  const [facts, setFacts] = useState<PublicFact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });

  const fetchFacts = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        sort: sortOrder,
      });
      
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      
      if (tagFilter && tagFilter !== "all") {
        params.append("tag", tagFilter);
      }

      const response = await fetch(`/api/facts/public?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch facts");
      }

      const data: PublicFactsResponse = await response.json();
      
      if (data.success) {
        setFacts(data.facts);
        setPagination(data.pagination);
        setAvailableTags(data.availableTags);
      } else {
        throw new Error("Failed to load facts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFacts();
  }, [pagination.offset, sortOrder, searchQuery, tagFilter]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleTagChange = (value: string) => {
    setTagFilter(value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleSortChange = (value: "newest" | "oldest") => {
    setSortOrder(value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const goToPage = (newOffset: number) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2 sm:space-y-3">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 border border-yellow-500/30">
              <Lightbulb className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-yellow-500 via-orange-500 to-pink-500 bg-clip-text text-transparent">
              Fact Feed
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
            Discover AI-generated facts from our community. New facts are added every day!
          </p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search facts..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9 bg-background/50"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={tagFilter} onValueChange={handleTagChange}>
                  <SelectTrigger className="w-[130px] sm:w-[150px] bg-background/50">
                    <SelectValue placeholder="All Tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[120px] sm:w-[140px] bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">
                      <span className="flex items-center gap-1.5">
                        <ArrowDown className="h-3 w-3" /> Newest
                      </span>
                    </SelectItem>
                    <SelectItem value="oldest">
                      <span className="flex items-center gap-1.5">
                        <ArrowUp className="h-3 w-3" /> Oldest
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fetchFacts()}
                  disabled={isLoading}
                  className="bg-background/50"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-4 text-center text-destructive">
              <p>{error}</p>
              <Button variant="outline" onClick={() => fetchFacts()} className="mt-2">
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-border/50 bg-card/50">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : facts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {facts.map((fact) => (
                <Card
                  key={fact.id}
                  className="border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 group"
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <Badge
                        variant="outline"
                        className={`flex items-center gap-1 text-xs ${getSourceColor(fact.source)}`}
                      >
                        {getSourceIcon(fact.source)}
                        <span className="capitalize">{fact.source}</span>
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(fact.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-foreground/90 group-hover:text-foreground transition-colors">
                      {fact.content}
                    </p>
                    {fact.tags && fact.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
                        {(fact.tags as string[]).slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-secondary/50 hover:bg-secondary cursor-pointer"
                            onClick={() => handleTagChange(tag)}
                          >
                            #{tag}
                          </Badge>
                        ))}
                        {fact.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-secondary/50">
                            +{fact.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {pagination.offset + 1} to {Math.min(pagination.offset + facts.length, pagination.total)} of {pagination.total} facts
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(pagination.offset - pagination.limit)}
                    disabled={pagination.offset === 0}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{currentPage}</span>
                    <span>/</span>
                    <span>{totalPages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(pagination.offset + pagination.limit)}
                    disabled={!pagination.hasMore}
                    className="gap-1"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-12 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-muted/50">
                  <Lightbulb className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">No facts found</p>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery || tagFilter !== "all"
                      ? "Try adjusting your search or filters"
                      : "Facts will appear here as they are generated"}
                  </p>
                </div>
                {(searchQuery || tagFilter !== "all") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setTagFilter("all");
                    }}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
