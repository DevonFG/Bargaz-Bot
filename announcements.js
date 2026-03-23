const axios  = require("axios");      // HTTP requests to APIs
const Parser = require("rss-parser"); // Parses Rumble's RSS feed
const { loadData, saveData } = require("./storage");   // Read/write storage functions
const { EmbedBuilder }       = require("discord.js");  // EmbedBuilder lets us create nicely formatted DC messages

const parser = new Parser(); // create new instance of RSS parser

const CHECK_INTERVAL = 300000; // time in milliseconds (300000 = 5min), how often to check for new post

// Platform specific colors
const PLATFORM_COLORS = {
  youtube: "#FF0000", // YouTube red
  twitch:  "#9146FF", // Twitch purple
  rumble:  "#85C742"  // Rumble green
};

// Platform specific emojis
const PLATFORM_EMOJI = {
  youtube: "🔴",
  twitch:  "🟣",
  rumble:  "🟢"
};

// Content types per platform
// NOTE: Rumble doesn't have a public API yet so this uses RSS as a substitute
// TODO: Update when Rumble releases an official public API
// Devon has reached out to Rumble requesting API access
const PLATFORM_CONTENT_TYPES = {
  youtube: ["videos", "shorts", "streams", "premieres", "posts"],
  twitch:  ["streams"],
  rumble:  ["videos", "streams"] // limited by RSS feed ability
};

// Store Twitch access token so we don't keep requesting a new one every check
let twitchToken     = null;
let twitchTokenTime = null;
const TWITCH_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

// Converts a JavaScript date object into a readable format
// e.g. "March 21 2026, 9:45 PM PDT"
function formatTimestamp(date) {
  return date.toLocaleString("en-US", {
    month:        "long",    // full month name
    day:          "numeric", // day number
    year:         "numeric", // 4-digit year
    hour:         "numeric", // hour number
    minute:       "2-digit", // always 2 digits e.g. "05" not "5"
    hour12:       true,      // use 12-hour format with AM/PM
    timeZoneName: "short"    // abbreviated timezone e.g. "PDT"
  });
}

// Converts normal text into Discord strikethrough format
// Used when a stream ends to cross out the original announcement
function strikethroughText(text) {
  return `~~${text}~~`;
}

/*
  Old YouTube-only checkChannel function kept for reference
  This has been replaced by the new combined checkChannel function below

  async function checkChannel(channelId) {
    try {
      const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          key:        process.env.YOUTUBE_API_KEY,
          channelId:  channelId,
          part:       "snippet",
          order:      "date",
          maxResults: 1,
          type:       "video"
        }
      });
      if (!response.data.items || response.data.items.length === 0) return null;
      const video = response.data.items[0];
      return {
        videoId:     video.id.videoId,
        title:       video.snippet.title,
        channelName: video.snippet.channelTitle,
        thumbnail:   video.snippet.thumbnails.high.url,
        url:         `https://www.youtube.com/watch?v=${video.id.videoId}`,
        isLive:      video.snippet.liveBroadcastContent === "live"
      };
    } catch (error) {
      console.error(`Error checking YouTube channel ${channelId}`, error.message);
      return null;
    }
  }
*/

// Builds the Discord embed card for any platform
// platform = "youtube"/"twitch"/"rumble"
// content = standardized content object returned by checkChannel
// customMessage = server's custom announcement text
// editHistory = array of previous edits, empty if none
// isEnded = true if stream has ended, triggers strikethrough on title
function buildEmbed(platform, content, customMessage, editHistory = [], isEnded = false) {
  // Apply strikethrough to title if stream has ended
  const title = isEnded ? strikethroughText(content.title) : content.title;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(content.url)
    .setColor(PLATFORM_COLORS[platform])
    .addFields(
      { name: "Channel", value: `${content.channelName} (${content.channelHandle})`, inline: true },
      { name: "Link",    value: content.url,         inline: true },
      { name: "Type",    value: content.contentType, inline: true }
    );

  // Only show thumbnail if content has one
  if (content.thumbnail) {
    embed.setImage(content.thumbnail);
  }

  // Footer shows platform emoji, content status, and ended note if applicable
  const footerParts = [PLATFORM_EMOJI[platform]];
  if (isEnded) {
    footerParts.push("Stream ended");
  } else if (content.isLive) {
    footerParts.push("▶️ LIVE NOW");
  } else {
    footerParts.push(`New ${content.contentType}!`);
  }
  embed.setFooter({ text: footerParts.join(" • ") });

  // Add edit history section if this message has been edited before
  if (editHistory.length > 0) {
    const historyText = editHistory
      .map(entry => `Last updated: ${entry.timestamp}`)
      .join("\n");
    embed.addFields({ name: "📝 Edit History", value: historyText });
  }

  return embed;
}

