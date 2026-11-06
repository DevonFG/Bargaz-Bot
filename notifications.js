import * as discord        from "discord.js";
import { getDB }           from "./storage.js";
import * as channelManager from "./channelManager.js";
import * as youtube        from "./youtube.js";
import * as twitch         from "./twitch.js";
import * as kick           from "./kick.js";
import * as entitlements   from "./entitlements.js";

const PLATFORM_COLORS       =  {youtube: 0xFF0000,  twitch: 0x9146FF, kick: 0x53FC18};
const PLATFORM_NAMES        =  {youtube: "YouTube", twitch: "Twitch", kick: "Kick"};
const PLATFORM_EMOJIS       =  {youtube: "🔴",      twitch: "🟣",    kick: "🟢"};
const PLATFORM_KEYS         =  ["youtube", "twitch", "kick"];
const DEFAULT_REFRESH_LIMIT = 2;
const REFRESH_WINDOW_MS     = 6 * 60 * 60 * 1000;


function normalizePlatform(platform) {
  const value = String(platform ?? "").trim().toLowerCase();
  if (!PLATFORM_KEYS.includes(value)) { throw new Error(`Unknown notification platform: ${platform}`);}
  return value;
}

function getPlatformModule(platform) {
  switch (normalizePlatform(platform)) {
    case "youtube":return youtube;
    case "twitch": return twitch;
    case "kick":   return kick;
  }
}

function getSubscriptionTable(platform) {
  switch (normalizePlatform(platform)) {
    case "youtube":return "guild_youtube_subs";
    case "twitch": return "guild_twitch_subs";
    case "kick":   return "guild_kick_subs";
  }
}


function getChannelTable(platform) {
  switch (normalizePlatform(platform)) {
    case "youtube":
      return "youtube_channels";

    case "twitch":
      return "twitch_channels";

    case "kick":
      return "kick_channels";
  }
}


export function getPlatformName(platform) {
  return PLATFORM_NAMES[
    normalizePlatform(platform)
  ];
}


export function getPlatformInfo(platform) {
  const key =
    normalizePlatform(platform);

  return {
    key,
    name: PLATFORM_NAMES[key],
    color: PLATFORM_COLORS[key],
    emoji: PLATFORM_EMOJIS[key]
  };
}


/*
=====================================================
Content Helpers
=====================================================
*/

function getContentTypeName(content) {
  switch (content.contentType) {
    case "video":
      return "Video";

    case "short":
      return "Short";

    case "stream":
      return "Livestream";

    case "premiere":
      return "Premiere";

    case "post":
      return "Community Post";

    default:
      return "Content";
  }
}


/*
=====================================================
Notification Embed
=====================================================
*/

function buildNotificationEmbed(content) {
  const platformName =
    PLATFORM_NAMES[content.platform] ??
    content.platform;

  const platformEmoji =
    PLATFORM_EMOJIS[content.platform] ??
    "";

  const embed =
    new discord.EmbedBuilder()
      .setColor(
        PLATFORM_COLORS[
          content.platform
        ] ??
        0x5865F2
      )
      .setTitle(
        content.isEnded
          ? `~~${content.title}~~`
          : content.title
      )
      .setURL(content.url)
      .setAuthor({
        name:
          `${content.channelName} • ${platformName}`
      })
      .addFields(
        {
          name: "Channel",
          value:
            content.channelHandle
              ? `${content.channelName} (${content.channelHandle})`
              : content.channelName,
          inline: true
        },
        {
          name: "Type",
          value:
            getContentTypeName(
              content
            ),
          inline: true
        }
      );

  if (content.isLive) {
    embed.addFields({
      name: "Status",
      value: "🔴 LIVE NOW",
      inline: true
    });
  } else if (content.isScheduled) {
    embed.addFields({
      name: "Status",
      value: "Scheduled",
      inline: true
    });
  } else if (content.isEnded) {
    embed.addFields({
      name: "Status",
      value: "Stream ended",
      inline: true
    });
  }

  if (
    content.platform === "twitch" &&
    content.gameName
  ) {
    embed.addFields({
      name: "Category",
      value: content.gameName,
      inline: true
    });
  }

  if (content.scheduledStartTime) {
    const timestamp =
      Math.floor(
        new Date(
          content.scheduledStartTime
        ).getTime() /
        1000
      );

    if (
      Number.isFinite(timestamp)
    ) {
      embed.addFields({
        name: "Scheduled Start",
        value:
          `<t:${timestamp}:F>\n` +
          `<t:${timestamp}:R>`,
        inline: false
      });
    }
  }

  if (content.thumbnail) {
    embed.setImage(
      content.thumbnail
    );
  }

  embed
    .setFooter({
      text:
        `${platformEmoji} ${platformName}`
    })
    .setTimestamp();

  return embed;
}


