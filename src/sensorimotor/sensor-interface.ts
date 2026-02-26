/**
 * Sensor Interface - Perception from environment
 * 
 * Sensors convert raw environmental data into structured perceptions.
 * This is the "sensory" part of sensorimotor grounding.
 */

import type { Representation } from '../perception/index.js';

/** Raw sensor reading */
export interface SensorReading {
  readonly readingId: string;
  readonly sensorType: string;
  readonly timestampMs: number;
  readonly rawData: unknown;
  readonly metadata?: {
    confidence?: number;
    source?: string;
    format?: string;
  };
}

/** Processed perception from sensor */
export interface Perception {
  readonly perceptionId: string;
  readonly sourceReading: string;
  readonly timestampMs: number;
  readonly content: unknown;
  readonly representation?: Representation;
  readonly confidence: number;
  readonly salience: number; // 0-1, how attention-worthy
}

/** Sensor configuration */
export interface SensorConfig {
  readonly sensorId: string;
  readonly sensorType: string;
  readonly sampleRateMs?: number;
  readonly confidenceThreshold?: number;
  readonly preprocessing?: boolean;
}

/**
 * Base sensor interface
 * All sensors implement this contract
 */
export interface Sensor {
  readonly config: SensorConfig;
  
  /** Initialize the sensor */
  initialize(): Promise<void>;
  
  /** Read from sensor */
  read(): Promise<SensorReading>;
  
  /** Process raw reading into perception */
  process(reading: SensorReading): Promise<Perception>;
  
  /** Check if sensor is available */
  isAvailable(): boolean;
  
  /** Shutdown sensor */
  shutdown(): Promise<void>;
}

/**
 * Text Sensor - processes text input
 */
export class TextSensor implements Sensor {
  readonly config: SensorConfig;
  private queue: string[] = [];
  private available = true;

