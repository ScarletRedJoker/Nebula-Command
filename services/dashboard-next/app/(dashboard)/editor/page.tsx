"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Save,
  Play,
  Terminal as TerminalIcon,
  GitBranch,
  Settings,
  X,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  ),
});

interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
  language?: string;
}

const mockFileTree: FileNode[] = [
  {
    name: "services",
    type: "folder",
    path: "/services",
    children: [
      {
        name: "discord-bot",
        type: "folder",
        path: "/services/discord-bot",
        children: [
          { name: "bot.ts", type: "file", path: "/services/discord-bot/bot.ts", language: "typescript" },
          { name: "commands.ts", type: "file", path: "/services/discord-bot/commands.ts", language: "typescript" },
          { name: "package.json", type: "file", path: "/services/discord-bot/package.json", language: "json" },
        ],
      },
      {
        name: "stream-bot",
        type: "folder",
        path: "/services/stream-bot",
        children: [
          { name: "index.ts", type: "file", path: "/services/stream-bot/index.ts", language: "typescript" },
          { name: "oauth.ts", type: "file", path: "/services/stream-bot/oauth.ts", language: "typescript" },
        ],
      },
    ],
  },
  {
    name: "deploy",
    type: "folder",
    path: "/deploy",
    children: [
      { name: "docker-compose.yml", type: "file", path: "/deploy/docker-compose.yml", language: "yaml" },
      { name: "Caddyfile", type: "file", path: "/deploy/Caddyfile", language: "plaintext" },
    ],
  },
];

const mockFileContents: Record<string, string> = {
  "/services/discord-bot/bot.ts": `import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(\`Logged in as \${client.user?.tag}\`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  if (message.content === '!ping') {
    await message.reply('Pong!');
  }
});

client.login(process.env.DISCORD_TOKEN);`,
  "/services/discord-bot/commands.ts": `import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows available commands'),
];`,
  "/services/stream-bot/index.ts": `import express from 'express';
import { setupOAuth } from './oauth';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
setupOAuth(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`Stream bot running on port \${PORT}\`);
});`,
};

function FileTreeItem({
  node,
  depth = 0,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggle,
}: {
  node: FileNode;
  depth?: number;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.type === "folder") {
            onToggle(node.path);
          } else {
            onSelect(node);
          }
        }}
      >
        {node.type === "folder" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-blue-400" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "folder" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OpenTab {
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
}

export default function EditorPage() {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["/services", "/services/discord-bot"])
  );
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((node: FileNode) => {
    if (node.type !== "file") return;

    const existingTab = openTabs.find((tab) => tab.path === node.path);
    if (existingTab) {
      setActiveTab(node.path);
      return;
    }

    const content = mockFileContents[node.path] || `// Content of ${node.name}`;
    const newTab: OpenTab = {
      path: node.path,
      name: node.name,
      language: node.language || "plaintext",
      content,
      isDirty: false,
    };

    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTab(node.path);
  }, [openTabs]);

  const handleCloseTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs((prev) => prev.filter((tab) => tab.path !== path));
    if (activeTab === path) {
      const remaining = openTabs.filter((tab) => tab.path !== path);
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  }, [activeTab, openTabs]);

  const handleContentChange = useCallback((value: string | undefined) => {
    if (!activeTab || value === undefined) return;
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTab
          ? { ...tab, content: value, isDirty: true }
          : tab
      )
    );
  }, [activeTab]);

  const activeTabData = openTabs.find((tab) => tab.path === activeTab);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <GitBranch className="mr-2 h-4 w-4" />
            main
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button size="sm">
            <Play className="mr-2 h-4 w-4" />
            Run
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 shrink-0 border-r bg-card overflow-auto">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Explorer</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-2">
            {mockFileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                selectedPath={activeTab}
                onSelect={handleSelectFile}
                expandedPaths={expandedPaths}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {openTabs.length > 0 && (
            <div className="flex border-b bg-card overflow-x-auto">
              {openTabs.map((tab) => (
                <button
                  key={tab.path}
                  className={cn(
                    "flex items-center gap-2 border-r px-3 py-2 text-sm",
                    activeTab === tab.path
                      ? "bg-background"
                      : "bg-card hover:bg-accent"
                  )}
                  onClick={() => setActiveTab(tab.path)}
                >
                  <File className="h-4 w-4" />
                  <span>{tab.name}</span>
                  {tab.isDirty && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                  <button
                    className="ml-1 rounded hover:bg-secondary"
                    onClick={(e) => handleCloseTab(tab.path, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {activeTabData ? (
              <MonacoEditor
                height="100%"
                language={activeTabData.language}
                value={activeTabData.content}
                onChange={handleContentChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  wordWrap: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <File className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Select a file to start editing</p>
                  <p className="text-sm mt-2">
                    Use the file explorer on the left
                  </p>
                </div>
              </div>
            )}
          </div>

          {showTerminal && (
            <div className="h-48 border-t bg-black">
              <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
                <span className="text-sm text-white">Terminal</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-white hover:bg-gray-800"
                  onClick={() => setShowTerminal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3 font-mono text-sm text-green-400">
                <p>$ npm run dev</p>
                <p className="text-white">Starting development server...</p>
                <p className="text-white">Ready on http://localhost:3000</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t bg-card px-4 py-1">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>TypeScript</span>
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTerminal(!showTerminal)}
        >
          <TerminalIcon className="mr-2 h-4 w-4" />
          Terminal
        </Button>
      </div>
    </div>
  );
}
