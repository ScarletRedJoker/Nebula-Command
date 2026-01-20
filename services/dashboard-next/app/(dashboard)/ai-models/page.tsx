"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  HardDrive,
  Zap,
  Play,
  Square,
  MemoryStick,
} from "lucide-react";

interface LocalModel {
  name: string;
  model?: string;
  sizeFormatted?: string;
  size?: string;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  provider?: string;
  type?: string;
  loaded?: boolean;
}

interface RuntimeHealth {
  provider: string;
  status: "online" | "offline" | "degraded";
  url: string;
  latencyMs?: number;
  gpuUsage?: number;
  vramUsed?: number;
  vramTotal?: number;
  modelsLoaded: number;
  error?: string;
}

const POPULAR_MODELS = [
  { name: "llama3.2:latest", description: "Meta's latest Llama 3.2 (3B)", size: "2GB" },
  { name: "llama3.2:1b", description: "Llama 3.2 1B - Fast", size: "1.3GB" },
  { name: "mistral:latest", description: "Mistral 7B", size: "4.1GB" },
  { name: "codellama:latest", description: "Code Llama 7B", size: "3.8GB" },
  { name: "phi3:latest", description: "Microsoft Phi-3", size: "2.2GB" },
  { name: "gemma2:2b", description: "Google Gemma 2 2B", size: "1.6GB" },
  { name: "qwen2.5:latest", description: "Alibaba Qwen 2.5", size: "4.7GB" },
  { name: "deepseek-coder:latest", description: "DeepSeek Coder", size: "776MB" },
];

export default function AIModelsPage() {
  const [runtimes, setRuntimes] = useState<RuntimeHealth[]>([]);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [selectedPopular, setSelectedPopular] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [runtimeRes, modelsRes] = await Promise.all([
        fetch("/api/ai/runtime"),
        fetch("/api/ai/models"),
      ]);

      if (runtimeRes.ok) {
        const data = await runtimeRes.json();
        setRuntimes(data.runtimes || []);
      }

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error("Failed to fetch AI data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRuntimes() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/ai/runtime");
      if (res.ok) {
        const data = await res.json();
        setRuntimes(data.runtimes || []);
      }
    } catch (error) {
      console.error("Failed to refresh runtimes:", error);
    } finally {
      setRefreshing(false);
    }
  }

  async function pullModel(modelName: string) {
    if (!modelName) return;
    setPullingModel(modelName);

    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", model: modelName }),
      });

      if (res.ok) {
        await fetchData();
        setCustomModel("");
        setSelectedPopular("");
        toast.success(`Successfully pulled ${modelName}`);
      } else {
        const error = await res.json();
        toast.error(`Failed to pull model: ${error.details || error.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setPullingModel(null);
    }
  }

  async function deleteModel(modelName: string) {
    setDeletingModel(modelName);

    try {
      const res = await fetch("/api/ai/models", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });

      if (res.ok) {
        await fetchData();
        toast.success(`${modelName} deleted successfully`);
      } else {
        const error = await res.json();
        toast.error(`Failed to delete model: ${error.details || error.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingModel(null);
    }
  }

  async function toggleModelLoad(modelName: string, currentlyLoaded: boolean) {
    setLoadingModel(modelName);
    const action = currentlyLoaded ? "unload" : "load";

    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, model: modelName }),
      });

      if (res.ok) {
        await fetchData();
        toast.success(`Model ${action}ed successfully`);
      } else {
        const error = await res.json();
        toast.error(`Failed to ${action} model: ${error.details || error.message}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoadingModel(null);
    }
  }

  const ollamaRuntime = runtimes.find(r => r.provider === "ollama");
  const sdRuntime = runtimes.find(r => r.provider === "stable-diffusion");
  const comfyRuntime = runtimes.find(r => r.provider === "comfyui");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Local AI Models</h1>
          <p className="text-muted-foreground">
            Manage your local AI runtimes and models
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refreshRuntimes}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RuntimeCard
          name="Ollama (LLMs)"
          runtime={ollamaRuntime}
          icon={<Cpu className="h-5 w-5" />}
        />
        <RuntimeCard
          name="Stable Diffusion"
          runtime={sdRuntime}
          icon={<HardDrive className="h-5 w-5" />}
        />
        <RuntimeCard
          name="ComfyUI"
          runtime={comfyRuntime}
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Pull New Model</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Popular Models</Label>
            <Select value={selectedPopular} onValueChange={setSelectedPopular}>
              <SelectTrigger>
                <SelectValue placeholder="Select a popular model" />
              </SelectTrigger>
              <SelectContent>
                {POPULAR_MODELS.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.description} ({m.size})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => pullModel(selectedPopular)}
              disabled={!selectedPopular || !!pullingModel}
              className="w-full"
            >
              {pullingModel === selectedPopular ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Pull Selected Model
                </>
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Custom Model</Label>
            <Input
              placeholder="e.g., llama3:70b, mistral:7b-instruct"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
            />
            <Button
              onClick={() => pullModel(customModel)}
              disabled={!customModel.trim() || !!pullingModel}
              variant="secondary"
              className="w-full"
            >
              {pullingModel === customModel ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Pull Custom Model
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Installed Models ({models.length})</h2>

        {models.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Cpu className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No models installed yet</p>
            <p className="text-sm">Pull a model above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((model) => (
              <div
                key={model.name}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Cpu className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{model.name}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{model.sizeFormatted || model.size}</span>
                      {model.parameterSize && (
                        <span>{model.parameterSize}</span>
                      )}
                      {model.quantization && (
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs">
                          {model.quantization}
                        </span>
                      )}
                      {model.loaded && (
                        <span className="flex items-center gap-1 text-green-500">
                          <MemoryStick className="h-3 w-3" />
                          In Memory
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleModelLoad(model.name, model.loaded || false)}
                    disabled={loadingModel === model.name}
                  >
                    {loadingModel === model.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : model.loaded ? (
                      <>
                        <Square className="h-4 w-4 mr-1" />
                        Unload
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        Load
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteModel(model.name)}
                    disabled={deletingModel === model.name}
                  >
                    {deletingModel === model.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeCard({
  name,
  runtime,
  icon,
}: {
  name: string;
  runtime?: RuntimeHealth;
  icon: React.ReactNode;
}) {
  const isOnline = runtime?.status === "online";

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{name}</span>
        </div>
        {isOnline ? (
          <span className="flex items-center gap-1 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-red-400">
            <XCircle className="h-4 w-4" />
            Offline
          </span>
        )}
      </div>

      {runtime && isOnline && (
        <div className="space-y-2 text-sm">
          {runtime.latencyMs !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latency</span>
              <span>{runtime.latencyMs}ms</span>
            </div>
          )}
          {runtime.modelsLoaded !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Models Loaded</span>
              <span>{runtime.modelsLoaded}</span>
            </div>
          )}
          {runtime.vramUsed !== undefined && runtime.vramTotal !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">VRAM</span>
              <span>{runtime.vramUsed}GB / {runtime.vramTotal}GB</span>
            </div>
          )}
          {runtime.gpuUsage !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">GPU Usage</span>
              <span>{runtime.gpuUsage}%</span>
            </div>
          )}
        </div>
      )}

      {runtime?.error && (
        <p className="text-xs text-red-400 mt-2">{runtime.error}</p>
      )}

      {!runtime && (
        <p className="text-xs text-muted-foreground">Checking status...</p>
      )}
    </div>
  );
}