// Gets a valid Twitch API access token
// Reuses the saved token if it hasn't expired yet, otherwise requests a new one
async function getTwitchToken() {
  const now = Date.now();

  // Reuse existing token if it's still valid
  if (twitchToken && twitchTokenTime && (now - twitchTokenTime) < TWITCH_TOKEN_EXPIRY) {
    return twitchToken;
  }

  try {
    // Request a new token from Twitch using client credentials
    const response = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id:     process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type:    "client_credentials" // server to server auth, no user login needed
      }
    });

    twitchToken     = response.data.access_token; // save token for reuse
    twitchTokenTime = now;                         // save when we got it
    return twitchToken;
  } catch (error) {
    console.error("Error getting Twitch token:", error.message);
    return null;
  }
}

// Verifies a channel exists on the given platform and returns its details
// platform = "youtube"/"twitch"/"rumble"
// channelInput = could be a channel ID or @ handle, we handle both
async function verifyChannel(platform, channelInput) {
  // Remove @ symbol if they included it
  const cleanInput = channelInput.startsWith("@")
    ? channelInput.slice(1)
    : channelInput;

  if (platform === "youtube") {
    try {
      // First try searching by channel ID directly
      let response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
        params: {
          key:  process.env.YOUTUBE_API_KEY,
          id:   cleanInput, // try as channel ID first
          part: "snippet"
        }
      });

      // If no results by ID, try searching by username/handle instead
      if (!response.data.items || response.data.items.length === 0) {
        response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
          params: {
            key:       process.env.YOUTUBE_API_KEY,
            forHandle: cleanInput, // try as @ handle
            part:      "snippet"
          }
        });
      }

      // If still no results, channel doesn't exist
      if (!response.data.items || response.data.items.length === 0) return null;

      const channel = response.data.items[0];

      // Return standardized channel info
      return {
        id:          channel.id,
        displayName: channel.snippet.title,
        handle:      `@${channel.snippet.customUrl || cleanInput}`,
        thumbnail:   channel.snippet.thumbnails.high.url,
        platform:    "youtube"
      };
    } catch (error) {
      console.error("Error verifying YouTube channel:", error.message);
      return null;
    }
  }

  if (platform === "twitch") {
    try {
      const token = await getTwitchToken();
      if (!token) return null;

      // Search for the channel by username
      const response = await axios.get("https://api.twitch.tv/helix/users", {
        params: { login: cleanInput }, // Twitch uses login name not ID for lookup
        headers: {
          "Client-ID":     process.env.TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.data.data || response.data.data.length === 0) return null;

      const channel = response.data.data[0];

      return {
        id:          channel.id,
        displayName: channel.display_name,
        handle:      `@${channel.login}`,
        thumbnail:   channel.profile_image_url,
        platform:    "twitch"
      };
    } catch (error) {
      console.error("Error verifying Twitch channel:", error.message);
      return null;
    }
  }

  if (platform === "rumble") {
    // NOTE: Rumble has no official API as of March 2026
    // Currently using RSS feed to verify channel existence
    // TODO: Update this when Rumble releases an official public API
    // Devon has reached out to Rumble requesting API access
    try {
      const rssUrl = `https://rumble.com/c/${cleanInput}/rss`;
      const altUrl = `https://rumble.com/user/${cleanInput}/rss`;

      let feed = null;

      try {
        feed = await parser.parseURL(rssUrl); // try /c/ path first
      } catch {
        feed = await parser.parseURL(altUrl); // fall back to /user/ path
      }

      if (!feed) return null;

      return {
        id:          cleanInput,
        displayName: feed.title || cleanInput,
        handle:      `@${cleanInput}`,
        thumbnail:   feed.image?.url || null,
        platform:    "rumble"
      };
    } catch (error) {
      console.error("Error verifying Rumble channel:", error.message);
      return null;
    }
  }

  // If platform doesn't match any known platform
  console.error(`Unknown platform: ${platform}`);
  return null;
}

// Checks a channel for new content on any platform
// platform = "youtube"/"twitch"/"rumble"
// channelConfig = the saved config for this channel from data.json
// enabledTypes = array of content types this server wants announced
// e.g. ["videos", "shorts", "streams"]
async function checkChannel(platform, channelConfig, enabledTypes) {
  if (platform === "youtube") {
    try {
      // Determine which content types are enabled for this server
      const isPostsEnabled     = enabledTypes.includes("posts");
      const isVideosEnabled    = enabledTypes.includes("videos");
      const isShortsEnabled    = enabledTypes.includes("shorts");
      const isStreamsEnabled   = enabledTypes.includes("streams");
      const isPremieresEnabled = enabledTypes.includes("premieres");

      let latestContent = null;
      let latestDate    = null;

      // Check for videos, shorts, streams and premieres in one API call
      if (isVideosEnabled || isShortsEnabled || isStreamsEnabled || isPremieresEnabled) {
        const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
          params: {
            key:        process.env.YOUTUBE_API_KEY,
            channelId:  channelConfig.channelId,
            part:       "snippet",
            order:      "date",
            maxResults: 1,
            type:       "video"
          }
        });

        if (response.data.items && response.data.items.length > 0) {
          const video     = response.data.items[0];
          const videoDate = new Date(video.snippet.publishedAt);

          // Determine what type of content this is
          let contentType = "video";
          if (video.snippet.liveBroadcastContent === "live") {
            contentType = "stream";
          } else if (video.snippet.liveBroadcastContent === "upcoming") {
            contentType = "premiere";
          } else if (video.snippet.title.toLowerCase().includes("#shorts")) {
            contentType = "short"; // YouTube doesn't directly label shorts so we check title
          }

          // Only include if the server has this content type enabled
          const typeEnabled = (
            (contentType === "video"    && isVideosEnabled)    ||
            (contentType === "stream"   && isStreamsEnabled)   ||
            (contentType === "premiere" && isPremieresEnabled) ||
            (contentType === "short"    && isShortsEnabled)
          );

          if (typeEnabled) {
            latestContent = {
              id:            video.id.videoId,
              title:         video.snippet.title,
              channelName:   video.snippet.channelTitle,
              channelHandle: channelConfig.handle,
              thumbnail:     video.snippet.thumbnails.high.url,
              url:           `https://www.youtube.com/watch?v=${video.id.videoId}`,
              isLive:        contentType === "stream",
              isEnded:       false,
              contentType:   contentType
            };
            latestDate = videoDate;
          }
        }
      }

      // Check for community posts separately if enabled
      // NOTE: YouTube community posts API is limited, only available for larger channels
      if (isPostsEnabled) {
        try {
          const postResponse = await axios.get("https://www.googleapis.com/youtube/v3/activities", {
            params: {
              key:        process.env.YOUTUBE_API_KEY,
              channelId:  channelConfig.channelId,
              part:       "snippet,contentDetails",
              maxResults: 1
            }
          });

          if (postResponse.data.items && postResponse.data.items.length > 0) {
            const post     = postResponse.data.items[0];
            const postDate = new Date(post.snippet.publishedAt);

            // Only use this post if it's newer than any video we already found
            if (!latestDate || postDate > latestDate) {
              if (post.snippet.type === "bulletinPost") {
                latestContent = {
                  id:            post.id,
                  title:         post.snippet.description || "New community post",
                  channelName:   post.snippet.channelTitle,
                  channelHandle: channelConfig.handle,
                  thumbnail:     post.snippet.thumbnails?.high?.url || null,
                  url:           `https://www.youtube.com/channel/${channelConfig.channelId}/community`,
                  isLive:        false,
                  isEnded:       false,
                  contentType:   "post"
                };
              }
            }
          }
        } catch (error) {
          // Community posts API can fail for smaller channels, just skip silently
          console.error("Error checking YouTube community posts:", error.message);
        }
      }

      return latestContent;

    } catch (error) {
      console.error(`Error checking YouTube channel ${channelConfig.channelId}:`, error.message);
      return null;
    }
  }

  if (platform === "twitch") {
    try {
      const token = await getTwitchToken();
      if (!token) return null;

      // Check if the streamer is currently live
      const response = await axios.get("https://api.twitch.tv/helix/streams", {
        params: { user_id: channelConfig.channelId },
        headers: {
          "Client-ID":     process.env.TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${token}`
        }
      });

      const streamData = response.data.data;

      // If no data returned, streamer is offline
      if (!streamData || streamData.length === 0) {
        // Return an ended state if they were previously live
        if (channelConfig.isCurrentlyLive) {
          return {
            id:            channelConfig.lastContentId,
            title:         channelConfig.lastTitle,
            channelName:   channelConfig.displayName,
            channelHandle: channelConfig.handle,
            thumbnail:     channelConfig.lastThumbnail,
            url:           `https://twitch.tv/${channelConfig.handle.replace("@", "")}`,
            isLive:        false,
            isEnded:       true, // signals that stream just ended
            contentType:   "stream"
          };
        }
        return null; // wasn't live before either, nothing to report
      }

      const stream = streamData[0];

      // Replace Twitch thumbnail size placeholders with actual dimensions
      const thumbnail = stream.thumbnail_url
        .replace("{width}",  "1280")
        .replace("{height}", "720");

      return {
        id:            stream.id,
        title:         stream.title,
        channelName:   stream.user_name,
        channelHandle: channelConfig.handle,
        thumbnail:     thumbnail,
        url:           `https://twitch.tv/${stream.user_login}`,
        isLive:        true,
        isEnded:       false,
        contentType:   "stream"
      };

    } catch (error) {
      console.error(`Error checking Twitch channel ${channelConfig.channelId}:`, error.message);
      return null;
    }
  }

  if (platform === "rumble") {
    // NOTE: Rumble has no official API as of March 2026
    // Currently using RSS feed to check for new content
    // TODO: Update this when Rumble releases an official public API
    // Devon has reached out to Rumble requesting API access
    try {
      let feed = null;
      try {
        feed = await parser.parseURL(`https://rumble.com/c/${channelConfig.channelId}/rss`);
      } catch {
        feed = await parser.parseURL(`https://rumble.com/user/${channelConfig.channelId}/rss`);
      }

      if (!feed || !feed.items || feed.items.length === 0) return null;

      const latest      = feed.items[0]; // most recent item
      const isLive      = latest.title?.toLowerCase().includes("live") || false;
      const contentType = isLive ? "stream" : "video";

      // Skip if this content type isn't enabled for this server
      if (!enabledTypes.includes(contentType)) return null;

      return {
        id:            latest.guid || latest.link,
        title:         latest.title,
        channelName:   feed.title || channelConfig.displayName,
        channelHandle: channelConfig.handle,
        thumbnail:     latest.enclosure?.url || null,
        url:           latest.link,
        isLive:        isLive,
        isEnded:       false,
        contentType:   contentType
      };

    } catch (error) {
      console.error(`Error checking Rumble channel ${channelConfig.channelId}:`, error.message);
      return null;
    }
  }

  console.error(`Unknown platform: ${platform}`);
  return null;
}

