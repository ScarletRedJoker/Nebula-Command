export type AssetType = 'sprite' | 'texture' | 'character' | 'background' | 'icon' | 'ui' | 'tileset';

export type GameEngineType = 'godot' | 'unity' | 'unreal' | 'custom';

export type ProjectStatus = 'concept' | 'development' | 'testing' | 'released';

export type BuildPlatform = 'windows' | 'linux' | 'macos' | 'web' | 'android' | 'ios';

export type BuildStatus = 'ready' | 'pending' | 'building' | 'failed' | 'not-configured';

export interface GameProject {
  id: string;
  name: string;
  engine: GameEngineType;
  description?: string | null;
  status: ProjectStatus;
  progress: number;
  metadata: Record<string, unknown>;
  userId?: string | null;
  repository?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameAsset {
  id: string;
  projectId: string;
  name: string;
  type: AssetType;
  prompt?: string | null;
  style?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface BuildTarget {
  id: string;
  platform: BuildPlatform;
  status: BuildStatus;
  lastBuild?: string;
  config?: Record<string, unknown>;
}

export interface GameEngine {
  id: GameEngineType;
  name: string;
  description: string;
  icon: string;
  status: 'available' | 'planned' | 'coming-soon';
  languages: string[];
  features: string[];
  documentationUrl?: string;
}

export interface AssetGenerationRequest {
  projectId: string;
  name: string;
  type: AssetType;
  prompt: string;
  style?: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
}

export interface AssetGenerationResult {
  success: boolean;
  asset?: GameAsset;
  error?: string;
}

export interface ProjectWithAssets extends GameProject {
  assets: GameAsset[];
}

export const ASSET_TYPE_CONFIGS: Record<AssetType, {
  defaultWidth: number;
  defaultHeight: number;
  promptPrefix: string;
  negativePrompt: string;
}> = {
  sprite: {
    defaultWidth: 64,
    defaultHeight: 64,
    promptPrefix: 'pixel art sprite, game asset, transparent background,',
    negativePrompt: 'blurry, low quality, text, watermark, signature',
  },
  texture: {
    defaultWidth: 512,
    defaultHeight: 512,
    promptPrefix: 'seamless texture, tileable pattern, game texture,',
    negativePrompt: 'text, watermark, non-tileable, seams visible',
  },
  character: {
    defaultWidth: 256,
    defaultHeight: 256,
    promptPrefix: 'game character design, full body, clear silhouette,',
    negativePrompt: 'blurry, low quality, text, watermark, cropped',
  },
  background: {
    defaultWidth: 1920,
    defaultHeight: 1080,
    promptPrefix: 'game background, environment art, detailed scenery,',
    negativePrompt: 'blurry, low quality, text, watermark, characters',
  },
  icon: {
    defaultWidth: 128,
    defaultHeight: 128,
    promptPrefix: 'game icon, UI element, clean design, bold colors,',
    negativePrompt: 'blurry, low quality, text, complex details',
  },
  ui: {
    defaultWidth: 256,
    defaultHeight: 256,
    promptPrefix: 'game UI element, interface design, clean edges,',
    negativePrompt: 'blurry, low quality, pixelated, uneven edges',
  },
  tileset: {
    defaultWidth: 256,
    defaultHeight: 256,
    promptPrefix: 'game tileset, modular tiles, seamless edges,',
    negativePrompt: 'blurry, low quality, non-modular, broken edges',
  },
};

export const GAME_ENGINES: GameEngine[] = [
  {
    id: 'godot',
    name: 'Godot Engine',
    description: 'Open-source game engine with GDScript and C# support',
    icon: '🎮',
    status: 'planned',
    languages: ['GDScript', 'C#', 'C++'],
    features: ['2D & 3D', 'Visual Scripting', 'Cross-platform', 'Open Source'],
    documentationUrl: 'https://docs.godotengine.org',
  },
  {
    id: 'unity',
    name: 'Unity',
    description: 'Industry-standard engine for mobile and indie games',
    icon: '🔷',
    status: 'planned',
    languages: ['C#'],
    features: ['Asset Store', 'Cross-platform', 'VR/AR Support', 'Cloud Build'],
    documentationUrl: 'https://docs.unity3d.com',
  },
  {
    id: 'unreal',
    name: 'Unreal Engine',
    description: 'AAA-quality game engine by Epic Games',
    icon: '⚡',
    status: 'coming-soon',
    languages: ['C++', 'Blueprints'],
    features: ['Photorealistic Graphics', 'Nanite', 'Lumen', 'MetaHumans'],
    documentationUrl: 'https://docs.unrealengine.com',
  },
  {
    id: 'custom',
    name: 'Custom Engine',
    description: 'Build your own game engine or integrate proprietary ones',
    icon: '🛠️',
    status: 'planned',
    languages: ['C++', 'Rust', 'Any'],
    features: ['Full Control', 'Optimized Performance', 'Custom Tooling'],
  },
];
