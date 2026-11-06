
import fs from "fs";
import https from "https";
import {execFile} from "child_process";
import {promisify} from "util";

import {
  beginShutdown,
  addShutdownBlocker,
  removeShutdownBlocker,
  isShutdownRequested,
  registerShutdownHandler
} from "./shutdownCoordinator.js";

const execFileAsync = promisify(execFile);

const UPS_STATUS_FILE = "/home/devon/ups/ups_status.json";
const SHUTDOWN_REQUEST_FILE = "/home/devon/ups/shutdown_request.json";

const CHECK_INTERVAL_MS = 5 * 1000;
const BATTERY_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const NETWORK_SHUTDOWN_INTERVAL_MS = 2 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 3000;

const WIFI_NAMES = {
  "Dragon Tears": "Home Wi-Fi",
  "OSU_IOT": "Primary Dorm Wi-Fi",
  "eduroam": "Backup Dorm Wi-Fi"
};

let notifierInterval = null;
let previousPowerSource = null;
let previousShutdownPending = false;
let previousNetwork = null;
let lastBatteryUpdate = null;
let networkDisconnectedAt = null;
let networkShutdownRequested = false;
let checkInProgress = false;

function readUpsStatus() {
  try {
    return JSON.parse(fs.readFileSync(UPS_STATUS_FILE, "utf8"));
  } catch (error) {
    console.error("Unable to read UPS status:", error);
    return null;
  }
}

function readShutdownRequest() {
  try {
    if (!fs.existsSync(SHUTDOWN_REQUEST_FILE)) {return null;}
    return JSON.parse(fs.readFileSync(SHUTDOWN_REQUEST_FILE, "utf8"));
  } catch (error) {
    console.error("Unable to read shutdown request:", error);
    return null;
  }
}

