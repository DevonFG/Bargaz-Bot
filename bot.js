require('dotenv').config(); // loads our .env file so process.env variables are available

const { Client, IntentsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js'); // import everything we need from discord.js
const { startYouTubeMonitor, refreshChannel } = require('./youtube'); // import our YouTube functions
const { loadData, saveData } = require('./storage'); // import our storage functions

// Set up the Discord client with the permissions it needs
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds, // allows the bot to see servers
    IntentsBitField.Flags.GuildMessages, // allows the bot to see messages
    IntentsBitField.Flags.MessageContent // allows the bot to read message content
  ]
});

// Define all of our slash commands
const commands = [
  // /ping command - basic test command
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  // /addyoutube command - lets admins add a YouTube channel to monitor
  new SlashCommandBuilder()
    .setName('addyoutube')
    .setDescription('Add a YouTube channel to monitor for new videos')
    .addStringOption(option =>
      option
        .setName('channelid')
        .setDescription('The YouTube channel ID to monitor')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('discordchannel')
        .setDescription('The Discord channel to post announcements in')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Custom announcement message (optional)')
        .setRequired(false)
    ),

  // /removeyoutube command - lets admins remove a monitored YouTube channel
  new SlashCommandBuilder()
    .setName('removeyoutube')
    .setDescription('Remove a YouTube channel from monitoring')
    .addStringOption(option =>
      option
        .setName('channelid')
        .setDescription('The YouTube channel ID to remove')
        .setRequired(true)
    ),

  // /listyoutube command - shows all monitored YouTube channels in this server
  new SlashCommandBuilder()
    .setName('listyoutube')
    .setDescription('List all YouTube channels being monitored in this server'),

  // /refresh command - forces a recheck of a specific creator
  new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Force a recheck of a specific YouTube creator')
    .addStringOption(option =>
      option
        .setName('channelid')
        .setDescription('The YouTube channel ID to refresh')
        .setRequired(true)
    ),

  // /setrefreshpermission command - lets admins control who can use /refresh
  new SlashCommandBuilder()
    .setName('setrefreshpermission')
    .setDescription('Set who can use the /refresh command')
    .addStringOption(option =>
      option
        .setName('permission')
        .setDescription('Who can use /refresh')
        .setRequired(true)
        .addChoices(
          { name: 'Admin only', value: 'admin' },
          { name: 'Specific role', value: 'role' },
          { name: 'Everyone', value: 'everyone' }
        )
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role that can use /refresh (only needed if you chose specific role)')
        .setRequired(false)
    ),
].map(command => command.toJSON()); // convert to JSON format for Discord's API

// When the bot first starts up and is ready
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register all slash commands with Discord
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id), // registers commands globally across all servers
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }

  // Start the YouTube monitor now that the bot is ready
  startYouTubeMonitor(client);
});

