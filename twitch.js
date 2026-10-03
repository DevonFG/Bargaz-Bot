import axios from "axios";
import { getDB } from "./storage.js";

const TWITCH_API_BASE = "https://api.twitch.tv/helix";
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/token";

const CHECK_INTERVAL = 300000;
const METADATA_REFRESH_INTERVAL = 60000;
const ENDED_CONTENT_RETENTION = 1800000;

let accessToken = null;
let accessTokenExpiresAt = 0;


/*
=====================================================
Twitch Authentication
=====================================================
*/

async function requestAccessToken() {
  if (
    !process.env.TWITCH_CLIENT_ID ||
    !process.env.TWITCH_CLIENT_SECRET
  ) {
    throw new Error(
      "TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET is not configured."
    );
  }

  try {
    const response = await axios.post(
      TWITCH_AUTH_URL,
      null,
      {
        timeout: 15000,

        params: {
          client_id:
            process.env.TWITCH_CLIENT_ID,

          client_secret:
            process.env.TWITCH_CLIENT_SECRET,

          grant_type:
            "client_credentials"
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
      error.message;

    console.error(
      "Failed to get Twitch access token:",
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
Twitch API
=====================================================
*/

async function twitchRequest(
  endpoint,
  params = {}
) {
  const token =
    await getAccessToken();

  try {
    const response =
      await axios.get(
        `${TWITCH_API_BASE}/${endpoint}`,
        {
          timeout: 15000,

          params,

          headers: {
            "Client-ID":
              process.env.TWITCH_CLIENT_ID,

            Authorization:
              `Bearer ${token}`
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
          `${TWITCH_API_BASE}/${endpoint}`,
          {
            timeout: 15000,

            params,

            headers: {
              "Client-ID":
                process.env.TWITCH_CLIENT_ID,

              Authorization:
                `Bearer ${newToken}`
            }
          }
        );

      return response.data;
    }

    const message =
      error.response?.data?.message ??
      error.message;

    console.error(
      `Twitch API request failed (${endpoint}):`,
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
    value.includes("twitch.tv")
  ) {
    const match =
      value.match(
        /twitch\.tv\/([^/?#]+)/
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
Channel Lookup
=====================================================
*/

async function getUserByLogin(login) {
  const data =
    await twitchRequest(
      "users",
      {
        login
      }
    );

  return data.data?.[0] ?? null;
}


async function getUserById(userId) {
  const data =
    await twitchRequest(
      "users",
      {
        id: userId
      }
    );

  return data.data?.[0] ?? null;
}


function normalizeChannel(user) {
  if (!user) {
    return null;
  }

  return {
    channelId:
      user.id,

    channelName:
      user.display_name,

    channelUrl:
      `https://www.twitch.tv/${user.login}`,

    channelHandle:
      `@${user.login}`,

    thumbnail:
      user.profile_image_url ??
      null
  };
}


export async function resolveChannel(input) {
  const login =
    parseChannelInput(input);

  if (!login) {
    return null;
  }

  const user =
    await getUserByLogin(login);

  return normalizeChannel(user);
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
    FROM twitch_channels
    WHERE channel_id = ?
  `).get(channelId) ?? null;
}


export function saveChannel(channel) {
  const db = getDB();

  db.prepare(`
    INSERT INTO twitch_channels (
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
      twitch_channels.channel_id,
      twitch_channels.channel_name,
      twitch_channels.channel_url,
      twitch_channels.channel_handle
    FROM twitch_channels

    INNER JOIN guild_twitch_subs
      ON guild_twitch_subs.channel_id =
         twitch_channels.channel_id

    ORDER BY
      twitch_channels.channel_name ASC
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
    FROM guild_twitch_subs
    WHERE channel_id = ?
    ORDER BY created_at ASC
  `).all(channelId);
}

/*
=====================================================
Stream Lookup
=====================================================
*/

async function getStreamsByUserIds(
  userIds
) {
  if (!userIds?.length) {
    return [];
  }

  const streams = [];

  for (
    let index = 0;
    index < userIds.length;
    index += 100
  ) {
    const batch =
      userIds.slice(
        index,
        index + 100
      );

    const params =
      new URLSearchParams();

    for (const userId of batch) {
      params.append(
        "user_id",
        userId
      );
    }

    const token =
      await getAccessToken();

    try {
      const response =
        await axios.get(
          `${TWITCH_API_BASE}/streams?${params.toString()}`,
          {
            timeout: 15000,

            headers: {
              "Client-ID":
                process.env.TWITCH_CLIENT_ID,

              Authorization:
                `Bearer ${token}`
            }
          }
        );

      if (response.data.data) {
        streams.push(
          ...response.data.data
        );
      }

    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message;

      console.error(
        "Failed to retrieve Twitch streams:",
        message
      );

      throw error;
    }
  }

  return streams;
}


/*
=====================================================
Stream Normalization
=====================================================
*/

function getThumbnail(stream) {
  if (!stream.thumbnail_url) {
    return null;
  }

  return stream.thumbnail_url
    .replace(
      "{width}",
      "1280"
    )
    .replace(
      "{height}",
      "720"
    );
}


function normalizeStream(
  stream,
  channel
) {
  return {
    id:
      stream.id,

    platform:
      "twitch",

    channelId:
      stream.user_id,

    channelName:
      stream.user_name ??
      channel.channel_name,

    channelHandle:
      channel.channel_handle,

    title:
      stream.title ||
      `${stream.user_name} is live`,

    gameId:
      stream.game_id ??
      null,

    gameName:
      stream.game_name ??
      null,

    viewerCount:
      stream.viewer_count ??
      null,

    language:
      stream.language ??
      null,

    thumbnail:
      getThumbnail(stream),

    url:
      channel.channel_url,

    contentType:
      "stream",

    liveState:
      "live",

    isLive:
      true,

    isEnded:
      false,

    startedAt:
      stream.started_at ??
      null
  };
}


/*
=====================================================
Content Storage
=====================================================
*/

function getStoredContent(streamId) {
  const db = getDB();

  return db.prepare(`
    SELECT
      stream_id,
      channel_id,
      title,
      thumbnail_url,
      discovered_at,
      ended_at,
      updated_at
    FROM twitch_content
    WHERE stream_id = ?
  `).get(streamId) ?? null;
}


function getActiveContentForChannel(
  channelId
) {
  const db = getDB();

  return db.prepare(`
    SELECT
      stream_id,
      channel_id,
      title,
      thumbnail_url,
      discovered_at,
      ended_at,
      updated_at
    FROM twitch_content
    WHERE channel_id = ?
    ORDER BY discovered_at DESC
    LIMIT 1
  `).get(channelId) ?? null;
}


function saveStream(content) {
  const db = getDB();

  const existing =
    getStoredContent(
      content.id
    );

  db.prepare(`
    INSERT INTO twitch_content (
      stream_id,
      channel_id,
      title,
      thumbnail_url,
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

    ON CONFLICT(stream_id) DO UPDATE SET
      channel_id =
        excluded.channel_id,
      title =
        excluded.title,
      thumbnail_url =
        excluded.thumbnail_url,
      ended_at =
        NULL,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    content.id,
    content.channelId,
    content.title,
    content.thumbnail
  );

  return {
    existing,

    current:
      getStoredContent(
        content.id
      )
  };
}


function markStreamEnded(streamId) {
  const db = getDB();

  db.prepare(`
    UPDATE twitch_content
    SET
      ended_at =
        COALESCE(
          ended_at,
          CURRENT_TIMESTAMP
        ),
      updated_at =
        CURRENT_TIMESTAMP
    WHERE stream_id = ?
  `).run(streamId);

  return getStoredContent(
    streamId
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

  return {
    isNew: false,

    titleChanged:
      previous.title !==
      content.title,

    thumbnailChanged:
      previous.thumbnail_url !==
      content.thumbnail,

    wentLive: false,

    ended: false,

    reconnected:
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
  const streams =
    await getStreamsByUserIds([
      channel.channel_id
    ]);

  const stream =
    streams[0] ?? null;

  const previous =
    getActiveContentForChannel(
      channel.channel_id
    );

  if (!stream) {
    if (
      previous &&
      !previous.ended_at
    ) {
      const ended =
        markStreamEnded(
          previous.stream_id
        );

      return {
        content: {
          id:
            previous.stream_id,

          platform:
            "twitch",

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
            true
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

  const content =
    normalizeStream(
      stream,
      channel
    );

  const stored =
    getStoredContent(
      content.id
    );

  const changes =
    compareStream(
      stored,
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

  const userIds =
    channels.map(
      channel =>
        channel.channel_id
    );

  const streams =
    await getStreamsByUserIds(
      userIds
    );

  const streamMap =
    new Map(
      streams.map(
        stream => [
          stream.user_id,
          stream
        ]
      )
    );

  const results = [];

  for (const channel of channels) {
    const stream =
      streamMap.get(
        channel.channel_id
      );

    const previous =
      getActiveContentForChannel(
        channel.channel_id
      );

    if (!stream) {
      if (
        previous &&
        !previous.ended_at
      ) {
        markStreamEnded(
          previous.stream_id
        );

        results.push({
          content: {
            id:
              previous.stream_id,

            platform:
              "twitch",

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
              true
          },

          changes: {
            isNew: false,
            titleChanged: false,
            thumbnailChanged: false,
            wentLive: false,
            ended: true,
            reconnected: false
          }
        });
      }

      continue;
    }

    const content =
      normalizeStream(
        stream,
        channel
      );

    const stored =
      getStoredContent(
        content.id
      );

    const changes =
      compareStream(
        stored,
        content
      );

    saveStream(content);

    if (
      changes.isNew ||
      changes.titleChanged ||
      changes.thumbnailChanged ||
      changes.reconnected
    ) {
      results.push({
        content,
        changes
      });
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

  try {
    const user =
      await getUserById(
        channelId
      );

    if (user) {
      saveChannel(
        normalizeChannel(user)
      );

      channel =
        getStoredChannel(
          channelId
        );
    }
  } catch (error) {
    console.error(
      `Failed to refresh Twitch channel ${channelId}:`,
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
      DELETE FROM twitch_content
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
