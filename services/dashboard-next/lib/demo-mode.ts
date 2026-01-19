/**
 * Demo Mode System
 * Provides cached/prerecorded responses for resilient presentations when AI services are offline
 */

export interface DemoModeConfig {
  enabled: boolean;
  showIndicator: boolean;
  simulateDelays: boolean;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface DemoChatResponse {
  id: string;
  trigger: string[];
  response: string;
  category: string;
}

export interface DemoImageSample {
  id: string;
  prompt: string;
  url: string;
  style: string;
}

export interface DemoVideoSample {
  id: string;
  prompt: string;
  url: string;
  duration: number;
  thumbnail?: string;
}

export interface DemoCodeSample {
  id: string;
  description: string;
  type: string;
  language: string;
  code: string;
  filePath: string;
  explanation: string;
}

const defaultConfig: DemoModeConfig = {
  enabled: false,
  showIndicator: true,
  simulateDelays: true,
  minDelayMs: 500,
  maxDelayMs: 2500,
};

class DemoModeManager {
  private config: DemoModeConfig;
  private chatResponses: DemoChatResponse[] = [];
  private imageSamples: DemoImageSample[] = [];
  private videoSamples: DemoVideoSample[] = [];
  private codeSamples: DemoCodeSample[] = [];
  private initialized = false;

  constructor() {
    this.config = { ...defaultConfig };
    this.checkEnvironment();
  }

  private checkEnvironment(): void {
    const envDemoMode = process.env.DEMO_MODE?.toLowerCase();
    if (envDemoMode === "true" || envDemoMode === "1" || envDemoMode === "yes") {
      this.config.enabled = true;
      console.log("[DemoMode] Demo mode enabled via environment variable");
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  enable(): void {
    this.config.enabled = true;
    console.log("[DemoMode] Demo mode enabled");
  }

  disable(): void {
    this.config.enabled = false;
    console.log("[DemoMode] Demo mode disabled");
  }

  toggle(): boolean {
    this.config.enabled = !this.config.enabled;
    console.log(`[DemoMode] Demo mode ${this.config.enabled ? "enabled" : "disabled"}`);
    return this.config.enabled;
  }

  getConfig(): DemoModeConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<DemoModeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.chatResponses = this.getBuiltInChatResponses();
      this.imageSamples = this.getBuiltInImageSamples();
      this.videoSamples = this.getBuiltInVideoSamples();
      this.codeSamples = this.getBuiltInCodeSamples();
      this.initialized = true;
      console.log("[DemoMode] Initialized with built-in demo content");
    } catch (error) {
      console.error("[DemoMode] Failed to initialize:", error);
    }
  }

