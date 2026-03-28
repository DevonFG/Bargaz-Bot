const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { loadData, saveData } = require("./storage");

// Track warning cooldowns to only show every 10 minutes
const warningCooldowns = new Map();
const WARNING_COOLDOWN = 600000; // 10 minutes in milliseconds

/**
 * Send a log to the bot owner's continuous log channel (all bot activity)
 */
async function logAction(client, action, details, guildId = null, userId = null) {
  try {
    const continuousChannelId = process.env.OWNER_LOG_CHANNEL_ID;
    if (!continuousChannelId) return;

    const channel = client.channels.cache.get(continuousChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📝 ${action}`)
      .setDescription(details)
      .setColor(0x5865F2)
      .setTimestamp();

    if (guildId) {
      const guild = client.guilds.cache.get(guildId);
      embed.addFields({ name: "Server", value: guild ? guild.name : guildId, inline: true });
    }

    if (userId) {
      const user = await client.users.fetch(userId).catch(() => null);
      embed.addFields({ name: "User", value: user ? user.username : userId, inline: true });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error logging action:", error);
  }
}

/**
 * Send a warning to the bot owner's warning log channel (throttled every 10 minutes)
 */
async function logWarning(client, title, message, category = "general") {
  try {
    const warningChannelId = process.env.OWNER_WARNING_CHANNEL_ID;
    if (!warningChannelId) return;

    const cooldownKey = `${category}`;
    const now = Date.now();
    const lastWarningTime = warningCooldowns.get(cooldownKey);

    if (lastWarningTime && now - lastWarningTime < WARNING_COOLDOWN) {
      console.warn(`⚠️ [COOLDOWN] ${title}: ${message}`);
      return;
    }

    warningCooldowns.set(cooldownKey, now);

    const channel = client.channels.cache.get(warningChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${title}`)
      .setDescription(message)
      .setColor(0xFFA500)
      .setTimestamp()
      .setFooter({ text: `Next alert in 10 minutes` });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error logging warning:", error);
  }
}

/**
 * Send a per-server log (appears in that server's log channel)
 */
async function logServerEvent(client, guildId, action, details, userId, type = "info") {
  try {
    const data = loadData();

    if (!data[guildId]) {
      data[guildId] = {};
    }

    let logChannelId = data[guildId].serverLogChannelId;

    if (!logChannelId) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      try {
        const logChannel = await guild.channels.create({
          name: "bargazbot-logs",
          reason: "Bargaz Bot server logs",
          type: 0
        });

        logChannelId = logChannel.id;
        data[guildId].serverLogChannelId = logChannelId;
        saveData(data);

        console.log(`Created log channel for server ${guild.name}`);
      } catch (error) {
        console.error(`Error creating log channel for ${guildId}:`, error);
        return;
      }
    }

    const channel = client.channels.cache.get(logChannelId);
    if (!channel) return;

    const colors = {
      info: 0x5865F2,
      success: 0x57F287,
      warning: 0xFFA500,
      error: 0xED4245
    };

    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌"
    };

    const user = await client.users.fetch(userId).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`${icons[type] || "📝"} ${action}`)
      .setDescription(details)
      .setColor(colors[type] || 0x5865F2)
      .addFields(
        { name: "Initiated by", value: user ? `<@${userId}>` : userId, inline: true },
        { name: "User ID", value: userId, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error logging server event:", error);
  }
}

/**
 * Move a server's log channel to a different channel
 */
async function moveServerLogChannel(client, guildId, newChannelId, userId) {
  try {
    const data = loadData();

    if (!data[guildId]) {
      data[guildId] = {};
    }

    const oldChannelId = data[guildId].serverLogChannelId;
    data[guildId].serverLogChannelId = newChannelId;
    saveData(data);

    const channel = client.channels.cache.get(newChannelId);
    if (channel) {
      const user = await client.users.fetch(userId).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle("📍 Log Channel Changed")
        .setDescription(`The server log channel has been moved here.`)
        .addFields(
          { name: "Changed by", value: user ? `<@${userId}>` : userId, inline: true },
          { name: "Previous channel", value: oldChannelId ? `<#${oldChannelId}>` : "None", inline: true }
        )
        .setColor(0x5865F2)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

    await logAction(client, "Server Log Channel Moved", `Guild ${guildId} moved logs to <#${newChannelId}>`, guildId, userId);
  } catch (error) {
    console.error("Error moving server log channel:", error);
  }
}

module.exports = {
  logAction,
  logWarning,
  logServerEvent,
  moveServerLogChannel,
  WARNING_COOLDOWN
};