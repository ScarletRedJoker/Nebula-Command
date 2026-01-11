/**
 * AI Orchestrator - Unified interface for multiple AI providers
 * Supports OpenAI, Ollama (local), Replicate (video), and future providers
 */
import OpenAI from "openai";
import Replicate from "replicate";

export type AIProvider = "openai" | "ollama" | "auto";
export type AICapability = "chat" | "image" | "video" | "embedding";

export interface AIConfig {
  provider: AIProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  config?: Partial<AIConfig>;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792" | "512x512";
  style?: "vivid" | "natural";
  provider?: "openai" | "stable-diffusion";
}

export interface ImageResponse {
  url?: string;
  base64?: string;
  provider: string;
  revisedPrompt?: string;
}

export interface VideoRequest {
  prompt: string;
  inputImage?: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  provider?: "replicate" | "local";
  model?: "wan-t2v" | "wan-i2v" | "svd";
}

export interface VideoResponse {
  url: string;
  provider: string;
  model: string;
  duration?: number;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "auto",
  temperature: 0.7,
  maxTokens: 2000,
};

class AIOrchestrator {
  private openaiClient: OpenAI | null = null;
  private replicateClient: Replicate | null = null;
  private ollamaUrl: string;

  constructor() {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.initOpenAI();
    this.initReplicate();
  }

  private initOpenAI() {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (apiKey) {
      this.openaiClient = new OpenAI({
        baseURL: baseURL || undefined,
        apiKey,
      });
    }
  }

  private initReplicate() {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (apiKey) {
      this.replicateClient = new Replicate({ auth: apiKey });
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = { ...DEFAULT_CONFIG, ...request.config };
    const provider = config.provider === "auto" ? await this.selectBestProvider("chat") : config.provider;

    if (provider === "ollama") {
      return this.chatWithOllama(request.messages, config);
    }

    return this.chatWithOpenAI(request.messages, config);
  }

  private async chatWithOpenAI(messages: ChatMessage[], config: AIConfig): Promise<ChatResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured");
    }

    const model = config.model || "gpt-4o";
    const response = await this.openaiClient.chat.completions.create({
      model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      provider: "openai",
      model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  private async chatWithOllama(messages: ChatMessage[], config: AIConfig): Promise<ChatResponse> {
    const model = config.model || "llama3.2";

    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || "",
      provider: "ollama",
      model,
      usage: data.eval_count ? {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      } : undefined,
    };
  }

  async generateImage(request: ImageRequest): Promise<ImageResponse> {
    const provider = request.provider || "openai";

    if (provider === "stable-diffusion") {
      return this.generateWithSD(request);
    }

    return this.generateWithDALLE(request);
  }

  private async generateWithDALLE(request: ImageRequest): Promise<ImageResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured");
    }

    const response = await this.openaiClient.images.generate({
      model: "dall-e-3",
      prompt: request.prompt,
      size: request.size || "1024x1024",
      style: request.style || "vivid",
      quality: "hd",
      n: 1,
    });

    return {
      url: response.data?.[0]?.url,
      provider: "openai",
      revisedPrompt: response.data?.[0]?.revised_prompt,
    };
  }

  private async generateWithSD(request: ImageRequest): Promise<ImageResponse> {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    const sdUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;

    const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || "blurry, low quality, distorted",
        width: 1024,
        height: 1024,
        steps: 30,
        cfg_scale: 7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stable Diffusion error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      base64: data.images?.[0],
      provider: "stable-diffusion",
    };
  }

  async getAvailableModels(): Promise<{ provider: string; models: string[] }[]> {
    const results: { provider: string; models: string[] }[] = [];

    if (this.openaiClient) {
      try {
        const models = await this.openaiClient.models.list();
        const chatModels = models.data
          .filter(m => m.id.includes("gpt"))
          .map(m => m.id);
        results.push({ provider: "openai", models: chatModels });
      } catch {
        results.push({ provider: "openai", models: [] });
      }
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        results.push({ provider: "ollama", models });
      }
    } catch {
      results.push({ provider: "ollama", models: [] });
    }

    return results;
  }

  private async selectBestProvider(capability: AICapability): Promise<AIProvider> {
    if (capability === "chat") {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.models?.length > 0) {
            return "ollama";
          }
        }
      } catch {
      }
    }

    return "openai";
  }

  hasOpenAI(): boolean {
    return this.openaiClient !== null;
  }

  hasReplicate(): boolean {
    return this.replicateClient !== null;
  }

  async generateVideo(request: VideoRequest): Promise<VideoResponse> {
    if (!this.replicateClient) {
      throw new Error("Replicate not configured - add REPLICATE_API_TOKEN");
    }

    const modelId = request.model || (request.inputImage ? "wan-i2v" : "wan-t2v");
    
    let output: unknown;
    let modelName: string;

    if (modelId === "wan-i2v" && request.inputImage) {
      modelName = "wavespeedai/wan-2.1-i2v-480p";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          image: request.inputImage,
          prompt: request.prompt,
          max_area: "832x480",
          fast_mode: "Balanced",
          frame_num: 81,
          sample_shift: 8,
          sample_steps: 30,
        },
      });
    } else if (modelId === "svd" && request.inputImage) {
      modelName = "stability-ai/stable-video-diffusion";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          input_image: request.inputImage,
          frames_per_second: 6,
        },
      });
    } else {
      modelName = "wavespeedai/wan-2.1-t2v-480p";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          prompt: request.prompt,
          negative_prompt: "blurry, low quality, distorted, ugly",
          max_area: request.aspectRatio === "9:16" ? "480x832" : 
                    request.aspectRatio === "1:1" ? "640x640" : "832x480",
          fast_mode: "Balanced",
          frame_num: 81,
          sample_shift: 8,
          sample_steps: 30,
        },
      });
    }

    // Normalize Replicate output - different models return different shapes
    let videoUrl = "";
    if (typeof output === "string") {
      videoUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      videoUrl = output[0];
    } else if (output && typeof output === "object") {
      // WAN models return { video: "url" }, others may return { url: "url" } or { output: "url" }
      const obj = output as { video?: string; url?: string; output?: string };
      videoUrl = obj.video || obj.url || obj.output || "";
    }

    if (!videoUrl) {
      throw new Error("Video generation failed - no output URL received from Replicate");
    }

    return {
      url: videoUrl,
      provider: "replicate",
      model: modelName,
      duration: 5,
    };
  }

  getVideoProviders() {
    return [
      {
        id: "wan-t2v",
        name: "WAN 2.1 Text-to-Video",
        description: "Fast text-to-video generation (480p)",
        type: "text-to-video",
        available: this.hasReplicate(),
      },
      {
        id: "wan-i2v",
        name: "WAN 2.1 Image-to-Video",
        description: "Animate images with AI (480p)",
        type: "image-to-video",
        available: this.hasReplicate(),
      },
      {
        id: "svd",
        name: "Stable Video Diffusion",
        description: "High-quality image animation",
        type: "image-to-video",
        available: this.hasReplicate(),
      },
    ];
  }
}

export const aiOrchestrator = new AIOrchestrator();
