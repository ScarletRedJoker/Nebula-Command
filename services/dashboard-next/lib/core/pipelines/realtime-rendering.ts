/**
 * Real-Time Rendering Pipeline
 * 
 * Provides abstractions for real-time rendering suitable for:
 * - Game engines (60fps+ rendering loops)
 * - AR/VR applications (90fps+ with low latency)
 * - Live streaming overlays
 * - Interactive 3D content
 * 
 * Designed for extensibility and GPU acceleration.
 */

import type { 
  IRenderingService, 
  RenderScene, 
  RenderOptions, 
  RenderResult,
  GPUStats 
} from '../interfaces/rendering-service';
import type { IService, ServiceCapability, ServiceHealth, ServiceType } from '../interfaces/service';

/**
 * Frame timing information for performance monitoring
 */
export interface FrameTiming {
  frameNumber: number;
  timestamp: number;
  deltaTime: number;
  cpuTime: number;
  gpuTime: number;
  presentTime: number;
  targetFps: number;
  actualFps: number;
}

/**
 * Render pass for deferred/forward rendering
 */
export interface RenderPass {
  name: string;
  type: 'geometry' | 'lighting' | 'post-process' | 'ui' | 'debug';
  enabled: boolean;
  priority: number;
  execute(context: RenderContext): Promise<void>;
}

/**
 * Render context passed through the pipeline
 */
export interface RenderContext {
  scene: RenderScene;
  camera: CameraState;
  viewport: Viewport;
  frameNumber: number;
  deltaTime: number;
  time: number;
  renderTargets: Map<string, RenderTarget>;
  uniforms: Map<string, unknown>;
}

/**
 * Camera state for real-time rendering
 */
export interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion
  fov: number;
  near: number;
  far: number;
  projectionMatrix: number[];
  viewMatrix: number[];
}

/**
 * Viewport configuration
 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Render target for multi-pass rendering
 */
export interface RenderTarget {
  id: string;
  width: number;
  height: number;
  format: 'rgba8' | 'rgba16f' | 'rgba32f' | 'depth24' | 'depth32f';
  samples: number;
  texture?: unknown; // Backend-specific texture handle
}

/**
 * Frame buffer for presenting rendered content
 */
export interface FrameBuffer {
  colorAttachments: RenderTarget[];
  depthAttachment?: RenderTarget;
  stencilAttachment?: RenderTarget;
}

/**
 * Real-time rendering loop configuration
 */
export interface RenderLoopConfig {
  targetFps: number;
  vsync: boolean;
  fixedTimestep: boolean;
  maxDeltaTime: number;
  adaptiveQuality: boolean;
  qualityLevels: QualityLevel[];
}

/**
 * Quality presets for adaptive rendering
 */
export interface QualityLevel {
  name: string;
  resolutionScale: number;
  shadowQuality: 'off' | 'low' | 'medium' | 'high' | 'ultra';
  antiAliasing: 'none' | 'fxaa' | 'smaa' | 'taa' | 'msaa4x' | 'msaa8x';
  effectsEnabled: boolean;
  maxLights: number;
}

/**
 * Real-time rendering pipeline interface
 * 
 * Provides frame-by-frame rendering with configurable passes,
 * quality scaling, and performance monitoring.
 */
export interface IRealtimeRenderingPipeline extends IRenderingService {
  /**
   * Configure the render loop
   */
  configure(config: Partial<RenderLoopConfig>): void;
  
  /**
   * Start the render loop
   */
  start(): void;
  
  /**
   * Stop the render loop
   */
  stop(): void;
  
  /**
   * Check if render loop is running
   */
  isRunning(): boolean;
  
  /**
   * Add a render pass to the pipeline
   */
  addPass(pass: RenderPass): void;
  
  /**
   * Remove a render pass by name
   */
  removePass(name: string): void;
  
  /**
   * Get all configured passes
   */
  getPasses(): RenderPass[];
  
  /**
   * Render a single frame (manual mode)
   */
  renderFrame(scene: RenderScene, camera: CameraState): Promise<RenderResult>;
  
  /**
   * Get current frame timing
   */
  getFrameTiming(): FrameTiming;
  
  /**
   * Get average FPS over last N frames
   */
  getAverageFps(sampleCount?: number): number;
  
  /**
   * Set quality level
   */
  setQualityLevel(level: string): void;
  
  /**
   * Get current quality level
   */
  getQualityLevel(): QualityLevel;
  
  /**
   * Register frame callback (called each frame)
   */
  onFrame(callback: (timing: FrameTiming) => void): () => void;
  
  /**
   * Create a render target for off-screen rendering
   */
  createRenderTarget(config: Omit<RenderTarget, 'id'>): RenderTarget;
  
