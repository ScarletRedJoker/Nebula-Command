"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Lightbulb,
  Sparkles,
  Wand2,
  RefreshCw,
  Save,
  Send,
  Star,
  StarOff,
  Trash2,
  Copy,
  Download,
  Upload,
  GripVertical,
  Palette,
  Image as ImageIcon,
  FileText,
  Clock,
  History,
  Share2,
  Combine,
  Expand,
  Target,
  Users,
  Eye,
  Layers,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  Filter,
  Zap,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Idea {
  id: string;
  content: string;
  expanded?: string;
  starred: boolean;
  createdAt: Date;
  color?: string;
  position?: { x: number; y: number };
  onMoodboard?: boolean;
}

interface ConceptBreakdown {
  title: string;
  tagline: string;
  description: string;
  keyFeatures: string[];
  visualStyle: string;
  targetAudience: string;
  similarExamples: string[];
}

interface IdeationSession {
  id: string;
  name: string;
  type: "canvas" | "brainstorm" | "concept";
  createdAt: Date;
  ideas: Idea[];
  canvasContent?: string;
  concept?: ConceptBreakdown;
  moodboard?: Idea[];
}

type IdeaFilter = "all" | "favorites" | "recent";

const IDEA_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

export default function IdeationPage() {
  const [activeTab, setActiveTab] = useState<"canvas" | "brainstorm" | "concept" | "moodboard">("canvas");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  
  const [canvasContent, setCanvasContent] = useState("");
  const [expandedContent, setExpandedContent] = useState("");
  const [canvasProcessing, setCanvasProcessing] = useState<"expand" | "refine" | "variations" | null>(null);
  
  const [brainstormTopic, setBrainstormTopic] = useState("");
  const [ideaCount, setIdeaCount] = useState(5);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>("all");
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [expandingIdeaId, setExpandingIdeaId] = useState<string | null>(null);
  const [combineMode, setCombineMode] = useState(false);
  const [selectedForCombine, setSelectedForCombine] = useState<string[]>([]);
  
  const [moodboardIdeas, setMoodboardIdeas] = useState<Idea[]>([]);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [colorPalette, setColorPalette] = useState<string[]>([]);
  
  const [conceptInput, setConceptInput] = useState("");
  const [conceptBreakdown, setConceptBreakdown] = useState<ConceptBreakdown | null>(null);
  const [generatingConcept, setGeneratingConcept] = useState(false);
  
  const [sessions, setSessions] = useState<IdeationSession[]>([]);
  const [currentSessionName, setCurrentSessionName] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  
  const moodboardRef = useRef<HTMLDivElement>(null);
  const draggedIdeaRef = useRef<Idea | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = () => {
    try {
      const saved = localStorage.getItem("ideation-sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSessions(parsed.map((s: IdeationSession) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          ideas: s.ideas?.map((i: Idea) => ({ ...i, createdAt: new Date(i.createdAt) })) || [],
        })));
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  const saveSession = () => {
    if (!currentSessionName.trim()) {
      toast.error("Please enter a session name");
      return;
    }

    const newSession: IdeationSession = {
      id: `session-${Date.now()}`,
      name: currentSessionName,
      type: activeTab === "moodboard" ? "brainstorm" : activeTab,
      createdAt: new Date(),
      ideas: ideas,
      canvasContent: activeTab === "canvas" ? canvasContent : undefined,
      concept: activeTab === "concept" ? conceptBreakdown || undefined : undefined,
      moodboard: moodboardIdeas,
    };

    const updatedSessions = [newSession, ...sessions].slice(0, 20);
    setSessions(updatedSessions);
    localStorage.setItem("ideation-sessions", JSON.stringify(updatedSessions));
    setSaveDialogOpen(false);
    setCurrentSessionName("");
    toast.success("Session saved!");
  };

  const loadSession = (session: IdeationSession) => {
    setIdeas(session.ideas || []);
    if (session.canvasContent) setCanvasContent(session.canvasContent);
    if (session.concept) setConceptBreakdown(session.concept);
    if (session.moodboard) setMoodboardIdeas(session.moodboard);
    setActiveTab(session.type === "brainstorm" ? "brainstorm" : session.type);
    toast.success(`Loaded session: ${session.name}`);
  };

  const deleteSession = (sessionId: string) => {
    const updatedSessions = sessions.filter((s) => s.id !== sessionId);
    setSessions(updatedSessions);
    localStorage.setItem("ideation-sessions", JSON.stringify(updatedSessions));
    toast.success("Session deleted");
  };

  const callAI = async (prompt: string, systemPrompt?: string): Promise<string> => {
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history: systemPrompt ? [{ role: "system", content: systemPrompt }] : [],
          provider: "auto",
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const data = await response.json();
      return data.content || data.message || "";
    } catch (error) {
      console.error("AI call failed:", error);
      throw error;
    }
  };

  const handleCanvasExpand = async () => {
    if (!canvasContent.trim()) {
      toast.error("Please enter some content first");
      return;
    }

    setCanvasProcessing("expand");
    try {
      const result = await callAI(
        `Take these rough notes/ideas and expand them into well-structured, detailed concepts. Organize the thoughts, add depth, and present them clearly with headings and bullet points where appropriate:\n\n${canvasContent}`,
        "You are a creative ideation assistant. Expand rough ideas into structured, detailed concepts while maintaining the original intent."
      );
      setExpandedContent(result);
      toast.success("Ideas expanded!");
    } catch {
      toast.error("Failed to expand ideas");
    } finally {
      setCanvasProcessing(null);
    }
  };

  const handleCanvasRefine = async () => {
    const contentToRefine = expandedContent || canvasContent;
    if (!contentToRefine.trim()) {
      toast.error("Please enter some content first");
      return;
    }

    setCanvasProcessing("refine");
    try {
      const result = await callAI(
        `Refine and improve these ideas. Make them clearer, more compelling, and better articulated. Fix any issues and enhance the overall quality:\n\n${contentToRefine}`,
        "You are a creative editor. Refine ideas to make them clearer, more compelling, and professional."
      );
      setExpandedContent(result);
      toast.success("Ideas refined!");
    } catch {
      toast.error("Failed to refine ideas");
    } finally {
      setCanvasProcessing(null);
    }
  };

  const handleCanvasVariations = async () => {
    const contentToVary = expandedContent || canvasContent;
    if (!contentToVary.trim()) {
      toast.error("Please enter some content first");
      return;
    }

    setCanvasProcessing("variations");
    try {
      const result = await callAI(
        `Generate 3-5 alternative variations or approaches based on these ideas. Each variation should offer a different perspective, angle, or creative direction:\n\n${contentToVary}`,
        "You are a creative brainstorming assistant. Generate diverse alternative approaches while staying true to the core concept."
      );
      setExpandedContent(result);
      toast.success("Variations generated!");
    } catch {
      toast.error("Failed to generate variations");
    } finally {
      setCanvasProcessing(null);
    }
  };

  const handleGenerateIdeas = async () => {
    if (!brainstormTopic.trim()) {
      toast.error("Please enter a topic first");
      return;
    }

    setGeneratingIdeas(true);
    try {
      const result = await callAI(
        `Generate exactly ${ideaCount} creative and diverse ideas for the following topic/theme. Format each idea on its own line, numbered 1-${ideaCount}. Be creative, think outside the box, and provide a mix of practical and innovative suggestions:\n\nTopic: ${brainstormTopic}`,
        "You are a creative brainstorming expert. Generate diverse, innovative ideas that explore different angles and approaches."
      );

      const newIdeas: Idea[] = result
        .split("\n")
        .filter((line) => line.trim() && /^\d+[\.\)]/.test(line.trim()))
        .slice(0, ideaCount)
        .map((line, index) => ({
          id: `idea-${Date.now()}-${index}`,
          content: line.replace(/^\d+[\.\)]\s*/, "").trim(),
          starred: false,
          createdAt: new Date(),
          color: IDEA_COLORS[index % IDEA_COLORS.length],
        }));

      setIdeas((prev) => [...newIdeas, ...prev]);
      toast.success(`Generated ${newIdeas.length} ideas!`);
    } catch {
      toast.error("Failed to generate ideas");
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const handleExpandIdea = async (idea: Idea) => {
    setExpandingIdeaId(idea.id);
    try {
      const result = await callAI(
        `Expand this idea into more detail. Provide context, potential applications, implementation considerations, and related concepts:\n\n${idea.content}`,
        "You are a creative ideation assistant. Expand ideas with depth and actionable details."
      );
      setIdeas((prev) =>
        prev.map((i) => (i.id === idea.id ? { ...i, expanded: result } : i))
      );
      toast.success("Idea expanded!");
    } catch {
      toast.error("Failed to expand idea");
    } finally {
      setExpandingIdeaId(null);
    }
  };

  const handleCombineIdeas = async () => {
    if (selectedForCombine.length < 2) {
      toast.error("Select at least 2 ideas to combine");
      return;
    }

    const selectedIdeas = ideas.filter((i) => selectedForCombine.includes(i.id));
    setGeneratingIdeas(true);
    try {
      const result = await callAI(
        `Combine and synthesize these ideas into one cohesive, innovative concept:\n\n${selectedIdeas.map((i, idx) => `${idx + 1}. ${i.content}`).join("\n")}`,
        "You are a creative synthesis expert. Combine multiple ideas into unified, innovative concepts."
      );

      const combinedIdea: Idea = {
        id: `idea-${Date.now()}`,
        content: result.trim(),
        starred: false,
        createdAt: new Date(),
        color: IDEA_COLORS[Math.floor(Math.random() * IDEA_COLORS.length)],
      };

      setIdeas((prev) => [combinedIdea, ...prev]);
      setCombineMode(false);
      setSelectedForCombine([]);
      toast.success("Ideas combined!");
    } catch {
      toast.error("Failed to combine ideas");
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const toggleStarIdea = (ideaId: string) => {
    setIdeas((prev) =>
      prev.map((i) => (i.id === ideaId ? { ...i, starred: !i.starred } : i))
    );
  };

  const deleteIdea = (ideaId: string) => {
    setIdeas((prev) => prev.filter((i) => i.id !== ideaId));
    setMoodboardIdeas((prev) => prev.filter((i) => i.id !== ideaId));
  };

  const copyIdea = (idea: Idea) => {
    navigator.clipboard.writeText(idea.expanded || idea.content);
    toast.success("Copied to clipboard!");
  };

  const addToMoodboard = (idea: Idea) => {
    if (moodboardIdeas.find((i) => i.id === idea.id)) {
      toast.error("Already on moodboard");
      return;
    }
    const positionedIdea = {
      ...idea,
      onMoodboard: true,
      position: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 200 + 50,
      },
    };
    setMoodboardIdeas((prev) => [...prev, positionedIdea]);
    toast.success("Added to moodboard!");
  };

  const handleGenerateImageSuggestion = async (idea: Idea) => {
    setGeneratingImage(idea.id);
    try {
      const result = await callAI(
        `Based on this idea, suggest a visual representation. Describe what an ideal image or illustration would look like to represent this concept:\n\n${idea.content}`,
        "You are a visual design consultant. Suggest compelling visual representations for concepts."
      );
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === idea.id
            ? { ...i, expanded: (i.expanded || "") + "\n\n**Visual Suggestion:**\n" + result }
            : i
        )
      );
      toast.success("Image suggestion generated!");
    } catch {
      toast.error("Failed to generate image suggestion");
    } finally {
      setGeneratingImage(null);
    }
  };

  const handleGenerateConcept = async () => {
    if (!conceptInput.trim()) {
      toast.error("Please enter a brief description or keywords");
      return;
    }

    setGeneratingConcept(true);
    try {
      const result = await callAI(
        `Generate a complete concept breakdown for the following brief/keywords. Respond in this exact JSON format:
{
  "title": "A compelling title for the concept",
  "tagline": "A catchy one-line tagline",
  "description": "2-3 sentences describing the concept",
  "keyFeatures": ["feature1", "feature2", "feature3", "feature4"],
  "visualStyle": "Description of the visual style and aesthetics",
  "targetAudience": "Who this is for",
  "similarExamples": ["example1", "example2", "example3"]
}

Brief/Keywords: ${conceptInput}`,
        "You are a concept development expert. Create comprehensive concept breakdowns. Always respond with valid JSON."
      );

      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setConceptBreakdown(parsed);
          toast.success("Concept generated!");
        } else {
          throw new Error("No JSON found");
        }
      } catch {
        toast.error("Failed to parse concept - try again");
      }
    } catch {
      toast.error("Failed to generate concept");
    } finally {
      setGeneratingConcept(false);
    }
  };

  const extractColorPalette = () => {
    const colors = moodboardIdeas
      .map((i) => i.color)
      .filter((c): c is string => !!c);
    const uniqueColors = [...new Set(colors)];
    setColorPalette(uniqueColors);
    toast.success("Color palette extracted!");
  };

  const handleDragStart = (e: React.DragEvent, idea: Idea) => {
    draggedIdeaRef.current = idea;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropOnMoodboard = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdeaRef.current && moodboardRef.current) {
      const rect = moodboardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!moodboardIdeas.find((i) => i.id === draggedIdeaRef.current?.id)) {
        const newIdea = {
          ...draggedIdeaRef.current,
          onMoodboard: true,
          position: { x, y },
        };
        setMoodboardIdeas((prev) => [...prev, newIdea]);
        toast.success("Added to moodboard!");
      } else {
        setMoodboardIdeas((prev) =>
          prev.map((i) =>
            i.id === draggedIdeaRef.current?.id ? { ...i, position: { x, y } } : i
          )
        );
      }
    }
    draggedIdeaRef.current = null;
  };

  const filteredIdeas = ideas.filter((idea) => {
    if (ideaFilter === "favorites") return idea.starred;
    if (ideaFilter === "recent") {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return idea.createdAt > oneHourAgo;
    }
    return true;
  });

  const exportMoodboard = async (format: "png" | "json") => {
    if (format === "json") {
      const data = JSON.stringify({ ideas: moodboardIdeas, palette: colorPalette }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moodboard-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Moodboard exported as JSON!");
    } else {
      toast.info("PNG export requires html2canvas - exporting as JSON instead");
      exportMoodboard("json");
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Lightbulb className="h-7 w-7 text-yellow-500" />
              Creative Ideation
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered brainstorming and concept generation
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDialogOpen(true)}
            >
              <Save className="h-4 w-4 mr-1" />
              Save Session
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-4 h-auto">
            <TabsTrigger value="canvas" className="flex items-center gap-1 text-xs">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Idea Canvas</span>
            </TabsTrigger>
            <TabsTrigger value="brainstorm" className="flex items-center gap-1 text-xs">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Brainstorm</span>
            </TabsTrigger>
            <TabsTrigger value="moodboard" className="flex items-center gap-1 text-xs">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Moodboard</span>
            </TabsTrigger>
            <TabsTrigger value="concept" className="flex items-center gap-1 text-xs">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Concept Gen</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="canvas" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Idea Canvas
                </CardTitle>
                <CardDescription>
                  Brain dump your thoughts, then let AI help structure and expand them
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Raw Ideas & Notes</Label>
                  <Textarea
                    placeholder="Dump your rough ideas, thoughts, fragments here... AI will help structure them"
                    className="min-h-[200px] mt-2"
                    value={canvasContent}
                    onChange={(e) => setCanvasContent(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleCanvasExpand}
                    disabled={canvasProcessing !== null}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {canvasProcessing === "expand" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Expand className="h-4 w-4 mr-2" />
                    )}
                    Expand
                  </Button>
                  <Button
                    onClick={handleCanvasRefine}
                    disabled={canvasProcessing !== null}
                    variant="secondary"
                  >
                    {canvasProcessing === "refine" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Refine
                  </Button>
                  <Button
                    onClick={handleCanvasVariations}
                    disabled={canvasProcessing !== null}
                    variant="outline"
                  >
                    {canvasProcessing === "variations" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Variations
                  </Button>
                </div>

                {expandedContent && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Label>AI Output</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(expandedContent);
                          toast.success("Copied!");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 prose prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm font-sans">{expandedContent}</pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="brainstorm" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Brainstorm Mode
                </CardTitle>
                <CardDescription>
                  Generate multiple ideas on any topic, then star, combine, or expand them
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Topic / Theme</Label>
                    <Input
                      placeholder="e.g., Mobile app for pet owners..."
                      value={brainstormTopic}
                      onChange={(e) => setBrainstormTopic(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Number of Ideas: {ideaCount}</Label>
                    <Slider
                      value={[ideaCount]}
                      onValueChange={([v]) => setIdeaCount(v)}
                      min={1}
                      max={20}
                      step={1}
                      className="mt-4"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleGenerateIdeas}
                    disabled={generatingIdeas}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    {generatingIdeas ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate Ideas
                  </Button>

                  {ideas.length > 1 && (
                    <Button
                      variant={combineMode ? "default" : "outline"}
                      onClick={() => {
                        if (combineMode && selectedForCombine.length >= 2) {
                          handleCombineIdeas();
                        } else {
                          setCombineMode(!combineMode);
                          setSelectedForCombine([]);
                        }
                      }}
                      disabled={generatingIdeas}
                    >
                      <Combine className="h-4 w-4 mr-2" />
                      {combineMode
                        ? selectedForCombine.length >= 2
                          ? "Combine Selected"
                          : `Select ${2 - selectedForCombine.length} more`
                        : "Combine Ideas"}
                    </Button>
                  )}
                </div>

                {combineMode && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm">
                    Click on ideas to select them for combining. Select at least 2 ideas.
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() => {
                        setCombineMode(false);
                        setSelectedForCombine([]);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {ideas.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Generated Ideas ({filteredIdeas.length})</CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={ideaFilter} onValueChange={(v) => setIdeaFilter(v as IdeaFilter)}>
                        <SelectTrigger className="w-[120px] h-8">
                          <Filter className="h-3 w-3 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="favorites">Favorites</SelectItem>
                          <SelectItem value="recent">Recent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {filteredIdeas.map((idea) => (
                        <div
                          key={idea.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, idea)}
                          className={`relative border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing ${
                            combineMode && selectedForCombine.includes(idea.id)
                              ? "ring-2 ring-blue-500"
                              : ""
                          }`}
                          onClick={() => {
                            if (combineMode) {
                              setSelectedForCombine((prev) =>
                                prev.includes(idea.id)
                                  ? prev.filter((id) => id !== idea.id)
                                  : [...prev, idea.id]
                              );
                            }
                          }}
                          style={{ borderLeftColor: idea.color, borderLeftWidth: 4 }}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{idea.content}</p>
                              {idea.expanded && (
                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                    <ChevronRight className="h-3 w-3" />
                                    View expanded details
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 pl-4 border-l-2 border-muted">
                                    <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{idea.expanded}</pre>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStarIdea(idea.id);
                                }}
                              >
                                {idea.starred ? (
                                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                ) : (
                                  <StarOff className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExpandIdea(idea);
                                    }}
                                    disabled={expandingIdeaId === idea.id}
                                  >
                                    {expandingIdeaId === idea.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Expand className="h-4 w-4 mr-2" />
                                    )}
                                    Expand with AI
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleGenerateImageSuggestion(idea);
                                    }}
                                    disabled={generatingImage === idea.id}
                                  >
                                    {generatingImage === idea.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <ImageIcon className="h-4 w-4 mr-2" />
                                    )}
                                    Image Suggestion
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addToMoodboard(idea);
                                    }}
                                  >
                                    <Layers className="h-4 w-4 mr-2" />
                                    Add to Moodboard
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyIdea(idea);
                                    }}
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteIdea(idea.id);
                                    }}
                                    className="text-red-500"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="moodboard" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers className="h-5 w-5 text-purple-500" />
                      Moodboard Builder
                    </CardTitle>
                    <CardDescription>
                      Drag ideas from Brainstorm mode to arrange them visually
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={extractColorPalette}>
                      <Palette className="h-4 w-4 mr-1" />
                      Extract Palette
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => exportMoodboard("json")}>
                          Export as JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportMoodboard("png")}>
                          Export as PNG
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {colorPalette.length > 0 && (
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Color Palette:</span>
                    <div className="flex gap-1">
                      {colorPalette.map((color, idx) => (
                        <div
                          key={idx}
                          className="w-8 h-8 rounded-md border cursor-pointer hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                          title={color}
                          onClick={() => {
                            navigator.clipboard.writeText(color);
                            toast.success(`Copied ${color}`);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div
                  ref={moodboardRef}
                  className="relative min-h-[500px] border-2 border-dashed border-muted rounded-lg bg-muted/20 overflow-hidden"
                  onDragOver={handleDragOver}
                  onDrop={handleDropOnMoodboard}
                >
                  {moodboardIdeas.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Drag ideas here from Brainstorm mode</p>
                        <p className="text-sm">or generate ideas first</p>
                      </div>
                    </div>
                  ) : (
                    moodboardIdeas.map((idea) => (
                      <div
                        key={idea.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idea)}
                        className="absolute p-3 bg-card border rounded-lg shadow-lg cursor-move max-w-[250px] hover:shadow-xl transition-shadow"
                        style={{
                          left: idea.position?.x || 50,
                          top: idea.position?.y || 50,
                          borderLeftColor: idea.color,
                          borderLeftWidth: 4,
                        }}
                      >
                        <p className="text-sm">{idea.content.substring(0, 100)}...</p>
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setMoodboardIdeas((prev) => prev.filter((i) => i.id !== idea.id));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="concept" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  Concept Generator
                </CardTitle>
                <CardDescription>
                  Turn a brief description into a complete concept breakdown
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Brief Description or Keywords</Label>
                  <Textarea
                    placeholder="e.g., A sustainable fashion marketplace for Gen Z consumers..."
                    className="min-h-[100px] mt-2"
                    value={conceptInput}
                    onChange={(e) => setConceptInput(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleGenerateConcept}
                  disabled={generatingConcept}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {generatingConcept ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" />
                  )}
                  Generate Concept
                </Button>

                {conceptBreakdown && (
                  <div className="mt-6 space-y-4">
                    <div className="border rounded-lg p-6 bg-gradient-to-br from-green-500/5 to-blue-500/5">
                      <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold">{conceptBreakdown.title}</h2>
                        <p className="text-muted-foreground italic mt-1">"{conceptBreakdown.tagline}"</p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="font-semibold flex items-center gap-2 mb-2">
                            <BookOpen className="h-4 w-4 text-blue-500" />
                            Description
                          </h3>
                          <p className="text-sm text-muted-foreground">{conceptBreakdown.description}</p>
                        </div>

                        <div>
                          <h3 className="font-semibold flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                            Key Features
                          </h3>
                          <ul className="space-y-1">
                            {conceptBreakdown.keyFeatures.map((feature, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h3 className="font-semibold flex items-center gap-2 mb-2">
                            <Eye className="h-4 w-4 text-purple-500" />
                            Visual Style
                          </h3>
                          <p className="text-sm text-muted-foreground">{conceptBreakdown.visualStyle}</p>
                        </div>

                        <div>
                          <h3 className="font-semibold flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-orange-500" />
                            Target Audience
                          </h3>
                          <p className="text-sm text-muted-foreground">{conceptBreakdown.targetAudience}</p>
                        </div>
                      </div>

                      <div className="mt-6">
                        <h3 className="font-semibold flex items-center gap-2 mb-2">
                          <Layers className="h-4 w-4 text-cyan-500" />
                          Similar Examples
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {conceptBreakdown.similarExamples.map((example, idx) => (
                            <Badge key={idx} variant="secondary">
                              {example}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(conceptBreakdown, null, 2));
                          toast.success("Copied concept as JSON!");
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy JSON
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const text = `# ${conceptBreakdown.title}\n\n*${conceptBreakdown.tagline}*\n\n## Description\n${conceptBreakdown.description}\n\n## Key Features\n${conceptBreakdown.keyFeatures.map((f) => `- ${f}`).join("\n")}\n\n## Visual Style\n${conceptBreakdown.visualStyle}\n\n## Target Audience\n${conceptBreakdown.targetAudience}\n\n## Similar Examples\n${conceptBreakdown.similarExamples.join(", ")}`;
                          navigator.clipboard.writeText(text);
                          toast.success("Copied as Markdown!");
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Copy Markdown
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showHistory && (
        <div className="w-80 border-l bg-muted/30 p-4 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              Session History
            </h2>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No saved sessions yet</p>
              <p className="text-xs mt-1">Save your work to see it here</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-2 pr-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-lg p-3 bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{session.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {session.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {session.ideas?.length || 0} ideas
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => loadSession(session)}>
                            <Upload className="h-4 w-4 mr-2" />
                            Load Session
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(session, null, 2));
                              toast.success("Session copied to clipboard!");
                            }}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share (Copy JSON)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteSession(session.id)}
                            className="text-red-500"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Ideation Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Session Name</Label>
              <Input
                placeholder="e.g., Mobile App Brainstorm"
                value={currentSessionName}
                onChange={(e) => setCurrentSessionName(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>This will save:</p>
              <ul className="list-disc list-inside mt-1">
                <li>{ideas.length} brainstorm ideas</li>
                <li>{moodboardIdeas.length} moodboard items</li>
                {canvasContent && <li>Canvas content</li>}
                {conceptBreakdown && <li>Generated concept</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSession}>
              <Save className="h-4 w-4 mr-2" />
              Save Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
