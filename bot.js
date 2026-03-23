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
  StringSelectMenuOptionBuilder
} = require("discord.js"); // import everything we need from discord.js

const { startMonitor, refreshChannel, verifyChannel, parseChannelInput, PLATFORM_CONTENT_TYPES, pendingAdds } = require("./announcements"); // import announcement functions
const { loadData, saveData } = require("./storage"); // import storage functions

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
  // /ping - basic test command
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),

  // /add - add a channel to monitor
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a YouTube, Twitch, or Rumble channel to monitor")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is this channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
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

  // /remove - remove or edit a monitored channel
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove or edit a monitored channel")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("action")
        .setDescription("What do you want to do?")
        .setRequired(true)
        .addChoices(
          { name: "Remove a channel",        value: "remove" },
          { name: "Edit channel information", value: "edit"   }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to remove or edit")
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
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
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
    .setDescription("Force a recheck of a specific monitored channel")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to refresh")
        .setRequired(true)
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
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
        )
    ),

  // /setcontenttypes - set which content types trigger announcements for a channel
  new SlashCommandBuilder()
    .setName("setcontenttypes")
    .setDescription("Set which content types trigger announcements for a channel")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Which platform is the channel on?")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitch",  value: "twitch"  },
          { name: "Rumble",  value: "rumble"  }
        )
    )
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("The nickname of the channel to update")
        .setRequired(true)
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

].map(command => command.toJSON()); // convert to JSON format for Discord's API

