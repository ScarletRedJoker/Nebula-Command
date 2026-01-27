import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ComfyUIOutputAsset } from './comfyui-orchestrator';

export interface GeneratedFrame {
  shotIndex: number;
  jobId?: string;
  status?: 'pending' | 'completed' | 'failed';
  outputAssets: ComfyUIOutputAsset[] | null;
  localPath?: string;
  thumbnailPath?: string;
}

export interface AssemblyOptions {
  fps?: number;
  format?: 'mp4' | 'webm';
  codec?: 'libx264' | 'libx265' | 'libvpx-vp9';
  resolution?: string | { width: number; height: number };
  transitionType?: 'none' | 'fade' | 'dissolve' | 'crossfade';
  transitionDuration?: number;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  frameDuration?: number;
  projectId?: string;
}

export interface VideoAssemblyResult {
  success: boolean;
  videoPath: string;
  thumbnailPath?: string;
  duration: number;
  fileSize: number;
  format: string;
  resolution: { width: number; height: number };
  url?: string;
}

export interface AudioMixResult {
  success: boolean;
  outputPath: string;
  duration: number;
  fileSize: number;
}

export interface ThumbnailResult {
  success: boolean;
  thumbnailPath: string;
  fileSize: number;
  resolution: { width: number; height: number };
}

export interface ConcatenateResult {
  success: boolean;
  outputPath: string;
  duration: number;
  fileSize: number;
  segmentCount: number;
}

const STORAGE_BASE_PATH = 'storage/ai/influencer';

const QUALITY_PRESETS = {
  low: { crf: 28, preset: 'fast', audioBitrate: '96k' },
  medium: { crf: 23, preset: 'medium', audioBitrate: '128k' },
  high: { crf: 18, preset: 'slow', audioBitrate: '192k' },
  ultra: { crf: 14, preset: 'veryslow', audioBitrate: '320k' },
};

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4K': { width: 3840, height: 2160 },
};

const DEFAULT_OPTIONS: Required<AssemblyOptions> = {
  fps: 30,
  format: 'mp4',
  codec: 'libx264',
  resolution: { width: 1920, height: 1080 },
  transitionType: 'none',
  transitionDuration: 0.5,
  quality: 'high',
  frameDuration: 3,
  projectId: '',
};

function log(level: 'info' | 'warn' | 'error' | 'debug', operation: string, message: string, metadata?: Record<string, unknown>): void {
  const prefix = `[VideoAssembly:${operation}]`;
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
  switch (level) {
    case 'debug': console.debug(`${prefix} ${message}${metaStr}`); break;
    case 'info': console.log(`${prefix} ${message}${metaStr}`); break;
    case 'warn': console.warn(`${prefix} ${message}${metaStr}`); break;
    case 'error': console.error(`${prefix} ${message}${metaStr}`); break;
  }
}

function parseResolution(resolution: string | { width: number; height: number } | undefined): { width: number; height: number } {
  if (!resolution) return { width: 1920, height: 1080 };
  if (typeof resolution === 'object') return resolution;
  return RESOLUTION_MAP[resolution] || { width: 1920, height: 1080 };
}

function runFFmpeg(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => { stdout += data.toString(); });
    process.stderr.on('data', (data) => { stderr += data.toString(); });

    process.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

function runFFprobe(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => { stdout += data.toString(); });
    process.stderr.on('data', (data) => { stderr += data.toString(); });

    process.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

class VideoAssemblyService {
  private storagePath: string;

  constructor(storagePath: string = STORAGE_BASE_PATH) {
    this.storagePath = storagePath;
  }

