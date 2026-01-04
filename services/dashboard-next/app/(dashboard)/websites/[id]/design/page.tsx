"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Layout,
  Type,
  Image,
  Square,
  Grid,
  Minus,
  Save,
  Eye,
  Code2,
  Undo,
  Redo,
  Monitor,
  Tablet,
  Smartphone,
  Settings,
  Palette,
  Layers,
  Move,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComponentItem {
  id: string;
  type: string;
  label: string;
  icon: any;
  content?: any;
}

const componentPalette: ComponentItem[] = [
  { id: "hero", type: "hero", label: "Hero Section", icon: Layout },
  { id: "heading", type: "heading", label: "Heading", icon: Type },
  { id: "text", type: "text", label: "Text Block", icon: Type },
  { id: "image", type: "image", label: "Image", icon: Image },
  { id: "button", type: "button", label: "Button", icon: Square },
  { id: "grid", type: "grid", label: "Grid", icon: Grid },
  { id: "divider", type: "divider", label: "Divider", icon: Minus },
];

interface CanvasItem extends ComponentItem {
  instanceId: string;
  props: Record<string, any>;
}

function DraggablePaletteItem({ item }: { item: ComponentItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.id}`,
    data: { type: "palette", item },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 cursor-grab hover:border-primary transition-colors"
    >
      <item.icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{item.label}</span>
    </div>
  );
}

function SortableCanvasItem({
  item,
  isSelected,
  onSelect,
  onDelete,
}: {
  item: CanvasItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.instanceId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderContent = () => {
    switch (item.type) {
      case "hero":
        return (
          <div className="bg-gradient-to-r from-primary/20 to-primary/5 p-12 text-center rounded-lg">
            <h1 className="text-4xl font-bold mb-4">Hero Section</h1>
            <p className="text-muted-foreground mb-6">Your amazing tagline goes here</p>
            <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg">
              Call to Action
            </button>
          </div>
        );
      case "heading":
        return <h2 className="text-2xl font-bold p-4">Heading Text</h2>;
      case "text":
        return (
          <p className="p-4 text-muted-foreground">
            This is a text block. Click to edit the content.
          </p>
        );
      case "image":
        return (
          <div className="bg-muted rounded-lg h-48 flex items-center justify-center">
            <Image className="h-12 w-12 text-muted-foreground" />
          </div>
        );
      case "button":
        return (
          <div className="p-4">
            <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg">
              Button
            </button>
          </div>
        );
      case "grid":
        return (
          <div className="grid grid-cols-3 gap-4 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted rounded-lg h-24" />
            ))}
          </div>
        );
      case "divider":
        return <hr className="my-4 border-border" />;
      default:
        return <div className="p-4">Unknown component</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group border-2 border-transparent rounded-lg transition-colors",
        isSelected && "border-primary",
        !isSelected && "hover:border-primary/50"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab bg-background rounded p-1 border"
      >
        <Move className="h-4 w-4 text-muted-foreground" />
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {renderContent()}
    </div>
  );
}

export default function DesignPage({ params }: { params: { id: string } }) {
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([
    {
      id: "hero",
      instanceId: "hero-1",
      type: "hero",
      label: "Hero Section",
      icon: Layout,
      props: {},
    },
  ]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current;

    if (activeData?.type === "palette") {
      const newItem: CanvasItem = {
        ...activeData.item,
        instanceId: `${activeData.item.id}-${Date.now()}`,
        props: {},
      };
      setCanvasItems((items) => [...items, newItem]);
      return;
    }

    if (active.id !== over.id) {
      setCanvasItems((items) => {
        const oldIndex = items.findIndex((i) => i.instanceId === active.id);
        const newIndex = items.findIndex((i) => i.instanceId === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDelete = (instanceId: string) => {
    setCanvasItems((items) => items.filter((i) => i.instanceId !== instanceId));
    if (selectedItem === instanceId) {
      setSelectedItem(null);
    }
  };

  const { setNodeRef: setDropRef } = useDroppable({ id: "canvas" });

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Redo className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-border mx-2" />
          <Button
            variant={viewport === "desktop" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewport("desktop")}
          >
            <Monitor className="h-4 w-4" />
          </Button>
          <Button
            variant={viewport === "tablet" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewport("tablet")}
          >
            <Tablet className="h-4 w-4" />
          </Button>
          <Button
            variant={viewport === "mobile" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewport("mobile")}
          >
            <Smartphone className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" size="sm">
            <Code2 className="mr-2 h-4 w-4" />
            Code
          </Button>
          <Button size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 shrink-0 border-r bg-card overflow-auto">
            <div className="p-4 border-b">
              <h3 className="font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Components
              </h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {componentPalette.map((item) => (
                <DraggablePaletteItem key={item.id} item={item} />
              ))}
            </div>
          </div>

          <div
            ref={setDropRef}
            className={cn(
              "flex-1 overflow-auto bg-background p-8",
              viewport === "tablet" && "max-w-2xl mx-auto",
              viewport === "mobile" && "max-w-sm mx-auto"
            )}
            onClick={() => setSelectedItem(null)}
          >
            <div className="min-h-full bg-card rounded-lg border shadow-sm p-4">
              {canvasItems.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                  <Plus className="h-12 w-12 mb-4" />
                  <p>Drag components here to start building</p>
                </div>
              ) : (
                <SortableContext
                  items={canvasItems.map((i) => i.instanceId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {canvasItems.map((item) => (
                      <SortableCanvasItem
                        key={item.instanceId}
                        item={item}
                        isSelected={selectedItem === item.instanceId}
                        onSelect={() => setSelectedItem(item.instanceId)}
                        onDelete={() => handleDelete(item.instanceId)}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          </div>

          <div className="w-72 shrink-0 border-l bg-card overflow-auto">
            <div className="p-4 border-b">
              <h3 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Properties
              </h3>
            </div>
            {selectedItem ? (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Component Type</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {canvasItems.find((i) => i.instanceId === selectedItem)?.label}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Background Color</label>
                  <div className="flex gap-2">
                    {["#000", "#fff", "#3b82f6", "#22c55e", "#ef4444"].map((color) => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded border"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Padding</label>
                  <Input type="number" placeholder="16" defaultValue="16" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Margin</label>
                  <Input type="number" placeholder="0" defaultValue="0" />
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                <p className="text-sm">Select a component to edit its properties</p>
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeId?.startsWith("palette-") && (
            <div className="bg-card border rounded-lg p-3 shadow-lg">
              <span className="text-sm">
                {componentPalette.find((i) => `palette-${i.id}` === activeId)?.label}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
