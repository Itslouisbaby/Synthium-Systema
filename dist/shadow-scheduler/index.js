"use strict";
/**
 * M10 Shadow Scheduler - Main Entry Point
 * Export all modules for the Shadow Scheduler system
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerDemo = exports.SchedulerUI = exports.NotificationManager = exports.SchedulerPersistence = exports.ShadowScheduler = void 0;
// Types
__exportStar(require("./types"), exports);
// Core
var scheduler_1 = require("./core/scheduler");
Object.defineProperty(exports, "ShadowScheduler", { enumerable: true, get: function () { return scheduler_1.ShadowScheduler; } });
// Persistence
var persistence_1 = require("./persistence");
Object.defineProperty(exports, "SchedulerPersistence", { enumerable: true, get: function () { return persistence_1.SchedulerPersistence; } });
// Notifications
var notifications_1 = require("./notifications");
Object.defineProperty(exports, "NotificationManager", { enumerable: true, get: function () { return notifications_1.NotificationManager; } });
// UI
var ui_1 = require("./ui");
Object.defineProperty(exports, "SchedulerUI", { enumerable: true, get: function () { return ui_1.SchedulerUI; } });
// Demo
var demo_1 = require("./demo");
Object.defineProperty(exports, "SchedulerDemo", { enumerable: true, get: function () { return demo_1.SchedulerDemo; } });
//# sourceMappingURL=index.js.map