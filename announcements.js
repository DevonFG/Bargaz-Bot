// Note: Rumble is disabled while I await a response from Rumble support (Automation requires permission, listed in TOS)
// I also want to make Rumble not ise HTML scraping, but I'm not sure how yet and need to do more research
import axios                from "axios";                // HTTP requests to YouTube API, Twitch API, and Rumble HTML scraping
import RSSParser            from "rss-parser";           // Parses RSS feed for YouTube as a backup/double check, and Twitch as a backup
import * as cheerio         from "cheerio";              // HTML parsing and scraping for Rumble 
import * as discord         from "discord.js";           // Only using EmbedBuilder for this file -- format of DC messages
import * as storage         from "./storage.js";         // Read/write functions used from storage.js
import * as quotaTracker    from "./youtube-quota.js";   // Internal tracker for YouTube's API Quota
import * as platformManager from "./platformManager.js"; // All functions and variables to do with Setup and Managing any social platforms
import * as utils           from "./utils.js";           // Currently just sleep and time conversion

const parser = new RSSParser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
});

// Builds the Discord embed card for any platform
// platform = "youtube"/"twitch"/"rumble"
// content = standardized content object returned by checkChannel
// customMessage = server's custom announcement text
// editHistory = array of previous edits, empty if none
// isEnded = true if stream has ended, triggers strikethrough on title
function buildEmbed(platform, content, customMessage, editHistory = [], isEnded = false) {
  // Apply strikethrough to title if stream has ended
  const title = isEnded ? utils.strikethroughText(content.title) : content.title;

  const embed = new discord.EmbedBuilder()
    .setTitle(title)
    .setURL(content.url)
    .setColor(platformManager.PLATFORM_COLORS[platform])
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
  const footerParts = [platformManager.PLATFORM_EMOJI[platform]];
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

// Checks a channel for new content on any platform
// platform = "youtube"/"twitch"/"rumble"
// channelConfig = the saved config for this channel from data.json
// enabledTypes = array of content types this server wants announced
// e.g. ["videos", "shorts", "streams"]
async function checkChannel(platform, channelConfig, enabledTypes) {
    if (platform === "youtube") {
      try {
      // CHECK IF WE'RE IN RSS-ONLY MODE
      if (quotaTracker.isYoutubeRSSOnly()) {
        console.log(`YouTube API quota critical - using RSS-only for ${channelConfig.displayName}`);
        
        // STEP 1: Check RSS feed for new videos ONLY
        try {
          const rssUrl  = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelConfig.channelId}`;
          const feed    = await parser.parseURL(rssUrl);

          if (feed && feed.items && feed.items.length > 0) {
            const latest  = feed.items[0];
            const videoId = latest.id?.split(":").pop() || latest.link?.split("v=")[1];

            if (videoId) {
              let contentType = "video";
              if (latest.title?.toLowerCase().includes("#shorts")) {
                contentType = "short";
              }

              return {
                id:            videoId,
                title:         latest.title,
                channelName:   latest.author || channelConfig.displayName,
                channelHandle: channelConfig.handle,
                thumbnail:     `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                url:           `https://www.youtube.com/watch?v=${videoId}`,
                isLive:        false,
                isEnded:       false,
                contentType:   contentType
              };
            }
          }
        } catch (rssError) {
          console.error(`RSS feed error for YouTube channel ${channelConfig.channelId}:`, rssError.message);
        }
        
        return null; // No RSS content found
      }

      // NORMAL MODE - USE API WITH QUOTA TRACKING
      const isPostsEnabled     = enabledTypes.includes("posts");
      const isVideosEnabled    = enabledTypes.includes("videos");
      const isShortsEnabled    = enabledTypes.includes("shorts");
      const isStreamsEnabled   = enabledTypes.includes("streams");
      const isPremieresEnabled = enabledTypes.includes("premieres");

      let latestContent = null;

      // STEP 1: Check RSS feed for new videos - free
      try {
        const rssUrl  = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelConfig.channelId}`;
        const feed    = await parser.parseURL(rssUrl);

        if (feed && feed.items && feed.items.length > 0) {
          const latest  = feed.items[0];
          const videoId = latest.id?.split(":").pop() || latest.link?.split("v=")[1];

          if (videoId) {
            let contentType = "video";

            if (latest.title?.toLowerCase().includes("#shorts")) {
              contentType = "short";
            }

            const typeEnabled = (
              (contentType === "video" && isVideosEnabled) ||
              (contentType === "short" && isShortsEnabled)
            );

            if (typeEnabled) {
              latestContent = {
                id:            videoId,
                title:         latest.title,
                channelName:   latest.author || channelConfig.displayName,
                channelHandle: channelConfig.handle,
                thumbnail:     `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                url:           `https://www.youtube.com/watch?v=${videoId}`,
                isLive:        false,
                isEnded:       false,
                contentType:   contentType
              };
            }
          }
        }
      } catch (rssError) {
        console.error(`RSS feed error for YouTube channel ${channelConfig.channelId}:`, rssError.message);
      }

      // STEP 2: Check for live streams using API (costs quota)
      if (isStreamsEnabled) {
        try {
          const liveResponse = await axios.get("https://www.googleapis.com/youtube/v3/search", {
            timeout: 10000,
            params: {
              key:        process.env.YOUTUBE_API_KEY,
              channelId:  channelConfig.channelId,
              part:       "snippet",
              eventType:  "live",
              type:       "video",
              maxResults: 1
            }
          });

          quotaTracker.updateQuotaUsage(100); // search.list costs ~100 units

          if (liveResponse.data.items && liveResponse.data.items.length > 0) {
            const stream = liveResponse.data.items[0];

            latestContent = {
              id:            stream.id.videoId,
              title:         stream.snippet.title,
              channelName:   stream.snippet.channelTitle,
              channelHandle: channelConfig.handle,
              thumbnail:     stream.snippet.thumbnails.high.url,
              url:           `https://www.youtube.com/watch?v=${stream.id.videoId}`,
              isLive:        true,
              isEnded:       false,
              contentType:   "stream"
            };
          } else if (channelConfig.isCurrentlyLive) {
            return {
              id:            channelConfig.lastContentId,
              title:         channelConfig.lastTitle,
              channelName:   channelConfig.displayName,
              channelHandle: channelConfig.handle,
              thumbnail:     channelConfig.lastThumbnail,
              url:           `https://www.youtube.com/watch?v=${channelConfig.lastContentId}`,
              isLive:        false,
              isEnded:       true,
              contentType:   "stream"
            };
          }
        } catch (apiError) {
          console.error(`YouTube API error for channel ${channelConfig.channelId}:`, apiError.message);
        }
      }

      // STEP 3: Check for premieres using API (costs quota)
      if (isPremieresEnabled) {
        try {
          const premiereResponse = await axios.get("https://www.googleapis.com/youtube/v3/search", {
            timeout: 10000,
            params: {
              key:        process.env.YOUTUBE_API_KEY,
              channelId:  channelConfig.channelId,
              part:       "snippet",
              eventType:  "upcoming",
              type:       "video",
              maxResults: 1
            }
          });

          quotaTracker.updateQuotaUsage(100); // search.list costs ~100 units

          if (premiereResponse.data.items && premiereResponse.data.items.length > 0) {
            const premiere = premiereResponse.data.items[0];

            if (!latestContent || premiere.id.videoId !== latestContent.id) {
              latestContent = {
                id:            premiere.id.videoId,
                title:         premiere.snippet.title,
                channelName:   premiere.snippet.channelTitle,
                channelHandle: channelConfig.handle,
                thumbnail:     premiere.snippet.thumbnails.high.url,
                url:           `https://www.youtube.com/watch?v=${premiere.id.videoId}`,
                isLive:        false,
                isEnded:       false,
                contentType:   "premiere"
              };
            }
          }
        } catch (apiError) {
          console.error(`YouTube premiere API error for channel ${channelConfig.channelId}:`, apiError.message);
        }
      }

      // STEP 4: Check for community posts using API (costs quota)
      if (isPostsEnabled) {
        try {
          const postResponse = await axios.get("https://www.googleapis.com/youtube/v3/activities", {
            timeout: 10000,
            params: {
              key:        process.env.YOUTUBE_API_KEY,
              channelId:  channelConfig.channelId,
              part:       "snippet,contentDetails",
              maxResults: 1
            }
          });

          quotaTracker.updateQuotaUsage(1); // activities.list costs 1 unit

          if (postResponse.data.items && postResponse.data.items.length > 0) {
            const post = postResponse.data.items[0];

            if (post.snippet.type === "bulletinPost") {
              if (!latestContent) {
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
        } catch (apiError) {
          console.error("Error checking YouTube community posts:", apiError.message);
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
      const token = await platformManager.getTwitchToken();
      if (!token) return null;

      // STEP 1: Try API first - more reliable and real-time
      try {
        const response = await axios.get("https://api.twitch.tv/helix/streams", {
          timeout: 10000,
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

      } catch (apiError) {
        // If API fails, try RSS feed as fallback
        console.warn(`Twitch API error for channel ${channelConfig.channelId}, trying RSS fallback:`, apiError.message);
        
        try {
          const rssUrl = `https://www.twitch.tv/feeds/videos.xml?channel_login=${channelConfig.handle.replace("@", "")}`;
          const feed = await parser.parseURL(rssUrl);

          if (!feed || !feed.items || feed.items.length === 0) return null;

          const latest = feed.items[0];
          const isLive = latest.title?.toLowerCase().includes("live") || false;

          return {
            id:            latest.guid || latest.link,
            title:         latest.title,
            channelName:   feed.title || channelConfig.displayName,
            channelHandle: channelConfig.handle,
            thumbnail:     latest.enclosure?.url || null,
            url:           latest.link,
            isLive:        isLive,
            isEnded:       false,
            contentType:   "stream"
          };
        } catch (rssError) {
          console.error(`Twitch RSS fallback also failed:`, rssError.message);
          return null;
        }
      }

    } catch (error) {
      console.error(`Error checking Twitch channel ${channelConfig.channelId}:`, error.message);
      return null;
    }

  }

  if (platform === "rumble") {
    
    console.error("Rumble called in checkChannel")
    return null;
    /*
    try {
      const username = channelConfig.channelId;
      
      // Try both URL formats
      const urls = [
        `https://rumble.com/c/${username}`,
        `https://rumble.com/user/${username}`
      ];

      let page = null;
      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
          });
          page = response.data;
          break; // Success, exit loop
        } catch (err) {
          // Try next URL
          continue;
        }
      }

      if (!page) return null;

      // Parse HTML to find latest video/stream
      const $ = cheerio.load(page);
      
      // Rumble's video/stream tiles are usually in div.video-item or similar
      // Look for the first video/stream item on the channel page
      const videoItem = $('[class*="video"], [class*="item"]').first();
      
      if (!videoItem.length) return null;

      // Extract video/stream details
      const title = videoItem.find('a[title]').attr('title') || 
                   videoItem.find('h3, .title').text().trim();
      const link = videoItem.find('a[href*="/v/"]').attr('href') || 
                  videoItem.find('a[href*="/embed/"]').attr('href');
      const thumbnail = videoItem.find('img').attr('src') || null;

      // Detect if it's a live stream
      const isLive = title?.toLowerCase().includes("live") || 
                    videoItem.find('[class*="live"]').length > 0;
      
      // Create unique ID from link
      const videoId = link ? link.split('/').pop()?.split('?')[0] : null;

      if (!videoId || !link) return null;

      const fullUrl = link.startsWith('http') ? link : `https://rumble.com${link}`;

      return {
        id:            videoId,
        title:         title || "New content",
        channelName:   channelConfig.displayName,
        channelHandle: channelConfig.handle,
        thumbnail:     thumbnail,
        url:           fullUrl,
        isLive:        isLive,
        isEnded:       false,
        contentType:   isLive ? "stream" : "video"
      };

    } catch (error) {
      console.error(`Error checking Rumble channel ${channelConfig.channelId}:`, error.message);
      return null;
    }
    */
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
  const enabledTypes = channelConfig.enabledTypes || platformManager.PLATFORM_CONTENT_TYPES[platform];

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

    storage.saveData(guildData);
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
    channelConfig.postTime        = Date.now(); // Track when content was first posted
    channelConfig.lastCheckTime   = Date.now(); // Track last check time
    storage.saveData(guildData);
    return;
  }

  // CASE 3: Same content - check for changes within 10 minute window
  // For non-live content stop checking after 6 checks (30 minutes)
  if (channelConfig.checksAfterPost >= 6 && !latest.isLive) { return; }

  // For live streams keep checking every interval until stream ends
  if (!latest.isLive) {
    channelConfig.checksAfterPost++;
  }

  // Check if title or thumbnail has changed
  const titleChanged     = channelConfig.lastTitle     !== latest.title;
  const thumbnailChanged = channelConfig.lastThumbnail !== latest.thumbnail;

  // Nothing changed, save updated counter and stop
  if (!titleChanged && !thumbnailChanged) {
    storage.saveData(guildData);
    return;
  }

  // Something changed! Edit the announcement
  try {
    const timestamp = utils.formatTimestamp(new Date());

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
    storage.saveData(guildData);

  } catch (error) {
    console.error("Error editing announcement:", error.message);
  }
}

// Starts the monitor for all platforms - runs forever on a 5 minute timer
// client = Discord bot client, passed in from bot.js
export async function startMonitor(client) {
  console.log("Announcement monitor started for YouTube, Twitch and Rumble");

  setInterval(async () => {
    const data = storage.loadData(); // load all server configs from data.json

    for (const guildId in data) {
      const guild = data[guildId];

      // Skip if this server has no announcements set up
      if (!guild.announcements) continue;

      // Loop through each platform
      for (const platform of ["youtube", "twitch", "rumble"]) {
        if (!guild.announcements[platform]) continue;

        for (const channelConfig of guild.announcements[platform]) {
          await processAnnouncement(client, platform, channelConfig, data);
          await utils.sleep(1000 + Math.random() * 2000);
        }
      }
    }
  }, platformManager.CHECK_INTERVAL);
}

// Handles the /refresh command for a specific creator by nickname
// client = Discord bot client
// guildId = Discord server ID
// nickname = the nickname set when the channel was added
// platform = the platform the channel is on
// interaction = the Discord slash command interaction object
// REPLACE the entire refreshChannel function (lines 845-951) in announcements.js with:
export async function refreshChannel(client, guildId, nickname, platform, requestedContentType, interaction) {
  const data  = storage.loadData();
  const guild = data[guildId];

  // Make sure this server has announcements set up
  if (!guild || !guild.announcements) {
    await interaction.reply({
      content:   "❌ No channels are being monitored in this server at this time.",
      ephemeral: true
    });
    return;
  }

  // Find the channel on the specified platform
  let foundConfig = null;

  if (platform === "all") {
    // Search all platforms if no specific platform given
    for (const p of ["youtube", "twitch", "rumble"]) {
      if (!guild.announcements[p]) continue;
      const match = guild.announcements[p].find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );
      if (match) {
        foundConfig = match;
        platform    = p;
        break;
      }
    }
  } else {
    // Search only the specified platform
    if (guild.announcements[platform]) {
      foundConfig = guild.announcements[platform].find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );
    }
  }

  // No channel found with that nickname on that platform
  if (!foundConfig) {
    await interaction.reply({
      content:   `❌ No channel found with the nickname **${nickname}** on ${platform}. Use /list to see all monitored channels.`,
      ephemeral: true
    });
    return;
  }

  // VALIDATE CONTENT TYPE if provided
  if (requestedContentType) {
    const validTypes = platformManager.PLATFORM_CONTENT_TYPES[platform];
    
    if (!validTypes.includes(requestedContentType)) {
      await interaction.reply({
        content:   `❌ Content type **${requestedContentType}** is not available for ${platform}. Available types: ${validTypes.join(", ")}`,
        ephemeral: true
      });
      return;
    }

    // Check if this content type is enabled for this channel
    const enabledTypes = foundConfig.enabledTypes || platformManager.PLATFORM_CONTENT_TYPES[platform];
    if (!enabledTypes.includes(requestedContentType)) {
      await interaction.reply({
        content:   `❌ Content type **${requestedContentType}** is not enabled for **${foundConfig.displayName}}**. Enabled types: ${enabledTypes.join(", ")}`,
        ephemeral: true
      });
      return;
    }
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
  storage.saveData(data);

  let contentTypeText = requestedContentType ? ` for **${requestedContentType}**` : "";
  await interaction.reply({
    content:   `🔄 Checking **${foundConfig.displayName}** on ${platform}${contentTypeText} for updates...`,
    ephemeral: true
  });

  // Get Discord channel to post in
  const discordChannel = client.channels.cache.get(foundConfig.discordChannelId);
  if (!discordChannel) {
    await interaction.editReply({
      content: `❌ Could not find the Discord channel to post announcements in. Channel may have been deleted.`
    });
    return;
  }

  try {
    // FORCE CHECK with optional content type filter
    const enabledTypes = requestedContentType 
      ? [requestedContentType]
      : (foundConfig.enabledTypes || platformManager.PLATFORM_CONTENT_TYPES[platform]);

    const latest = await checkChannel(platform, foundConfig, enabledTypes);

    // Nothing new found
    if (!latest) {
      await interaction.editReply({
        content: `✅ Refresh complete! No new or updated content found for **${foundConfig.displayName}}**.`
      });
      return;
    }

    // STREAM ENDED - Update previous announcement with strikethrough
    if (latest.isEnded && foundConfig.isCurrentlyLive) {
      foundConfig.isCurrentlyLive = false;

      if (foundConfig.lastMessageId) {
        try {
          const originalMessage = await discordChannel.messages.fetch(foundConfig.lastMessageId);
          const mentions = foundConfig.mentions
            ? foundConfig.mentions.map(id => `<@&${id}>`).join(" ")
            : "";
          const customMessage = foundConfig.customMessage
            ? `${mentions} ${foundConfig.customMessage}`.trim()
            : `${mentions} New content from ${foundConfig.displayName}!`.trim();

          const embed = buildEmbed(
            platform,
            latest,
            customMessage,
            foundConfig.editHistory || [],
            true // isEnded = true triggers strikethrough
          );
          await originalMessage.edit({ content: customMessage, embeds: [embed] });
          
          storage.saveData(data);
          await interaction.editReply({
            content: `✅ Refresh complete! **${foundConfig.displayName}** stream has ended - announcement updated with strikethrough.`
          });
          return;
        } catch (error) {
          console.error("Error updating stream ended message:", error.message);
        }
      }
    }

    // NEW CONTENT - different from what's tracked
    if (foundConfig.lastContentId !== latest.id) {
      const mentions = foundConfig.mentions
        ? foundConfig.mentions.map(id => `<@&${id}>`).join(" ")
        : "";
      const customMessage = foundConfig.customMessage
        ? `${mentions} ${foundConfig.customMessage}`.trim()
        : `${mentions} New content from ${foundConfig.displayName}!`.trim();

      const embed = buildEmbed(platform, latest, customMessage);
      const sent = await discordChannel.send({
        content: customMessage,
        embeds:  [embed]
      });

      // Save as if it was just found by the monitor
      foundConfig.lastContentId   = latest.id;
      foundConfig.lastTitle       = latest.title;
      foundConfig.lastThumbnail   = latest.thumbnail;
      foundConfig.lastMessageId   = sent.id;
      foundConfig.editHistory     = [];
      foundConfig.checksAfterPost = 0;
      foundConfig.isCurrentlyLive = latest.isLive;
      foundConfig.lastCheckTime   = now; // Track when we last checked
      
      storage.saveData(data);
      await interaction.editReply({
        content: `✅ Refresh complete! Posted new announcement for **${foundConfig.displayName}}**.`
      });
      return;
    }

    // SAME CONTENT - Check for title/thumbnail changes within 30 minute window
    
    // Check if we're still within the 30 minute edit window
    const lastCheckTime = foundConfig.lastCheckTime || now;
    const timeSincePost = now - (foundConfig.postTime || lastCheckTime);
    
    if (timeSincePost > 1800000) { // 30 minutes in milliseconds
      await interaction.editReply({
        content: `✅ Refresh complete! **${foundConfig.displayName}}** content is unchanged and outside the 30-minute edit window.`
      });
      return;
    }

    // Check if title or thumbnail has changed
    const titleChanged     = foundConfig.lastTitle     !== latest.title;
    const thumbnailChanged = foundConfig.lastThumbnail !== latest.thumbnail;

    if (!titleChanged && !thumbnailChanged) {
      await interaction.editReply({
        content: `✅ Refresh complete! **${foundConfig.displayName}}** content is unchanged.`
      });
      return;
    }

    // CHANGES DETECTED - Update the announcement
    const timestamp = utils.formatTimestamp(new Date());

    if (!foundConfig.editHistory) foundConfig.editHistory = [];
    foundConfig.editHistory.push({ timestamp });

    const mentions = foundConfig.mentions
      ? foundConfig.mentions.map(id => `<@&${id}>`).join(" ")
      : "";
    const customMessage = foundConfig.customMessage
      ? `${mentions} ${foundConfig.customMessage}`.trim()
      : `${mentions} New content from ${foundConfig.displayName}!`.trim();

    const embed = buildEmbed(
      platform,
      latest,
      customMessage,
      foundConfig.editHistory,
      false // not ended
    );

    if (foundConfig.lastMessageId) {
      try {
        const originalMessage = await discordChannel.messages.fetch(foundConfig.lastMessageId);
        await originalMessage.edit({ content: customMessage, embeds: [embed] });
      } catch {
        // Message not found, send a new one
        const sent = await discordChannel.send({
          content: customMessage,
          embeds:  [embed]
        });
        foundConfig.lastMessageId = sent.id;
      }
    } else {
      const sent = await discordChannel.send({
        content: customMessage,
        embeds:  [embed]
      });
      foundConfig.lastMessageId = sent.id;
    }

    foundConfig.lastTitle       = latest.title;
    foundConfig.lastThumbnail   = latest.thumbnail;
    foundConfig.lastCheckTime   = now;
    foundConfig.postTime        = foundConfig.postTime || now; // Track original post time
    foundConfig.checksAfterPost = 0; // Reset check counter
    
    storage.saveData(data);

    await interaction.editReply({
      content: `✅ Refresh complete! **${foundConfig.displayName}}** announcement updated with new title/thumbnail at ${timestamp}.`
    });

  } catch (error) {
    console.error("Error during refresh:", error.message);
    await interaction.editReply({
      content: `❌ An error occurred during refresh: ${error.message}`
    });
  }
}

// Stores pending channel additions temporarily while waiting for confirmation
// This avoids hitting Discord's 100 character select menu value limit
export const pendingAdds = new Map();