  async assembleVideo(
    frames: GeneratedFrame[],
    audioPath?: string,
    musicPath?: string,
    options: AssemblyOptions = {}
  ): Promise<VideoAssemblyResult> {
    const parsedResolution = parseResolution(options.resolution);
    const opts = { ...DEFAULT_OPTIONS, ...options, resolution: parsedResolution };
    const storageProjectId = options.projectId || randomUUID();
    const projectDir = await this.ensureProjectDirectory(storageProjectId);
    
    log('info', 'assembleVideo', 'Starting video assembly', {
      frameCount: frames.length,
      projectId: storageProjectId,
      hasAudio: !!audioPath,
      hasMusic: !!musicPath,
      format: opts.format,
    });

    try {
      const validFrames = frames
        .filter(f => f.localPath || (f.outputAssets && f.outputAssets.length > 0))
        .sort((a, b) => a.shotIndex - b.shotIndex);

      if (validFrames.length === 0) {
        throw new Error('No valid frames provided for video assembly');
      }

      const frameListPath = path.join(projectDir, 'frames.txt');
      await this.createFrameListFile(validFrames, frameListPath, opts.frameDuration);

      const tempVideoPath = path.join(projectDir, `temp_video.${opts.format}`);
      const finalVideoPath = path.join(projectDir, `output.${opts.format}`);

      const quality = QUALITY_PRESETS[opts.quality];
      let ffmpegArgs: string[] = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', frameListPath,
      ];

      if (opts.transitionType !== 'none' && validFrames.length > 1) {
        ffmpegArgs.push(
          '-vf', this.buildTransitionFilter(validFrames.length, opts.frameDuration, opts.transitionType, opts.transitionDuration)
        );
      }

      ffmpegArgs.push(
        '-c:v', opts.codec,
        '-crf', String(quality.crf),
        '-preset', quality.preset,
        '-pix_fmt', 'yuv420p',
        '-r', String(opts.fps),
        '-s', `${opts.resolution.width}x${opts.resolution.height}`,
      );

      if (opts.format === 'webm') {
        ffmpegArgs.push('-c:v', 'libvpx-vp9', '-b:v', '2M');
      }

      ffmpegArgs.push(tempVideoPath);

      log('debug', 'assembleVideo', 'Running FFmpeg for frame assembly', { args: ffmpegArgs.join(' ') });
      const frameResult = await runFFmpeg(ffmpegArgs);
      
      if (frameResult.exitCode !== 0) {
        throw new Error(`FFmpeg frame assembly failed: ${frameResult.stderr}`);
      }

      let videoToProcess = tempVideoPath;

      if (audioPath && musicPath) {
        const mixedAudioPath = path.join(projectDir, 'mixed_audio.aac');
        const mixResult = await this.mixAudio(audioPath, musicPath, 0.3, mixedAudioPath);
        
        if (mixResult.success) {
          videoToProcess = await this.addAudioToVideo(tempVideoPath, mixResult.outputPath, projectDir, opts);
        }
      } else if (audioPath || musicPath) {
        const audioFile = audioPath || musicPath!;
        videoToProcess = await this.addAudioToVideo(tempVideoPath, audioFile, projectDir, opts);
      }

      if (videoToProcess !== finalVideoPath) {
        await fs.copyFile(videoToProcess, finalVideoPath);
      }

      const thumbnailResult = await this.generateThumbnail(finalVideoPath, 0, path.join(projectDir, 'thumbnail.jpg'));
      const videoInfo = await this.getVideoInfo(finalVideoPath);
      const stats = await fs.stat(finalVideoPath);

      await this.cleanupTempFiles(projectDir, [finalVideoPath, thumbnailResult.thumbnailPath]);

      const result: VideoAssemblyResult = {
        success: true,
        videoPath: finalVideoPath,
        thumbnailPath: thumbnailResult.success ? thumbnailResult.thumbnailPath : undefined,
        duration: videoInfo.duration,
        fileSize: stats.size,
        format: opts.format,
        resolution: opts.resolution,
        url: this.getPublicUrl(finalVideoPath),
      };

      log('info', 'assembleVideo', 'Video assembly completed', { projectId: storageProjectId, duration: result.duration });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'assembleVideo', errorMessage, { projectId: storageProjectId });
      throw error;
    }
  }

  async generateThumbnail(
    videoPath: string,
    timestamp: number = 0,
    outputPath?: string
  ): Promise<ThumbnailResult> {
    log('info', 'generateThumbnail', 'Generating thumbnail', { videoPath, timestamp });

    try {
      const thumbPath = outputPath || videoPath.replace(/\.[^/.]+$/, '_thumb.jpg');

      const ffmpegArgs = [
        '-y',
        '-ss', String(timestamp),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-vf', 'scale=640:-1',
        thumbPath,
      ];

      const result = await runFFmpeg(ffmpegArgs);
      
      if (result.exitCode !== 0) {
        throw new Error(`FFmpeg thumbnail generation failed: ${result.stderr}`);
      }

      const stats = await fs.stat(thumbPath);
      const info = await this.getImageInfo(thumbPath);

      return {
        success: true,
        thumbnailPath: thumbPath,
        fileSize: stats.size,
        resolution: info.resolution,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'generateThumbnail', errorMessage);
      throw error;
    }
  }

  async mixAudio(
    speechPath: string,
    musicPath: string,
    musicVolume: number = 0.3,
    outputPath?: string
  ): Promise<AudioMixResult> {
    log('info', 'mixAudio', 'Mixing audio tracks', { speechPath, musicPath, musicVolume });

    try {
      const outPath = outputPath || speechPath.replace(/\.[^/.]+$/, '_mixed.aac');
      
      const ffmpegArgs = [
        '-y',
        '-i', speechPath,
        '-i', musicPath,
        '-filter_complex',
        `[1:a]volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[out]`,
        '-map', '[out]',
        '-c:a', 'aac',
        '-b:a', '192k',
        outPath,
      ];

      const result = await runFFmpeg(ffmpegArgs);
      
      if (result.exitCode !== 0) {
        throw new Error(`FFmpeg audio mixing failed: ${result.stderr}`);
      }

      const stats = await fs.stat(outPath);
      const info = await this.getAudioInfo(outPath);

      return {
        success: true,
        outputPath: outPath,
        duration: info.duration,
        fileSize: stats.size,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'mixAudio', errorMessage);
      throw error;
    }
  }

  async concatenateVideos(videoPaths: string[], outputPath?: string): Promise<ConcatenateResult> {
    log('info', 'concatenateVideos', 'Concatenating videos', { count: videoPaths.length });

    try {
      if (videoPaths.length === 0) {
        throw new Error('No video paths provided for concatenation');
      }

      if (videoPaths.length === 1) {
        const stats = await fs.stat(videoPaths[0]);
        const info = await this.getVideoInfo(videoPaths[0]);
        return {
          success: true,
          outputPath: videoPaths[0],
          duration: info.duration,
          fileSize: stats.size,
          segmentCount: 1,
        };
      }

      const outPath = outputPath || `${path.dirname(videoPaths[0])}/concatenated_${Date.now()}.mp4`;
      const listPath = `${path.dirname(videoPaths[0])}/concat_list.txt`;
      
      const listContent = videoPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
      await fs.writeFile(listPath, listContent);

      const ffmpegArgs = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        outPath,
      ];

      const result = await runFFmpeg(ffmpegArgs);
      
      if (result.exitCode !== 0) {
        throw new Error(`FFmpeg concatenation failed: ${result.stderr}`);
      }

      await fs.unlink(listPath).catch(() => {});

      const stats = await fs.stat(outPath);
      const info = await this.getVideoInfo(outPath);

      return {
        success: true,
        outputPath: outPath,
        duration: info.duration,
        fileSize: stats.size,
        segmentCount: videoPaths.length,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'concatenateVideos', errorMessage);
      throw error;
    }
  }

  async moveToStorage(sourcePath: string, projectId: string, filename?: string): Promise<string> {
    const projectDir = await this.ensureProjectDirectory(projectId);
    const destFilename = filename || path.basename(sourcePath);
    const destPath = path.join(projectDir, destFilename);

    await fs.copyFile(sourcePath, destPath);
    log('info', 'moveToStorage', 'Asset moved to storage', { sourcePath, destPath, projectId });

    return destPath;
  }

  getStoragePath(projectId: string): string {
    return path.join(this.storagePath, projectId);
  }

  private async ensureProjectDirectory(projectId: string): Promise<string> {
    const projectDir = path.join(this.storagePath, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  private async createFrameListFile(
    frames: GeneratedFrame[],
    outputPath: string,
    frameDuration: number
  ): Promise<void> {
    const lines: string[] = [];

    for (const frame of frames) {
      let framePath = frame.localPath;
      
      if (!framePath && frame.outputAssets && frame.outputAssets.length > 0) {
        framePath = frame.outputAssets[0].localPath;
      }

      if (!framePath) {
        log('warn', 'createFrameListFile', `No path found for frame ${frame.shotIndex}`);
        continue;
      }

      const resolvedPath = path.resolve(framePath);
      lines.push(`file '${resolvedPath}'`);
      lines.push(`duration ${frameDuration}`);
    }

    if (frames.length > 0) {
      let lastFramePath = frames[frames.length - 1].localPath;
      if (!lastFramePath && frames[frames.length - 1].outputAssets?.[0]) {
        lastFramePath = frames[frames.length - 1].outputAssets![0].localPath;
      }
      if (lastFramePath) {
        lines.push(`file '${path.resolve(lastFramePath)}'`);
      }
    }

    await fs.writeFile(outputPath, lines.join('\n'));
  }

  private buildTransitionFilter(
    frameCount: number,
    frameDuration: number,
    transitionType: string,
    transitionDuration: number
  ): string {
    if (frameCount <= 1 || transitionType === 'none') {
      return 'null';
    }

    switch (transitionType) {
      case 'fade':
        return `fade=t=in:st=0:d=${transitionDuration},fade=t=out:st=${(frameCount * frameDuration) - transitionDuration}:d=${transitionDuration}`;
      case 'crossfade':
      case 'dissolve':
        return `xfade=transition=fade:duration=${transitionDuration}:offset=${frameDuration - transitionDuration}`;
      default:
        return 'null';
    }
  }

  private async addAudioToVideo(
    videoPath: string,
    audioPath: string,
    projectDir: string,
    opts: Required<AssemblyOptions>
  ): Promise<string> {
    const outputPath = path.join(projectDir, `video_with_audio.${opts.format}`);
    const quality = QUALITY_PRESETS[opts.quality];

    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', quality.audioBitrate,
      '-shortest',
      '-map', '0:v:0',
      '-map', '1:a:0',
      outputPath,
    ];

    const result = await runFFmpeg(ffmpegArgs);
    
    if (result.exitCode !== 0) {
      throw new Error(`FFmpeg audio addition failed: ${result.stderr}`);
    }

    return outputPath;
  }

  private async getVideoInfo(videoPath: string): Promise<{ duration: number; resolution: { width: number; height: number } }> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ];

    const result = await runFFprobe(args);
    
    try {
      const info = JSON.parse(result.stdout);
      const videoStream = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
      
      return {
        duration: parseFloat(info.format?.duration || '0'),
        resolution: {
          width: videoStream?.width || 1920,
          height: videoStream?.height || 1080,
        },
      };
    } catch {
      return { duration: 0, resolution: { width: 1920, height: 1080 } };
    }
  }

  private async getAudioInfo(audioPath: string): Promise<{ duration: number }> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      audioPath,
    ];

    const result = await runFFprobe(args);
    
    try {
      const info = JSON.parse(result.stdout);
      return { duration: parseFloat(info.format?.duration || '0') };
    } catch {
      return { duration: 0 };
    }
  }

  private async getImageInfo(imagePath: string): Promise<{ resolution: { width: number; height: number } }> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      imagePath,
    ];

    const result = await runFFprobe(args);
    
    try {
      const info = JSON.parse(result.stdout);
      const stream = info.streams?.[0];
      return {
        resolution: {
          width: stream?.width || 640,
          height: stream?.height || 360,
        },
      };
    } catch {
      return { resolution: { width: 640, height: 360 } };
    }
  }

  private async cleanupTempFiles(projectDir: string, keepFiles: string[]): Promise<void> {
    try {
      const files = await fs.readdir(projectDir);
      const keepSet = new Set(keepFiles.map(f => path.resolve(f)));

      for (const file of files) {
        const filePath = path.join(projectDir, file);
        if (!keepSet.has(path.resolve(filePath)) && (file.startsWith('temp_') || file.endsWith('.txt'))) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch {
      log('warn', 'cleanupTempFiles', 'Failed to cleanup temp files');
    }
  }

  private getPublicUrl(filePath: string): string {
    const relativePath = filePath.replace(/^\.?\/?/, '');
    return `/api/ai/video/download?path=${encodeURIComponent(relativePath)}`;
  }
}

export const videoAssemblyService = new VideoAssemblyService();

export default videoAssemblyService;
