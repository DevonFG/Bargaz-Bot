const axios = require("axios"); // HTTP request to YouTube API
const { loadData, saveData } = require("./storage");
const { logAction } = require("./logging");

// Quota tracking configuration
const QUOTA_CONFIG = {
  warningThreshold: 500,    // Warn when quota drops below 500 units
  criticalThreshold: 100,   // Switch to RSS-only at 100 units
  checkInterval: 3600000,   // Check quota every hour (in milliseconds)
  maxDailyQuota: 10000      // YouTube's daily quota per project
};

// Check current quota usage
async function checkQuotaUsage() {
  try {
    // Make a minimal API call that costs 1 quota unit
    // We'll use channels.list which is cheap
    const response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: {
        key:  process.env.YOUTUBE_API_KEY,
        id:   "UC_x5XG1OV2P6uZZ5FSM9Ttw", // YouTube's own channel (safe test)
        part: "snippet"
      }
    });

    return response.status === 200;
  } catch (error) {
    // Check if it's a quota error
    if (error.response?.status === 403) {
      const message = error.response.data?.error?.message || "";
      if (message.includes("quotaExceeded") || message.includes("dailyLimitExceeded")) {
        return "exceeded";
      }
    }
    return false;
  }
}

// Get estimated quota remaining (based on tracking)
function getEstimatedQuotaRemaining() {
  const data = loadData();
  if (!data.youtubeQuotaTracker) {
    data.youtubeQuotaTracker = {
      lastUpdated: Date.now(),
      estimatedRemaining: QUOTA_CONFIG.maxDailyQuota,
      quotaExceeded: false,
      rssOnlyMode: false
    };
    saveData(data);
  }
  return data.youtubeQuotaTracker;
}

// Update quota tracking after API calls
function updateQuotaUsage(unitsUsed) {
  const data = loadData();
  if (!data.youtubeQuotaTracker) {
    data.youtubeQuotaTracker = {
      lastUpdated: Date.now(),
      estimatedRemaining: QUOTA_CONFIG.maxDailyQuota,
      quotaExceeded: false,
      rssOnlyMode: false
    };
  }

  const tracker = data.youtubeQuotaTracker;
  
  // Reset daily quota at midnight UTC
  const lastUpdateDate = new Date(tracker.lastUpdated);
  const today = new Date();
  if (lastUpdateDate.toDateString() !== today.toDateString()) {
    tracker.estimatedRemaining = QUOTA_CONFIG.maxDailyQuota;
    tracker.quotaExceeded = false;
  }

  // Deduct units used
  tracker.estimatedRemaining -= unitsUsed;
  tracker.lastUpdated = Date.now();

  // Check thresholds
  if (tracker.estimatedRemaining <= 0) {
    tracker.quotaExceeded = true;
    tracker.rssOnlyMode = true;
  } else if (tracker.estimatedRemaining < QUOTA_CONFIG.criticalThreshold) {
    tracker.rssOnlyMode = true; // Switch to RSS-only
  } else if (tracker.estimatedRemaining > QUOTA_CONFIG.warningThreshold) {
    tracker.rssOnlyMode = false; // Re-enable API if we recover
  }

  saveData(data);
  return tracker;
}

