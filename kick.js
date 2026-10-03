import axios from "axios";
import { getDB } from "./storage.js";

const KICK_API_BASE = "https://api.kick.com/public/v1";
const KICK_AUTH_URL = "https://id.kick.com/oauth/token";

const CHECK_INTERVAL = 300000;
const METADATA_REFRESH_INTERVAL = 60000;
const ENDED_CONTENT_RETENTION = 1800000;

let accessToken = null;
let accessTokenExpiresAt = 0;


/*
=====================================================
Kick Authentication
=====================================================
*/

async function requestAccessToken() {
  if (
    !process.env.KICK_CLIENT_ID ||
    !process.env.KICK_CLIENT_SECRET
  ) {
    throw new Error(
      "KICK_CLIENT_ID or KICK_CLIENT_SECRET is not configured."
    );
  }

  try {
    const response = await axios.post(
      KICK_AUTH_URL,
      new URLSearchParams({
        client_id:
          process.env.KICK_CLIENT_ID,

        client_secret:
          process.env.KICK_CLIENT_SECRET,

        grant_type:
          "client_credentials"
      }),
      {
        timeout: 15000,

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        }
      }
    );

    accessToken =
      response.data.access_token;

    const expiresIn =
      Number(
        response.data.expires_in ??
        0
      );

    accessTokenExpiresAt =
      Date.now() +
      expiresIn * 1000 -
      60000;

    return accessToken;

  } catch (error) {
    const message =
      error.response?.data?.message ??
      error.response?.data?.error_description ??
      error.message;

    console.error(
      "Failed to get Kick access token:",
      message
    );

    throw error;
  }
}


export async function getAccessToken() {
  if (
    accessToken &&
    Date.now() <
      accessTokenExpiresAt
  ) {
    return accessToken;
  }

  return requestAccessToken();
}


/*
=====================================================
Kick API
=====================================================
*/

async function kickRequest(
  endpoint,
  params = {}
) {
  const token =
    await getAccessToken();

  try {
    const response =
      await axios.get(
        `${KICK_API_BASE}/${endpoint}`,
        {
          timeout: 15000,

          params,

          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          }
        }
      );

    return response.data;

  } catch (error) {
    if (
      error.response?.status === 401
    ) {
      accessToken = null;
      accessTokenExpiresAt = 0;

      const newToken =
        await getAccessToken();

      const response =
        await axios.get(
          `${KICK_API_BASE}/${endpoint}`,
          {
            timeout: 15000,

            params,

            headers: {
              Authorization:
                `Bearer ${newToken}`,

              Accept:
                "application/json"
            }
          }
        );

      return response.data;
    }

    const message =
      error.response?.data?.message ??
      error.response?.data?.error ??
      error.message;

    console.error(
      `Kick API request failed (${endpoint}):`,
      message
    );

    throw error;
  }
}


/*
=====================================================
Channel Parsing
=====================================================
*/

