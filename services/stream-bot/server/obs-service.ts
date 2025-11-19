import OBSWebSocket from 'obs-websocket-js';
import { EventEmitter } from 'events';

interface OBSConnectionConfig {
  host: string;
  port: number;
  password: string;
}

interface Scene {
  sceneName: string;
  sceneIndex: number;
}

interface SceneItem {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  sceneItemIndex: number;
}

interface OBSAction {
  type: 'scene' | 'source_visibility' | 'text_update' | 'media_play' | 'media_stop';
  params: Record<string, any>;
  delay?: number;
}

export class OBSService extends EventEmitter {
  private obs: OBSWebSocket;
  private connected = false;
  private connectionConfig: OBSConnectionConfig | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.obs.on('ConnectionOpened', () => {
      console.log('[OBS] Connection opened');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.obs.on('ConnectionClosed', () => {
      console.log('[OBS] Connection closed');
      this.connected = false;
      this.emit('disconnected');
      this.attemptReconnect();
    });

    this.obs.on('ConnectionError', (error) => {
      console.error('[OBS] Connection error:', error);
      this.connected = false;
      this.emit('error', error);
    });

    this.obs.on('Identified', () => {
      console.log('[OBS] Identified');
      this.emit('identified');
    });

    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.emit('scene_changed', data.sceneName);
    });

    this.obs.on('StreamStateChanged', (data) => {
      this.emit('stream_state_changed', data.outputActive);
    });

    this.obs.on('RecordStateChanged', (data) => {
      this.emit('record_state_changed', data.outputActive);
    });
  }

  private async attemptReconnect() {
    if (!this.connectionConfig || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[OBS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect(
          this.connectionConfig!.host,
          this.connectionConfig!.port,
          this.connectionConfig!.password
        );
      } catch (error) {
        console.error('[OBS] Reconnection failed:', error);
      }
    }, delay);
  }

  async connect(host: string, port: number, password: string): Promise<void> {
    try {
      await this.obs.connect(`ws://${host}:${port}`, password);
      this.connectionConfig = { host, port, password };
      this.connected = true;
      console.log(`[OBS] Connected to ws://${host}:${port}`);
    } catch (error: any) {
      this.connected = false;
      throw new Error(`Failed to connect to OBS: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.connectionConfig = null;
      this.reconnectAttempts = this.maxReconnectAttempts;
      await this.obs.disconnect();
      this.connected = false;
      console.log('[OBS] Disconnected');
    } catch (error: any) {
      throw new Error(`Failed to disconnect from OBS: ${error.message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getScenes(): Promise<Scene[]> {
    this.ensureConnected();
    try {
      const response = await this.obs.call('GetSceneList');
      return response.scenes.map((scene: any, index: number) => ({
        sceneName: scene.sceneName,
        sceneIndex: index,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get scenes: ${error.message}`);
    }
  }

  async getCurrentScene(): Promise<string> {
    this.ensureConnected();
    try {
      const response = await this.obs.call('GetCurrentProgramScene');
      return response.currentProgramSceneName;
    } catch (error: any) {
      throw new Error(`Failed to get current scene: ${error.message}`);
    }
  }

  async setScene(sceneName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      console.log(`[OBS] Switched to scene: ${sceneName}`);
    } catch (error: any) {
      throw new Error(`Failed to set scene: ${error.message}`);
    }
  }

  async createScene(sceneName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('CreateScene', { sceneName });
      console.log(`[OBS] Created scene: ${sceneName}`);
    } catch (error: any) {
      throw new Error(`Failed to create scene: ${error.message}`);
    }
  }

  async getSceneItems(sceneName: string): Promise<SceneItem[]> {
    this.ensureConnected();
    try {
      const response = await this.obs.call('GetSceneItemList', { sceneName });
      return response.sceneItems.map((item: any) => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        sceneItemEnabled: item.sceneItemEnabled,
        sceneItemIndex: item.sceneItemIndex,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get scene items: ${error.message}`);
    }
  }

  async setSourceVisibility(sceneName: string, sceneItemId: number, visible: boolean): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('SetSceneItemEnabled', {
        sceneName,
        sceneItemId,
        sceneItemEnabled: visible,
      });
      console.log(`[OBS] Set source ${sceneItemId} visibility to ${visible}`);
    } catch (error: any) {
      throw new Error(`Failed to set source visibility: ${error.message}`);
    }
  }

  async setSourceSettings(sourceName: string, settings: Record<string, any>): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings: settings,
      });
      console.log(`[OBS] Updated source settings for: ${sourceName}`);
    } catch (error: any) {
      throw new Error(`Failed to set source settings: ${error.message}`);
    }
  }

  async getSourceSettings(sourceName: string): Promise<Record<string, any>> {
    this.ensureConnected();
    try {
      const response = await this.obs.call('GetInputSettings', { inputName: sourceName });
      return response.inputSettings;
    } catch (error: any) {
      throw new Error(`Failed to get source settings: ${error.message}`);
    }
  }

  async updateTextSource(sourceName: string, text: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings: { text },
      });
      console.log(`[OBS] Updated text source ${sourceName}: ${text}`);
    } catch (error: any) {
      throw new Error(`Failed to update text source: ${error.message}`);
    }
  }

  async playMedia(sourceName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName: sourceName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
      });
      console.log(`[OBS] Playing media: ${sourceName}`);
    } catch (error: any) {
      throw new Error(`Failed to play media: ${error.message}`);
    }
  }

  async pauseMedia(sourceName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName: sourceName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
      });
      console.log(`[OBS] Paused media: ${sourceName}`);
    } catch (error: any) {
      throw new Error(`Failed to pause media: ${error.message}`);
    }
  }

  async stopMedia(sourceName: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName: sourceName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
      });
      console.log(`[OBS] Stopped media: ${sourceName}`);
    } catch (error: any) {
      throw new Error(`Failed to stop media: ${error.message}`);
    }
  }

  async startStreaming(): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('StartStream');
      console.log('[OBS] Started streaming');
    } catch (error: any) {
      throw new Error(`Failed to start streaming: ${error.message}`);
    }
  }

  async stopStreaming(): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('StopStream');
      console.log('[OBS] Stopped streaming');
    } catch (error: any) {
      throw new Error(`Failed to stop streaming: ${error.message}`);
    }
  }

  async startRecording(): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('StartRecord');
      console.log('[OBS] Started recording');
    } catch (error: any) {
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  async stopRecording(): Promise<void> {
    this.ensureConnected();
    try {
      await this.obs.call('StopRecord');
      console.log('[OBS] Stopped recording');
    } catch (error: any) {
      throw new Error(`Failed to stop recording: ${error.message}`);
    }
  }

  async executeAction(action: OBSAction): Promise<void> {
    if (action.delay && action.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, action.delay));
    }

    switch (action.type) {
      case 'scene':
        await this.setScene(action.params.sceneName);
        break;
      
      case 'source_visibility':
        await this.setSourceVisibility(
          action.params.sceneName,
          action.params.sceneItemId,
          action.params.visible
        );
        break;
      
      case 'text_update':
        await this.updateTextSource(action.params.sourceName, action.params.text);
        break;
      
      case 'media_play':
        await this.playMedia(action.params.sourceName);
        break;
      
      case 'media_stop':
        await this.stopMedia(action.params.sourceName);
        break;
      
      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  async executeActions(actions: OBSAction[]): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action);
      } catch (error) {
        console.error('[OBS] Failed to execute action:', error);
      }
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to OBS');
    }
  }
}

export const obsService = new OBSService();
