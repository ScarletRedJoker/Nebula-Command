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
  provider?: "replicate" | "local" | "comfyui";
  model?: "wan-t2v" | "wan-i2v" | "svd" | "animatediff" | "svd-local";
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
  private comfyuiUrl: string;
  private stableDiffusionUrl: string;

  constructor() {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.comfyuiUrl = process.env.COMFYUI_URL || `http://${WINDOWS_VM_IP}:8188`;
    this.stableDiffusionUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;
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
    const response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/txt2img`, {
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

  async checkComfyUI(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.comfyuiUrl}/system_stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async checkStableDiffusion(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async uploadImageToComfyUI(imageUrl: string): Promise<string> {
    // Download image from URL
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download input image");
    const imageBuffer = await response.arrayBuffer();
    
    // Upload to ComfyUI
    const formData = new FormData();
    const filename = `input_${Date.now()}.png`;
    formData.append("image", new Blob([imageBuffer], { type: "image/png" }), filename);
    
    const uploadResponse = await fetch(`${this.comfyuiUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      throw new Error("Failed to upload image to ComfyUI");
    }
    
    const result = await uploadResponse.json();
    return result.name || filename;
  }

  private async generateVideoWithComfyUI(request: VideoRequest): Promise<VideoResponse> {
    const isAnimateDiff = request.model === "animatediff" || !request.inputImage;
    
    // AnimateDiff workflow for text-to-video (properly wired)
    // Flow: Checkpoint -> AnimateDiff Loader -> KSampler -> VAEDecode -> VideoCombine
    const animateDiffWorkflow = {
      "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "dreamshaper_8.safetensors"
        }
      },
      "2": {
        "class_type": "ADE_AnimateDiffLoaderWithContext",
        "inputs": {
          "model": ["1", 0],
          "motion_model": "mm_sd_v15_v2.ckpt",
          "beta_schedule": "sqrt_linear (AnimateDiff)",
          "context_length": 16,
          "context_stride": 1,
          "context_overlap": 4,
          "closed_loop": false
        }
      },
      "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["1", 1],
          "text": request.prompt
        }
      },
      "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["1", 1],
          "text": "blurry, low quality, distorted, ugly, watermark, text"
        }
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "batch_size": 16,
          "height": request.aspectRatio === "9:16" ? 512 : 320,
          "width": request.aspectRatio === "9:16" ? 320 : 512
        }
      },
      "6": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": 7.5,
          "denoise": 1,
          "latent_image": ["5", 0],
          "model": ["2", 0],
          "negative": ["4", 0],
          "positive": ["3", 0],
          "sampler_name": "euler_ancestral",
          "scheduler": "normal",
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20
        }
      },
      "7": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["6", 0],
          "vae": ["1", 2]
        }
      },
      "8": {
        "class_type": "VHS_VideoCombine",
        "inputs": {
          "images": ["7", 0],
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "AnimateDiff",
          "format": "video/h264-mp4",
          "save_output": true,
          "pingpong": false,
          "crf": 19
        }
      }
    };

    // For SVD with image input, we need to upload the image first
    let uploadedImageName = "";
    if (!isAnimateDiff && request.inputImage) {
      uploadedImageName = await this.uploadImageToComfyUI(request.inputImage);
    }

    // SVD workflow for image-to-video
    const svdWorkflow = {
      "1": {
        "class_type": "LoadImage",
        "inputs": {
          "image": uploadedImageName
        }
      },
      "2": {
        "class_type": "ImageOnlyCheckpointLoader",
        "inputs": {
          "ckpt_name": "svd_xt_1_1.safetensors"
        }
      },
      "3": {
        "class_type": "SVD_img2vid_Conditioning",
        "inputs": {
          "augmentation_level": 0,
          "fps": 8,
          "init_image": ["1", 0],
          "motion_bucket_id": 127,
          "video_frames": 25,
          "width": 1024,
          "height": 576
        }
      },
      "4": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": 2.5,
          "denoise": 1,
          "latent_image": ["3", 2],
          "model": ["2", 0],
          "negative": ["3", 1],
          "positive": ["3", 0],
          "sampler_name": "euler",
          "scheduler": "karras",
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20
        }
      },
      "5": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["4", 0],
          "vae": ["2", 2]
        }
      },
      "6": {
        "class_type": "VHS_VideoCombine",
        "inputs": {
          "images": ["5", 0],
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "SVD",
          "format": "video/h264-mp4",
          "save_output": true,
          "pingpong": false,
          "crf": 19
        }
      }
    };

    const workflow = isAnimateDiff ? animateDiffWorkflow : svdWorkflow;
    const clientId = `nebula-${Date.now()}`;

    // Queue the prompt
    const queueResponse = await fetch(`${this.comfyuiUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId,
      }),
    });

    if (!queueResponse.ok) {
      const error = await queueResponse.text();
      throw new Error(`ComfyUI queue error: ${error}`);
    }

    const { prompt_id } = await queueResponse.json();

    // Poll for completion (max 5 minutes for video generation)
    const maxWait = 300000;
    const pollInterval = 2000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;

      const historyResponse = await fetch(`${this.comfyuiUrl}/history/${prompt_id}`);
      if (!historyResponse.ok) continue;

      const history = await historyResponse.json();
      const result = history[prompt_id];

      if (result?.outputs) {
        // Find the video output
        for (const nodeId of Object.keys(result.outputs)) {
          const output = result.outputs[nodeId];
          if (output.gifs || output.videos) {
            const videos = output.gifs || output.videos;
            if (videos.length > 0) {
              const video = videos[0];
              const videoUrl = `${this.comfyuiUrl}/view?filename=${encodeURIComponent(video.filename)}&subfolder=${encodeURIComponent(video.subfolder || "")}&type=${video.type || "output"}`;
              return {
                url: videoUrl,
                provider: "comfyui",
                model: isAnimateDiff ? "animatediff" : "svd-local",
                duration: isAnimateDiff ? 2 : 3,
              };
            }
          }
        }
      }
    }

    throw new Error("Video generation timed out");
  }

  async generateVideo(request: VideoRequest): Promise<VideoResponse> {
    // Check for local ComfyUI video generation first
    if (request.provider === "local" || request.provider === "comfyui" || 
        request.model === "animatediff" || request.model === "svd-local") {
      const comfyAvailable = await this.checkComfyUI();
      if (comfyAvailable) {
        return this.generateVideoWithComfyUI(request);
      }
      if (request.provider === "local" || request.provider === "comfyui") {
        throw new Error("ComfyUI not available - ensure ComfyUI is running on your Windows VM with AnimateDiff/SVD installed");
      }
      // Fall through to Replicate if auto-selecting
    }

    if (!this.replicateClient) {
      // Try ComfyUI as fallback if available
      const comfyAvailable = await this.checkComfyUI();
      if (comfyAvailable) {
        return this.generateVideoWithComfyUI(request);
      }
      throw new Error("No video generation provider available - add REPLICATE_API_TOKEN or configure ComfyUI on your Windows VM");
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

  async getVideoProviders() {
    const comfyAvailable = await this.checkComfyUI();
    
    return [
      {
        id: "animatediff",
        name: "AnimateDiff (Local)",
        description: "Local text-to-video via ComfyUI on Windows VM",
        type: "text-to-video",
        available: comfyAvailable,
        provider: "local",
      },
      {
        id: "svd-local",
        name: "SVD (Local)",
        description: "Local image-to-video via ComfyUI on Windows VM",
        type: "image-to-video",
        available: comfyAvailable,
        provider: "local",
      },
      {
        id: "wan-t2v",
        name: "WAN 2.1 Text-to-Video",
        description: "Cloud text-to-video via Replicate (480p)",
        type: "text-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
      {
        id: "wan-i2v",
        name: "WAN 2.1 Image-to-Video",
        description: "Cloud image-to-video via Replicate (480p)",
        type: "image-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
      {
        id: "svd",
        name: "Stable Video Diffusion",
        description: "Cloud high-quality image animation via Replicate",
        type: "image-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
    ];
  }
}

export const aiOrchestrator = new AIOrchestrator();
