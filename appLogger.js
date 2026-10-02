import fs from "node:fs";
import path from "node:path";
import util from "node:util";

import * as config from "./config.js";

const LOG_DIR = config.LOG_DIR;
const CONSOLE_LOG_PATH =
  path.join(LOG_DIR, "console.log");
const ERROR_LOG_PATH =
  path.join(LOG_DIR, "errors.log");

let eventHandler = null;
let consoleCaptured = false;

/*
=====================================================
Setup
=====================================================
*/

export function initAppLogger() {
  fs.mkdirSync(LOG_DIR, {
    recursive: true
  });
}

/*
=====================================================
Owner Event Handler
=====================================================
*/

export function setLogEventHandler(handler) {
  if (handler !== null && typeof handler !== "function") {
    throw new TypeError(
      "Application log event handler must be a function or null."
    );
  }

  eventHandler = handler;
}

/*
=====================================================
Formatting
=====================================================
*/

function formatTimestamp() {
  return new Date().toISOString();
}

function formatValue(value) {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return util.inspect(value, {
    depth: 5,
    colors: false
  });
}

function formatValues(values) {
  return values
    .map(formatValue)
    .join(" ");
}

/*
=====================================================
File Writing
=====================================================
*/

function appendToFile(filePath, line) {
  try {
    fs.appendFileSync(
      filePath,
      `${line}\n`,
      "utf8"
    );
  } catch (error) {
    /*
     * Do not use console.error here.
     *
     * console.error may itself be captured by this
     * logger, which could cause a logging loop.
     */
    process.stderr.write(
      `BargazBot failed to write to ${filePath}: ` +
      `${error?.stack ?? error}\n`
    );
  }
}

/*
=====================================================
Event Forwarding
=====================================================
*/

function forwardEvent(event) {
  if (!eventHandler) {
    return;
  }
  Promise.resolve(eventHandler(event))
    .catch(error => {
      process.stderr.write(
        "BargazBot log event handler failed: " +
        `${error?.stack ?? error}\n`
      );
    });
}

/*
=====================================================
Core Logging
=====================================================
*/

function write(level, values) {
  const timestamp = formatTimestamp();
  const message = formatValues(values);

  const line =
    `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  appendToFile(
    CONSOLE_LOG_PATH,
    line
  );

  if (level === "error") {
    appendToFile(
      ERROR_LOG_PATH,
      line
    );
  }

  forwardEvent({
    timestamp,
    level,
    message
  });
}

/*
=====================================================
Public Logging Functions
=====================================================
*/

export function info(...values) {
  write("info", values);
}

export function warn(...values) {
  write("warn", values);
}

export function error(...values) {
  write("error", values);
}

/*
=====================================================
Console Capture
=====================================================

Existing console.log/warn/error calls throughout
BargazBot can continue to work.

They will still appear in the real terminal while also
being copied into the application logger.
=====================================================
*/

export function captureConsole() {
  if (consoleCaptured) {
    return;
  }

  consoleCaptured = true;

  const originalLog =
    console.log.bind(console);

  const originalWarn =
    console.warn.bind(console);

  const originalError =
    console.error.bind(console);

  console.log = (...values) => {
    originalLog(...values);
    info(...values);
  };

  console.warn = (...values) => {
    originalWarn(...values);
    warn(...values);
  };

  console.error = (...values) => {
    originalError(...values);
    error(...values);
  };
}
