
import fs from "fs";
import {execFile} from "child_process";
import {promisify} from "util";

const execFileAsync = promisify(execFile);
const READY_FILE = "/home/devon/ups/shutdown_ready.json";
const GRACEFUL_TIMEOUT_MS = 30 * 1000;
const FALLBACK_TIMEOUT_MS = 10 * 1000;

let shutdownRequested = false;
let shutdownRequestId = null;
let shutdownSource = null;
let shutdownPhase = 0;
let shutdownTask = null;
let closingServices = false;

const blockers = new Set();
const shutdownHandlers = new Map();

export function isShutdownRequested() {
  return shutdownRequested;
}

export function registerShutdownHandler(name, handler) {
  shutdownHandlers.set(name, handler);
}

export function beginShutdown(requestId, source = "ups") {
  if (!requestId) {console.error("Shutdown request has no request ID."); return false;}
  if (shutdownRequested) {return shutdownRequestId === requestId;}

  shutdownRequested = true;
  shutdownRequestId = requestId;
  shutdownSource = source;
  shutdownPhase = 1;
  closingServices = false;
  blockers.clear();

  console.log(`Graceful shutdown requested: ${requestId} (${source})`);

  shutdownTask = Promise.resolve().then(() => performShutdown(requestId));
  return true;
}

export function addShutdownBlocker(name) {
  if (!shutdownRequested || shutdownPhase !== 1 || closingServices) {return;}

  blockers.add(name);
  console.log(`Shutdown blocker added: ${name}`);
}

export function removeShutdownBlocker(name) {
  blockers.delete(name);
  console.log(`Shutdown blocker cleared: ${name}`);
}

export function getShutdownBlockers() {
  return [...blockers];
}

export function cancelShutdown() {
  if (!shutdownRequested || shutdownPhase !== 1 || closingServices) {return false;}

  shutdownRequested = false;
  shutdownRequestId = null;
  shutdownSource = null;
  shutdownPhase = 0;
  blockers.clear();

  console.log("Graceful shutdown cancelled.");
  return true;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForBlockers(requestId, deadline) {
  while (shutdownRequested && shutdownRequestId === requestId && blockers.size > 0) {
    if (Date.now() >= deadline) {return false;}
    await delay(Math.min(250, deadline - Date.now()));
  }

  return shutdownRequested && shutdownRequestId === requestId;
}

async function runHandlers(phase, timeout) {
  const tasks = [...shutdownHandlers.entries()].map(async ([name, handler]) => {
    try {
      await handler(phase);
      console.log(`Shutdown completed: ${name}`);
      return true;
    } catch (error) {
      console.error(`Shutdown failed: ${name}`, error);
      return false;
    }
  });

  let timer;

  try {
    const results = await Promise.race([
      Promise.all(tasks),
      new Promise(resolve => {timer = setTimeout(() => resolve(null), timeout);})
    ]);

    return results !== null && results.every(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

function writeShutdownReady(requestId) {
  try {
    const temporaryFile = `${READY_FILE}.tmp`;

    fs.writeFileSync(temporaryFile, JSON.stringify({
      request_id: requestId,
      ready: true,
      timestamp: new Date().toISOString()
    }, null, 2));

    fs.renameSync(temporaryFile, READY_FILE);

    console.log(`BargazBot is ready for shutdown: ${requestId}`);
    return true;
  } catch (error) {
    console.error("Unable to write shutdown readiness:", error);
    return false;
  }
}

export function checkShutdownReady() {
  if (!shutdownRequested || shutdownPhase !== 3 || blockers.size !== 0) {return false;}
  return writeShutdownReady(shutdownRequestId);
}

async function finishShutdown(requestId, source) {
  if (source === "ups") {
    writeShutdownReady(requestId);
    return;
  }

  console.warn("Requesting Raspberry Pi poweroff after network shutdown.");

  try {
    await execFileAsync("sudo", ["-n", "systemctl", "poweroff"], {timeout: 5000});
  } catch (error) {
    console.error("Network shutdown poweroff command failed:", error);

    try {
      await execFileAsync("systemctl", ["poweroff"], {timeout: 5000});
    } catch (fallbackError) {
      console.error("Fallback poweroff command failed:", fallbackError);
    }
  }
}

async function performShutdown(requestId) {
  const source = shutdownSource;
  const deadline = Date.now() + GRACEFUL_TIMEOUT_MS;

  console.log("Shutdown Stage 1: Graceful shutdown.");

  const blockersFinished = await waitForBlockers(requestId, deadline);
  if (!shutdownRequested || shutdownRequestId !== requestId) {return;}

  const remaining = Math.max(0, deadline - Date.now());
  let gracefulSuccess = false;

  if (blockersFinished && remaining > 0) {
    closingServices = true;
    gracefulSuccess = await runHandlers(1, remaining);
  }

  if (!shutdownRequested || shutdownRequestId !== requestId) {return;}

  if (!gracefulSuccess) {
    shutdownPhase = 2;
    closingServices = true;
    console.warn("Graceful shutdown incomplete. Starting fallback.");
    await runHandlers(2, FALLBACK_TIMEOUT_MS);
  } else {
    console.log("Graceful shutdown completed.");
  }

  shutdownPhase = 3;
  blockers.clear();

  await finishShutdown(requestId, source);
}
