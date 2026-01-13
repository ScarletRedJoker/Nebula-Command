/**
 * Speech Services Module
 * Exports Text-to-Speech and Speech-to-Text services
 */

import TextToSpeechService, { TTSModel, TTSVoice, TTSOptions, TTSResponse } from "./tts";
import SpeechToTextService, { STTModel, STTOptions, STTResponse, TranscriptionSegment } from "./stt";

// Export classes
export { TextToSpeechService, SpeechToTextService };

// Export types
export type { TTSModel, TTSVoice, TTSOptions, TTSResponse };
export type { STTModel, STTOptions, STTResponse, TranscriptionSegment };

// Create singleton instances for convenient access
const tts = new TextToSpeechService();
const stt = new SpeechToTextService();

export { tts, stt };

// Default export with both services
export default {
  tts,
  stt,
  TextToSpeechService,
  SpeechToTextService,
};
