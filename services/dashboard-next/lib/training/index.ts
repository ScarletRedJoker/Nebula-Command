/**
 * Training Module
 * Exports all training-related classes and utilities
 * Handles model training (LoRA, QLoRA, SDXL, DreamBooth)
 * with real-time progress monitoring and event streaming
 */

// Event Bus
export {
  TrainingEventBus,
  getTrainingEventBus,
  resetTrainingEventBus,
  type TrainingEvent,
  type TrainingEventType,
  type EventSubscriber,
} from './event-bus';

// Run Manager
export {
  TrainingRunManager,
  getTrainingRunManager,
  resetTrainingRunManager,
  type TrainingRunOptions,
  type TrainingProgress,
  type TrainingResult,
  type TrainingConfig,
  type LoRAConfig,
  type QLoRAConfig,
  type SDXLConfig,
  type DreamBoothConfig,
} from './run-manager';
