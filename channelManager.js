import * as discord from "discord.js";
import { getDB } from "./storage.js";


/*
=====================================================
Channel Purposes
=====================================================
*/

const CHANNEL_COLUMNS = {
  notifications:
    "announcement_channel_id",
  welcome:
    "welcome_channel_id",
  goodbye:
    "goodbye_channel_id",
  logs:
    "logs_channel_id",
  status:
    "status_channel_id"
};


/*
=====================================================
Channel Validation
=====================================================
*/

function getChannelColumn(purpose) {
  const column =
    CHANNEL_COLUMNS[purpose];

  if (!column) {
    throw new Error(
      `Unknown BargazBot channel purpose: ${purpose}`
    );
  }

  return column;
}


function isUsableTextChannel(channel) {
  return Boolean(
    channel &&
    channel.isTextBased() &&
    !channel.isThread()
  );
}


/*
=====================================================
Setup Message
=====================================================
*/

function buildSetupEmbed() {
  return new discord.EmbedBuilder()
    .setTitle(
      "BargazBot Setup"
    )
    .setDescription(
      "Thanks for adding BargazBot to your server!\n\n" +
      "This channel has been created as the default location for BargazBot's features."
    )
    .addFields(
      {
        name:
          "Currently using this channel",

        value:
          "• Creator Notifications\n" +
          "• BargazBot Updates\n" +
          "• BargazBot Status\n" +
          "• Server Logs\n" +
          "• Welcome Messages\n" +
          "• Goodbye Messages"
      },
      {
        name:
          "Channel customization",

        value:
          "These features can be configured using BargazBot's commands.\n" +
          "Run `/help` if you need help navigating BargazBot's commands!"
      }
    )
    .setTimestamp();
}


/*
=====================================================
Guild Database Records
=====================================================
*/

