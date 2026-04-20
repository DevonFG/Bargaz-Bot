const axios  = require("axios");      // HTTP requests to APIs
const Parser = require("rss-parser"); // Parses Rumble's RSS feed
const { loadData, saveData } = require("./storage");   // Read/write storage functions
const { EmbedBuilder }       = require("discord.js");  // EmbedBuilder lets us create nicely formatted DC messages
const cheerio = require("cheerio") // HTML Parsing for Rumble
const quotaTracker = require("./youtube-quota");

// Create RSS parser with headers
const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
});

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
      timeout: 10000,
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

// Parses any input format into a clean channel identifier
// Handles @handles, usernames, channel IDs, and full URLs for all platforms
function parseChannelInput(platform, input) {
  const trimmed = input.trim();

  if (platform === "youtube") {
    // Handle YouTube URLs
    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      // https://youtube.com/@handle
      const handleMatch = trimmed.match(/@([^/?&]+)/);
      if (handleMatch) return { type: "handle", value: handleMatch[1] };

      // https://youtube.com/channel/UCxxxxxxx
      const channelMatch = trimmed.match(/\/channel\/([^/?&]+)/);
      if (channelMatch) return { type: "id", value: channelMatch[1] };

      // https://youtube.com/c/username or https://youtube.com/user/username
      const userMatch = trimmed.match(/\/(?:c|user)\/([^/?&]+)/);
      if (userMatch) return { type: "handle", value: userMatch[1] };
    }

    // @handle without URL
    if (trimmed.startsWith("@")) return { type: "handle", value: trimmed.slice(1) };

    // YouTube channel IDs start with UC and are 24 characters long
    if (trimmed.startsWith("UC") && trimmed.length === 24) {
      return { type: "id", value: trimmed };
    }

    // Assume anything else is a handle
    return { type: "handle", value: trimmed };
  }

  if (platform === "twitch") {
    // Handle Twitch URLs
    if (trimmed.includes("twitch.tv")) {
      // https://twitch.tv/username
      const match = trimmed.match(/twitch\.tv\/([^/?&]+)/);
      if (match) return { type: "username", value: match[1] };
    }

    // Plain username (with or without @, we strip it)
    return { type: "username", value: trimmed.replace("@", "") };
  }

  if (platform === "rumble") {
    
    console.error("Rumble called in parseChannelInput");
    return null;
    /*
    // Handle Rumble URLs
    if (trimmed.includes("rumble.com")) {
      // https://rumble.com/c/username or https://rumble.com/user/username
      const match = trimmed.match(/rumble\.com\/(?:c|user)\/([^/?&]+)/);
      if (match) return { type: "username", value: match[1] };
    }

    // @handle or plain username
    return { type: "username", value: trimmed.replace("@", "") };\
    */

  }

  return { type: "username", value: trimmed.replace("@", "") };
}

