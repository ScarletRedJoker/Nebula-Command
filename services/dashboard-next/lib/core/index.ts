/**
 * Nebula Command Core Module
 * 
 * This module provides the foundational abstractions for building
 * extensible AI-powered applications, game engines, AR/VR runtimes,
 * and simulation systems.
 * 
 * ## Architecture Overview
 * 
 * The core module is organized into three main areas:
 * 
 * ### 1. Interfaces (`./interfaces/`)
 * Clean abstractions that decouple application logic from specific implementations:
 * - `IService` - Base service contract for all platform services
 * - `IAIService` - AI capabilities (chat, embeddings, generation)
 * - `IRenderingService` - 2D/3D rendering capabilities
 * - `IPipeline` - Generic multi-stage processing pipelines
 * - `IExtension` - Extension point for plugins and add-ons
 * 
 * ### 2. Registry (`./registry/`)
 * Dynamic service discovery and management:
 * - `ServiceRegistry` - Register and discover services
 * - `CapabilityMatcher` - Find services by capability
 * - `ServiceDiscovery` - Distributed service discovery
 * 
 * ### 3. Extensions (`./extensions/`)
 * Pluggable extension system for future capabilities:
 * - `ExtensionLoader` - Load extensions from manifests
 * - `IGameEngineExtension` - Game engine integration
 * - `IARVRExtension` - AR/VR runtime integration
 * - `ISimulationExtension` - Physics/simulation integration
 * - `IRenderingBackendExtension` - GPU backend abstraction
 * 
 * ### 4. Pipelines (`./pipelines/`)
 * Specialized pipeline implementations:
 * - `IRealtimeRenderingPipeline` - 60fps+ game rendering
 * - `IXRRenderingPipeline` - VR/AR stereo rendering
 * - `IStreamingRenderPipeline` - Live streaming output
 * 
 * ## Usage Examples
 * 
 * ```typescript
 * import { 
 *   ServiceRegistry, 
 *   CapabilityMatcher,
 *   IAIService,
 *   IRealtimeRenderingPipeline 
 * } from '@/lib/core';
 * 
 * // Get AI service with specific capabilities
 * const registry = ServiceRegistry.getInstance();
 * const matcher = new CapabilityMatcher();
 * const aiService = matcher.findBestMatch(
 *   { required: ['chat', 'embeddings'], preferred: ['image-generation'] },
 *   registry.getByType('ai')
 * ) as IAIService;
 * 
 * // Use the service
 * const response = await aiService.chat({
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   model: 'default'
 * });
 * ```
 * 
 * ## Design Principles
 * 
 * 1. **Interface Segregation**: Small, focused interfaces
 * 2. **Dependency Inversion**: Depend on abstractions, not concretions
 * 3. **Open/Closed**: Open for extension, closed for modification
 * 4. **Build-Time Safety**: No side effects during compilation
 * 
 * @module core
 */

// Core interfaces (primary definitions)
export * from './interfaces';

// Service registry and discovery
export {
  ServiceRegistry,
  CapabilityMatcher,
  ServiceDiscovery,
  type DiscoveryConfig,
  type DiscoveredService,
  type ServiceChange,
  type CapabilityQuery,
} from './registry';

// Extension system (avoid conflicts with interfaces)
export {
  ExtensionLoader,
  type ExtensionManifest,
} from './extensions/extension-loader';

export {
  type IGameEngineExtension as GameEngineExtension,
  type IGameScene,
  type GameObject,
  type GameComponent,
  type AssetDescriptor,
  type GameAsset,
  type EngineCapabilities,
} from './extensions/game-engine';

export {
  type IARVRExtension as ARVRExtension,
  type IXRSession,
  type XRHitTestResult,
  type XRPlane,
  type XRMesh,
  type XRHandData,
  type XRInputSource,
  type XRView,
  type XRFrame,
  type XRPose,
  type XRDeviceCapabilities,
} from './extensions/ar-vr-runtime';

export {
  type ISimulationExtension as SimulationExtension,
  type IPhysicsWorld,
  type RigidBody,
  type CollisionShape,
  type Constraint,
  type RaycastHit,
  type Contact,
  type WorldConfig,
  type SimulationFeatures,
} from './extensions/simulation-engine';

export {
  type IRenderingBackendExtension as RenderingBackendExtension,
  type IRenderContext,
  type ShaderSource,
  type CompiledShader,
  type ShaderReflection,
  type PipelineConfig,
  type VertexLayout,
  type TextureConfig,
  type BufferConfig,
  type BackendCapabilities,
} from './extensions/rendering-backend';

// Specialized pipelines
export {
  type IRealtimeRenderingPipeline,
  type IXRRenderingPipeline,
  type IStreamingRenderPipeline,
  type IRenderingPipelineFactory,
  type RenderLoopConfig,
  type RenderPass as RealtimeRenderPass,
  type RenderContext as RealtimeRenderContext,
  type RenderTarget as RealtimeRenderTarget,
  type FrameTiming,
  type QualityLevel,
  type CameraState,
  type Viewport,
  type StreamingConfig,
  type StreamingStats,
  type RecordingConfig,
  type XRSessionInfo,
  type StereoRenderResult,
} from './pipelines';
