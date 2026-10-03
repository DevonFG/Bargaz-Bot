import * as youtube from "./youtube.js";
import * as twitch from "./twitch.js";
import * as kick from "./kick.js";
import * as notifications from "./notifications.js";

const DEFAULT_CHECK_INTERVAL = 300000;
const METADATA_REFRESH_INTERVAL = 60000;
const CLEANUP_INTERVAL = 300000;

let client = null;

let monitorInterval = null;
let metadataInterval = null;
let cleanupInterval = null;

let monitorRunning = false;
let metadataRunning = false;


/*
=====================================================
Platform Information
=====================================================
*/

export const PLATFORM_NAMES = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick"
};


export const PLATFORM_COLORS = {
  youtube: 0xFF0000,
  twitch: 0x9146FF,
  kick: 0x53FC18
};


export const PLATFORM_EMOJIS = {
  youtube: "🔴",
  twitch: "🟣",
  kick: "🟢"
};


export const PLATFORM_CONTENT_TYPES = {
  youtube: [
    "video",
    "short",
    "stream",
    "premiere"
  ],

  twitch: [
    "stream"
  ],

  kick: [
    "stream"
  ]
};


/*
=====================================================
Platform Lookup
=====================================================
*/

export function getPlatformModule(platform) {
  switch (platform) {
    case "youtube":
      return youtube;

    case "twitch":
      return twitch;

    case "kick":
      return kick;

    default:
      throw new Error(
        `Unknown platform: ${platform}`
      );
  }
}


export function isSupportedPlatform(platform) {
  return (
    platform === "youtube" ||
    platform === "twitch" ||
    platform === "kick"
  );
}


export function getSupportedPlatforms() {
  return [
    "youtube",
    "twitch",
    "kick"
  ];
}


/*
=====================================================
Platform Validation
=====================================================
*/

export function validatePlatform(platform) {
  if (
    !isSupportedPlatform(platform)
  ) {
    throw new Error(
      `Unsupported platform: ${platform}`
    );
  }

  return platform;
}


/*
=====================================================
Channel Resolution
=====================================================
*/

export async function resolveChannel(
  platform,
  input
) {
  validatePlatform(platform);

  const platformModule =
    getPlatformModule(platform);

  return platformModule
    .resolveChannel(input);
}


export async function resolveAndSaveChannel(
  platform,
  input
) {
  validatePlatform(platform);

  const platformModule =
    getPlatformModule(platform);

  return platformModule
    .resolveAndSaveChannel(input);
}


/*
=====================================================
YouTube Polling
=====================================================
*/

async function checkYouTube() {
  const channels =
    youtube.getSubscribedChannels();

  const results = [];

  for (const channel of channels) {
    try {
      const channelResults =
        await youtube.checkChannel(
          channel
        );

      if (
        !channelResults ||
        channelResults.length === 0
      ) {
        continue;
      }

      results.push(
        ...channelResults
      );

      await notifications
        .processYouTubeResults(
          client,
          channelResults
        );

    } catch (error) {
      console.error(
        `Failed to check YouTube channel ${channel.channel_id}:`,
        error
      );
    }
  }

  return results;
}


/*
=====================================================
Twitch Polling
=====================================================
*/

async function checkTwitch() {
  try {
    const results =
      await twitch
        .checkSubscribedChannels();

    for (const result of results) {
      await notifications
        .processResult(
          client,
          result
        );
    }

    return results;

  } catch (error) {
    console.error(
      "Failed to check Twitch channels:",
      error
    );

    return [];
  }
}


/*
=====================================================
Kick Polling
=====================================================
*/

async function checkKick() {
  try {
    const results =
      await kick
        .checkSubscribedChannels();

    for (const result of results) {
      await notifications
        .processResult(
          client,
          result
        );
    }

    return results;

  } catch (error) {
    console.error(
      "Failed to check Kick channels:",
      error
    );

    return [];
  }
}


/*
=====================================================
Main Platform Check
=====================================================
*/

