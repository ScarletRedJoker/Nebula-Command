import { ComfyUIClient } from '@/lib/ai/providers/comfyui';
import { StableDiffusionProvider } from '@/lib/ai/providers/stable-diffusion';
import { projectManager } from './project-manager';
import type { 
  AssetType, 
  AssetGenerationRequest, 
  AssetGenerationResult,
  GameAsset 
} from './types';
import { ASSET_TYPE_CONFIGS } from './types';

export interface GenerationOptions {
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  style?: string;
  negativePrompt?: string;
}

export class GameAssetGenerator {
  private comfyClient: ComfyUIClient;
  private sdProvider: StableDiffusionProvider;

  constructor() {
    this.comfyClient = new ComfyUIClient();
    this.sdProvider = new StableDiffusionProvider();
  }

  private buildPrompt(basePrompt: string, type: AssetType, style?: string): string {
    const config = ASSET_TYPE_CONFIGS[type];
    let prompt = `${config.promptPrefix} ${basePrompt}`;
    
    if (style) {
      prompt = `${prompt}, ${style} style`;
    }

    return prompt;
  }

  private buildNegativePrompt(type: AssetType, additional?: string): string {
    const config = ASSET_TYPE_CONFIGS[type];
    if (additional) {
      return `${config.negativePrompt}, ${additional}`;
    }
    return config.negativePrompt;
  }

  async checkHealth(): Promise<{ comfyui: boolean; stableDiffusion: boolean }> {
    const [comfyHealth, sdHealth] = await Promise.all([
      this.comfyClient.health(),
      this.sdProvider.checkHealth(),
    ]);

    return {
      comfyui: comfyHealth,
      stableDiffusion: sdHealth,
    };
  }

  async generateAsset(request: AssetGenerationRequest): Promise<AssetGenerationResult> {
    try {
      const config = ASSET_TYPE_CONFIGS[request.type];
      const width = request.width || config.defaultWidth;
      const height = request.height || config.defaultHeight;

      const prompt = this.buildPrompt(request.prompt, request.type, request.style);
      const negativePrompt = this.buildNegativePrompt(request.type, request.negativePrompt);

      const sdAvailable = await this.sdProvider.checkHealth();
      
      if (!sdAvailable) {
        return {
          success: false,
          error: 'Stable Diffusion is not available. Please ensure the Windows VM is running.',
        };
      }

      const result = await this.sdProvider.txt2img({
        prompt,
        negativePrompt,
        width,
        height,
        steps: 30,
        cfgScale: 7,
        samplerName: 'DPM++ 2M Karras',
      });

      if (!result.images || result.images.length === 0) {
        return {
          success: false,
          error: 'No images were generated',
        };
      }

      const imageBase64 = result.images[0];
      const fileSize = Math.round((imageBase64.length * 3) / 4);

      const asset = await projectManager.createAsset({
        projectId: request.projectId,
        name: request.name,
        type: request.type,
        prompt: request.prompt,
        style: request.style,
        filePath: `data:image/png;base64,${imageBase64}`,
        fileSize,
        width,
        height,
        metadata: {
          generatedWith: 'stable-diffusion',
          seed: result.info?.seed,
          fullPrompt: prompt,
          negativePrompt,
        },
      });

      return {
        success: true,
        asset,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Asset generation failed: ${errorMessage}`,
      };
    }
  }

  async generateSprite(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'sprite',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateTexture(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'texture',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateCharacter(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'character',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateBackground(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'background',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateIcon(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'icon',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateUI(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'ui',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateTileset(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'tileset',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateBatch(
    requests: AssetGenerationRequest[]
  ): Promise<AssetGenerationResult[]> {
    const results: AssetGenerationResult[] = [];
    
    for (const request of requests) {
      const result = await this.generateAsset(request);
      results.push(result);
    }

    return results;
  }
}

export const assetGenerator = new GameAssetGenerator();