// Main logic for deciding whether to post new announcement, edit existing, or skip
// client = Discord bot client
// platform = "youtube"/"twitch"/"rumble"
// channelConfig = this channel's saved settings from data.json
// guildData = all data for this server
async function processAnnouncement(client, platform, channelConfig, guildData) {
  // Get enabled content types for this channel, default to all if not set
  const enabledTypes = channelConfig.enabledTypes || PLATFORM_CONTENT_TYPES[platform];

  // Fetch latest content from the platform
  const latest = await checkChannel(platform, channelConfig, enabledTypes);

  // Get the Discord channel object to post announcements in
  const discordChannel = client.channels.cache.get(channelConfig.discordChannelId);
  if (!discordChannel) return; // stop if Discord channel not found

  // Build the announcement message including any @ mentions
  const mentions = channelConfig.mentions
    ? channelConfig.mentions.map(id => `<@&${id}>`).join(" ")
    : "";
  const customMessage = channelConfig.customMessage
    ? `${mentions} ${channelConfig.customMessage}`.trim()
    : `${mentions} New content from ${channelConfig.displayName}!`.trim();

  // CASE 1: Stream has ended - edit original message with strikethrough
  if (latest && latest.isEnded && channelConfig.isCurrentlyLive) {
    channelConfig.isCurrentlyLive = false;

    if (channelConfig.lastMessageId) {
      try {
        const originalMessage = await discordChannel.messages.fetch(
          channelConfig.lastMessageId
        );
        const embed = buildEmbed(
          platform,
          latest,
          customMessage,
          channelConfig.editHistory || [],
          true // isEnded = true triggers strikethrough
        );
        await originalMessage.edit({ content: customMessage, embeds: [embed] });
      } catch {
        // Original message not found, update saved state silently
      }
    }

    saveData(guildData);
    return;
  }

  // Nothing returned from platform, nothing to do
  if (!latest) return;

  // CASE 2: Brand new content we haven't announced yet
  if (channelConfig.lastContentId !== latest.id) {
    const embed = buildEmbed(platform, latest, customMessage);
    const sent  = await discordChannel.send({
      content: customMessage,
      embeds:  [embed]
    });

    // Save all details for tracking and future edits
    channelConfig.lastContentId   = latest.id;
    channelConfig.lastTitle       = latest.title;
    channelConfig.lastThumbnail   = latest.thumbnail;
    channelConfig.lastMessageId   = sent.id;
    channelConfig.editHistory     = [];
    channelConfig.checksAfterPost = 0;
    channelConfig.isCurrentlyLive = latest.isLive;
    saveData(guildData);
    return;
  }

  // CASE 3: Same content - check for changes within 10 minute window
  // For non-live content stop checking after 2 checks (10 minutes)
  if (channelConfig.checksAfterPost >= 2 && !latest.isLive) { return; }

  // For live streams keep checking every interval until stream ends
  if (!latest.isLive) {
    channelConfig.checksAfterPost++;
  }

  // Check if title or thumbnail has changed
  const titleChanged     = channelConfig.lastTitle     !== latest.title;
  const thumbnailChanged = channelConfig.lastThumbnail !== latest.thumbnail;

  // Nothing changed, save updated counter and stop
  if (!titleChanged && !thumbnailChanged) {
    saveData(guildData);
    return;
  }

  // Something changed! Edit the announcement
  try {
    const timestamp = formatTimestamp(new Date());

    if (!channelConfig.editHistory) channelConfig.editHistory = [];
    channelConfig.editHistory.push({ timestamp });

    const embed = buildEmbed(
      platform,
      latest,
      customMessage,
      channelConfig.editHistory,
      false // not ended
    );

    if (channelConfig.lastMessageId) {
      try {
        const originalMessage = await discordChannel.messages.fetch(
          channelConfig.lastMessageId
        );
        await originalMessage.edit({ content: customMessage, embeds: [embed] });
      } catch {
        // Original message not found, send a new one
        const sent = await discordChannel.send({
          content: customMessage,
          embeds:  [embed]
        });
        channelConfig.lastMessageId = sent.id;
      }
    } else {
      const sent = await discordChannel.send({
        content: customMessage,
        embeds:  [embed]
      });
      channelConfig.lastMessageId = sent.id;
    }

    channelConfig.lastTitle     = latest.title;
    channelConfig.lastThumbnail = latest.thumbnail;
    saveData(guildData);

  } catch (error) {
    console.error("Error editing announcement:", error.message);
  }
}

