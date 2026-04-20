require("dotenv").config(); // loads .env file so process.env variables are available

const {
  Client,
  IntentsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js"); // import everything we need from discord.js

const { startMonitor, refreshChannel, verifyChannel, parseChannelInput, PLATFORM_CONTENT_TYPES, pendingAdds } = require("./announcements"); // import announcement functions
const { loadData, saveData } = require("./storage"); // import storage functions
const { loadConfig, saveConfig } = require("./config"); // import config functions
const quotaTracker = require("./youtube-quota"); 
const { logAction, logWarning, logServerEvent, moveServerLogChannel } = require("./logging"); // import logging functions

// Set up the Discord client with the permissions it needs
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,        // allows bot to see servers
    IntentsBitField.Flags.GuildMessages, // allows bot to see messages
    IntentsBitField.Flags.MessageContent // allows bot to read message content
  ]
});

// Define all slash commands
const commands = [

  // /youtube_rss_mode - toggle RSS-only mode for YouTube
  new SlashCommandBuilder()
    .setName("youtube_rss_mode")
    .setDescription("Toggle RSS-only mode for YouTube announcements")
    .addStringOption( option =>
      option
        .setName("mode")
        .setDescription("Enable or disable RSS-only mode")
        .setRequired(true)
        .addChoices(
          { name: "Enable - Use RSS only, skip API calls", value: "enable" },
          { name: "Disable - Use API normally", value: "disable"}
        )
    ),

  // /ping - basic test command
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  // /announcement_add - add a channel to monitor
  new SlashCommandBuilder()
    .setName("announcement_add")
    .setDescription("Add a YouTube or Twitch channel to monitor for announcements")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is this channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  } 
        )
    )
    .addStringOption(option =>
      option
        .setName("channel")
        .setDescription("The channel @handle, username, channel ID, or full URL")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("A nickname for this channel used in commands like /refresh")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("discordchannel")
        .setDescription("The Discord channel to post announcements in")
        .setRequired(true)
    ),

  // /announcement_delete - remove a monitored channel
  new SlashCommandBuilder()
    .setName("announcement_delete")
    .setDescription("Remove a monitored channel")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to remove")
        .setRequired(true)
    ),

  // /announcement_edit - edit a monitored channel
  new SlashCommandBuilder()
    .setName("announcement_edit")
    .setDescription("Edit a monitored channel's settings")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to edit")
        .setRequired(true)
    ),

  // /setmessage - set custom announcement message and mentions for a channel
  new SlashCommandBuilder()
    .setName("setmessage")
    .setDescription("Set the announcement message and @ mentions for a monitored channel")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to update")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("The custom announcement message")
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("mentions")
        .setDescription("Role IDs to mention, separated by commas e.g. 123456,789012")
        .setRequired(false)
    ),

  // /refresh - force recheck a specific channel by nickname and platform
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Force a recheck of a specific monitored channel for new/updated content")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to refresh")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("contenttype")
        .setDescription("The type of content to check for (optional - omit to check all types)")
        .setRequired(false)
    ),

  // /list - list all monitored channels filtered by platform
  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all monitored channels in this server")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform to list channels for")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  }//,
          //{ name: "Rumble",  value: "rumble"  }
        )
    ),

  // /setrefreshpermission - control who can use /refresh
  new SlashCommandBuilder()
    .setName("setrefreshpermission")
    .setDescription("Set who can use the /refresh command in this server")
    .addStringOption(option =>
      option
        .setName("permission")
        .setDescription("Who can use /refresh")
        .setRequired(true)
        .addChoices(
          { name: "Admin only",    value: "admin"    },
          { name: "Specific role", value: "role"     },
          { name: "Everyone",      value: "everyone" }
        )
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("The role that can use /refresh (only needed if you chose specific role)")
        .setRequired(false)
    ),

  // /editautocreatedchannels - change where announcements and/or logs are sent
  new SlashCommandBuilder()
    .setName("editautocreatedchannels")
    .setDescription("Configure where announcements and/or server logs are sent")
    .addSubcommand(subcommand =>
      subcommand
        .setName("announcements")
        .setDescription("Set the channel for Bargaz Bot announcements")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel to receive bot announcements")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("logs")
        .setDescription("Set the channel for server logs")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel to receive server logs")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("both")
        .setDescription("Use one channel for both announcements and server logs")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel for both announcements and logs")
            .setRequired(true)
        )
    ),

  // /setwelcomemessage - owner only, sets the welcome message for all new servers
  new SlashCommandBuilder()
    .setName("setwelcomemessage")
    .setDescription("(Bot owner only) Set the welcome message sent when the bot joins a new server")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("The new welcome message")
        .setRequired(true)
    ),

].map(command => command.toJSON()); // convert to JSON format for Discord's API