  private getBuiltInChatResponses(): DemoChatResponse[] {
    return [
      {
        id: "greeting",
        trigger: ["hello", "hi", "hey", "greetings"],
        response: "Hello! I'm Jarvis, your AI assistant for Nebula Command. I can help you manage your homelab infrastructure, generate code, create images and videos, and much more. What would you like to do today?",
        category: "greeting",
      },
      {
        id: "status",
        trigger: ["status", "what's running", "server status", "check status"],
        response: "📊 **Infrastructure Status**\n\n✅ **Linode Server** - All services healthy\n  - Discord Bot: Running (4000)\n  - Stream Bot: Running (3000)\n  - Dashboard: Running (5000)\n  - PostgreSQL: Connected\n  - Redis: Connected\n\n✅ **Home Server** - Online\n  - Plex: Running (32400)\n  - Home Assistant: Running (8123)\n  - MinIO: Running (9000)\n\n✅ **Windows VM (GPU)** - Online\n  - Ollama: Running (11434)\n  - ComfyUI: Running (8188)\n  - Stable Diffusion: Running (7860)\n\n🟢 All 12 services operational",
        category: "infrastructure",
      },
      {
        id: "ai-status",
        trigger: ["ai status", "ai services", "what ai", "ollama", "models"],
        response: "🤖 **AI Services Status**\n\n**Local GPU (Windows VM)**\n✅ Ollama: Online (3 models loaded)\n  - llama3.2:latest (3.2B params)\n  - mistral:latest (7B params)\n  - codellama:latest (7B params)\n\n✅ Stable Diffusion: Online\n  - Model: SDXL 1.0\n  - VAE: sdxl_vae\n  - VRAM: 8.2GB / 12GB\n\n✅ ComfyUI: Online\n  - Workflows: 15 available\n  - AnimateDiff: Ready\n  - SVD: Ready\n\n**Cloud Providers**\n✅ OpenAI: Connected\n✅ Replicate: Connected",
        category: "ai",
      },
      {
        id: "generate-image",
        trigger: ["generate image", "create image", "make image", "picture of"],
        response: "🎨 **Image Generated Successfully!**\n\nI've created your image using local Stable Diffusion on the GPU.\n\n**Details:**\n- Model: SDXL 1.0\n- Resolution: 1024x1024\n- Steps: 30\n- Sampler: DPM++ 2M Karras\n- Generation Time: 4.2s\n\n[Image would be displayed here in demo mode]\n\nWould you like me to generate variations or adjust the style?",
        category: "creative",
      },
      {
        id: "generate-video",
        trigger: ["generate video", "create video", "make video", "animate"],
        response: "🎬 **Video Generation Started!**\n\nQueued video generation on ComfyUI.\n\n**Job Details:**\n- Model: AnimateDiff v3\n- Frames: 16\n- FPS: 8\n- Resolution: 512x512\n- Estimated Time: 45s\n\n📊 Progress: Initializing...\n\n[Video preview would be displayed here in demo mode]\n\nI'll notify you when it's complete!",
        category: "creative",
      },
      {
        id: "deploy",
        trigger: ["deploy", "push to production", "update services"],
        response: "🚀 **Deployment Initiated**\n\n**Target:** Linode Production Server\n**Services:** dashboard-next, discord-bot\n\n📋 **Deployment Steps:**\n1. ✅ Code validation passed\n2. ✅ Tests passing (23/23)\n3. ✅ Docker images built\n4. ✅ Pushed to registry\n5. ⏳ Rolling update in progress...\n\n**ETA:** ~2 minutes\n\nI'll notify you when the deployment is complete.",
        category: "infrastructure",
      },
      {
        id: "code-help",
        trigger: ["write code", "create component", "generate code", "help with code"],
        response: "💻 **Code Generation Ready**\n\nI can help you create:\n- React/Next.js components\n- API routes and endpoints\n- Python scripts and modules\n- Discord bot commands\n- Database schemas\n- Full project scaffolds\n\nJust describe what you need and I'll generate production-ready code with proper typing, error handling, and best practices.\n\nExample: \"Create a React component for a user profile card with avatar, name, and bio\"",
        category: "development",
      },
      {
        id: "docker-action",
        trigger: ["restart", "stop container", "start container", "docker"],
        response: "🐳 **Container Action Executed**\n\n**Action:** restart\n**Container:** discord-bot\n**Status:** ✅ Success\n\n```\nContainer stopped successfully\nContainer started successfully\nHealth check: passing\nUptime: 12 seconds\n```\n\nThe service is now running and healthy.",
        category: "infrastructure",
      },
      {
        id: "logs",
        trigger: ["show logs", "get logs", "view logs", "debug"],
        response: "📜 **Recent Logs - discord-bot**\n\n```\n[2025-01-19 12:00:01] INFO  Bot connected to Discord\n[2025-01-19 12:00:02] INFO  Loaded 45 slash commands\n[2025-01-19 12:00:03] INFO  Connected to 3 guilds\n[2025-01-19 12:00:15] INFO  Handling command: /play\n[2025-01-19 12:00:16] INFO  Music queue updated\n[2025-01-19 12:01:00] INFO  Heartbeat sent\n```\n\nNo errors in the last 100 log entries. Service is healthy.",
        category: "infrastructure",
      },
      {
        id: "capabilities",
        trigger: ["what can you do", "capabilities", "help", "features"],
        response: "🌟 **Jarvis Capabilities**\n\n**🎨 Creative Generation**\n- Image generation (DALL-E & local SD)\n- Video generation (AnimateDiff, SVD)\n- Face swap & enhancement\n\n**🐳 Infrastructure Management**\n- Docker container control\n- Server deployments\n- Health monitoring\n- Log analysis\n\n**💻 Code Development**\n- Code generation & analysis\n- Bug fixing & optimization\n- File creation & editing\n- Multi-agent orchestration\n\n**🧠 AI Model Management**\n- Browse & install models\n- Monitor GPU resources\n- Manage local vs cloud routing\n\nJust ask and I'll help!",
        category: "help",
      },
    ];
  }