  constructor(config: Partial<SensorConfig> = {}) {
    this.config = {
      sensorId: config.sensorId ?? 'text-sensor',
      sensorType: 'text',
      sampleRateMs: config.sampleRateMs ?? 100,
      confidenceThreshold: config.confidenceThreshold ?? 0.8,
      preprocessing: config.preprocessing ?? true,
    };
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async read(): Promise<SensorReading> {
    const text = this.queue.shift() ?? '';
    return {
      readingId: `read-${Date.now()}`,
      sensorType: this.config.sensorType,
      timestampMs: Date.now(),
      rawData: text,
      metadata: { format: 'text/plain' },
    };
  }

  async process(reading: SensorReading): Promise<Perception> {
    const text = String(reading.rawData);
    
    return {
      perceptionId: `perc-${Date.now()}`,
      sourceReading: reading.readingId,
      timestampMs: Date.now(),
      content: text,
      confidence: text.length > 0 ? 1.0 : 0.0,
      salience: Math.min(1, text.length / 100),
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }

  /** Submit text to sensor */
  submit(text: string): void {
    this.queue.push(text);
  }
}

/**
 * API Response Sensor - processes API responses
 */
export class APIResponseSensor implements Sensor {
  readonly config: SensorConfig;
  private available = true;

  constructor(config: Partial<SensorConfig> = {}) {
    this.config = {
      sensorId: config.sensorId ?? 'api-sensor',
      sensorType: 'api_response',
      sampleRateMs: config.sampleRateMs ?? 0, // Event-driven
      confidenceThreshold: config.confidenceThreshold ?? 0.9,
      preprocessing: config.preprocessing ?? true,
    };
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async read(): Promise<SensorReading> {
    // Event-driven, returns empty if no data
    return {
      readingId: `read-${Date.now()}`,
      sensorType: this.config.sensorType,
      timestampMs: Date.now(),
      rawData: null,
      metadata: { format: 'application/json' },
    };
  }

  async process(reading: SensorReading): Promise<Perception> {
    const data = reading.rawData;
    
    // Extract key information from API response
    let content: unknown = data;
    let confidence = 0.9;
    
    if (data && typeof data === 'object') {
      // Check for error responses
      if ('error' in data) {
        confidence = 0.3;
        content = { type: 'error', details: data.error };
      }
      // Check for success responses with data
      else if ('data' in data) {
        content = data.data;
        confidence = 0.95;
      }
    }

    return {
      perceptionId: `perc-${Date.now()}`,
      sourceReading: reading.readingId,
      timestampMs: Date.now(),
      content,
      confidence,
      salience: confidence > 0.8 ? 0.7 : 0.9, // Errors are more salient
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }
}

/**
 * File System Sensor - monitors file changes
 */
export class FileSystemSensor implements Sensor {
  readonly config: SensorConfig;
  private available = true;
  private watchedPaths: Set<string> = new Set();

  constructor(config: Partial<SensorConfig> & { watchPaths?: string[] } = {}) {
    this.config = {
      sensorId: config.sensorId ?? 'fs-sensor',
      sensorType: 'filesystem',
      sampleRateMs: config.sampleRateMs ?? 1000,
      confidenceThreshold: config.confidenceThreshold ?? 0.95,
      preprocessing: config.preprocessing ?? true,
    };
    if (config.watchPaths) {
      config.watchPaths.forEach(p => this.watchedPaths.add(p));
    }
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async read(): Promise<SensorReading> {
    return {
      readingId: `read-${Date.now()}`,
      sensorType: this.config.sensorType,
      timestampMs: Date.now(),
      rawData: { watchedPaths: Array.from(this.watchedPaths) },
      metadata: { format: 'fs/snapshot' },
    };
  }

  async process(reading: SensorReading): Promise<Perception> {
    const data = reading.rawData as { watchedPaths: string[] };
    
    return {
      perceptionId: `perc-${Date.now()}`,
      sourceReading: reading.readingId,
      timestampMs: Date.now(),
      content: {
        type: 'filesystem_state',
        paths: data.watchedPaths,
      },
      confidence: 0.95,
      salience: 0.5,
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }

  addWatchPath(path: string): void {
    this.watchedPaths.add(path);
  }
}

/**
 * Composite Sensor - combines multiple sensors
 */
export class CompositeSensor implements Sensor {
  readonly config: SensorConfig;
  private sensors: Sensor[] = [];

  constructor(
    sensors: Sensor[],
    config: Partial<SensorConfig> = {}
  ) {
    this.sensors = sensors;
    this.config = {
      sensorId: config.sensorId ?? 'composite-sensor',
      sensorType: 'composite',
      sampleRateMs: config.sampleRateMs ?? 100,
      confidenceThreshold: config.confidenceThreshold ?? 0.8,
      preprocessing: config.preprocessing ?? true,
    };
  }

  async initialize(): Promise<void> {
    await Promise.all(this.sensors.map(s => s.initialize()));
  }

  async read(): Promise<SensorReading> {
    // Read from all sensors and merge
    const readings = await Promise.all(
      this.sensors.map(s => s.read())
    );

    return {
      readingId: `read-${Date.now()}`,
      sensorType: this.config.sensorType,
      timestampMs: Date.now(),
      rawData: { readings },
      metadata: { format: 'composite' },
    };
  }

  async process(reading: SensorReading): Promise<Perception> {
    const data = reading.rawData as { readings: SensorReading[] };
    
    // Process each sub-reading
    const perceptions = await Promise.all(
      data.readings.map(async r => {
        const sensor = this.sensors.find(s => s.config.sensorType === r.sensorType);
        return sensor ? sensor.process(r) : null;
      })
    );

    // Merge perceptions
    const validPerceptions = perceptions.filter((p): p is Perception => p !== null);
    const avgConfidence = validPerceptions.reduce((s, p) => s + p.confidence, 0) / validPerceptions.length;
    const maxSalience = Math.max(...validPerceptions.map(p => p.salience));

    return {
      perceptionId: `perc-${Date.now()}`,
      sourceReading: reading.readingId,
      timestampMs: Date.now(),
      content: { perceptions: validPerceptions },
      confidence: avgConfidence,
      salience: maxSalience,
    };
  }

  isAvailable(): boolean {
    return this.sensors.some(s => s.isAvailable());
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.sensors.map(s => s.shutdown()));
  }

  addSensor(sensor: Sensor): void {
    this.sensors.push(sensor);
  }
}