function ensureGuildRecord(guild) {
  const db = getDB();

  db.prepare(`
    INSERT INTO guilds (
      guild_id,
      guild_name,
      owner_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(guild_id)
    DO UPDATE SET
      guild_name =
        excluded.guild_name,
      owner_id =
        excluded.owner_id,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    guild.id,
    guild.name,
    guild.ownerId
  );
}


function ensureGuildSettingsRecord(
  guildId
) {
  const db = getDB();

  db.prepare(`
    INSERT INTO guild_settings (
      guild_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(guild_id)
    DO NOTHING
  `).run(
    guildId
  );
}


export function ensureGuildData(guild) {
  ensureGuildRecord(guild);

  ensureGuildSettingsRecord(
    guild.id
  );
}


/*
=====================================================
Channel Assignments
=====================================================
*/

function saveDefaultChannelAssignments(
  guildId,
  channelId
) {
  const db = getDB();

  db.prepare(`
    INSERT INTO guild_settings (
      guild_id,
      announcement_channel_id,
      welcome_channel_id,
      goodbye_channel_id,
      logs_channel_id,
      status_channel_id,
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

    ON CONFLICT(guild_id)
    DO UPDATE SET
      announcement_channel_id =
        excluded.announcement_channel_id,
      welcome_channel_id =
        excluded.welcome_channel_id,
      goodbye_channel_id =
        excluded.goodbye_channel_id,
      logs_channel_id =
        excluded.logs_channel_id,
      status_channel_id =
        excluded.status_channel_id,
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    guildId,
    channelId,
    channelId,
    channelId,
    channelId,
    channelId
  );
}


export function setChannel(
  guildId,
  purpose,
  channelId
) {
  const column =
    getChannelColumn(purpose);

  const db = getDB();

  const result =
    db.prepare(`
      UPDATE guild_settings
      SET ${column} = ?,
          updated_at =
            CURRENT_TIMESTAMP
      WHERE guild_id = ?
    `).run(
      channelId,
      guildId
    );

  if (
    result.changes === 0
  ) {
    throw new Error(
      `Cannot change ${purpose} channel: guild ${guildId} has no guild_settings record.`
    );
  }
}


export function getChannelAssignments(
  guildId
) {
  const db = getDB();

  return (
    db.prepare(`
      SELECT
        announcement_channel_id,
        welcome_channel_id,
        goodbye_channel_id,
        logs_channel_id,
        status_channel_id
      FROM guild_settings
      WHERE guild_id = ?
    `).get(
      guildId
    ) ??
    null
  );
}


/*
=====================================================
Get Configured Channel
=====================================================
*/

export async function getChannel(
  guild,
  purpose
) {
  const column =
    getChannelColumn(purpose);

  const db = getDB();

  const settings =
    db.prepare(`
      SELECT ${column}
      FROM guild_settings
      WHERE guild_id = ?
    `).get(
      guild.id
    );

  const channelId =
    settings?.[column];

  if (!channelId) {
    return null;
  }

  const channel =
    guild.channels.cache.get(
      channelId
    ) ??
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (
    !isUsableTextChannel(
      channel
    )
  ) {
    return null;
  }

  return channel;
}


/*
=====================================================
Find Existing BargazBot Channel
=====================================================
*/

async function findExistingBargazBotChannel(
  guild,
  purpose
) {
  const assignments =
    getChannelAssignments(
      guild.id
    );

  if (!assignments) {
    return null;
  }

  /*
   * Prefer channels that are already being
   * used for similar BargazBot purposes.
   *
   * We intentionally do not use welcome or
   * goodbye channels as automatic fallbacks
   * for logs/status/notifications.
   */

  let channelIds;

  switch (purpose) {
    case "notifications":
      channelIds = [
        assignments
          .announcement_channel_id,
        assignments
          .status_channel_id,
        assignments
          .logs_channel_id
      ];
      break;

    case "logs":
      channelIds = [
        assignments
          .logs_channel_id,
        assignments
          .status_channel_id,
        assignments
          .announcement_channel_id
      ];
      break;

    case "status":
      channelIds = [
        assignments
          .status_channel_id,
        assignments
          .logs_channel_id,
        assignments
          .announcement_channel_id
      ];
      break;

    case "welcome":
      channelIds = [
        assignments
          .welcome_channel_id
      ];
      break;

    case "goodbye":
      channelIds = [
        assignments
          .goodbye_channel_id
      ];
      break;

    default:
      channelIds = [];
  }

  const checkedIds =
    new Set();

  for (
    const channelId
    of channelIds
  ) {
    if (
      !channelId ||
      checkedIds.has(channelId)
    ) {
      continue;
    }

    checkedIds.add(
      channelId
    );

    const channel =
      guild.channels.cache.get(
        channelId
      ) ??
      await guild.channels
        .fetch(channelId)
        .catch(() => null);

    if (
      isUsableTextChannel(
        channel
      )
    ) {
      return channel;
    }
  }

  /*
   * A server may already have a BargazBot
   * channel even though the database does
   * not contain its ID. This is especially
   * useful for migrated servers.
   */

  const namedChannel =
    guild.channels.cache.find(
      channel =>
        channel.name ===
          "bargazbot" &&
        isUsableTextChannel(
          channel
        )
    );

  return (
    namedChannel ??
    null
  );
}


/*
=====================================================
Create BargazBot Channel
=====================================================
*/

async function createBargazBotChannel(
  guild,
  reason
) {
  return guild.channels.create({
    name: "bargazbot",
    type:
      discord.ChannelType
        .GuildText,
    reason
  });
}


/*
=====================================================
Initial Guild Setup
=====================================================
*/

export async function setupGuild(
  guild
) {
  ensureGuildData(guild);

  /*
   * Normally this is a newly joined server,
   * but checking first prevents duplicate
   * #bargazbot channels if setup is retried.
   */

  let channel =
    await findExistingBargazBotChannel(
      guild,
      "notifications"
    );

  let created = false;

  if (!channel) {
    channel =
      await createBargazBotChannel(
        guild,
        "Initial BargazBot server setup"
      );

    created = true;
  }

  saveDefaultChannelAssignments(
    guild.id,
    channel.id
  );

  if (created) {
    await channel.send({
      embeds: [
        buildSetupEmbed()
      ]
    });
  }

  return channel;
}


/*
=====================================================
Ensure Feature Channel
=====================================================
*/

export async function ensureChannel(
  guild,
  purpose
) {
  /*
   * This also updates the stored guild name
   * and owner ID whenever BargazBot uses
   * the server.
   */

  ensureGuildData(guild);

  const existingChannel =
    await getChannel(
      guild,
      purpose
    );

  if (existingChannel) {
    return existingChannel;
  }

  /*
   * If the configured channel is missing,
   * first try to reuse an appropriate
   * BargazBot channel.
   */

  const fallbackChannel =
    await findExistingBargazBotChannel(
      guild,
      purpose
    );

  if (fallbackChannel) {
    setChannel(
      guild.id,
      purpose,
      fallbackChannel.id
    );

    return fallbackChannel;
  }

  /*
   * Nothing suitable exists, so create a
   * BargazBot channel when the feature
   * actually needs one.
   */

  const newChannel =
    await createBargazBotChannel(
      guild,
      `Creating BargazBot ${purpose} channel`
    );

  setChannel(
    guild.id,
    purpose,
    newChannel.id
  );

  await newChannel.send({
    content:
      `BargazBot created this channel because the **${purpose}** feature needed a channel and no configured BargazBot channel was available.`
  });

  return newChannel;
}