  private getBuiltInImageSamples(): DemoImageSample[] {
    return [
      {
        id: "demo-landscape-1",
        prompt: "A beautiful sunset over mountains with a lake reflection",
        url: "/demo/image-samples/landscape-sunset.jpg",
        style: "photorealistic",
      },
      {
        id: "demo-scifi-1",
        prompt: "Futuristic cyberpunk city at night with neon lights",
        url: "/demo/image-samples/cyberpunk-city.jpg",
        style: "digital-art",
      },
      {
        id: "demo-abstract-1",
        prompt: "Abstract flowing colors representing AI consciousness",
        url: "/demo/image-samples/abstract-ai.jpg",
        style: "abstract",
      },
      {
        id: "demo-robot-1",
        prompt: "Friendly robot assistant in a modern office",
        url: "/demo/image-samples/robot-assistant.jpg",
        style: "3d-render",
      },
      {
        id: "demo-space-1",
        prompt: "Deep space nebula with colorful gas clouds and stars",
        url: "/demo/image-samples/space-nebula.jpg",
        style: "photorealistic",
      },
    ];
  }

  private getBuiltInVideoSamples(): DemoVideoSample[] {
    return [
      {
        id: "demo-video-1",
        prompt: "Smooth camera pan across a futuristic dashboard interface",
        url: "/demo/video-samples/dashboard-pan.mp4",
        duration: 4,
        thumbnail: "/demo/video-samples/dashboard-pan-thumb.jpg",
      },
      {
        id: "demo-video-2",
        prompt: "Animated logo reveal with particle effects",
        url: "/demo/video-samples/logo-reveal.mp4",
        duration: 3,
        thumbnail: "/demo/video-samples/logo-reveal-thumb.jpg",
      },
      {
        id: "demo-video-3",
        prompt: "Abstract flowing geometry morphing and transforming",
        url: "/demo/video-samples/abstract-flow.mp4",
        duration: 5,
        thumbnail: "/demo/video-samples/abstract-flow-thumb.jpg",
      },
    ];
  }

  private getBuiltInCodeSamples(): DemoCodeSample[] {
    return [
      {
        id: "demo-code-1",
        description: "React component for a user profile card",
        type: "component",
        language: "react",
        code: `import React from 'react';

interface UserProfileCardProps {
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  role: 'admin' | 'user' | 'guest';
}

export function UserProfileCard({ name, email, avatar, bio, role }: UserProfileCardProps) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <img
          src={avatar || '/default-avatar.png'}
          alt={name}
          className="h-16 w-16 rounded-full object-cover"
        />
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-sm text-muted-foreground">{email}</p>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {role}
          </span>
        </div>
      </div>
      {bio && (
        <p className="mt-4 text-sm text-muted-foreground">{bio}</p>
      )}
    </div>
  );
}`,
        filePath: "src/components/UserProfileCard.tsx",
        explanation: "A reusable React component for displaying user profile information with avatar, name, email, role badge, and optional bio.",
      },
      {
        id: "demo-code-2",
        description: "Express API endpoint with authentication",
        type: "api",
        language: "typescript",
        code: `import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.enum(['electronics', 'clothing', 'food', 'other']),
});

router.post('/items', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createItemSchema.parse(req.body);
    
    const item = await prisma.item.create({
      data: {
        ...data,
        userId: req.user.id,
      },
    });
    
    res.status(201).json({ success: true, item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

export default router;`,
        filePath: "src/routes/items.ts",
        explanation: "A secure Express.js API endpoint for creating items with Zod validation, JWT authentication, and Prisma database integration.",
      },
      {
        id: "demo-code-3",
        description: "Python async web scraper",
        type: "file",
        language: "python",
        code: `import asyncio
import aiohttp
from typing import List, Dict, Any
from dataclasses import dataclass
from bs4 import BeautifulSoup
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ScrapedPage:
    url: str
    title: str
    content: str
    links: List[str]

class AsyncWebScraper:
    def __init__(self, max_concurrent: int = 10):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_page(self, session: aiohttp.ClientSession, url: str) -> ScrapedPage | None:
        async with self.semaphore:
            try:
                async with session.get(url, timeout=30) as response:
                    if response.status == 200:
                        html = await response.text()
                        return self._parse_page(url, html)
            except Exception as e:
                logger.error(f"Error fetching {url}: {e}")
            return None
    
    def _parse_page(self, url: str, html: str) -> ScrapedPage:
        soup = BeautifulSoup(html, 'html.parser')
        title = soup.title.string if soup.title else ''
        content = soup.get_text(separator=' ', strip=True)[:1000]
        links = [a.get('href') for a in soup.find_all('a', href=True)]
        return ScrapedPage(url=url, title=title, content=content, links=links)
    
    async def scrape_urls(self, urls: List[str]) -> List[ScrapedPage]:
        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_page(session, url) for url in urls]
            results = await asyncio.gather(*tasks)
            return [r for r in results if r is not None]

if __name__ == "__main__":
    scraper = AsyncWebScraper()
    urls = ["https://example.com", "https://httpbin.org/html"]
    results = asyncio.run(scraper.scrape_urls(urls))
    for page in results:
        print(f"Title: {page.title}")`,
        filePath: "src/scraper.py",
        explanation: "An asynchronous web scraper using aiohttp and BeautifulSoup with rate limiting via semaphores and proper error handling.",
      },
    ];
  }