/*
=====================================================
Default Notification Messages
=====================================================
*/

export function buildDefaultMessage(content) {
  const platformName =
    PLATFORM_NAMES[content.platform] ??
    content.platform;

  if (content.isEnded) {
    return (
      `${content.channelName}'s stream on ` +
      `${platformName} has ended.`
    );
  }

  if (content.isLive) {
    return (
      `${content.channelName} is now live on ` +
      `${platformName}!`
    );
  }

  if (content.isScheduled) {
    return (
      `${content.channelName} has scheduled new ` +
      `${getContentTypeName(content).toLowerCase()} content on ` +
      `${platformName}!`
    );
  }

  return (
    `${content.channelName} posted new ` +
    `${getContentTypeName(content).toLowerCase()} content on ` +
    `${platformName}!`
  );
}


/*
=====================================================
Notification Event Types
=====================================================
*/

function getNotificationEventType(
  content,
  changes = {}
) {
  if (changes.ended) {
    return "live";
  }

  if (
    changes.wentLive ||
    content.isLive
  ) {
    return "live";
  }

  if (content.isScheduled) {
    return "scheduled";
  }

  switch (content.contentType) {
    case "video":
      return "video";

    case "short":
      return "short";

    case "premiere":
      return "premiere";

    case "post":
      return "post";

    case "stream":
      return "live";

    default:
      return "content";
  }
}


/*
=====================================================
Notification Message Storage
=====================================================
*/


function getTrackingContentId(content) {
  return content.platform === "kick" ? String(content.channelId) : String(content.id);
}


function getStoredMessage(
  guildId,
  platform,
  contentId,
  eventType
) {
  const db = getDB();

  return db.prepare(`
    SELECT
      guild_id,
      platform,
      content_id,
      event_type,
      discord_channel_id,
      discord_message_id,
      created_at,
      updated_at
    FROM notification_messages
    WHERE guild_id = ?
      AND platform = ?
      AND content_id = ?
      AND event_type = ?
  `).get(
    guildId,
    platform,
    contentId,
    eventType
  ) ?? null;
}