// Send warning to announcement channel AND owner's warning log
async function sendQuotaWarning(client, tracker, severity) {
  const data = loadData();
  
  const severityEmoji = severity === "critical" ? "🚨" : "⚠️";
  const title = `${severityEmoji} YouTube API Quota ${severity === "critical" ? "CRITICAL" : "Warning"}`;
  const message = severity === "critical"
    ? `⚠️ YouTube API quota is critically low! Switching to RSS-only mode.`
    : `⚠️ YouTube API quota is running low. Monitor usage.`;
  
  // Send to owner's warning log channel
  await logAction(client, title, message, "youtube_quota", "system", severity === "critical" ? "error" : "warning");
  
  // Send to all servers that have announcements enabled
  for (const guildId in data) {
    const guild = data[guildId];
    if (!guild.announcements || !guild.botAnnouncementChannelId) continue;

    try {
      const channel = client.channels.cache.get(guild.botAnnouncementChannelId);
      if (!channel) continue;

      const color = severity === "critical" ? 0xFF0000 : 0xFFFF00;
      
      const embed = new (require("discord.js")).EmbedBuilder()
        .setColor(color)
        .setTitle(`${severityEmoji} YouTube API Quota Warning`)
        .setDescription(severity === "critical"
          ? "🔴 **CRITICAL:** YouTube API quota is critically low! Switching to RSS-only mode for YouTube announcements."
          : "🟡 **WARNING:** YouTube API quota is running low. Please monitor usage.")
        .addFields(
          {
            name: "Estimated Remaining Units",
            value: `${Math.max(0, tracker.estimatedRemaining)} / 10000`,
            inline: true
          },
          {
            name: "Quota Status",
            value: tracker.rssOnlyMode ? "🔴 RSS-Only Mode" : "🟢 API Enabled",
            inline: true
          },
          {
            name: "What This Means",
            value: severity === "critical"
              ? "YouTube features that require API calls (live streams, premieres, community posts) are temporarily disabled. RSS feeds will still work for videos/shorts."
              : "Consider monitoring your API usage or requesting a quota increase from Google.",
            inline: false
          }
        )
        .setFooter({
          text: `Last Updated: ${new Date(tracker.lastUpdated).toLocaleString()}`
        });

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error sending quota warning to guild ${guildId}:`, error.message);
    }
  }
}

// Check if we should use RSS-only for YouTube
function isYoutubeRssOnly() {
  const tracker = getEstimatedQuotaRemaining();
  return tracker.rssOnlyMode || tracker.quotaExceeded;
}


// Start quota monitoring
function startQuotaMonitoring(client) {
  console.log("YouTube API quota monitoring started");

    setInterval(async () => {
    const data = loadData();
    let tracker = getEstimatedQuotaRemaining();
    
    // CHECK IF IT'S A NEW DAY (reset quota at midnight UTC)
    const now = new Date();
    const lastUpdateDate = new Date(tracker.lastUpdated);
    
    // If the day has changed since last update, reset quota
    if (lastUpdateDate.toDateString() !== now.toDateString()) {
      console.log("📅 New day detected - resetting YouTube API quota");
      tracker.estimatedRemaining = QUOTA_CONFIG.maxDailyQuota;
      tracker.quotaExceeded = false;
      
      // Only keep manual RSS mode if admin explicitly set it
      if (!tracker.manualRssMode) {
        tracker.rssOnlyMode = false;
      }
      
      tracker.lastUpdated = Date.now();
      saveData(data);
      
      // Send notification of reset
      for (const guildId in data) {
        const guild = data[guildId];
        if (!guild.botAnnouncementChannelId) continue;
        try {
          const channel = client.channels.cache.get(guild.botAnnouncementChannelId);
          if (channel) {
            const embed = {
              color: 0x00FF00,
              title: "📅 YouTube API Quota Reset",
              description: `Daily quota has been reset. New quota: ${QUOTA_CONFIG.maxDailyQuota} units`,
              fields: [
                { name: "Status", value: "🟢 API Enabled", inline: true },
                { name: "Estimated Remaining", value: `${QUOTA_CONFIG.maxDailyQuota} units`, inline: true }
              ],
              footer: { text: "Reset at " + now.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" }
            };
            await channel.send({ embeds: [embed] });
          }
        } catch (error) {
          console.error(`Error sending quota reset notification:`, error.message);
        }
      }
    }
    
    // Check if manual RSS mode should be reset at midnight
    if (tracker.manualRssMode && tracker.manualRssModeUntil) {
      const setTime = new Date(tracker.manualRssModeUntil);
      
      // If it's a new day since manual mode was set, reset it
      if (setTime.toDateString() !== now.toDateString()) {
        console.log("🔄 Manual RSS-only mode expired - resetting to normal");
        tracker.manualRssMode = false;
        tracker.rssOnlyMode = false;
        tracker.manualRssModeUntil = null;
        saveData(data);
        
        // Send notification
        for (const guildId in data) {
          const guild = data[guildId];
          if (!guild.botAnnouncementChannelId) continue;
          try {
            const channel = client.channels.cache.get(guild.botAnnouncementChannelId);
            if (channel) {
              const embed = {
                color: 0x00FF00,
                title: "🟢 Manual RSS-Only Mode Expired",
                description: "YouTube API is back to normal at midnight UTC.",
                footer: { text: "Updated at " + now.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" }
              };
              await channel.send({ embeds: [embed] });
            }
          } catch (error) {
            console.error(`Error sending mode reset notification:`, error.message);
          }
        }
      }
    }

    // NORMAL QUOTA CHECKING (only if not in manual RSS mode)
    if (!tracker.manualRssMode) {
      const quotaStatus = await checkQuotaUsage();

      if (quotaStatus === true) {
        updateQuotaUsage(1);
        
        const updated = getEstimatedQuotaRemaining();
        
        // Send critical warning
        if (updated.rssOnlyMode && !tracker.rssOnlyMode) {
          console.warn("⚠️ YouTube API quota CRITICAL - switching to RSS-only mode");
          sendQuotaWarning(client, updated, "critical");
        }
        // Send regular warning
        else if (updated.estimatedRemaining < QUOTA_CONFIG.warningThreshold && 
                 tracker.estimatedRemaining >= QUOTA_CONFIG.warningThreshold) {
          console.warn("⚠️ YouTube API quota warning - running low");
          sendQuotaWarning(client, updated, "warning");
        }
      }
      // Quota exceeded
      else if (quotaStatus === "exceeded") {
        const updated = updateQuotaUsage(0);
        updated.quotaExceeded = true;
        saveData(loadData());
        console.error("🚨 YouTube API quota EXCEEDED");
        sendQuotaWarning(client, updated, "critical");
      }
    }
  }, QUOTA_CONFIG.checkInterval);
}

// Export functions
module.exports = {
  checkQuotaUsage,
  updateQuotaUsage,
  getEstimatedQuotaRemaining,
  isYoutubeRssOnly,
  startQuotaMonitoring,
  sendQuotaWarning,
  QUOTA_CONFIG
};