  async simulateDelay(): Promise<void> {
    if (!this.config.simulateDelays) return;

    const delay = Math.random() * (this.config.maxDelayMs - this.config.minDelayMs) + this.config.minDelayMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async getChatResponse(message: string): Promise<{ content: string; provider: string; model: string; isDemo: boolean } | null> {
    if (!this.config.enabled) return null;

    await this.initialize();
    const lowerMessage = message.toLowerCase();

    for (const response of this.chatResponses) {
      if (response.trigger.some((t) => lowerMessage.includes(t))) {
        await this.simulateDelay();
        return {
          content: response.response,
          provider: "demo",
          model: "jarvis-demo",
          isDemo: true,
        };
      }
    }

    await this.simulateDelay();
    return {
      content: this.getDefaultResponse(),
      provider: "demo",
      model: "jarvis-demo",
      isDemo: true,
    };
  }

  private getDefaultResponse(): string {
    return `I understand you're asking about something specific. In demo mode, I'm showing cached responses. Here's what I can help with:

🎨 **Creative:** "generate an image of..." or "create a video..."
🐳 **Infrastructure:** "check status" or "restart [service]"
💻 **Development:** "create a component" or "help with code"
🤖 **AI:** "ai status" or "what models are available"

Try one of these commands to see demo responses!`;
  }

  async getRandomImage(): Promise<DemoImageSample | null> {
    if (!this.config.enabled) return null;

    await this.initialize();
    await this.simulateDelay();

    const randomIndex = Math.floor(Math.random() * this.imageSamples.length);
    return this.imageSamples[randomIndex];
  }

  async getImageByPrompt(prompt: string): Promise<DemoImageSample | null> {
    if (!this.config.enabled) return null;

    await this.initialize();
    await this.simulateDelay();

    const lowerPrompt = prompt.toLowerCase();
    const matched = this.imageSamples.find((img) =>
      lowerPrompt.includes(img.style) || img.prompt.toLowerCase().includes(lowerPrompt.split(" ")[0])
    );

    return matched || this.imageSamples[Math.floor(Math.random() * this.imageSamples.length)];
  }

  async getRandomVideo(): Promise<DemoVideoSample | null> {
    if (!this.config.enabled) return null;

    await this.initialize();
    await this.simulateDelay();

    const randomIndex = Math.floor(Math.random() * this.videoSamples.length);
    return this.videoSamples[randomIndex];
  }

  async getCodeSample(type?: string, language?: string): Promise<DemoCodeSample | null> {
    if (!this.config.enabled) return null;

    await this.initialize();
    await this.simulateDelay();

    let filtered = this.codeSamples;

    if (type) {
      filtered = filtered.filter((s) => s.type === type);
    }
    if (language) {
      filtered = filtered.filter((s) => s.language.toLowerCase() === language.toLowerCase());
    }

    if (filtered.length === 0) {
      filtered = this.codeSamples;
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    return filtered[randomIndex];
  }

  getStatus(): {
    enabled: boolean;
    config: DemoModeConfig;
    contentLoaded: {
      chatResponses: number;
      imageSamples: number;
      videoSamples: number;
      codeSamples: number;
    };
  } {
    return {
      enabled: this.config.enabled,
      config: this.config,
      contentLoaded: {
        chatResponses: this.chatResponses.length,
        imageSamples: this.imageSamples.length,
        videoSamples: this.videoSamples.length,
        codeSamples: this.codeSamples.length,
      },
    };
  }
}

export const demoMode = new DemoModeManager();
