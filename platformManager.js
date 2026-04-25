import axios from "axios";
import * as cheerio from "cheerio";

export const CHECK_INTERVAL = 300000; // time in milliseconds (300000 = 5min), how often to check for new post

// Platform specific colors
export const PLATFORM_COLORS = {
  youtube: "#FF0000", // YouTube red
  twitch:  "#9146FF", // Twitch purple
  rumble:  "#85C742"  // Rumble green
};

// Platform specific emojis
export const PLATFORM_EMOJI = {
  youtube: "🔴",
  twitch:  "🟣",
  rumble:  "🟢"
};

// Content types per platform
// NOTE: Rumble doesn't have a public API yet so this uses RSS as a substitute
// TODO: Update when Rumble releases an official public API
// Devon has reached out to Rumble requesting API access
export const PLATFORM_CONTENT_TYPES = {
  youtube: ["videos", "shorts", "streams", "premieres", "posts"],
  twitch:  ["streams"],
  rumble:  ["videos", "streams"] // limited by RSS feed ability
};

// Store Twitch access token so we don't keep requesting a new one every check
export let twitchToken     = null;
let twitchTokenTime = null;
const TWITCH_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

// Gets a valid Twitch API access token
// Reuses the saved token if it hasn't expired yet, otherwise requests a new one
export async function getTwitchToken() {
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
export function parseChannelInput(platform, input) {
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
export async function verifyChannel(platform, channelInput) {

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