// When the bot first starts up and is ready
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register all slash commands globally with Discord
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(client.user.id), // registers commands across all servers
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (error) {
    console.error("Error registering commands:", error);
  }

  // Start the announcement monitor for all platforms
  startMonitor(client);
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
    // /ping
    // ----------------------------------------------------------
    if (commandName === "ping") {
      await interaction.reply("Pong!");
    }

    // ----------------------------------------------------------
    // /add
    // ----------------------------------------------------------
    else if (commandName === "add") {
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

      if (!verified) {
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
      // We store the verified channel data in memory instead of in the select menu value
      // This avoids Discord's 100 character limit on select menu values
      const pendingKey = `${guildId}_${interaction.user.id}_${Date.now()}`;
      pendingAdds.set(pendingKey, {
        platform,
        verified,
        nickname,
        discordChannelId: discordChannel.id,
        expires: Date.now() + 300000 // expires after 5 minutes
      });

      // Build a preview embed so the admin can see what announcements will look like
      const { EmbedBuilder } = require("discord.js");
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

      if (verified.thumbnail) previewEmbed.setThumbnail(verified.thumbnail);

      // Show preview with confirm/cancel select menu
      // We only store the pendingKey in the value, not all the channel data
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
    // /remove
    // ----------------------------------------------------------
    else if (commandName === "remove") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform = interaction.options.getString("platform");
      const action   = interaction.options.getString("action");
      const nickname = interaction.options.getString("nickname");

      // Find the channel on the specified platform
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

      // REMOVE action
      if (action === "remove") {
        data[guildId].announcements[platform] = data[guildId].announcements[platform].filter(
          c => c.nickname.toLowerCase() !== nickname.toLowerCase()
        );
        saveData(data);
        await interaction.reply({
          content:   `✅ Successfully removed **${foundConfig.displayName}** (${nickname}) from ${platform} monitoring.`,
          ephemeral: true
        });
      }

      // EDIT action - show a select menu of what to edit
      else if (action === "edit") {
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
                .setValue(`editfield|mentions|${nickname}|${platform}`)
            )
        );

        await interaction.reply({
          content:    `What would you like to edit for **${foundConfig.displayName}** (${nickname}) on ${platform}?`,
          components: [editRow],
          ephemeral:  true
        });
      }
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

      // Find the channel on the specified platform
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

      // Update custom message if provided
      if (customMessage) {
        foundConfig.customMessage = customMessage;
      }

      // Update mentions if provided
      // Expects comma separated role IDs e.g. "123456,789012"
      if (mentionsInput) {
        foundConfig.mentions = mentionsInput
          .split(",")                 // split by comma
          .map(id => id.trim())       // remove any spaces
          .filter(id => id.length > 0); // remove empty entries
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
      await refreshChannel(client, guildId, nickname, platform, interaction);
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

      // Build a formatted list of all monitored channels for this platform
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
    // /setcontenttypes
    // ----------------------------------------------------------
    else if (commandName === "setcontenttypes") {
      if (!isAdmin) {
        await interaction.reply({
          content:   "❌ You need to be an administrator to use this command.",
          ephemeral: true
        });
        return;
      }

      const platform = interaction.options.getString("platform");
      const nickname = interaction.options.getString("nickname");

      // Find the channel on the specified platform
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
          content:   `❌ No ${platform} channel found with the nickname **${nickname}**.`,
          ephemeral: true
        });
        return;
      }

      // Build a select menu with all available content types for this platform
      const contentTypes = PLATFORM_CONTENT_TYPES[platform];
      const currentTypes = foundConfig.enabledTypes || contentTypes;

      const typeRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`set_content_types_${guildId}_${nickname}_${platform}`)
          .setPlaceholder("Select which content types to announce")
          .setMinValues(1)                   // must select at least 1
          .setMaxValues(contentTypes.length) // can select all
          .addOptions(
            contentTypes.map(type =>
              new StringSelectMenuOptionBuilder()
                .setLabel(type.charAt(0).toUpperCase() + type.slice(1)) // capitalize first letter
                .setValue(`contenttype|${type}|${nickname}|${platform}`)
                .setDefault(currentTypes.includes(type)) // pre-select currently enabled types
            )
          )
      );

      await interaction.reply({
        content:    `Select which content types should trigger announcements for **${foundConfig.displayName}** on ${platform}:`,
        components: [typeRow],
        ephemeral:  true
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
        // Pending add expired or not found
        await interaction.update({
          content:    "❌ This confirmation has expired. Please run /add again.",
          embeds:     [],
          components: []
        });
        pendingAdds.delete(pendingKey);
        return;
      }

      const { platform, verified, nickname, discordChannelId } = pending;

      if (!data[guildId].announcements[platform]) {
        data[guildId].announcements[platform] = [];
      }

      // Add the new channel config
      data[guildId].announcements[platform].push({
        channelId:        verified.id,                          // platform channel ID
        displayName:      verified.displayName,                 // display name from platform
        handle:           verified.handle,                      // @ handle
        nickname,                                               // server nickname for commands
        discordChannelId,                                       // Discord channel to post in
        enabledTypes:     PLATFORM_CONTENT_TYPES[platform],    // all types enabled by default
        customMessage:    null,                                 // no custom message yet
        mentions:         [],                                   // no mentions yet
        lastContentId:    null,                                 // no content announced yet
        lastTitle:        null,
        lastThumbnail:    null,
        lastMessageId:    null,
        editHistory:      [],
        checksAfterPost:  0,
        isCurrentlyLive:  false
      });

      saveData(data);
      pendingAdds.delete(pendingKey); // clean up pending add from memory

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

      // Find the channel config
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

      // For text fields, show a modal for input
      if (field === "nickname" || field === "message" || field === "mentions") {
        const modal = new ModalBuilder()
          .setCustomId(`edit_modal_${field}_${nickname}_${platform}`)
          .setTitle(`Edit ${field}`);

        const input = new TextInputBuilder()
          .setCustomId("edit_input")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        // Customize the modal label based on what's being edited
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

      // Discord modals don't support channel pickers so we ask them to re-add instead
      else if (field === "discordchannel") {
        await interaction.update({
          content:    `To change the announcement channel for **${channelConfig.displayName}**, please remove it with /remove and re-add it with the new Discord channel.`,
          components: []
        });
      }

      // For platform change, show a select menu
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

      // Find and remove from old platform
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

      // Move the config to the new platform
      const [channelConfig] = data[guildId].announcements[oldPlatform].splice(oldIndex, 1);
      channelConfig.enabledTypes = PLATFORM_CONTENT_TYPES[newPlatform]; // reset content types for new platform

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
      // format of each value: contenttype|type|nickname|platform
      const firstValue    = interaction.values[0];
      const [, , nickname, platform] = firstValue.split("|");

      // Extract just the content type names from all selected values
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

    // format: edit_modal_field_nickname_platform
    if (customId.startsWith("edit_modal_")) {
      const parts    = customId.split("_");
      const field    = parts[2];                // what field we're editing
      const platform = parts[parts.length - 1]; // last part is always platform
      // nickname is everything between field and platform
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
        // Check new nickname isn't already taken on this platform
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