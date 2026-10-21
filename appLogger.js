import fs   from "node:fs";
import path from "node:path";
import util from "node:util";

import * as config from "./config.js";
import * as utils  from "./utils.js";

const LOG_DIR          = config.LOG_DIR;
const CONSOLE_LOG_PATH = path.join(LOG_DIR, "console.log");
const ERROR_LOG_PATH   = path.join(LOG_DIR, "errors.log");

let eventHandler    = null;
let consoleCaptured = false;

/*
=====================================================
Setup
=====================================================
*/

// Ensures the logs directory exists
export function initAppLogger() { fs.mkdirSync(LOG_DIR, { recursive: true }); }

// Registers the functions that should recieve future logging information
// handler = String including the name of a function, or null
export function setLogEventHandler(handler) {
  if (handler !== null && typeof handler !== "function") {
    throw new TypeError("Application log event handler must be a function or null.");
  }
  eventHandler = handler;
}

/*
=====================================================
Formating
=====================================================
*/

// Takes all the information that is to be logged and converts each piece into a readable message
// values = Array [] with no restrictions on values inside the array
function formatValues(values) {
  return values
    .map(value => {
      if (value instanceof Error)    {return value.stack ?? value.message;}
      if (typeof value === "string") {return value;}
      return util.inspect(value, {depth: 5, colors: false});
    })
    .join(" ");
}

// Adds a new line of text to the end of an existing file
// This only exists as a function so logging is taken care of
// filePath = String containing location and the name of the file to write to
// line = String containing the text to add
function appendToFile(filePath, line) {
  try {
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch (error) {
    // Does not use normal logging system to prevent looping
    process.stderr.write(`BargazBot failed to write to ${filePath}: ` + `${error?.stack ?? error}\n`);
  }
}

// Sends new logging data to registered functions
// event = Object {timestamp: String, level: String, message: String}
function forwardEvent(event) {
  if (!eventHandler) {return;}
  Promise.resolve(eventHandler(event))
    .catch(error => {
      process.stderr.write("BargazBot log event handler failed: " + `${error?.stack ?? error}\n`);
    });
}

// START BACK HERE!!!

/*
=====================================================
Core Logging
=====================================================
*/

function write(level, values) {
  const timestamp = utils.newTimestamp();
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