export async function checkPlatforms() {
  if (!client) {
    throw new Error(
      "Platform manager has not been started."
    );
  }

  if (monitorRunning) {
    console.warn(
      "Platform check skipped because the previous check is still running."
    );

    return;
  }

  monitorRunning = true;

  try {
    await Promise.allSettled([
      checkYouTube(),
      checkTwitch(),
      checkKick()
    ]);

  } finally {
    monitorRunning = false;
  }
}


/*
=====================================================
YouTube Metadata Refresh
=====================================================
*/

async function refreshYouTubeMetadata() {
  if (
    !client ||
    metadataRunning
  ) {
    return;
  }

  metadataRunning = true;

  try {
    const results =
      await youtube
        .refreshActiveContent();

    for (const result of results) {
      try {
        await notifications
          .processResult(
            client,
            result
          );

      } catch (error) {
        console.error(
          `Failed to process YouTube metadata update for ${result.content?.id}:`,
          error
        );
      }
    }

  } catch (error) {
    console.error(
      "Failed to refresh active YouTube content:",
      error
    );

  } finally {
    metadataRunning = false;
  }
}


/*
=====================================================
Content Cleanup
=====================================================
*/

function cleanupContent() {
  try {
    const youtubeRemoved =
      youtube.cleanupEndedContent();

    const twitchRemoved =
      twitch.cleanupEndedContent();

    const kickRemoved =
      kick.cleanupEndedContent();

    const totalRemoved =
      youtubeRemoved +
      twitchRemoved +
      kickRemoved;

    if (totalRemoved > 0) {
      console.log(
        `Removed ${totalRemoved} expired notification content record(s).`
      );
    }

  } catch (error) {
    console.error(
      "Failed to clean expired notification content:",
      error
    );
  }
}


/*
=====================================================
Monitor Startup
=====================================================
*/

export async function startPlatformManager(
  discordClient
) {
  if (client) {
    console.warn(
      "Platform manager is already running."
    );

    return;
  }

  client =
    discordClient;

  console.log(
    "Starting BargazBot platform manager."
  );

  try {
    await checkPlatforms();
  } catch (error) {
    console.error(
      "Initial platform check failed:",
      error
    );
  }

  monitorInterval =
    setInterval(
      () => {
        checkPlatforms().catch(
          error => {
            console.error(
              "Platform monitor failed:",
              error
            );
          }
        );
      },
      DEFAULT_CHECK_INTERVAL
    );

  metadataInterval =
    setInterval(
      () => {
        refreshYouTubeMetadata()
          .catch(
            error => {
              console.error(
                "YouTube metadata monitor failed:",
                error
              );
            }
          );
      },
      METADATA_REFRESH_INTERVAL
    );

  cleanupInterval =
    setInterval(
      cleanupContent,
      CLEANUP_INTERVAL
    );

  console.log(
    "BargazBot platform manager started."
  );
}


/*
=====================================================
Monitor Shutdown
=====================================================
*/

export function stopPlatformManager() {
  if (monitorInterval) {
    clearInterval(
      monitorInterval
    );

    monitorInterval = null;
  }

  if (metadataInterval) {
    clearInterval(
      metadataInterval
    );

    metadataInterval = null;
  }

  if (cleanupInterval) {
    clearInterval(
      cleanupInterval
    );

    cleanupInterval = null;
  }

  client = null;
  monitorRunning = false;
  metadataRunning = false;

  console.log(
    "BargazBot platform manager stopped."
  );
}


/*
=====================================================
Manual Platform Check
=====================================================
*/

export async function checkPlatform(
  platform
) {
  validatePlatform(platform);

  if (!client) {
    throw new Error(
      "Platform manager has not been started."
    );
  }

  switch (platform) {
    case "youtube":
      return checkYouTube();

    case "twitch":
      return checkTwitch();

    case "kick":
      return checkKick();
  }
}


/*
=====================================================
Monitor Status
=====================================================
*/

export function getMonitorStatus() {
  return {
    running:
      Boolean(client),

    platformCheckRunning:
      monitorRunning,

    metadataRefreshRunning:
      metadataRunning,

    checkInterval:
      DEFAULT_CHECK_INTERVAL,

    metadataRefreshInterval:
      METADATA_REFRESH_INTERVAL,

    cleanupInterval:
      CLEANUP_INTERVAL,

    platforms:
      getSupportedPlatforms()
  };
}
