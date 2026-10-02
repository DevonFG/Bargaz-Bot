import * as discord from "discord.js";
import { getDB } from "./storage.js";

const CHANNEL_COLUMNS = {
  notifications: "announcement_channel_id",
  welcome:       "welcome_channel_id",
  goodbye:       "goodbye_channel_id",
  logs:          "logs_channel_id",
  status:        "status_channel_id"
};

// Typo protection
function getChannelColumn(purpose) {
  const column = CHANNEL_COLUMNS[purpose];

  if (!column) {
    throw new Error(`Unknown BargazBot channel purpose: ${purpose}`);
  }

  return column;
}

// Initial setup message
function buildSetupEmbed() {
  return new discord.EmbedBuilder()
    .setTitle("BargazBot Setup")
    .setDescription(
      "Thanks for adding BargazBot to your server!\n\n" +
      "This channel has been created as the default location for BargazBot's features."
    )
    .addFields(
      {
        name: "Currently using this channel",
        value:
          "• BargazBot Updates\n" +
          "• BargazBot Status\n" +
          "• Server Logs\n" +
          "• Welcome Messages\n" +
          "• Goodbye Messages"
      },
      {
        name: "Channel customization",
        value:
          "All features, including these, can be configured using commands.\n" +
          "Run `/help` if you need help navigating BargazBot's commands!"
      }
    )
    .setTimestamp();
}

// Makes sure a specific guild exists in SQLite
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
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

    ON CONFLICT(guild_id) DO UPDATE SET
      guild_name = excluded.guild_name,
      owner_id = excluded.owner_id,
      updated_at = CURRENT_TIMESTAMP
    `).run(
      guild.id,
      guild.name,
      guild.ownerId
  );
}

// This saves all default channel assignments to SQLite
function saveDefaultChannelAssignments(guildId, channelId) {
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
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

    ON CONFLICT(guild_id) DO UPDATE SET
      announcement_channel_id = excluded.announcement_channel_id,
      welcome_channel_id = excluded.welcome_channel_id,
      goodbye_channel_id = excluded.goodbye_channel_id,
      logs_channel_id = excluded.logs_channel_id,
      status_channel_id = excluded.status_channel_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    guildId,
    channelId,
    channelId,
    channelId,
    channelId,
    channelId
  );
}

// This is used by bot.js to start setup
export async function setupGuild(guild) {
  ensureGuildRecord(guild);

  const channel = await guild.channels.create({
    name: "bargazbot",
    type: discord.ChannelType.GuildText,
    reason: "Initial BargazBot server setup"
  });

  saveDefaultChannelAssignments(guild.id, channel.id);

  await channel.send({
    embeds: [buildSetupEmbed()]
  });

  return channel;
}

// This is used when something needs to know what channel to use for a specific use
export async function getChannel(guild, purpose) {
  const column = getChannelColumn(purpose);
  const db = getDB();

  const settings = db.prepare(`
    SELECT ${column}
    FROM guild_settings
    WHERE guild_id = ?
  `).get(guild.id);

  const channelId = settings?.[column];

  if (!channelId) {
    return null;
  }

  const channel =
    guild.channels.cache.get(channelId) ??
    await guild.channels.fetch(channelId).catch(() => null);

  return channel ?? null;
}

// This is used when a feature in a guild needs to change to a different channel
export function setChannel(guildId, purpose, channelId) {
  const column = getChannelColumn(purpose);
  const db = getDB();

  const result = db.prepare(`
    UPDATE guild_settings
    SET ${column} = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
  `).run(channelId, guildId);

  if (result.changes === 0) {
    throw new Error(
      `Cannot change ${purpose} channel: guild ${guildId} has no guild_settings record.`
    );
  }
}

// This is mainly for convenience, but it returns all IDs of channels for a particular guild
export function getChannelAssignments(guildId) {
  const db = getDB();

  return db.prepare(`
    SELECT
      announcement_channel_id,
      welcome_channel_id,
      goodbye_channel_id,
      logs_channel_id,
      status_channel_id
    FROM guild_settings
    WHERE guild_id = ?
  `).get(guildId) ?? null;
}

// This is used only in ensureChannel function to find channels to post in if the normal channel cannot be found
async function findExistingBargazBotChannel(guild) {
  const assignments = getChannelAssignments(guild.id);

  if (!assignments) {
    return null;
  }

  const channelIds = [
    assignments.logs_channel_id,
    assignments.status_channel_id
  ];

  for (const channelId of channelIds) {
    if (!channelId) {
      continue;
    }

    const channel =
      guild.channels.cache.get(channelId) ??
      await guild.channels.fetch(channelId).catch(() => null);

    if (channel?.isTextBased()) {
      return channel;
    }
  }

  return null;
}

// If a channel is missing/deleted, see if a different channel exists that is configured,
// otherwise, create a new channel
export async function ensureChannel(guild, purpose) {
  const existingChannel = await getChannel(guild, purpose);

  if (existingChannel) {
    return existingChannel;
  }

  const fallbackChannel = await findExistingBargazBotChannel(guild);

  if (fallbackChannel) {
    setChannel(guild.id, purpose, fallbackChannel.id);
    return fallbackChannel;
  }

  const newChannel = await guild.channels.create({
    name: "bargazbot",
    type: discord.ChannelType.GuildText,
    reason: `Recovering missing BargazBot ${purpose} channel`
  });

  setChannel(guild.id, purpose, newChannel.id);

  await newChannel.send({
    content:
      `BargazBot recreated this channel because the configured **${purpose}** channel was missing.`
  });

  return newChannel;
}

// To add: When moving logs channel, move over history
