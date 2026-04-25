import * as discord from "discord.js";
import * as storage from "./storage";

// Send a log to the respecive log channel
// client = discord bot client
// title = log title (I.e: "Bot Joined Server")
// message = description/details of the log
// guildId = server ID where the action happened
// userId = user who triggered the action
// type = severety level ("info", "success", "warning", "error") | Defaults as "info"
export async function logAction(client, title, message, guildId, userId = "unknown", type = "info") {
  try {

    // ====================================
    // Individual Server Log Channel Config
    // ====================================

    const data = storage.loadData();

    // Create empty object if no data exists yet
    if (!data[guildId]) {
      data[guildId] = {};
    }

    // Saves individual server channel log ID
    let serverChannelId = data[guildId].serverLogChannelId;

    // If no saved log channel, create one
    if (!serverChannelId) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.error("Error creating log channel: guild not found");
        return;
      }

      try {
        const logChannel = await guild.channels.create({
          name: "bargazbot-logs",
          reason: "Bargaz Bot server logs",
          type: 0
        });

        serverChannelId = logChannel.id;
        data[guildId].serverLogChannelId = serverChannelId;
        storage.saveData(data);

        console.log(`Created log channel for server ${guild.name}`);
      } catch (error) {
        console.error(`Error creating log channel for ${guildId}:`, error);
        return;
      }
    }

    // ================================
    // Other Server Log Channels Config
    // ================================

    const ownerLogChannelID = process.env.OWNER_LOG_CHANNEL_ID;
    const ownerWarningChannelID = process.env.OWNER_WARNING_CHANNEL_ID;

    if (!ownerLogChannelID) {
      console.error("Cannot send error log, missing owner log channel ID");
      return;
    }
    
    // ===============
    // Everything Else
    // ===============

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
    
    // Convert channel ID to a usable format (object)
    const ownerLogChannel = client.channels.cache.get(ownerLogChannelID);
    const ownerWarningChannel = ownerWarningChannelID ? client.channels.cache.get(ownerWarningChannelID) : null;
    const serverChannel = client.channels.cache.get(serverChannelId);

    if (!ownerLogChannel) {
      console.error("Cannot send error log, cannot convert the ownerLogChannelID");
      return;
    }
    
    // Create embed
    const embed = new discord.EmbedBuilder()
      .setTitle(`${icons[type] || "📝"} ${title}`)
      .setDescription(message)
      .setColor(colors[type] || 0xFFC107)
      .setTimestamp();
    
    // Add user info if provided
    if (userId && userId !== "unknown") {
      const user = await client.users.fetch(userId).catch(() => null);
      embed.addFields(
        { name: "Initiated by", value: user ? `<@${userId}>` : userId, inline: true },
        { name: "User ID", value: userId, inline: true }
      );
    }
    
    // If the guild ID was given, use that
    if (guildId) {
      const guild = client.guilds.cache.get(guildId);
      embed.addFields({ 
        name: "Server", 
        value: guild ? guild.name : guildId, 
        inline: true 
      });
    }

    // Send to server's log channel
    if (serverChannel) {
      await serverChannel.send({ embeds: [embed] });
    }

    // Send to owner warning channel if type is warning or error
    if ((type === "warning" || type === "error") && ownerWarningChannel) {
      await ownerWarningChannel.send({ embeds: [embed] });
    }

    // Send to owner log channel
    await ownerLogChannel.send({ embeds: [embed] });

  } catch (error) {
    console.error("Error logging action:", error);
  }
}

//Move a server's log channel to a different channel
export async function moveServerLogChannel(client, guildId, newChannelId, userId) {
  try {
    const data = storage.loadData();

    if (!data[guildId]) {
      data[guildId] = {};
    }

    const oldChannelId = data[guildId].serverLogChannelId;
    data[guildId].serverLogChannelId = newChannelId;
    storage.saveData(data);

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