function saveStoredMessage(
  guildId,
  platform,
  contentId,
  eventType,
  channelId,
  messageId,
  resetTracking = false
) {
  const db = getDB();

  db.prepare(`
    INSERT INTO notification_messages (
      guild_id,
      platform,
      content_id,
      event_type,
      discord_channel_id,
      discord_message_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      guild_id,
      platform,
      content_id,
      event_type
    ) DO UPDATE SET
      discord_channel_id =
        excluded.discord_channel_id,
      discord_message_id =
        excluded.discord_message_id,
      created_at =
        CASE WHEN ? = 1
          THEN CURRENT_TIMESTAMP
          ELSE notification_messages.created_at
        END,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    guildId,
    platform,
    contentId,
    eventType,
    channelId,
    messageId,
    resetTracking ? 1 : 0
  );
}


function deleteStoredMessage(
  guildId,
  platform,
  contentId,
  eventType
) {
  const db = getDB();

  db.prepare(`
    DELETE FROM notification_messages
    WHERE guild_id = ?
      AND platform = ?
      AND content_id = ?
      AND event_type = ?
  `).run(
    guildId,
    platform,
    contentId,
    eventType
  );
}


/*
=====================================================
Guild Subscriptions
=====================================================
*/

export function getGuildSubscriptions(
  guildId,
  platform = null
) {
  const db = getDB();

  const platforms =
    platform
      ? [
          normalizePlatform(
            platform
          )
        ]
      : PLATFORM_KEYS;

  const subscriptions = [];

  for (
    const currentPlatform
    of platforms
  ) {
    const subscriptionTable =
      getSubscriptionTable(
        currentPlatform
      );

    const channelTable =
      getChannelTable(
        currentPlatform
      );

    const rows =
      db.prepare(`
        SELECT
          subscriptions.guild_id,
          subscriptions.channel_id,
          subscriptions.nickname,
          subscriptions.discord_channel_id,
          subscriptions.custom_message,

          channels.channel_name,
          channels.channel_url,
          channels.channel_handle

        FROM ${subscriptionTable}
          AS subscriptions

        INNER JOIN ${channelTable}
          AS channels

          ON channels.channel_id =
             subscriptions.channel_id

        WHERE subscriptions.guild_id = ?

        ORDER BY
          channels.channel_name ASC
      `).all(guildId);

    for (const row of rows) {
      subscriptions.push({
        platform:
          currentPlatform,

        guildId:
          row.guild_id,

        channelId:
          row.channel_id,

        nickname:
          row.nickname,

        discordChannelId:
          row.discord_channel_id,

        customMessage:
          row.custom_message,

        channelName:
          row.channel_name,

        channelUrl:
          row.channel_url,

        channelHandle:
          row.channel_handle
      });
    }
  }

  return subscriptions;
}


export function findGuildSubscription(
  guildId,
  nickname,
  platform
) {
  if (!platform) {
    return null;
  }

  const normalizedNickname =
    String(nickname ?? "")
      .trim()
      .toLowerCase();

  if (!normalizedNickname) {
    return null;
  }

  return (
    getGuildSubscriptions(
      guildId,
      platform
    ).find(
      subscription =>
        subscription.nickname
          ?.toLowerCase() ===
        normalizedNickname
    ) ??
    null
  );
}


/*
=====================================================
Add Subscription
=====================================================
*/

export async function addSubscription(
  guildId,
  platform,
  input,
  nickname,
  discordChannelId = null,
  customMessage = null
) {

  const capacity =
    entitlements.canAddSubscription(
      guildId,
      platform
    );

  if (!capacity.allowed) {
    return {
      success: false,
      reason: "entitlement-limit",
      usage: capacity.usage,
      limit: capacity.limit
    };
  }

  const key =
    normalizePlatform(platform);

  const platformModule =
    getPlatformModule(key);

  const channel =
    await platformModule
      .resolveAndSaveChannel(
        input
      );

  if (!channel) {
    return {
      success: false,
      reason: "not-found"
    };
  }

  const db = getDB();

  const table =
    getSubscriptionTable(key);

  const result =
    db.prepare(`
      INSERT OR IGNORE INTO ${table} (
        guild_id,
        channel_id,
        nickname,
        discord_channel_id,
        custom_message,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `).run(
      guildId,
      channel.channel_id,
      nickname,
      discordChannelId,
      customMessage
    );

  if (result.changes === 0) {
    return {
      success: false,
      reason: "already-exists",
      channel
    };
  }

  if (key === "youtube") {
    await youtube.initializeChannel(
      channel.channel_id
    );
  }

  return {
    success: true,
    channel
  };
}


/*
=====================================================
Delete Subscription
=====================================================
*/

export function deleteSubscription(
  guildId,
  nickname,
  platform
) {
  const subscription =
    findGuildSubscription(
      guildId,
      nickname,
      platform
    );

  if (!subscription) {
    return {
      success: false,
      reason: "not-found"
    };
  }

  const db = getDB();

  const table =
    getSubscriptionTable(
      subscription.platform
    );

  const result =
    db.prepare(`
      DELETE FROM ${table}
      WHERE guild_id = ?
        AND channel_id = ?
    `).run(
      guildId,
      subscription.channelId
    );

  return {
    success:
      result.changes > 0,

    subscription
  };
}


/*
=====================================================
Edit Subscription Nickname
=====================================================
*/

export function editSubscription(
  guildId,
  nickname,
  platform,
  newNickname
) {
  const subscription =
    findGuildSubscription(
      guildId,
      nickname,
      platform
    );

  if (!subscription) {
    return {
      success: false,
      reason: "not-found"
    };
  }

  const db = getDB();

  const table =
    getSubscriptionTable(
      subscription.platform
    );

  try {
    db.prepare(`
      UPDATE ${table}
      SET
        nickname = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
    `).run(
      newNickname,
      guildId,
      subscription.channelId
    );
  } catch (error) {
    if (
      error?.code ===
      "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return {
        success: false,
        reason: "nickname-exists"
      };
    }

    throw error;
  }

  return {
    success: true,

    subscription: {
      ...subscription,
      nickname: newNickname
    }
  };
}


/*
=====================================================
Subscription Message
=====================================================
*/

export function setSubscriptionMessage(
  guildId,
  nickname,
  platform,
  customMessage
) {
  const subscription =
    findGuildSubscription(
      guildId,
      nickname,
      platform
    );

  if (!subscription) {
    return {
      success: false,
      reason: "not-found"
    };
  }

  const db = getDB();

  const table =
    getSubscriptionTable(
      platform
    );

  db.prepare(`
    UPDATE ${table}
    SET
      custom_message = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    customMessage,
    guildId,
    subscription.channelId
  );

  return {
    success: true,

    subscription: {
      ...subscription,
      customMessage
    }
  };
}


/*
=====================================================
Subscription Discord Channel
=====================================================
*/

export function setSubscriptionChannel(
  guildId,
  nickname,
  platform,
  discordChannelId
) {
  const subscription =
    findGuildSubscription(
      guildId,
      nickname,
      platform
    );

  if (!subscription) {
    return {
      success: false,
      reason: "not-found"
    };
  }

  const db = getDB();

  const table =
    getSubscriptionTable(
      platform
    );

  db.prepare(`
    UPDATE ${table}
    SET
      discord_channel_id = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    discordChannelId,
    guildId,
    subscription.channelId
  );

  return {
    success: true,

    subscription: {
      ...subscription,
      discordChannelId
    }
  };
}


/*
=====================================================
Platform Subscription Lookup
=====================================================
*/

function getSubscribedGuilds(
  platform,
  channelId
) {
  return getPlatformModule(
    platform
  ).getSubscribedGuilds(
    channelId
  );
}


/*
=====================================================
Guild Lookup
=====================================================
*/

async function getGuild(
  client,
  guildId
) {
  return (
    client.guilds.cache.get(
      guildId
    ) ??
    await client.guilds
      .fetch(guildId)
      .catch(() => null)
  );
}


/*
=====================================================
Existing Discord Message Lookup
=====================================================
*/

async function getExistingDiscordMessage(
  guild,
  storedMessage
) {
  if (!storedMessage) {
    return null;
  }

  const channel =
    guild.channels.cache.get(
      storedMessage.discord_channel_id
    ) ??
    await guild.channels
      .fetch(
        storedMessage.discord_channel_id
      )
      .catch(() => null);

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }

  const message =
    await channel.messages
      .fetch(
        storedMessage.discord_message_id
      )
      .catch(() => null);

  if (!message) {
    return null;
  }

  return {
    channel,
    message
  };
}


/*
=====================================================
Notification Channel Resolution
=====================================================
*/

async function resolveNotificationChannel(
  guild,
  subscription
) {
  let notificationChannel = null;

  if (
    subscription.discordChannelId
  ) {
    notificationChannel =
      guild.channels.cache.get(
        subscription.discordChannelId
      ) ??
      await guild.channels
        .fetch(
          subscription.discordChannelId
        )
        .catch(() => null);
  }

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    notificationChannel =
      await channelManager.ensureChannel(
        guild,
        "notifications"
      );
  }

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    return null;
  }

  return notificationChannel;
}


/*
=====================================================
Send New Notification
=====================================================
*/

async function sendNewNotification(
  guild,
  content,
  eventType,
  subscription,
  resetTracking = false
) {
  const notificationChannel =
    await resolveNotificationChannel(
      guild,
      subscription
    );

  if (!notificationChannel) {
    return null;
  }

  const message =
    await notificationChannel.send({
      content:
        subscription.customMessage ??
        buildDefaultMessage(
          content
        ),

      embeds: [
        buildNotificationEmbed(
          content
        )
      ]
    });

    saveStoredMessage(
      guild.id,
      content.platform,
      getTrackingContentId(content),
      eventType,
      notificationChannel.id,
      message.id,
      resetTracking
    );

  return message;
}


/*
=====================================================
Edit Existing Notification
=====================================================
*/

async function editExistingNotification(
  guild,
  content,
  eventType,
  subscription
) {
  const storedMessage =
    getStoredMessage(
      guild.id,
      content.platform,
      getTrackingContentId(content),
      eventType
    );

  if (!storedMessage) {
    return null;
  }

  const existing =
    await getExistingDiscordMessage(
      guild,
      storedMessage
    );

  if (!existing) {
    deleteStoredMessage(
      guild.id,
      content.platform,
      getTrackingContentId(content),
      eventType
    );

    return null;
  }

  await existing.message.edit({
    content:
      subscription.customMessage ??
      buildDefaultMessage(
        content
      ),

    embeds: [
      buildNotificationEmbed(
        content
      )
    ]
  });

  return existing.message;
}


/*
=====================================================
Send or Update Guild Notification
=====================================================
*/

async function sendOrUpdateGuildNotification(
  client,
  guildId,
  content,
  changes,
  subscription
) {
  const eventType =
    getNotificationEventType(
      content,
      changes
    );

  const guild =
    await getGuild(
      client,
      guildId
    );

  if (!guild) {
    console.warn(
      `Cannot send notification: guild ${guildId} was not found.`
    );

    return null;
  }

  const storedMessage =
    getStoredMessage(
      guildId,
      content.platform,
      getTrackingContentId(content),
      eventType
    );
  
  if (storedMessage && !(content.platform === "kick" && changes?.isNew)) {
    const edited =
      await editExistingNotification(
        guild,
        content,
        eventType,
        subscription
      );

    if (edited) {
      return {
        action: "edited",
        message: edited
      };
    }
  }

  if (changes?.ended) return null;

  const isNewAnnouncement =
    changes?.isNew ||
    changes?.wentLive ||
    changes?.reconnected;

  if (!isNewAnnouncement) return null;

  const sent =
    await sendNewNotification(
      guild,
      content,
      eventType,
      subscription,
      content.platform === "kick" && Boolean(changes?.isNew)
    );

  if (!sent) {
    return null;
  }

  return {
    action: "sent",
    message: sent
  };
}


/*
=====================================================
Broadcast Content
=====================================================
*/

export async function broadcastContent(
  client,
  content,
  changes = {}
) {
  const subscriptions =
    getSubscribedGuilds(
      content.platform,
      content.channelId
    );

  const results = [];

  for (
    const subscription
    of subscriptions
  ) {
    try {
      const result =
        await sendOrUpdateGuildNotification(
          client,
          subscription.guild_id,
          content,
          changes,
          {
            discordChannelId:
              subscription.discord_channel_id ??
              null,

            customMessage:
              subscription.custom_message ??
              null
          }
        );

      results.push({
        guildId:
          subscription.guild_id,

        success:
          Boolean(result),

        action:
          result?.action ??
          null,

        messageId:
          result?.message?.id ??
          null
      });

    } catch (error) {
      console.error(
        `Failed to process ${content.platform} notification for guild ${subscription.guild_id}:`,
        error
      );

      results.push({
        guildId:
          subscription.guild_id,

        success: false,
        action: null,
        messageId: null
      });
    }
  }

  return results;
}


/*
=====================================================
Process Platform Result
=====================================================
*/

export async function processResult(
  client,
  result
) {
  if (
    !result ||
    !result.content ||
    !result.changes
  ) {
    return [];
  }

  const {
    content,
    changes
  } = result;

  const shouldProcess =
    changes.isNew ||
    changes.wentLive ||
    changes.ended ||
    changes.reconnected ||
    changes.titleChanged ||
    changes.thumbnailChanged ||
    changes.scheduleChanged ||
    changes.endedChanged;

  if (!shouldProcess) {
    return [];
  }

  return broadcastContent(
    client,
    content,
    changes
  );
}


/*
=====================================================
Process YouTube Results
=====================================================
*/

export async function processYouTubeResults(
  client,
  results
) {
  const output = [];

  for (
    const result
    of results ?? []
  ) {
    output.push(
      ...(
        await processResult(
          client,
          result
        )
      )
    );
  }

  return output;
}


/*
=====================================================
Manual Refresh Usage
=====================================================
*/

function reserveRefresh(guildId,platform) {
  const db = getDB();
  const now = Date.now();
  const cutoff = now - REFRESH_WINDOW_MS;

  return db.transaction(() => {
    db.prepare(`DELETE FROM notification_refresh_usage WHERE used_at <= ?`).run(cutoff);

    const usage = db.prepare(`
      SELECT COUNT(*) AS count, MIN(used_at) AS oldest
      FROM notification_refresh_usage
      WHERE guild_id = ? AND platform = ?
    `).get(guildId,platform);

    if (usage.count >= DEFAULT_REFRESH_LIMIT) {
      return {
        allowed:false,
        remaining:0,
        retryAt:usage.oldest + REFRESH_WINDOW_MS
      };
    }

    const result = db.prepare(`
      INSERT INTO notification_refresh_usage (guild_id,platform,used_at)
      VALUES (?,?,?)
    `).run(guildId,platform,now);

    return {
      allowed:true,
      usageId:result.lastInsertRowid,
      remaining:DEFAULT_REFRESH_LIMIT - usage.count - 1
    };
  })();
}

function releaseRefresh(usageId) {
  getDB().prepare(`DELETE FROM notification_refresh_usage WHERE id = ?`).run(usageId);
}


function getNewestRefreshResult(results,channelId) {
  const eligible = results.filter(result =>
    result?.content?.id &&
    String(result.content.channelId) === String(channelId) &&
    !result.content.isEnded
  );

  const getTime = content => {
    const value = content.actualStartTime ??
      content.startedAt ??
      content.publishedAt ??
      content.scheduledStartTime ??
      content.discoveredAt;

    const timestamp = value ? Date.parse(value) : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  eligible.sort((a,b) =>
    Number(Boolean(b.content.isLive)) - Number(Boolean(a.content.isLive)) ||
    getTime(b.content) - getTime(a.content)
  );

  return eligible[0] ?? null;
}


/*
=====================================================
Manual Subscription Refresh
=====================================================
*/



export async function refreshSubscription(client,guildId,nickname,platform) {
  const subscription = findGuildSubscription(guildId,nickname,platform);
  if (!subscription) return {success:false,reason:"not-found"};

  const key = subscription.platform;
  const platformModule = getPlatformModule(key);
  const allowance = reserveRefresh(guildId,key);

  if (!allowance.allowed) {
    return {
      success:false,
      reason:"refresh-limit",
      remaining:0,
      retryAt:allowance.retryAt
    };
  }

  let messagePosted = false;

  try {
    let refreshResult = null;

    if (typeof platformModule.refreshChannel === "function") {
      refreshResult = await platformModule.refreshChannel(subscription.channelId);
    } else if (typeof platformModule.checkChannel === "function") {
      refreshResult = await platformModule.checkChannel(subscription.channelId);
    } else if (typeof platformModule.checkChannels === "function") {
      refreshResult = await platformModule.checkChannels([subscription.channelId]);
    } else if (typeof platformModule.pollChannel === "function") {
      refreshResult = await platformModule.pollChannel(subscription.channelId);
    } else {
      throw new Error(`No refresh function available for ${key}`);
    }

    const results = Array.isArray(refreshResult)?refreshResult:refreshResult?[refreshResult]:[];
    const result = getNewestRefreshResult(results,subscription.channelId);

    if (!result) {
      releaseRefresh(allowance.usageId);
      return {success:false,reason:"no-content",subscription};
    }

    const content = result.content;
    const guild = await getGuild(client,guildId);

    if (!guild) {
      releaseRefresh(allowance.usageId);
      return {success:false,reason:"guild-unavailable",subscription};
    }

    const eventType = getNotificationEventType(content,result.changes ?? {});
    const message = await sendNewNotification(guild,content,eventType,subscription,true);

    if (!message) {
      releaseRefresh(allowance.usageId);
      return {success:false,reason:"channel-unavailable",subscription};
    }

    messagePosted = true;

    return {
      success:true,
      subscription,
      content,
      messageId:message.id,
      remaining:allowance.remaining,
      results
    };
  } catch (error) {
    if (!messagePosted) releaseRefresh(allowance.usageId);
    console.error(`Manual ${key} refresh failed for guild ${guildId}:`,error);
    return {success:false,reason:"refresh-error",subscription};
  }
}




export async function manualRefresh(
  client,
  guildId,
  nickname,
  platform
) {
  return refreshSubscription(
    client,
    guildId,
    nickname,
    platform
  );
}