// When the bot first starts up and is ready
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register all slash commands globally with Discord
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (error) {
    console.error("Error registering commands:", error);
  }

  // Start the announcement monitor for all platforms
  startMonitor(client);

  // Start monitoring the YouTube API Quota limit
  quotaTracker.startQuotaMonitoring(client);

});

// When the bot joins a new server
client.on("guildCreate", async (guild) => {
  try {
    const config = loadConfig();
    const data   = loadData();

    // Create #bargazbot-announcements channel in the new server
    const announcementChannel = await guild.channels.create({
      name: "bargazbot-announcements",
      reason: "Bargaz Bot announcements channel"
    });

    // Create #bargazbot-logs channel in the new server
    const logChannel = await guild.channels.create({
      name: "bargazbot-logs",
      reason: "Bargaz Bot server logs"
    });

    // Save the channels
    if (!data[guild.id]) data[guild.id] = {};
    data[guild.id].botAnnouncementChannelId = announcementChannel.id;
    data[guild.id].serverLogChannelId = logChannel.id;
    saveData(data);

    // Send the welcome message
    await announcementChannel.send(config.welcomeMessage);

    // Log to owner's continuous log
    await logAction(client, "Bot Joined Server", `Joined **${guild.name}** with ${guild.memberCount} members`, guild.id);

    console.log(`Joined server: ${guild.name} - created #bargazbot-announcements and #bargazbot-logs`);
  } catch (error) {
    console.error(`Error setting up new server ${guild.name}:`, error.message);
    await logWarning(client, "Server Setup Error", `Failed to set up server ${guild.name}: ${error.message}`, "server_setup");
  }
});

// Listen for messages in the owner's announcement source channel
// When a message is posted there, broadcast it to all servers
client.on("messageCreate", async (message) => {
  // Ignore bots and messages outside the owner's server
  if (message.author.bot) return;
  if (message.guildId !== process.env.OWNER_SERVER_ID) return;
  if (message.channelId !== process.env.OWNER_ANNOUNCEMENT_CHANNEL_ID) return;

  // Check if the poster is an admin in the owner's server
  const member = message.member;
  if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) return;

  console.log("Broadcasting cross-server announcement...");

  const data = loadData();

  // Build the announcement embed
  const embed = new EmbedBuilder()
    .setTitle("📢 Bargaz Bot Announcement")
    .setDescription(message.content)
    .setColor("#FF6B35") // orange color for bot announcements
    .setFooter({
      text: `Sent by ${message.author.username} • ${new Date().toLocaleString("en-US", {
        month: "long",
        day:   "numeric",
        year:  "numeric",
        hour:  "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short"
      })}`
    });

  // If the message has an image attachment, add it to the embed
  const imageAttachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  // Loop through all servers the bot is in and send the announcement
  let successCount = 0;
  let failCount    = 0;

  for (const [guildId, guildData] of client.guilds.cache) {
    // Skip the owner's own server
    if (guildId === process.env.OWNER_SERVER_ID) continue;

    // Get the configured announcement channel for this server
    const channelId = data[guildId]?.botAnnouncementChannelId;
    if (!channelId) continue;

    try {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await channel.send({ embeds: [embed] });
        successCount++;
      }
    } catch (error) {
      console.error(`Failed to send announcement to ${guildId}:`, error.message);
      failCount++;
    }
  }

  // React to the original message to confirm it was sent
  await message.react(successCount > 0 ? "✅" : "❌");
  console.log(`Announcement sent to ${successCount} servers, failed for ${failCount}`);
});