export function parseChannelInput(input) {
  const value =
    input.trim();

  if (!value) {
    return null;
  }

  if (
    value.includes("kick.com")
  ) {
    const match =
      value.match(
        /kick\.com\/([^/?#]+)/
      );

    if (match) {
      return match[1]
        .replace("@", "")
        .toLowerCase();
    }
  }

  return value
    .replace("@", "")
    .toLowerCase();
}


/*
=====================================================
API Response Helpers
=====================================================
*/

function getResponseItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}


function getFirstResponseItem(data) {
  return (
    getResponseItems(data)[0] ??
    null
  );
}


/*
=====================================================
Channel Lookup
=====================================================
*/

async function getChannelBySlug(slug) {
  const data =
    await kickRequest(
      "channels",
      {
        slug
      }
    );

  return getFirstResponseItem(data);
}


async function getChannelById(channelId) {
  const data =
    await kickRequest(
      "channels",
      {
        broadcaster_user_id:
          channelId
      }
    );

  return getFirstResponseItem(data);
}


function getChannelId(channel) {
  return String(
    channel.broadcaster_user_id ??
    channel.user_id ??
    channel.id ??
    ""
  );
}


function getChannelSlug(channel) {
  return (
    channel.slug ??
    channel.channel_slug ??
    channel.username ??
    null
  );
}


function getChannelName(channel) {
  return (
    channel.broadcaster_user_name ??
    channel.display_name ??
    channel.name ??
    channel.username ??
    getChannelSlug(channel) ??
    getChannelId(channel)
  );
}


function getChannelThumbnail(channel) {
  return (
    channel.profile_picture ??
    channel.profile_picture_url ??
    channel.avatar ??
    channel.avatar_url ??
    null
  );
}


function normalizeChannel(channel) {
  if (!channel) {
    return null;
  }

  const channelId =
    getChannelId(channel);

  const slug =
    getChannelSlug(channel);

  if (
    !channelId ||
    !slug
  ) {
    return null;
  }

  return {
    channelId,

    channelName:
      getChannelName(channel),

    channelUrl:
      `https://kick.com/${slug}`,

    channelHandle:
      `@${slug}`,

    thumbnail:
      getChannelThumbnail(channel)
  };
}


export async function resolveChannel(input) {
  const slug =
    parseChannelInput(input);

  if (!slug) {
    return null;
  }

  const channel =
    await getChannelBySlug(slug);

  return normalizeChannel(channel);
}


/*
=====================================================
Channel Storage
=====================================================
*/

export function getStoredChannel(channelId) {
  const db = getDB();

  return db.prepare(`
    SELECT
      channel_id,
      channel_name,
      channel_url,
      channel_handle,
      created_at,
      updated_at
    FROM kick_channels
    WHERE channel_id = ?
  `).get(channelId) ?? null;
}


export function saveChannel(channel) {
  const db = getDB();

  db.prepare(`
    INSERT INTO kick_channels (
      channel_id,
      channel_name,
      channel_url,
      channel_handle,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(channel_id) DO UPDATE SET
      channel_name =
        excluded.channel_name,
      channel_url =
        excluded.channel_url,
      channel_handle =
        excluded.channel_handle,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    channel.channelId,
    channel.channelName,
    channel.channelUrl,
    channel.channelHandle
  );

  return getStoredChannel(
    channel.channelId
  );
}


export async function resolveAndSaveChannel(input) {
  const channel =
    await resolveChannel(input);

  if (!channel) {
    return null;
  }

  return saveChannel(channel);
}


/*
=====================================================
Subscriptions
=====================================================
*/

export function getSubscribedChannels() {
  const db = getDB();

  return db.prepare(`
    SELECT DISTINCT
      kick_channels.channel_id,
      kick_channels.channel_name,
      kick_channels.channel_url,
      kick_channels.channel_handle
    FROM kick_channels

    INNER JOIN guild_kick_subs
      ON guild_kick_subs.channel_id =
         kick_channels.channel_id

    ORDER BY
      kick_channels.channel_name ASC
  `).all();
}

export function getSubscribedGuilds(channelId) {
  const db = getDB();

  return db.prepare(`
    SELECT
      guild_id,
      channel_id,
      nickname,
      discord_channel_id,
      custom_message
    FROM guild_kick_subs
    WHERE channel_id = ?
    ORDER BY created_at ASC
  `).all(channelId);
}

/*
=====================================================
Livestream Information
=====================================================
*/

function getLivestreamObject(channel) {
  return (
    channel.livestream ??
    channel.live_stream ??
    channel.stream ??
    null
  );
}


function getStreamId(
  channel,
  livestream
) {
  return String(
    livestream?.id ??
    livestream?.stream_id ??
    channel?.livestream_id ??
    channel?.stream_id ??
    channel?.broadcaster_user_id ??
    channel?.id ??
    ""
  );
}


function getStreamTitle(
  channel,
  livestream
) {
  return (
    livestream?.session_title ??
    livestream?.title ??
    channel?.stream_title ??
    channel?.title ??
    `${getChannelName(channel)} is live`
  );
}


function getStreamThumbnail(
  channel,
  livestream
) {
  return (
    livestream?.thumbnail?.url ??
    livestream?.thumbnail_url ??
    channel?.stream?.thumbnail_url ??
    channel?.livestream?.thumbnail?.url ??
    channel?.thumbnail_url ??
    null
  );
}


function getStartedAt(
  channel,
  livestream
) {
  return (
    livestream?.created_at ??
    livestream?.started_at ??
    channel?.started_at ??
    null
  );
}


function isChannelLive(channel) {
  if (
    typeof channel.is_live ===
    "boolean"
  ) {
    return channel.is_live;
  }

  if (
    typeof channel.is_live ===
    "number"
  ) {
    return channel.is_live === 1;
  }

  if (
    typeof channel.livestream?.is_live ===
    "boolean"
  ) {
    return channel.livestream.is_live;
  }

  if (
    channel.livestream ||
    channel.live_stream
  ) {
    return true;
  }

  return false;
}


function normalizeStream(
  channel,
  storedChannel
) {
  if (
    !channel ||
    !isChannelLive(channel)
  ) {
    return null;
  }

  const livestream =
    getLivestreamObject(channel);

  const streamId =
    getStreamId(
      channel,
      livestream
    );

  if (!streamId) {
    return null;
  }

  const slug =
    getChannelSlug(channel) ??
    storedChannel.channel_handle
      ?.replace("@", "");

  return {
    id:
      streamId,

    platform:
      "kick",

    channelId:
      getChannelId(channel) ||
      storedChannel.channel_id,

    channelName:
      getChannelName(channel) ||
      storedChannel.channel_name,

    channelHandle:
      slug
        ? `@${slug}`
        : storedChannel.channel_handle,

    title:
      getStreamTitle(
        channel,
        livestream
      ),

    thumbnail:
      getStreamThumbnail(
        channel,
        livestream
      ),

    url:
      slug
        ? `https://kick.com/${slug}`
        : storedChannel.channel_url,

    contentType:
      "stream",

    liveState:
      "live",

    isLive:
      true,

    isEnded:
      false,

    startedAt:
      getStartedAt(
        channel,
        livestream
      )
  };
}


/*
=====================================================
Content Storage
=====================================================
*/

function getStoredContent(channelId) {
  const db = getDB();

  return db.prepare(`
    SELECT
      channel_id,
      title,
      thumbnail_url,
      started_at,
      discovered_at,
      ended_at,
      updated_at
    FROM kick_content
    WHERE channel_id = ?
  `).get(channelId) ?? null;
}


function saveStream(content) {
  const db = getDB();

  const existing =
    getStoredContent(
      content.channelId
    );

  db.prepare(`
    INSERT INTO kick_content (
      channel_id,
      title,
      thumbnail_url,
      started_at,
      discovered_at,
      ended_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      NULL,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(channel_id) DO UPDATE SET
      title =
        excluded.title,
      thumbnail_url =
        excluded.thumbnail_url,
      started_at =
        excluded.started_at,
      ended_at =
        NULL,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    content.channelId,
    content.title,
    content.thumbnail,
    content.startedAt
  );

  return {
    existing,

    current:
      getStoredContent(
        content.channelId
      )
  };
}


function markStreamEnded(channelId) {
  const db = getDB();

  db.prepare(`
    UPDATE kick_content
    SET
      ended_at =
        COALESCE(
          ended_at,
          CURRENT_TIMESTAMP
        ),
      updated_at =
        CURRENT_TIMESTAMP
    WHERE channel_id = ?
  `).run(channelId);

  return getStoredContent(
    channelId
  );
}


/*
=====================================================
Change Detection
=====================================================
*/

function compareStream(
  previous,
  content
) {
  if (!previous) {
    return {
      isNew: true,
      titleChanged: false,
      thumbnailChanged: false,
      wentLive: true,
      ended: false,
      reconnected: false
    };
  }

  const previousStart =
    previous.started_at
      ? new Date(
          previous.started_at
        ).getTime()
      : null;

  const currentStart =
    content.startedAt
      ? new Date(
          content.startedAt
        ).getTime()
      : null;

  const sameSession =
    previousStart &&
    currentStart
      ? previousStart ===
        currentStart
      : true;

  return {
    isNew:
      !sameSession,

    titleChanged:
      previous.title !==
      content.title,

    thumbnailChanged:
      previous.thumbnail_url !==
      content.thumbnail,

    wentLive:
      !sameSession,

    ended:
      false,

    reconnected:
      sameSession &&
      Boolean(
        previous.ended_at
      )
  };
}


/*
=====================================================
Channel Polling
=====================================================
*/

export async function checkChannel(channel) {
  const slug =
    channel.channel_handle
      ?.replace("@", "");

  if (!slug) {
    return null;
  }

  const apiChannel =
    await getChannelBySlug(slug);

  if (!apiChannel) {
    return null;
  }

  const previous =
    getStoredContent(
      channel.channel_id
    );

  const content =
    normalizeStream(
      apiChannel,
      channel
    );

  if (!content) {
    if (
      previous &&
      !previous.ended_at
    ) {
      const ended =
        markStreamEnded(
          channel.channel_id
        );

      return {
        content: {
          id:
            channel.channel_id,

          platform:
            "kick",

          channelId:
            channel.channel_id,

          channelName:
            channel.channel_name,

          channelHandle:
            channel.channel_handle,

          title:
            previous.title,

          thumbnail:
            previous.thumbnail_url,

          url:
            channel.channel_url,

          contentType:
            "stream",

          liveState:
            "ended",

          isLive:
            false,

          isEnded:
            true,

          startedAt:
            previous.started_at
        },

        changes: {
          isNew: false,
          titleChanged: false,
          thumbnailChanged: false,
          wentLive: false,
          ended: true,
          reconnected: false
        },

        stored:
          ended
      };
    }

    return null;
  }

  const changes =
    compareStream(
      previous,
      content
    );

  saveStream(content);

  return {
    content,
    changes
  };
}


/*
=====================================================
Bulk Polling
=====================================================
*/

export async function checkSubscribedChannels() {
  const channels =
    getSubscribedChannels();

  if (channels.length === 0) {
    return [];
  }

  const results = [];

  for (const channel of channels) {
    try {
      const result =
        await checkChannel(channel);

      if (!result) {
        continue;
      }

      if (
        result.changes.isNew ||
        result.changes.titleChanged ||
        result.changes.thumbnailChanged ||
        result.changes.wentLive ||
        result.changes.ended ||
        result.changes.reconnected
      ) {
        results.push(result);
      }

    } catch (error) {
      console.error(
        `Failed to check Kick channel ${channel.channel_id}:`,
        error.message
      );
    }
  }

  return results;
}


/*
=====================================================
Channel Refresh
=====================================================
*/

export async function refreshChannel(
  channelId
) {
  let channel =
    getStoredChannel(
      channelId
    );

  if (!channel) {
    return null;
  }

  const slug =
    channel.channel_handle
      ?.replace("@", "");

  if (!slug) {
    return null;
  }

  try {
    const apiChannel =
      await getChannelBySlug(
        slug
      );

    const normalized =
      normalizeChannel(
        apiChannel
      );

    if (normalized) {
      saveChannel(normalized);

      channel =
        getStoredChannel(
          normalized.channelId
        );
    }

  } catch (error) {
    console.error(
      `Failed to refresh Kick channel ${channelId}:`,
      error.message
    );
  }

  return checkChannel(channel);
}


/*
=====================================================
Ended Content Cleanup
=====================================================
*/

export function cleanupEndedContent() {
  const db = getDB();

  const cutoff =
    new Date(
      Date.now() -
      ENDED_CONTENT_RETENTION
    ).toISOString();

  const result =
    db.prepare(`
      DELETE FROM kick_content
      WHERE ended_at IS NOT NULL
        AND ended_at <= ?
    `).run(cutoff);

  return result.changes;
}


/*
=====================================================
Monitor Configuration
=====================================================
*/

export const MONITOR_CONFIG = {
  checkInterval:
    CHECK_INTERVAL,

  metadataRefreshInterval:
    METADATA_REFRESH_INTERVAL,

  endedContentRetention:
    ENDED_CONTENT_RETENTION
};