// Verifies a channel exists on the given platform and returns its details
// platform = "youtube"/"twitch"/"rumble"
// channelInput = @handle, username, channel ID, or full URL
async function verifyChannel(platform, channelInput) {

  // Parse the input into a clean identifier first
  const parsed = parseChannelInput(platform, channelInput);

  if (platform === "youtube") {
    try {
      let channelId = null;
      let response = null;

      // If it's already a channel ID (starts with UC and is 24 chars), use it directly
      if (parsed.type === "id") {
        channelId = parsed.value;
      } else {
        // For handles/usernames, we need to search for the channel
        try {
          const searchResponse = await axios.get("https://www.googleapis.com/youtube/v3/search", {
            timeout: 10000,
            params: {
              key:        process.env.YOUTUBE_API_KEY,
              q:          parsed.value,  // search for the username/handle as-is
              part:       "snippet",
              type:       "channel",
              maxResults: 1
            }
          });

          if (searchResponse.data.items && searchResponse.data.items.length > 0) {
            channelId = searchResponse.data.items[0].id.channelId;
          } else {
            return null; // No results found
          }
        } catch (searchError) {
          console.error("YouTube search error:", searchError.message);
          return null;
        }
      }

      // Now fetch the full channel details using the channel ID
      if (channelId) {
        response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
          timeout: 10000,
          params: {
            key:  process.env.YOUTUBE_API_KEY,
            id:   channelId,
            part: "snippet"
          }
        });
      }

      if (!response || !response.data.items || response.data.items.length === 0) return null;

      const channel = response.data.items[0];

      return {
        id:          channel.id,
        displayName: channel.snippet.title,
        handle:      `@${channel.snippet.customUrl || parsed.value}`,
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

      const response = await axios.get("https://api.twitch.tv/helix/users", {
        timeout: 10000,
        params: { login: parsed.value }, // always a username for Twitch
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

    console.error(" Rumble called in verifyChannel");
    return null;
    /* try {
      const username = parsed.value;
      
      // Try both URL formats
      const urls = [
        `https://rumble.com/c/${username}`,
        `https://rumble.com/user/${username}`
      ];

      let page = null;
      let workingUrl = null;

      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
          });
          page = response.data;
          workingUrl = url;
          break;
        } catch (err) {
          continue;
        }
      }

      if (!page) return null;

      // Parse HTML to extract channel info
      const $ = cheerio.load(page);
      
      // Channel name is usually in h1 or meta tags
      const channelName = $('h1').first().text().trim() || 
                         $('meta[property="og:title"]').attr('content') || 
                         username;
      
      // Channel thumbnail/avatar
      const thumbnail = $('img[alt="avatar"], img[class*="avatar"]').first().attr('src') || 
                       $('meta[property="og:image"]').attr('content') || 
                       null;

      return {
        id:          username,
        displayName: channelName,
        handle:      `@${username}`,
        thumbnail:   thumbnail,
        platform:    "rumble"
      };
    } catch (error) {
      console.error("Error verifying Rumble channel:", error.message);
      return null; 
    } */
  }

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
      // CHECK IF WE'RE IN RSS-ONLY MODE
      if (quotaTracker.isYoutubeRssOnly()) {
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
      const token = await getTwitchToken();
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
    channelConfig.postTime        = Date.now(); // Track when content was first posted
    channelConfig.lastCheckTime   = Date.now(); // Track last check time
    saveData(guildData);
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

// Sleep function for adding delays when needed
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
          await sleep(1000 + Math.random() * 2000);
        }
      }
    }
  }, CHECK_INTERVAL);
}

// Handles the /refresh command for a specific creator by nickname
// client = Discord bot client
// guildId = Discord server ID
// nickname = the nickname set when the channel was added
// platform = the platform the channel is on
// interaction = the Discord slash command interaction object
// REPLACE the entire refreshChannel function (lines 845-951) in announcements.js with:
async function refreshChannel(client, guildId, nickname, platform, requestedContentType, interaction) {
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
    const validTypes = PLATFORM_CONTENT_TYPES[platform];
    
    if (!validTypes.includes(requestedContentType)) {
      await interaction.reply({
        content:   `❌ Content type **${requestedContentType}** is not available for ${platform}. Available types: ${validTypes.join(", ")}`,
        ephemeral: true
      });
      return;
    }

    // Check if this content type is enabled for this channel
    const enabledTypes = foundConfig.enabledTypes || PLATFORM_CONTENT_TYPES[platform];
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
  saveData(data);

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
      : (foundConfig.enabledTypes || PLATFORM_CONTENT_TYPES[platform]);

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
          
          saveData(data);
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
      
      saveData(data);
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
    const timestamp = formatTimestamp(new Date());

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
    
    saveData(data);

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
const pendingAdds = new Map();

// Export functions needed by bot.js
module.exports = { startMonitor, refreshChannel, verifyChannel, parseChannelInput, PLATFORM_CONTENT_TYPES, pendingAdds };