  /**
   * Dispose a render target
   */
  disposeRenderTarget(id: string): void;
}

/**
 * XR (AR/VR) rendering pipeline extension
 * 
 * Extends real-time rendering for immersive experiences
 * with stereo rendering, pose tracking, and low latency.
 */
export interface IXRRenderingPipeline extends IRealtimeRenderingPipeline {
  /**
   * Enable XR mode with specific configuration
   */
  enableXR(mode: 'vr' | 'ar' | 'mr'): Promise<void>;
  
  /**
   * Disable XR mode
   */
  disableXR(): void;
  
  /**
   * Check if XR is active
   */
  isXRActive(): boolean;
  
  /**
   * Get XR session info
   */
  getXRSession(): XRSessionInfo | null;
  
  /**
   * Render stereo frame for VR/MR headsets
   */
  renderStereoFrame(
    scene: RenderScene,
    leftEye: CameraState,
    rightEye: CameraState
  ): Promise<StereoRenderResult>;
  
  /**
   * Submit frame to XR runtime
   */
  submitXRFrame(frame: XRFrameData): Promise<void>;
  
  /**
   * Get predicted pose for next frame (for latency compensation)
   */
  getPredictedPose(deltaMs: number): XRPredictedPose;
}

/**
 * XR session information
 */
export interface XRSessionInfo {
  mode: 'vr' | 'ar' | 'mr';
  referenceSpace: string;
  targetFrameRate: number;
  views: number;
  boundaryVisible: boolean;
}

/**
 * Stereo render result for VR
 */
export interface StereoRenderResult {
  leftEye: RenderResult;
  rightEye: RenderResult;
  timing: FrameTiming;
}

/**
 * XR frame data for submission
 */
export interface XRFrameData {
  timestamp: number;
  pose: XRPredictedPose;
  layers: XRLayer[];
}

/**
 * Predicted XR pose
 */
export interface XRPredictedPose {
  position: [number, number, number];
  orientation: [number, number, number, number];
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
}

/**
 * XR composition layer
 */
export interface XRLayer {
  type: 'projection' | 'quad' | 'cylinder' | 'equirect';
  texture: unknown;
  transform?: {
    position: [number, number, number];
    orientation: [number, number, number, number];
    scale: [number, number, number];
  };
}

/**
 * Streaming render pipeline for live content
 * 
 * Optimized for encoding and streaming rendered content
 * to video platforms or remote clients.
 */
export interface IStreamingRenderPipeline extends IRealtimeRenderingPipeline {
  /**
   * Configure streaming output
   */
  configureStreaming(config: StreamingConfig): void;
  
  /**
   * Start streaming to a destination
   */
  startStreaming(destination: StreamDestination): Promise<void>;
  
  /**
   * Stop streaming
   */
  stopStreaming(): Promise<void>;
  
  /**
   * Check if streaming is active
   */
  isStreaming(): boolean;
  
  /**
   * Get streaming statistics
   */
  getStreamingStats(): StreamingStats;
  
  /**
   * Capture current frame as image
   */
  captureFrame(format: 'png' | 'jpg' | 'webp'): Promise<Uint8Array>;
  
  /**
   * Record frames to video
   */
  startRecording(config: RecordingConfig): Promise<void>;
  
  /**
   * Stop recording and get video
   */
  stopRecording(): Promise<Uint8Array>;
}

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  encoder: 'h264' | 'h265' | 'vp9' | 'av1';
  bitrate: number;
  keyframeInterval: number;
  latencyMode: 'low' | 'normal' | 'high-quality';
}

/**
 * Stream destination
 */
export interface StreamDestination {
  type: 'rtmp' | 'webrtc' | 'hls' | 'file';
  url?: string;
  streamKey?: string;
}

/**
 * Streaming statistics
 */
export interface StreamingStats {
  bitrate: number;
  framesEncoded: number;
  framesDropped: number;
  bufferHealth: number;
  latencyMs: number;
}

/**
 * Recording configuration
 */
export interface RecordingConfig {
  format: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

/**
 * Factory for creating rendering pipelines
 */
export interface IRenderingPipelineFactory {
  /**
   * Create a standard real-time rendering pipeline
   */
  createRealtimePipeline(config?: Partial<RenderLoopConfig>): IRealtimeRenderingPipeline;
  
  /**
   * Create an XR-enabled rendering pipeline
   */
  createXRPipeline(config?: Partial<RenderLoopConfig>): IXRRenderingPipeline;
  
  /**
   * Create a streaming-enabled rendering pipeline
   */
  createStreamingPipeline(config?: Partial<RenderLoopConfig>): IStreamingRenderPipeline;
  
  /**
   * Get available rendering backends
   */
  getAvailableBackends(): string[];
}
