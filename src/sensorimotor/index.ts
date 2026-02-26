/**
 * Sensorimotor Grounding - Index
 * 
 * Perception-Action loop for connecting internal representations
 * to real-world sensors and actuators.
 */

// Sensors
export {
  TextSensor,
  APIResponseSensor,
  FileSystemSensor,
  CompositeSensor,
} from './sensor-interface.js';

export type {
  Sensor,
  SensorConfig,
  SensorReading,
  Perception,
} from './sensor-interface.js';

// Actuators
export {
  TextOutputActuator,
  APICallActuator,
  FileOperationActuator,
  CompositeActuator,
} from './actuator-interface.js';

export type {
  Actuator,
  ActuatorConfig,
  Action,
  ActionResult,
} from './actuator-interface.js';

// Perception-Action Loop
export {
  PerceptionActionLoop,
} from './perception-action-loop.js';

export type {
  PALoopConfig,
  PACycle,
  Decision,
  Feedback,
  LearnedAffordance,
} from './perception-action-loop.js';
