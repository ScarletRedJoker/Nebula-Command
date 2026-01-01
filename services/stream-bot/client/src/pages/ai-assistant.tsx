import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Copy, RefreshCw, Wand2, Hash, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GeneratedContent {
  success: boolean;
  content: string;
  alternatives?: string[];
  error?: string;
}

export default function AIAssistantPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);

  const [titleForm, setTitleForm] = useState({
    platform: "twitch",
    gameOrCategory: "",
    tone: "casual",
    context: ""
  });

  const [descForm, setDescForm] = useState({
    platform: "youtube",
    gameOrCategory: "",
    tone: "professional",
    existingContent: ""
  });

  const [socialForm, setSocialForm] = useState({
    platform: "twitter",
    gameOrCategory: "",
    tone: "hype",
    existingContent: ""
  });

  const [hashtagForm, setHashtagForm] = useState({
    content: "",
    platform: "twitter",
    count: 5
  });

  const [ideaForm, setIdeaForm] = useState({
    category: "",
    audience: "",
    pastStreams: ""
  });

  const generateContent = async (type: string, data: any) => {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, ...data })
      });
      const result = await response.json();
      setGeneratedContent(result);
      if (!result.success) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateHashtags = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(hashtagForm)
      });
      const result = await response.json();
      if (result.success) {
        setGeneratedContent({ success: true, content: result.hashtags.join(" ") });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateIdeas = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/stream-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: ideaForm.category,
          audience: ideaForm.audience,
          pastStreams: ideaForm.pastStreams ? ideaForm.pastStreams.split(",").map(s => s.trim()) : []
        })
      });
      const result = await response.json();
      if (result.success) {
        setGeneratedContent({ success: true, content: result.ideas.join("\n\n") });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Content copied to clipboard" });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-purple-500" />
          AI Content Assistant
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate stream titles, descriptions, social posts, and more with AI
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generate Content</CardTitle>
            <CardDescription>Choose what type of content you want to create</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="title">
              <TabsList className="grid grid-cols-5 mb-4">
                <TabsTrigger value="title">Title</TabsTrigger>
                <TabsTrigger value="desc">Desc</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
                <TabsTrigger value="hashtags">Tags</TabsTrigger>
                <TabsTrigger value="ideas">Ideas</TabsTrigger>
              </TabsList>

              <TabsContent value="title" className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={titleForm.platform} onValueChange={(v) => setTitleForm(f => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="kick">Kick</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Game/Category</Label>
                  <Input
                    placeholder="e.g., Valorant, Just Chatting, Minecraft"
                    value={titleForm.gameOrCategory}
                    onChange={(e) => setTitleForm(f => ({ ...f, gameOrCategory: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select value={titleForm.tone} onValueChange={(v) => setTitleForm(f => ({ ...f, tone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="hype">Hype</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="funny">Funny</SelectItem>
                      <SelectItem value="chill">Chill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Context (optional)</Label>
                  <Input
                    placeholder="e.g., ranked grind, collab with friends, chill vibes"
                    value={titleForm.context}
                    onChange={(e) => setTitleForm(f => ({ ...f, context: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => generateContent("title", titleForm)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate Titles
                </Button>
              </TabsContent>

              <TabsContent value="desc" className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={descForm.platform} onValueChange={(v) => setDescForm(f => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="kick">Kick</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Game/Category</Label>
                  <Input
                    placeholder="e.g., Valorant, Tech Reviews"
                    value={descForm.gameOrCategory}
                    onChange={(e) => setDescForm(f => ({ ...f, gameOrCategory: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stream/Video Title</Label>
                  <Input
                    placeholder="Your existing title"
                    value={descForm.existingContent}
                    onChange={(e) => setDescForm(f => ({ ...f, existingContent: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => generateContent("description", descForm)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate Description
                </Button>
              </TabsContent>

              <TabsContent value="social" className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={socialForm.platform} onValueChange={(v) => setSocialForm(f => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twitter">Twitter/X</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="discord">Discord</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>What are you streaming?</Label>
                  <Input
                    placeholder="e.g., Valorant ranked grind"
                    value={socialForm.gameOrCategory}
                    onChange={(e) => setSocialForm(f => ({ ...f, gameOrCategory: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select value={socialForm.tone} onValueChange={(v) => setSocialForm(f => ({ ...f, tone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hype">Hype</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="funny">Funny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => generateContent("social_post", socialForm)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate Post
                </Button>
              </TabsContent>

              <TabsContent value="hashtags" className="space-y-4">
                <div className="space-y-2">
                  <Label>Content to tag</Label>
                  <Textarea
                    placeholder="Paste your stream title or description"
                    value={hashtagForm.content}
                    onChange={(e) => setHashtagForm(f => ({ ...f, content: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={hashtagForm.platform} onValueChange={(v) => setHashtagForm(f => ({ ...f, platform: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="twitter">Twitter</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Count</Label>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      value={hashtagForm.count}
                      onChange={(e) => setHashtagForm(f => ({ ...f, count: parseInt(e.target.value) || 5 }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={generateHashtags}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hash className="mr-2 h-4 w-4" />}
                  Generate Hashtags
                </Button>
              </TabsContent>

              <TabsContent value="ideas" className="space-y-4">
                <div className="space-y-2">
                  <Label>Your Category/Niche</Label>
                  <Input
                    placeholder="e.g., FPS games, coding, music production"
                    value={ideaForm.category}
                    onChange={(e) => setIdeaForm(f => ({ ...f, category: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Audience (optional)</Label>
                  <Input
                    placeholder="e.g., competitive gamers, beginners, tech enthusiasts"
                    value={ideaForm.audience}
                    onChange={(e) => setIdeaForm(f => ({ ...f, audience: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recent Streams (optional, comma-separated)</Label>
                  <Input
                    placeholder="e.g., Valorant ranked, Minecraft survival"
                    value={ideaForm.pastStreams}
                    onChange={(e) => setIdeaForm(f => ({ ...f, pastStreams: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={generateIdeas}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
                  Get Stream Ideas
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Generated Content
              {generatedContent?.success && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.content)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGeneratedContent(null)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardTitle>
            <CardDescription>Your AI-generated content will appear here</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : generatedContent?.success ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap">
                  {generatedContent.content}
                </div>
                {generatedContent.alternatives && generatedContent.alternatives.length > 0 && (
                  <div className="space-y-2">
                    <Label>Alternative Options:</Label>
                    {generatedContent.alternatives.map((alt, i) => (
                      <div
                        key={i}
                        className="bg-muted/50 p-3 rounded-lg flex items-center justify-between group cursor-pointer hover:bg-muted"
                        onClick={() => copyToClipboard(alt)}
                      >
                        <span>{alt}</span>
                        <Copy className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Fill out the form and click generate to create content</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