// Handle all incoming slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return; // ignore anything that isn't a slash command

  const { commandName, guildId } = interaction; // get the command name and server ID

  // Load the current data and make sure this server has an entry
  const data = loadData();
  if (!data[guildId]) data[guildId] = {}; // create empty entry for new servers

  // /ping command handler
  if (commandName === 'ping') {
    await interaction.reply('Pong!');
  }

  // /addyoutube command handler
  else if (commandName === 'addyoutube') {
    // Only server admins can add YouTube channels
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({ 
        content: '❌ You need to be an administrator to use this command.', 
        ephemeral: true 
      });
      return;
    }

    const youtubeChannelId = interaction.options.getString('channelid');
    const discordChannel = interaction.options.getChannel('discordchannel');
    const customMessage = interaction.options.getString('message'); // optional

    // Make sure youtube section exists in this server's data
    if (!data[guildId].youtube) data[guildId].youtube = { channels: [] };
    if (!data[guildId].youtube.channels) data[guildId].youtube.channels = [];

    // Check if this YouTube channel is already being monitored
    const exists = data[guildId].youtube.channels.find(
      c => c.youtubeChannelId === youtubeChannelId
    );

    if (exists) {
      await interaction.reply({ 
        content: '❌ That YouTube channel is already being monitored.', 
        ephemeral: true 
      });
      return;
    }

    // Add the new channel to the config
    data[guildId].youtube.channels.push({
      youtubeChannelId, // the YouTube channel ID
      discordChannelId: discordChannel.id, // the Discord channel to post in
      customMessage: customMessage || null, // custom message or null if not set
      lastVideoId: null, // no video announced yet
      lastTitle: null,
      lastThumbnail: null,
      lastMessageId: null,
      editHistory: [],
      checksAfterPost: 0
    });

    saveData(data);
    await interaction.reply({ 
      content: `✅ Now monitoring YouTube channel \`${youtubeChannelId}\` and posting in ${discordChannel}.`, 
      ephemeral: true 
    });
  }

  // /removeyoutube command handler
  else if (commandName === 'removeyoutube') {
    // Only admins can remove channels
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({ 
        content: '❌ You need to be an administrator to use this command.', 
        ephemeral: true 
      });
      return;
    }

    const youtubeChannelId = interaction.options.getString('channelid');

    if (!data[guildId].youtube || !data[guildId].youtube.channels) {
      await interaction.reply({ 
        content: '❌ No YouTube channels are being monitored in this server.', 
        ephemeral: true 
      });
      return;
    }

    // Filter out the channel they want to remove
    const before = data[guildId].youtube.channels.length;
    data[guildId].youtube.channels = data[guildId].youtube.channels.filter(
      c => c.youtubeChannelId !== youtubeChannelId
    );

    // If nothing was removed, that channel wasn't in the list
    if (data[guildId].youtube.channels.length === before) {
      await interaction.reply({ 
        content: '❌ That YouTube channel was not found in this server\'s monitoring list.', 
        ephemeral: true 
      });
      return;
    }

    saveData(data);
    await interaction.reply({ 
      content: `✅ Stopped monitoring YouTube channel \`${youtubeChannelId}\`.`, 
      ephemeral: true 
    });
  }

  // /listyoutube command handler
  else if (commandName === 'listyoutube') {
    if (!data[guildId].youtube || !data[guildId].youtube.channels || 
        data[guildId].youtube.channels.length === 0) {
      await interaction.reply({ 
        content: '❌ No YouTube channels are being monitored in this server.', 
        ephemeral: true 
      });
      return;
    }

    // Build a list of all monitored channels
    const list = data[guildId].youtube.channels
      .map(c => `• \`${c.youtubeChannelId}\` → <#${c.discordChannelId}>`)
      .join('\n');

    await interaction.reply({ 
      content: `📺 **Monitored YouTube Channels:**\n${list}`, 
      ephemeral: true 
    });
  }

  // /refresh command handler
  else if (commandName === 'refresh') {
    // Check permissions based on server's refresh permission setting
    const refreshPermission = data[guildId].youtube?.refreshPermission || 'admin';
    const refreshRoleId = data[guildId].youtube?.refreshRoleId || null;

    let hasPermission = false;

    if (refreshPermission === 'everyone') {
      hasPermission = true; // anyone can use it
    } else if (refreshPermission === 'role' && refreshRoleId) {
      hasPermission = interaction.member.roles.cache.has(refreshRoleId); // check if they have the role
    } else {
      hasPermission = interaction.member.permissions.has('Administrator'); // admin only by default
    }

    if (!hasPermission) {
      await interaction.reply({ 
        content: '❌ You don\'t have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }

    const youtubeChannelId = interaction.options.getString('channelid');
    await refreshChannel(client, guildId, youtubeChannelId, interaction);
  }

  // /setrefreshpermission command handler
  else if (commandName === 'setrefreshpermission') {
    // Only admins can change permission settings
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({ 
        content: '❌ You need to be an administrator to use this command.', 
        ephemeral: true 
      });
      return;
    }

    const permission = interaction.options.getString('permission');
    const role = interaction.options.getRole('role');

    // Make sure youtube section exists
    if (!data[guildId].youtube) data[guildId].youtube = { channels: [] };

    data[guildId].youtube.refreshPermission = permission;

    // If they chose role based, save the role ID
    if (permission === 'role') {
      if (!role) {
        await interaction.reply({ 
          content: '❌ Please specify a role when using the role permission option.', 
          ephemeral: true 
        });
        return;
      }
      data[guildId].youtube.refreshRoleId = role.id;
    }

    saveData(data);
    await interaction.reply({ 
      content: `✅ Refresh permission set to: **${permission}**${role ? ` (${role.name})` : ''}.`, 
      ephemeral: true 
    });
  }
});

// Log the bot in using the token from our .env file
client.login(process.env.BOT_TOKEN);