// Starts the monitor for all platforms - runs forever on a 5 minute timer
// client = Discord bot client, passed in from bot.js
async function startMonitor(client) {
  console.log("Announcement monitor started for YouTube, Twitch and Rumble");

  setInterval(async () => {
    const data = loadData(); // load all server configs from data.json

    for (const guildId in data) {
      const guild = data[guildId];

      // Skip if this server has no announcements set up
      if (!guild.announcements) continue;

      // Loop through each platform
      for (const platform of ["youtube", "twitch", "rumble"]) {
        if (!guild.announcements[platform]) continue;

        for (const channelConfig of guild.announcements[platform]) {
          await processAnnouncement(client, platform, channelConfig, data);
        }
      }
    }
  }, CHECK_INTERVAL);
}

// Handles the /refresh command for a specific creator by nickname
// client = Discord bot client
// guildId = Discord server ID
// nickname = the nickname set when the channel was added
// interaction = the Discord slash command interaction object
async function refreshChannel(client, guildId, nickname, interaction) {
  const data  = loadData();
  const guild = data[guildId];

  // Make sure this server has announcements set up
  if (!guild || !guild.announcements) {
    await interaction.reply({
      content:   "❌ No channels are being monitored in this server at this time.",
      ephemeral: true
    });
    return;
  }

  // Search all platforms for a channel matching the nickname
  let foundConfig   = null;
  let foundPlatform = null;

  for (const platform of ["youtube", "twitch", "rumble"]) {
    if (!guild.announcements[platform]) continue;

    const match = guild.announcements[platform].find(
      c => c.nickname.toLowerCase() === nickname.toLowerCase() // case insensitive
    );

    if (match) {
      foundConfig   = match;
      foundPlatform = platform;
      break;
    }
  }

  // No channel found with that nickname
  if (!foundConfig) {
    await interaction.reply({
      content:   `❌ No channel found with the nickname **${nickname}**. Check your spelling or use /list to see all monitored channels.`,
      ephemeral: true
    });
    return;
  }

  // Check 10 minute cooldown
  const now = Date.now();
  if (guild.announcements.lastRefresh &&
      now - guild.announcements.lastRefresh < 600000) {
    const remaining = Math.ceil(
      (600000 - (now - guild.announcements.lastRefresh)) / 60000
    );
    await interaction.reply({
      content:   `⏳ Please wait ${remaining} more minute(s) before refreshing again.`,
      ephemeral: true
    });
    return;
  }

  // Check refresh permission for this server
  const refreshPermission = guild.announcements.refreshPermission || "admin";
  const refreshRoleId     = guild.announcements.refreshRoleId     || null;

  let hasPermission = false;

  if (refreshPermission === "everyone") {
    hasPermission = true;
  } else if (refreshPermission === "role" && refreshRoleId) {
    hasPermission = interaction.member.roles.cache.has(refreshRoleId);
  } else {
    hasPermission = interaction.member.permissions.has("Administrator");
  }

  if (!hasPermission) {
    await interaction.reply({
      content:   "❌ You don't have permission to use this command.",
      ephemeral: true
    });
    return;
  }

  // Update cooldown timestamp
  guild.announcements.lastRefresh = now;
  saveData(data);

  await interaction.reply({
    content:   `🔄 Checking **${foundConfig.displayName}** on ${foundPlatform} for updates...`,
    ephemeral: true
  });

  // Force a check of this specific channel
  await processAnnouncement(client, foundPlatform, foundConfig, data);

  await interaction.editReply({
    content:   `✅ Refresh complete for **${foundConfig.displayName}**!`,
    ephemeral: true
  });
}

// Export functions needed by bot.js
module.exports = { startMonitor, refreshChannel, verifyChannel, PLATFORM_CONTENT_TYPES };