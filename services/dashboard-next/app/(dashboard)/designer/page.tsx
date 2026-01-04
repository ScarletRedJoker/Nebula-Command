"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Layout,
  Type,
  Image,
  Square,
  Columns,
  MousePointer,
  Save,
  Download,
  Eye,
  Code,
  Trash2,
  Settings,
  Move,
  Plus,
  Loader2,
  Grid3X3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  List,
  Link,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Copy,
  Palette,
} from "lucide-react";

interface ComponentStyle {
  backgroundColor?: string;
  color?: string;
  padding?: string;
  margin?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: string;
  borderRadius?: string;
  border?: string;
  width?: string;
  height?: string;
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
}

interface DesignComponent {
  id: string;
  type: string;
  content: string;
  style: ComponentStyle;
  children?: DesignComponent[];
  props?: Record<string, any>;
}

interface DesignProject {
  id: string;
  name: string;
  components: DesignComponent[];
  globalStyles: {
    fontFamily: string;
    primaryColor: string;
    backgroundColor: string;
  };
}

const componentTemplates: { type: string; label: string; icon: any; defaultContent: string; defaultStyle: ComponentStyle }[] = [
  { type: "header", label: "Header", icon: Layout, defaultContent: "Header Section", defaultStyle: { backgroundColor: "#1e293b", color: "#ffffff", padding: "24px", textAlign: "center" } },
  { type: "hero", label: "Hero", icon: Columns, defaultContent: "Welcome to Our Site", defaultStyle: { backgroundColor: "#3b82f6", color: "#ffffff", padding: "64px 24px", textAlign: "center", fontSize: "32px", fontWeight: "bold" } },
  { type: "heading", label: "Heading", icon: Type, defaultContent: "Section Title", defaultStyle: { fontSize: "24px", fontWeight: "bold", padding: "16px 0" } },
  { type: "paragraph", label: "Paragraph", icon: AlignLeft, defaultContent: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.", defaultStyle: { fontSize: "16px", padding: "8px 0", lineHeight: "1.6" } as any },
  { type: "button", label: "Button", icon: MousePointer, defaultContent: "Click Me", defaultStyle: { backgroundColor: "#3b82f6", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", display: "inline-block", textAlign: "center" } },
  { type: "image", label: "Image", icon: Image, defaultContent: "https://via.placeholder.com/800x400", defaultStyle: { width: "100%", borderRadius: "8px" } },
  { type: "section", label: "Section", icon: Square, defaultContent: "", defaultStyle: { padding: "48px 24px", backgroundColor: "#f8fafc" } },
  { type: "container", label: "Container", icon: Grid3X3, defaultContent: "", defaultStyle: { maxWidth: "1200px", margin: "0 auto", padding: "0 24px" } as any },
  { type: "columns", label: "2 Columns", icon: Columns, defaultContent: "", defaultStyle: { display: "flex", gap: "24px", padding: "24px 0" } },
  { type: "card", label: "Card", icon: Square, defaultContent: "Card content here", defaultStyle: { backgroundColor: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" } },
  { type: "footer", label: "Footer", icon: Layout, defaultContent: "2025 Your Company. All rights reserved.", defaultStyle: { backgroundColor: "#1e293b", color: "#94a3b8", padding: "24px", textAlign: "center", fontSize: "14px" } },
  { type: "navbar", label: "Navigation", icon: List, defaultContent: "Home | About | Services | Contact", defaultStyle: { backgroundColor: "#ffffff", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" } as any },
  { type: "contact", label: "Contact Info", icon: Mail, defaultContent: "email@example.com | (555) 123-4567", defaultStyle: { padding: "16px", fontSize: "14px" } },
  { type: "spacer", label: "Spacer", icon: ChevronDown, defaultContent: "", defaultStyle: { height: "48px" } },
];

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function ComponentRenderer({ component, isSelected, onClick, onDragStart }: { component: DesignComponent; isSelected: boolean; onClick: () => void; onDragStart: (e: React.DragEvent, id: string) => void }) {
  const style: React.CSSProperties = {
    ...component.style as React.CSSProperties,
    outline: isSelected ? "2px solid #3b82f6" : "none",
    outlineOffset: "2px",
    cursor: "pointer",
    position: "relative",
  };

  const renderContent = () => {
    switch (component.type) {
      case "image":
        return <img src={component.content} alt="Design element" style={{ width: component.style.width || "100%", borderRadius: component.style.borderRadius }} />;
      case "button":
        return <span style={style}>{component.content}</span>;
      case "columns":
        return (
          <div style={style}>
            <div style={{ flex: 1, backgroundColor: "#f1f5f9", padding: "24px", borderRadius: "8px" }}>Column 1</div>
            <div style={{ flex: 1, backgroundColor: "#f1f5f9", padding: "24px", borderRadius: "8px" }}>Column 2</div>
          </div>
        );
      case "spacer":
        return <div style={{ ...style, backgroundColor: isSelected ? "#e2e8f0" : "transparent" }} />;
      default:
        return <div style={style}>{component.content || <span className="text-muted-foreground italic">Empty {component.type}</span>}</div>;
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, component.id)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="relative group"
    >
      {isSelected && (
        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded z-10">
          {component.type}
        </div>
      )}
      {renderContent()}
    </div>
  );
}

interface SavedProjectInfo {
  id: string;
  name: string;
  componentCount: number;
  updatedAt?: string;
}

export default function DesignerPage() {
  const [project, setProject] = useState<DesignProject>({
    id: generateId(),
    name: "New Website",
    components: [],
    globalStyles: {
      fontFamily: "Inter, system-ui, sans-serif",
      primaryColor: "#3b82f6",
      backgroundColor: "#ffffff",
    },
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProjectInfo[]>([]);
  const [showProjectList, setShowProjectList] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedComponent = project.components.find((c) => c.id === selectedId);

  const loadProjectList = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/designer");
      if (res.ok) {
        const data = await res.json();
        setSavedProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/designer?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setShowProjectList(false);
        toast({ title: "Loaded", description: `Project "${data.name}" loaded` });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load project", variant: "destructive" });
    }
  }, [toast]);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/designer?id=${projectId}`, { method: "DELETE" });
      if (res.ok) {
        setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
        toast({ title: "Deleted", description: "Project deleted" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
  }, [toast]);

  const createNewProject = useCallback(() => {
    setProject({
      id: generateId(),
      name: "New Website",
      components: [],
      globalStyles: {
        fontFamily: "Inter, system-ui, sans-serif",
        primaryColor: "#3b82f6",
        backgroundColor: "#ffffff",
      },
    });
    setSelectedId(null);
    setShowProjectList(false);
  }, []);

  useEffect(() => {
    loadProjectList();
  }, [loadProjectList]);

  const addComponent = useCallback((template: typeof componentTemplates[0]) => {
    const newComponent: DesignComponent = {
      id: generateId(),
      type: template.type,
      content: template.defaultContent,
      style: { ...template.defaultStyle },
    };
    setProject((prev) => ({
      ...prev,
      components: [...prev.components, newComponent],
    }));
    setSelectedId(newComponent.id);
  }, []);

  const updateComponent = useCallback((id: string, updates: Partial<DesignComponent>) => {
    setProject((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  }, []);

  const updateComponentStyle = useCallback((id: string, styleUpdates: Partial<ComponentStyle>) => {
    setProject((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.id === id ? { ...c, style: { ...c.style, ...styleUpdates } } : c
      ),
    }));
  }, []);

  const deleteComponent = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      components: prev.components.filter((c) => c.id !== id),
    }));
    setSelectedId(null);
  }, []);

  const moveComponent = useCallback((id: string, direction: "up" | "down") => {
    setProject((prev) => {
      const index = prev.components.findIndex((c) => c.id === id);
      if (index === -1) return prev;
      if (direction === "up" && index === 0) return prev;
      if (direction === "down" && index === prev.components.length - 1) return prev;

      const newComponents = [...prev.components];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      [newComponents[index], newComponents[swapIndex]] = [newComponents[swapIndex], newComponents[index]];

      return { ...prev, components: newComponents };
    });
  }, []);

  const duplicateComponent = useCallback((id: string) => {
    const component = project.components.find((c) => c.id === id);
    if (!component) return;

    const newComponent: DesignComponent = {
      ...component,
      id: generateId(),
      style: { ...component.style },
    };

    setProject((prev) => {
      const index = prev.components.findIndex((c) => c.id === id);
      const newComponents = [...prev.components];
      newComponents.splice(index + 1, 0, newComponent);
      return { ...prev, components: newComponents };
    });
    setSelectedId(newComponent.id);
  }, [project.components]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("componentId", id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const componentId = e.dataTransfer.getData("componentId");
    const templateType = e.dataTransfer.getData("templateType");

    if (templateType) {
      const template = componentTemplates.find((t) => t.type === templateType);
      if (template) addComponent(template);
    }
  }, [addComponent]);

  const generateHTML = useCallback(() => {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${project.globalStyles.fontFamily}; background-color: ${project.globalStyles.backgroundColor}; }
  </style>
</head>
<body>
`;

    project.components.forEach((component) => {
      const styleStr = Object.entries(component.style)
        .map(([key, value]) => `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value}`)
        .join("; ");

      switch (component.type) {
        case "image":
          html += `  <img src="${component.content}" alt="" style="${styleStr}" />\n`;
          break;
        case "button":
          html += `  <button style="${styleStr}">${component.content}</button>\n`;
          break;
        case "heading":
          html += `  <h2 style="${styleStr}">${component.content}</h2>\n`;
          break;
        default:
          html += `  <div style="${styleStr}">${component.content}</div>\n`;
      }
    });

    html += `</body>
</html>`;
    return html;
  }, [project]);

  const handleExport = useCallback(() => {
    const html = generateHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "HTML file downloaded" });
  }, [generateHTML, project.name, toast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/designer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "Saved", description: "Project saved successfully" });
      loadProjectList();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save project", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [project, toast, loadProjectList]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={createNewProject}>
            <Plus className="h-4 w-4 mr-2" />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowProjectList(!showProjectList); loadProjectList(); }}>
            <Layout className="h-4 w-4 mr-2" />
            {savedProjects.length > 0 ? `Load (${savedProjects.length})` : "Load"}
          </Button>
          <Input
            value={project.name}
            onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
            className="w-48 h-8"
          />
          <span className="text-sm text-muted-foreground">{project.components.length} components</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={previewMode ? "default" : "outline"} size="sm" onClick={() => { setPreviewMode(!previewMode); setShowCode(false); }}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button variant={showCode ? "default" : "outline"} size="sm" onClick={() => { setShowCode(!showCode); setPreviewMode(false); }}>
            <Code className="h-4 w-4 mr-2" />
            Code
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {showProjectList && (
        <div className="border-b bg-card px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Saved Projects</span>
            <Button variant="ghost" size="sm" onClick={() => setShowProjectList(false)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {loadingProjects ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : savedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No saved projects yet. Create and save your first design!</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {savedProjects.map((p) => (
                <div key={p.id} className="flex items-center gap-1 bg-secondary rounded-lg px-3 py-2">
                  <button
                    onClick={() => loadProject(p.id)}
                    className="text-sm hover:underline"
                  >
                    {p.name} ({p.componentCount} components)
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!previewMode && !showCode && (
          <div className="w-64 shrink-0 border-r bg-card overflow-auto">
            <div className="p-3 border-b">
              <span className="text-sm font-medium">Components</span>
            </div>
            <ScrollArea className="h-[calc(100%-45px)]">
              <div className="p-2 grid grid-cols-2 gap-2">
                {componentTemplates.map((template) => (
                  <button
                    key={template.type}
                    className="flex flex-col items-center gap-1 p-3 rounded-lg border hover:bg-accent transition-colors text-xs"
                    onClick={() => addComponent(template)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("templateType", template.type)}
                  >
                    <template.icon className="h-5 w-5" />
                    <span>{template.label}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div
          ref={canvasRef}
          className="flex-1 overflow-auto p-4 bg-gray-100"
          onClick={() => setSelectedId(null)}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {showCode ? (
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto h-full text-sm font-mono whitespace-pre-wrap">
              {generateHTML()}
            </pre>
          ) : (
            <div
              className="min-h-full bg-white shadow-lg mx-auto"
              style={{
                maxWidth: previewMode ? "100%" : "1000px",
                fontFamily: project.globalStyles.fontFamily,
              }}
            >
              {project.components.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                  <Layout className="h-12 w-12 mb-4 opacity-30" />
                  <p>Drag components here or click to add</p>
                </div>
              ) : (
                project.components.map((component) => (
                  <ComponentRenderer
                    key={component.id}
                    component={component}
                    isSelected={!previewMode && selectedId === component.id}
                    onClick={() => !previewMode && setSelectedId(component.id)}
                    onDragStart={handleDragStart}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {!previewMode && !showCode && selectedComponent && (
          <div className="w-72 shrink-0 border-l bg-card overflow-auto">
            <Tabs defaultValue="content" className="h-full">
              <div className="border-b px-3">
                <TabsList className="h-10">
                  <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
                  <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
                  <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="h-[calc(100%-45px)]">
                <TabsContent value="content" className="p-3 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{selectedComponent.type}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveComponent(selectedId!, "up")}>
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveComponent(selectedId!, "down")}>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateComponent(selectedId!)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteComponent(selectedId!)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedComponent.type !== "spacer" && selectedComponent.type !== "columns" && (
                    <div>
                      <Label className="text-xs">Content</Label>
                      {selectedComponent.type === "image" ? (
                        <Input
                          value={selectedComponent.content}
                          onChange={(e) => updateComponent(selectedId!, { content: e.target.value })}
                          placeholder="Image URL"
                        />
                      ) : (
                        <Textarea
                          value={selectedComponent.content}
                          onChange={(e) => updateComponent(selectedId!, { content: e.target.value })}
                          rows={3}
                        />
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="style" className="p-3 space-y-4">
                  <div>
                    <Label className="text-xs">Background Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={selectedComponent.style.backgroundColor || "#ffffff"}
                        onChange={(e) => updateComponentStyle(selectedId!, { backgroundColor: e.target.value })}
                        className="w-12 h-8 p-1"
                      />
                      <Input
                        value={selectedComponent.style.backgroundColor || ""}
                        onChange={(e) => updateComponentStyle(selectedId!, { backgroundColor: e.target.value })}
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Text Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={selectedComponent.style.color || "#000000"}
                        onChange={(e) => updateComponentStyle(selectedId!, { color: e.target.value })}
                        className="w-12 h-8 p-1"
                      />
                      <Input
                        value={selectedComponent.style.color || ""}
                        onChange={(e) => updateComponentStyle(selectedId!, { color: e.target.value })}
                        placeholder="#000000"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Font Size</Label>
                    <Input
                      value={selectedComponent.style.fontSize || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { fontSize: e.target.value })}
                      placeholder="16px"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Font Weight</Label>
                    <Select
                      value={selectedComponent.style.fontWeight || "normal"}
                      onValueChange={(v) => updateComponentStyle(selectedId!, { fontWeight: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                        <SelectItem value="600">Semi-bold</SelectItem>
                        <SelectItem value="300">Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Text Align</Label>
                    <div className="flex gap-1">
                      {["left", "center", "right"].map((align) => (
                        <Button
                          key={align}
                          variant={selectedComponent.style.textAlign === align ? "default" : "outline"}
                          size="sm"
                          className="flex-1"
                          onClick={() => updateComponentStyle(selectedId!, { textAlign: align })}
                        >
                          {align === "left" && <AlignLeft className="h-4 w-4" />}
                          {align === "center" && <AlignCenter className="h-4 w-4" />}
                          {align === "right" && <AlignRight className="h-4 w-4" />}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Border Radius</Label>
                    <Input
                      value={selectedComponent.style.borderRadius || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { borderRadius: e.target.value })}
                      placeholder="8px"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="layout" className="p-3 space-y-4">
                  <div>
                    <Label className="text-xs">Padding</Label>
                    <Input
                      value={selectedComponent.style.padding || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { padding: e.target.value })}
                      placeholder="16px"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Margin</Label>
                    <Input
                      value={selectedComponent.style.margin || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { margin: e.target.value })}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Width</Label>
                    <Input
                      value={selectedComponent.style.width || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { width: e.target.value })}
                      placeholder="100%"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Height</Label>
                    <Input
                      value={selectedComponent.style.height || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { height: e.target.value })}
                      placeholder="auto"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Border</Label>
                    <Input
                      value={selectedComponent.style.border || ""}
                      onChange={(e) => updateComponentStyle(selectedId!, { border: e.target.value })}
                      placeholder="1px solid #e2e8f0"
                    />
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