async function runCommand(command, args = []) {
  try {
    const {stdout} = await execFileAsync(command, args, {timeout: 2000});
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getNetworkStatus() {
  const interfaces = fs.readdirSync("/sys/class/net").filter(name => name !== "lo");
  const active = [];

  for (const name of interfaces) {
    try {
      const state = fs.readFileSync(`/sys/class/net/${name}/operstate`, "utf8").trim();
      if (state !== "up") {continue;}

      const wireless = fs.existsSync(`/sys/class/net/${name}/wireless`);
      active.push({name, wireless});
    } catch {}
  }

  const ethernet = active.find(item => !item.wireless && !/^(tailscale|tun|tap|docker|veth|br-|wg)/.test(item.name));

  if (ethernet) {
    return {type: "ethernet", name: "Ethernet", bars: null, interface: ethernet.name};
  }

  const wifi = active.find(item => item.wireless);
  if (!wifi) {return {type: "disconnected", name: "Disconnected", bars: 0, interface: null};}

  const ssid = await runCommand("iwgetid", [wifi.name, "--raw"]);
  const signal = await runCommand("iw", ["dev", wifi.name, "link"]);
  const dbm = Number(signal?.match(/signal:\s*(-?\d+)/)?.[1]);

  let bars = null;

  if (Number.isFinite(dbm) && signal?.includes("signal:")) {
    if (dbm >= -55) {bars = 4;}
    else if (dbm >= -65) {bars = 3;}
    else if (dbm >= -75) {bars = 2;}
    else if (dbm >= -85) {bars = 1;}
    else {bars = 0;}
  }

  return {
    type: "wifi",
    name: WIFI_NAMES[ssid] || (ssid ? `Other Wi-Fi (${ssid})` : "Unknown Wi-Fi"),
    ssid: ssid || null,
    bars,
    interface: wifi.name
  };
}

function checkEndpoint(host) {
  return new Promise(resolve => {
    const request = https.get({
      hostname: host,
      path: "/",
      timeout: NETWORK_TIMEOUT_MS,
      headers: {"User-Agent": "BargazBot-NetworkMonitor"}
    }, response => {
      response.resume();
      resolve(true);
    });

    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function hasInternetConnection() {
  const results = await Promise.all([
    checkEndpoint("discord.com"),
    checkEndpoint("www.google.com"),
    checkEndpoint("www.cloudflare.com")
  ]);

  return results.some(Boolean);
}

function networkMessage(network, connected) {
  let message = "\n\n**Network Status**\n";

  if (!connected) {
    message += "Connection: **No usable internet connection**";
    return message;
  }

  message += `Connection: **${network.name}**`;

  if (network.type === "wifi") {
    const bars = network.bars;
    message += `\nSignal: **${bars === null ? "Unknown" : `${"▰".repeat(bars)}${"▱".repeat(4 - bars)} (${bars}/4 bars)`}**`;
  }

  return message;
}

function batteryMessage(percent) {
  const battery = typeof percent === "number" ? `${percent.toFixed(1)}%` : "Unknown";

  return (
    "🟡 **BargazBot is running on battery power.**\n" +
    `Battery remaining: **${battery}**\n\n` +
    "The UPS can run BargazBot for roughly **12 hours from 100% " +
    "until the 30% automatic-shutdown threshold**. " +
    "The Raspberry Pi will automatically shut down at **30%**."
  );
}

function externalMessage() {
  return (
    "🟢 **BargazBot is running on external power.**\n" +
    "If it loses power, this message will update " +
    "with the relevant information."
  );
}

function shutdownMessage(status, shutdownRequest) {
  const battery = typeof status?.battery_percent === "number" ? `${status.battery_percent.toFixed(1)}%` : "Unknown";

  let reason = shutdownRequest?.shutdown_reason;

  if (reason === "low_battery") {reason = "Low battery";}
  else if (reason === "manual") {reason = "Manual shutdown";}
  else if (reason === "network") {reason = "Network connection lost";}
  else if (!reason) {reason = "Shutdown requested";}

  let message = (
    "🔴 **BargazBot is about to shut down.**\n" +
    `Battery remaining: **${battery}**\n` +
    `Reason: **${reason}**\n\n`
  );

  if (shutdownRequest?.shutdown_reason === "network") {
    message += "The Raspberry Pi has been unable to communicate with external services for over **2 minutes**.";
  } else {
    message += "The Raspberry Pi automatically shuts down when the UPS reaches the **30% battery threshold**. Sorry for any inconveniences this may cause.";
  }

  return message;
}

async function sendOrEditUpsMessage(channel, client, content) {
  try {
    const messages = await channel.messages.fetch({limit: 1});
    const latest = messages.first();

    if (latest?.author.id === client.user.id) {
      await latest.edit(content);
    } else {
      await channel.send(content);
    }

    return true;
  } catch (error) {
    console.error("Unable to send/edit UPS Discord message:", error);
    return false;
  }
}

function networkChanged(previous, current) {
  if (!previous) {return false;}

  return previous.connected !== current.connected ||
    previous.type !== current.type ||
    previous.name !== current.name ||
    previous.ssid !== current.ssid ||
    previous.interface !== current.interface ||
    previous.bars !== current.bars;
}


registerShutdownHandler("ups-notifier", async () => {
  if (notifierInterval) {
    clearInterval(notifierInterval);
    notifierInterval = null;
  }
  console.log("UPS and network monitoring stopped.");
});


export async function startUpsNotifier(client) {
  const channelId = process.env.OWNER_STATUS_CHANNEL;
  let channel = null;

  if (channelId) {
    try {
      channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {channel = null;}
    } catch (error) {
      console.error("Unable to fetch UPS announcement channel:", error);
    }
  }

  if (!channel) {console.warn("UPS Discord channel unavailable. Local monitoring will continue.");}

  console.log("UPS and network notifier started.");

  async function checkUps() {
    if (checkInProgress || isShutdownRequested()) {return;}
    checkInProgress = true;

    try {
      const now = Date.now();
      const status = readUpsStatus();
      const shutdownRequest = readShutdownRequest();
      const network = await getNetworkStatus();
      const connected = await hasInternetConnection();
      const currentNetwork = {...network, connected};

      if (connected) {
        if (networkDisconnectedAt !== null) {console.log("Network connection restored.");}
        networkDisconnectedAt = null;
      } else {
        if (networkDisconnectedAt === null) {
          networkDisconnectedAt = now;
          console.warn("Network connectivity lost. Starting 2-minute countdown.");
        }

        if (!networkShutdownRequested && Date.now() - networkDisconnectedAt >= NETWORK_SHUTDOWN_INTERVAL_MS) {
          networkShutdownRequested = true;
          console.error("Network unavailable for 2 minutes. Requesting graceful shutdown.");

          const requestId = `network-${Date.now()}`;
          beginShutdown(requestId, "network");
          return;
          if (channel && connected) {addShutdownBlocker("discord-shutdown-notification");}
          beginShutdown(requestId, "ups");
          return;
        }
      }

      if (!status) {
        previousNetwork = currentNetwork;
        return;
      }

      const powerSource = status.power_source;
      const shutdownPending = shutdownRequest?.shutdown_pending === true;

      if (shutdownPending && !previousShutdownPending) {
        const requestId = shutdownRequest?.shutdown_request_id;

        if (!requestId) {
          console.error("Shutdown requested without shutdown_request_id.");
          previousShutdownPending = true;
          return;
        }

        beginShutdown(requestId);

        if (channel && connected) {
          addShutdownBlocker("discord-shutdown-notification");

          try {
            await channel.send(shutdownMessage(status, shutdownRequest));
            console.log("Shutdown Discord notification sent.");
          } catch (error) {
            console.error("Shutdown Discord notification failed:", error);
          } finally {
            removeShutdownBlocker("discord-shutdown-notification");
          }
        }

        previousShutdownPending = true;
        previousPowerSource = powerSource;
        return;
      }

      if (shutdownPending) {
        previousShutdownPending = true;
        return;
      }
      
      if (!shutdownPending && previousShutdownPending) {
        cancelShutdown();
        previousShutdownPending = false;
      }

      if (previousPowerSource === null) {
        previousPowerSource = powerSource;
        previousNetwork = currentNetwork;
        if (powerSource === "battery") {lastBatteryUpdate = now;}
        return;
      }

      const powerChanged = powerSource !== previousPowerSource;
      const connectionChanged = networkChanged(previousNetwork, currentNetwork);
      const batteryUpdate = powerSource === "battery" &&
        (lastBatteryUpdate === null || now - lastBatteryUpdate >= BATTERY_UPDATE_INTERVAL_MS);

      if (powerChanged || connectionChanged || batteryUpdate) {
        const powerMessage = powerSource === "battery" ? batteryMessage(status.battery_percent) : externalMessage();
        const content = powerMessage + networkMessage(network, connected);

        if (channel && connected) {
          const sent = await sendOrEditUpsMessage(channel, client, content);

          if (sent && powerSource === "battery") {lastBatteryUpdate = now;}
          if (sent && powerSource === "external") {lastBatteryUpdate = null;}
        }
      }

      previousPowerSource = powerSource;
      previousNetwork = currentNetwork;

    } catch (error) {
      console.error("UPS/network notifier check failed:", error);
    } finally {
      checkInProgress = false;
    }
  }

  await checkUps();
    if (!isShutdownRequested()) {
    notifierInterval = setInterval(checkUps, CHECK_INTERVAL_MS);
  }
}