// Handle all incoming interactions (slash commands, modals, select menus)
client.on("interactionCreate", async interaction => {

  // ============================================================
  // SLASH COMMANDS
  // ============================================================
  if (interaction.isChatInputCommand()) {
    const { commandName, guildId } = interaction;

    // Load data and make sure this server has an entry
    const data = loadData();
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId].announcements) data[guildId].announcements = {};

    // Helper to check if user is an admin
    const isAdmin = interaction.member.permissions.has("Administrator");

    // ----------------------------------------------------------
    // /youtube_rss_mode - owner only
    // ----------------------------------------------------------
    if (commandName === "youtube_rss_mode") {
      // Only the bot owner's server can use this command
      if (guildId !== process.env.OWNER_SERVER_ID) {
        await interaction.reply({
          content:   "❌ This command can only be used in the bot's support server.",
          ephemeral: true
        });
        return;
      }

      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const mode = interaction.options.getString("mode");
      const quotaTracker = require("./youtube-quota");

      // Get current tracker state
      const tracker = quotaTracker.getEstimatedQuotaRemaining();

      if (mode === "enable") {
        // Enable RSS-only mode
        tracker.rssOnlyMode = true;
        tracker.manualRssMode = true; // Track that admin manually set this
        tracker.manualRssModeUntil = new Date(); // Current time + will reset at midnight
        saveData(data);

        const embed = new EmbedBuilder()
          .setTitle("🔴 YouTube RSS-Only Mode ENABLED")
          .setColor(0xFF0000)
          .addFields(
            { name: "Status", value: "YouTube API calls are now disabled", inline: true },
            { name: "Videos/Shorts", value: "✅ RSS feeds will still work", inline: true },
            { name: "Live Streams", value: "❌ Disabled (requires API)", inline: true },
            { name: "Premieres", value: "❌ Disabled (requires API)", inline: true },
            { name: "Community Posts", value: "❌ Disabled (requires API)", inline: true },
            { name: "Reset Time", value: "Midnight UTC tomorrow (or when quota recovers)", inline: false }
          )
          .setFooter({ text: "Manually enabled by " + interaction.user.username });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      } else {
        // Disable RSS-only mode
        tracker.rssOnlyMode = false;
        tracker.manualRssMode = false;
        tracker.estimatedRemaining = quotaTracker.QUOTA_CONFIG.maxDailyQuota; // Reset to max
        saveData(data);

        const embed = new EmbedBuilder()
          .setTitle("🟢 YouTube RSS-Only Mode DISABLED")
          .setColor(0x00FF00)
          .addFields(
            { name: "Status", value: "YouTube API is now enabled", inline: true },
            { name: "Quota Reset", value: "Estimated at maximum capacity", inline: true },
            { name: "All Features", value: "✅ API calls, live streams, premieres, and posts re-enabled", inline: false }
          )
          .setFooter({ text: "Manually disabled by " + interaction.user.username });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    }

    // ----------------------------------------------------------
    // /ping
    // ----------------------------------------------------------
    else if (commandName === "ping") {
      await interaction.reply("Pong!");
    }

    // ----------------------------------------------------------
    // /announcement_add
    // ----------------------------------------------------------
    else if (commandName === "announcement_add") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform       = interaction.options.getString("platform");
      const channelInput   = interaction.options.getString("channel");
      const nickname       = interaction.options.getString("nickname");
      const discordChannel = interaction.options.getChannel("discordchannel");

      // Check if this nickname is already in use on this platform in this server
      const platformChannels = data[guildId].announcements[platform] || [];
      const nicknameExists   = platformChannels.find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (nicknameExists) {
        await interaction.reply({
          content:   `❌ A channel with the nickname **${nickname}** already exists on ${platform}. Please choose a different nickname.`,
          ephemeral: true
        });
        return;
      }

      // Tell the user we're verifying - this can take a moment
      await interaction.deferReply({ ephemeral: true });

      // Verify the channel actually exists on the platform
      const verified = await verifyChannel(platform, channelInput);

      // Log the action if verification fails
      if (!verified) {
        await logServerEvent(client, guildId, "Announcement Add Failed", 
          `Failed to verify channel: ${channelInput} on ${platform}`, 
          interaction.user.id, "error");
        await interaction.editReply({
          content: `❌ Could not find that channel on ${platform}. Please check the input and try again. You can use a @handle, username, channel ID, or full URL.`
        });
        return;
      }

      // Check if this channel ID is already being monitored on this platform
      if (!data[guildId].announcements[platform]) {
        data[guildId].announcements[platform] = [];
      }

      const alreadyExists = data[guildId].announcements[platform].find(
        c => c.channelId === verified.id
      );

      if (alreadyExists) {
        await interaction.editReply({
          content: `❌ That channel is already being monitored under the nickname **${alreadyExists.nickname}** on ${platform}.`
        });
        return;
      }

      // Generate a unique key for this pending add
      const pendingKey = `${guildId}_${interaction.user.id}_${Date.now()}`;
      pendingAdds.set(pendingKey, {
        platform,
        verified,
        nickname,
        discordChannelId: discordChannel.id,
        expires: Date.now() + 300000 // expires after 5 minutes
      });

      // Build a preview embed
      const previewEmbed = new EmbedBuilder()
        .setTitle(`Preview: ${verified.displayName}`)
        .setColor(
          platform === "youtube" ? "#FF0000" :
          platform === "twitch"  ? "#9146FF" : "#85C742"
        )
        .addFields(
          { name: "Platform",      value: platform,                                        inline: true },
          { name: "Channel",       value: verified.displayName,                            inline: true },
          { name: "Handle",        value: verified.handle,                                 inline: true },
          { name: "Nickname",      value: nickname,                                        inline: true },
          { name: "Posting in",    value: `<#${discordChannel.id}>`,                       inline: true },
          { name: "Content types", value: PLATFORM_CONTENT_TYPES[platform].join(", "),    inline: false }
        )
        .setFooter({ text: "Use the menu below to confirm or cancel." });
        
        // Log successful add to server log
        await logServerEvent(client, guildId, "Announcement Added", 
         `Added **${verified.displayName}** (${nickname}) on ${platform} → <#${discordChannel.id}>`,
        interaction.user.id, "success");

      if (verified.thumbnail) previewEmbed.setThumbnail(verified.thumbnail);

      // Show preview with confirm/cancel select menu
      const confirmRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`confirm_add_${guildId}`)
          .setPlaceholder("Confirm or cancel")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("✅ Confirm - Add this channel")
              .setValue(`confirm|${pendingKey}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("❌ Cancel")
              .setValue("cancel")
          )
      );

      await interaction.editReply({
        content:    "Here's a preview of what will be monitored:",
        embeds:     [previewEmbed],
        components: [confirmRow]
      });
    }

    // ----------------------------------------------------------
    // /announcement_delete
    // ----------------------------------------------------------
    else if (commandName === "announcement_delete") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform = interaction.options.getString("platform");
      const nickname = interaction.options.getString("nickname");

      if (!data[guildId].announcements[platform]) {
        await interaction.reply({
          content:   `❌ No ${platform} channels are being monitored in this server.`,
          ephemeral: true
        });

        // Log the deletion
        await logServerEvent(client, guildId, "Announcement Deleted", 
          `Removed **${foundConfig.displayName}** (${nickname}) from ${platform}`,
          interaction.user.id, "warning");

        return;
      }

      const foundConfig = data[guildId].announcements[platform].find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (!foundConfig) {
        await interaction.reply({
          content:   `❌ No ${platform} channel found with the nickname **${nickname}**. Use /list to see all monitored channels.`,
          ephemeral: true
        });
        return;
      }

      // Remove the channel
      data[guildId].announcements[platform] = data[guildId].announcements[platform].filter(
        c => c.nickname.toLowerCase() !== nickname.toLowerCase()
      );
      saveData(data);

      await interaction.reply({
        content:   `✅ Successfully removed **${foundConfig.displayName}** (${nickname}) from ${platform} monitoring.`,
        ephemeral: true
      });
    }

    // ----------------------------------------------------------
    // /announcement_edit
    // ----------------------------------------------------------
    else if (commandName === "announcement_edit") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform = interaction.options.getString("platform");
      const nickname = interaction.options.getString("nickname");

      if (!data[guildId].announcements[platform]) {
        await interaction.reply({
          content:   `❌ No ${platform} channels are being monitored in this server.`,
          ephemeral: true
        });
        return;
      }

      const foundConfig = data[guildId].announcements[platform].find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (!foundConfig) {
        await interaction.reply({
          content:   `❌ No ${platform} channel found with the nickname **${nickname}**. Use /list to see all monitored channels.`,
          ephemeral: true
        });
        return;
      }

      // Show edit options select menu
      const editRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`edit_field_${guildId}`)
          .setPlaceholder("What would you like to edit?")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Nickname")
              .setDescription("Change the nickname used to identify this channel")
              .setValue(`editfield|nickname|${nickname}|${platform}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("Platform")
              .setDescription("Move this channel to a different platform")
              .setValue(`editfield|platform|${nickname}|${platform}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("Discord announcement channel")
              .setDescription("Change which Discord channel announcements are posted in")
              .setValue(`editfield|discordchannel|${nickname}|${platform}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("Custom message")
              .setDescription("Change the announcement message")
              .setValue(`editfield|message|${nickname}|${platform}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("@ Mentions")
              .setDescription("Change which roles are mentioned in announcements")
              .setValue(`editfield|mentions|${nickname}|${platform}`),
            new StringSelectMenuOptionBuilder()
              .setLabel("Content types")
              .setDescription("Change which content types trigger announcements")
              .setValue(`editfield|contenttypes|${nickname}|${platform}`)
          )
      );

      await interaction.reply({
        content:    `What would you like to edit for **${foundConfig.displayName}** (${nickname}) on ${platform}?`,
        components: [editRow],
        ephemeral:  true
      });
    }

    // ----------------------------------------------------------
    // /setmessage
    // ----------------------------------------------------------
    else if (commandName === "setmessage") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform      = interaction.options.getString("platform");
      const nickname      = interaction.options.getString("nickname");
      const customMessage = interaction.options.getString("message");
      const mentionsInput = interaction.options.getString("mentions");

      if (!data[guildId].announcements[platform]) {
        await interaction.reply({
          content:   `❌ No ${platform} channels are being monitored in this server.`,
          ephemeral: true
        });
        return;
      }

      const foundConfig = data[guildId].announcements[platform].find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (!foundConfig) {
        await interaction.reply({
          content:   `❌ No ${platform} channel found with the nickname **${nickname}**. Use /list to see all monitored channels.`,
          ephemeral: true
        });
        return;
      }

      if (customMessage) foundConfig.customMessage = customMessage;

      if (mentionsInput) {
        foundConfig.mentions = mentionsInput
          .split(",")
          .map(id => id.trim())
          .filter(id => id.length > 0);
      }

      saveData(data);

      await interaction.reply({
        content:   `✅ Updated announcement settings for **${foundConfig.displayName}** (${nickname}) on ${platform}.`,
        ephemeral: true
      });
    }

    // ----------------------------------------------------------
    // /refresh
    // ----------------------------------------------------------
    else if (commandName === "refresh") {
      const platform = interaction.options.getString("platform");
      const nickname = interaction.options.getString("nickname");
      await refreshChannel(client, guildId, nickname, platform, contentType, interaction);
    }

    // ----------------------------------------------------------
    // /list
    // ----------------------------------------------------------
    else if (commandName === "list") {
      const platform = interaction.options.getString("platform");
      const channels = data[guildId].announcements[platform];

      if (!channels || channels.length === 0) {
        await interaction.reply({
          content:   `❌ No ${platform} channels are being monitored in this server.`,
          ephemeral: true
        });
        return;
      }

      const list = channels.map(c =>
        `• **${c.nickname}** — ${c.displayName} (${c.handle}) → <#${c.discordChannelId}>`
      ).join("\n");

      const platformLabel =
        platform === "youtube" ? "🔴 YouTube" :
        platform === "twitch"  ? "🟣 Twitch"  : "🟢 Rumble";

      await interaction.reply({
        content:   `**${platformLabel} Monitored Channels:**\n${list}`,
        ephemeral: true
      });
    }

    // ----------------------------------------------------------
    // /setrefreshpermission
    // ----------------------------------------------------------
    else if (commandName === "setrefreshpermission") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const permission = interaction.options.getString("permission");
      const role       = interaction.options.getRole("role");

      data[guildId].announcements.refreshPermission = permission;

      if (permission === "role") {
        if (!role) {
          await interaction.reply({
            content:   "❌ Please specify a role when using the role permission option.",
            ephemeral: true
          });
          return;
        }
        data[guildId].announcements.refreshRoleId = role.id;
      }

      saveData(data);
      await interaction.reply({
        content:   `✅ Refresh permission set to: **${permission}**${role ? ` (${role.name})` : ""}.`,
        ephemeral: true
      });
    }

    // ----------------------------------------------------------
    // /editautocreatedchannels
    // ----------------------------------------------------------
    else if (commandName === "editautocreatedchannels") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      const selectedChannel = interaction.options.getChannel("channel");

      if (subcommand === "announcements") {
        // Change ONLY announcements channel
        const oldChannelId = data[guildId].botAnnouncementChannelId;
        data[guildId].botAnnouncementChannelId = selectedChannel.id;
        saveData(data);

        await logServerEvent(
          client,
          guildId,
          "Announcement Channel Changed",
          `Moved from <#${oldChannelId || "unknown"}> → <#${selectedChannel.id}>`,
          interaction.user.id,
          "info"
        );

        await interaction.reply({
          content: `✅ Bargaz Bot announcements will now be posted in <#${selectedChannel.id}>.`,
          ephemeral: true
        });
      }
      else if (subcommand === "logs") {
        // Change ONLY logs channel
        const oldChannelId = data[guildId].serverLogChannelId;
        data[guildId].serverLogChannelId = selectedChannel.id;
        saveData(data);

        await logServerEvent(
          client,
          guildId,
          "Log Channel Changed",
          `Moved from <#${oldChannelId || "unknown"}> → <#${selectedChannel.id}>`,
          interaction.user.id,
          "info"
        );

        await interaction.reply({
          content: `✅ Server logs will now be posted in <#${selectedChannel.id}>.`,
          ephemeral: true
        });
      }
      else if (subcommand === "both") {
        // Use same channel for BOTH
        const oldAnnouncementChannelId = data[guildId].botAnnouncementChannelId;
        const oldLogChannelId = data[guildId].serverLogChannelId;

        data[guildId].botAnnouncementChannelId = selectedChannel.id;
        data[guildId].serverLogChannelId = selectedChannel.id;
        saveData(data);

        await logServerEvent(
          client,
          guildId,
          "Announcements & Logs Channel Changed",
          `Both announcements and logs now sent to <#${selectedChannel.id}>\nPreviously: Announcements <#${oldAnnouncementChannelId || "unknown"}> | Logs <#${oldLogChannelId || "unknown"}>`,
          interaction.user.id,
          "info"
        );

        await interaction.reply({
          content: `✅ Both announcements and server logs will now be posted in <#${selectedChannel.id}>.`,
          ephemeral: true
        });
      }
    }

    // ----------------------------------------------------------
    // /setwelcomemessage - owner only
    // ----------------------------------------------------------
    else if (commandName === "setwelcomemessage") {
      // Only the bot owner's server can use this command
      if (guildId !== process.env.OWNER_SERVER_ID) {
        await interaction.reply({
          content:   "❌ This command can only be used in the bot's support server.",
          ephemeral: true
        });
        return;
      }

      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const newMessage = interaction.options.getString("message");
      const config     = loadConfig();
      config.welcomeMessage = newMessage;
      saveConfig(config);

      await interaction.reply({
        content:   `✅ Welcome message updated! New servers will now receive:\n\n${newMessage}`,
        ephemeral: true
      });
    }
  }

  // ============================================================
  // SELECT MENU INTERACTIONS
  // ============================================================
  else if (interaction.isStringSelectMenu()) {
    const { guildId, customId } = interaction;
    const data = loadData();

    // ----------------------------------------------------------
    // Confirm or cancel adding a channel
    // ----------------------------------------------------------
    if (customId.startsWith("confirm_add_")) {
      const selected = interaction.values[0];

      if (selected === "cancel") {
        await interaction.update({
          content:    "❌ Cancelled. No channel was added.",
          embeds:     [],
          components: []
        });
        return;
      }

      // format: confirm|pendingKey
      const [, pendingKey] = selected.split("|");

      // Retrieve the pending add data from memory
      const pending = pendingAdds.get(pendingKey);

      if (!pending || Date.now() > pending.expires) {
        await interaction.update({
          content:    "❌ This confirmation has expired. Please run /announcement_add again.",
          embeds:     [],
          components: []
        });
        pendingAdds.delete(pendingKey);
        return;
      }

      const { platform, verified, nickname, discordChannelId } = pending;

      // INITIALIZE SERVER DATA if it doesn't exist
      if (!data[guildId]) {
        data[guildId] = {};
      }
      if (!data[guildId].announcements) {
        data[guildId].announcements = {};
      }

      if (!data[guildId].announcements[platform]) {
        data[guildId].announcements[platform] = [];
      }

      // Add the new channel config
      data[guildId].announcements[platform].push({
        channelId:        verified.id,
        displayName:      verified.displayName,
        handle:           verified.handle,
        nickname,
        discordChannelId,
        enabledTypes:     PLATFORM_CONTENT_TYPES[platform],
        customMessage:    null,
        mentions:         [],
        lastContentId:    null,
        lastTitle:        null,
        lastThumbnail:    null,
        lastMessageId:    null,
        editHistory:      [],
        checksAfterPost:  0,
        isCurrentlyLive:  false,
        postTime:         null,
        lastCheckTime:    null
      });

      saveData(data);
      pendingAdds.delete(pendingKey);

      await interaction.update({
        content:    `✅ Now monitoring **${verified.displayName}** (${verified.handle}) on ${platform}! Announcements will be posted in <#${discordChannelId}>.`,
        embeds:     [],
        components: []
      });
    }

    // ----------------------------------------------------------
    // Edit field selection
    // ----------------------------------------------------------
    else if (customId.startsWith("edit_field_")) {
      const selected = interaction.values[0];

      // format: editfield|field|nickname|platform
      const [, field, nickname, platform] = selected.split("|");

      const channelConfig = data[guildId].announcements[platform]?.find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      channelConfig.lastRumbleFail = Date.now();

      if (channelConfig.lastRumbleFail && Date.now() - channelConfig.lastRumbleFail < 600000) {
        return null; // skip for 10 minutes
      }

      if (!channelConfig) {
        await interaction.update({
          content:    "❌ Could not find that channel. Please try again.",
          components: []
        });
        return;
      }

      // For text fields show a modal
      if (field === "nickname" || field === "message" || field === "mentions") {
        const modal = new ModalBuilder()
          .setCustomId(`edit_modal_${field}_${nickname}_${platform}`)
          .setTitle(`Edit ${field}`);

        const input = new TextInputBuilder()
          .setCustomId("edit_input")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        if (field === "nickname") {
          input.setLabel("New nickname").setValue(channelConfig.nickname);
        } else if (field === "message") {
          input.setLabel("New announcement message").setValue(channelConfig.customMessage || "");
        } else if (field === "mentions") {
          input.setLabel("Role IDs separated by commas").setValue(
            channelConfig.mentions?.join(", ") || ""
          );
        }

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      }

      // For content types show a select menu
      else if (field === "contenttypes") {
        const contentTypes = PLATFORM_CONTENT_TYPES[platform];
        const currentTypes = channelConfig.enabledTypes || contentTypes;

        const typeRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`set_content_types_${guildId}_${nickname}_${platform}`)
            .setPlaceholder("Select which content types to announce")
            .setMinValues(1)
            .setMaxValues(contentTypes.length)
            .addOptions(
              contentTypes.map(type =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(type.charAt(0).toUpperCase() + type.slice(1))
                  .setValue(`contenttype|${type}|${nickname}|${platform}`)
                  .setDefault(currentTypes.includes(type))
              )
            )
        );

        await interaction.update({
          content:    `Select which content types should trigger announcements for **${channelConfig.displayName}**:`,
          components: [typeRow]
        });
      }

      // For Discord channel show instructions to re-add
      else if (field === "discordchannel") {
        await interaction.update({
          content:    `To change the announcement channel for **${channelConfig.displayName}**, please delete it with /announcement_delete and re-add it with the new Discord channel.`,
          components: []
        });
      }

      // For platform change show a select menu
      else if (field === "platform") {
        const platformRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`edit_platform_${guildId}`)
            .setPlaceholder("Select new platform")
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel("YouTube")
                .setValue(`newplatform|youtube|${nickname}|${platform}`),
              new StringSelectMenuOptionBuilder()
                .setLabel("Twitch")
                .setValue(`newplatform|twitch|${nickname}|${platform}`),
              new StringSelectMenuOptionBuilder()
                .setLabel("Rumble")
                .setValue(`newplatform|rumble|${nickname}|${platform}`)
            )
        );

        await interaction.update({
          content:    `Select the new platform for **${channelConfig.displayName}**:`,
          components: [platformRow]
        });
      }
    }

    // ----------------------------------------------------------
    // Platform edit confirmation
    // ----------------------------------------------------------
    else if (customId.startsWith("edit_platform_")) {
      const selected = interaction.values[0];

      // format: newplatform|newPlatform|nickname|oldPlatform
      const [, newPlatform, nickname, oldPlatform] = selected.split("|");

      const oldIndex = data[guildId].announcements[oldPlatform]?.findIndex(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (oldIndex === -1 || oldIndex === undefined) {
        await interaction.update({
          content:    "❌ Could not find that channel. Please try again.",
          components: []
        });
        return;
      }

      const [channelConfig] = data[guildId].announcements[oldPlatform].splice(oldIndex, 1);
      channelConfig.enabledTypes = PLATFORM_CONTENT_TYPES[newPlatform];

      if (!data[guildId].announcements[newPlatform]) {
        data[guildId].announcements[newPlatform] = [];
      }

      data[guildId].announcements[newPlatform].push(channelConfig);
      saveData(data);

      await interaction.update({
        content:    `✅ Moved **${channelConfig.displayName}** to ${newPlatform}.`,
        components: []
      });
    }

    // ----------------------------------------------------------
    // Content types selection
    // ----------------------------------------------------------
    else if (customId.startsWith("set_content_types_")) {
      const firstValue            = interaction.values[0];
      const [, , nickname, platform] = firstValue.split("|");

      const selectedTypes = interaction.values.map(v => v.split("|")[1]);

      const channelConfig = data[guildId].announcements[platform]?.find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (!channelConfig) {
        await interaction.update({
          content:    "❌ Could not find that channel. Please try again.",
          components: []
        });
        return;
      }

      channelConfig.enabledTypes = selectedTypes;
      saveData(data);

      await interaction.update({
        content:    `✅ Updated content types for **${channelConfig.displayName}** on ${platform}: ${selectedTypes.join(", ")}.`,
        components: []
      });
    }
  }

  // ============================================================
  // MODAL SUBMISSIONS
  // ============================================================
  else if (interaction.isModalSubmit()) {
    const { guildId, customId } = interaction;
    const data = loadData();

    if (customId.startsWith("edit_modal_")) {
      const parts    = customId.split("_");
      const field    = parts[2];
      const platform = parts[parts.length - 1];
      const nickname = parts.slice(3, parts.length - 1).join("_");

      const newValue = interaction.fields.getTextInputValue("edit_input");

      const channelConfig = data[guildId].announcements[platform]?.find(
        c => c.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (!channelConfig) {
        await interaction.reply({
          content:   "❌ Could not find that channel. Please try again.",
          ephemeral: true
        });
        return;
      }

      if (field === "nickname") {
        const taken = (data[guildId].announcements[platform] || []).find(
          c => c.nickname.toLowerCase() === newValue.toLowerCase() &&
               c.nickname.toLowerCase() !== nickname.toLowerCase()
        );
        if (taken) {
          await interaction.reply({
            content:   `❌ The nickname **${newValue}** is already in use on ${platform}. Please choose a different one.`,
            ephemeral: true
          });
          return;
        }
        channelConfig.nickname = newValue;

      } else if (field === "message") {
        channelConfig.customMessage = newValue;

      } else if (field === "mentions") {
        channelConfig.mentions = newValue
          .split(",")
          .map(id => id.trim())
          .filter(id => id.length > 0);
      }

      saveData(data);

      await interaction.reply({
        content:   `✅ Successfully updated **${field}** for **${channelConfig.displayName}** on ${platform}.`,
        ephemeral: true
      });
    }
  }
});

// Log the bot in using the token from the .env file
client.login(process.env.BOT_TOKEN);