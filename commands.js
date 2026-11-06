import * as discord        from "discord.js";
import * as channelManager from "./channelManager.js";
import * as logging        from "./logging.js";
import * as permissions    from "./permissions.js";
import * as notifications  from "./notifications.js";
import * as entitlements   from "./entitlements.js";

// Checks whether a member can execute a specific command
// interaction = ChatInputCommandInteraction
// command = String, command name
// subcommand = String, subcommand name
async function requireCommandAccess(interaction, command, subcommand) {
  if (!interaction.guild) {
    await interaction.reply({content: "This command can only be used in a Discord server.", flags: discord.MessageFlags.Ephemeral});
    return false;
  }
  if (command === "permissions" && subcommand === "list") {return true;}
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
  if (permissions.canUseCommand(member, command, subcommand)) {return true;}
  await interaction.reply({
    content: `You do not have permission to use \`/${command} ${subcommand}\` in this server.`,
    flags: discord.MessageFlags.Ephemeral
  });
  return false;
}

// Adds supported creator platforms to a command option
// option = SlashCommandStringOption
function addPlatformChoices(option) {
  return option.addChoices({name: "YouTube", value: "youtube"}, {name: "Twitch", value: "twitch"}, {name: "Kick", value: "kick"});
}

const commands = [
  new discord.SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks whether BargazBot is responding."),
  new discord.SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows information about BargazBot's commands."),
  //===================================================
  // Creator Notifications
  //===================================================
  new discord.SlashCommandBuilder()
    .setName("notification")
    .setDescription("Manage creator notifications.")
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a creator notification.")
        .addStringOption(option =>
          addPlatformChoices(option
            .setName("platform")
            .setDescription("The creator's platform.")
            .setRequired(true)
          )
        )
        .addStringOption(option => option
          .setName("creator")
          .setDescription("The creator's channel URL, handle, or username.")
          .setRequired(true)
        )
        .addStringOption(option => option
          .setName("nickname")
          .setDescription("A nickname used to manage this notification.")
          .setRequired(true)
        )
        .addChannelOption(option => option
          .setName("channel")
          .setDescription("The Discord channel where notifications will be sent.")
          .setRequired(false)
          .addChannelTypes(discord.ChannelType.GuildText, discord.ChannelType.GuildAnnouncement)
        )
        .addStringOption(option => option
          .setName("message")
          .setDescription("Optional custom message sent with this creator's notifications.")
          .setRequired(false)
          .setMaxLength(2000)
        )
    )
    .addSubcommand(subcommand => subcommand
      .setName("delete")
      .setDescription("Delete a creator notification.")
      .addStringOption(option =>
        addPlatformChoices(option
          .setName("platform")
          .setDescription("The notification's platform.")
          .setRequired(true)
        )
      )
      .addStringOption(option => option
        .setName("nickname")
        .setDescription("The notification nickname.")
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("edit")
      .setDescription("Rename a creator notification.")
      .addStringOption(option =>
        addPlatformChoices(option
          .setName("platform")
          .setDescription("The notification's platform.")
          .setRequired(true)
        )
      )
      .addStringOption(option => option
        .setName("nickname")
        .setDescription("The notification's current nickname.")
        .setRequired(true)
      )
      .addStringOption(option => option
        .setName("new-nickname")
        .setDescription("The new nickname.")
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("message")
      .setDescription("Configure a creator's notification message.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("The notification's platform.")
        .setRequired(true)
      ))
      .addStringOption(option => option
        .setName("nickname")
        .setDescription("The notification nickname.")
        .setRequired(true)
      )
      .addStringOption(option => option
        .setName("message")
        .setDescription("Custom message, or leave blank to restore the default.")
        .setRequired(false)
        .setMaxLength(2000)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("channel")
      .setDescription("Change a creator notification's destination channel.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("The notification's platform.")
        .setRequired(true)
      ))
      .addStringOption(option => option
        .setName("nickname")
        .setDescription("The notification nickname.")
        .setRequired(true)
      )
      .addChannelOption(option =>option
        .setName("channel")
        .setDescription("The Discord channel where notifications will be sent.")
        .setRequired(true)
        .addChannelTypes(discord.ChannelType.GuildText, discord.ChannelType.GuildAnnouncement)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("refresh")
      .setDescription("Refresh information for a creator notification.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("The notification's platform.")
        .setRequired(true)
      ))
      .addStringOption(option => option
        .setName("nickname")
        .setDescription("The notification nickname.")
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("list")
      .setDescription("List this server's creator notifications.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("Only show notifications from one platform.")
        .setRequired(false)
      ))
    ),
  
  //===================================================
  // Channel Configuration
  //===================================================
  new discord.SlashCommandBuilder()
    .setName("channels")
    .setDescription("Configure the channels used by BargazBot.")
    .addSubcommand(subcommand => subcommand
      .setName("set")
      .setDescription("Change the channel used by a feature.")
      .addStringOption(option => option
        .setName("purpose")
        .setDescription("The feature to configure.")
        .setRequired(true)
        .addChoices(
          {name:"Creator notification fallback", value:"notifications"},
          {name:"Welcome messages",              value:"welcome"},
          {name:"Goodbye messages",              value:"goodbye"},
          {name:"Server logs",                   value:"logs"},
          {name:"BargazBot status",              value:"status"}
        )
      )
      .addChannelOption(option => option
        .setName("channel")
        .setDescription("The channel to use for this feature.")
        .addChannelTypes(discord.ChannelType.GuildText, discord.ChannelType.GuildAnnouncement)
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName("list")
      .setDescription("Show the channels currently used by BargazBot.")
    ),
  //===================================================
  // Entitlements
  //===================================================
  new discord.SlashCommandBuilder()
    .setName("entitlement")
    .setDescription("Manage your BargazBot entitlement allocation.")
    .addSubcommand(subcommand => subcommand
      .setName("allocate")
      .setDescription("Allocate some of your entitlement to this server.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("The platform to allocate.")
        .setRequired(true)
      ))
      .addStringOption(option => option
        .setName("limit")
        .setDescription('The number of notifications to allocate, or "unlimited".')
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand =>subcommand
      .setName("remove")
      .setDescription("Remove your allocation for a platform from this server.")
      .addStringOption(option => addPlatformChoices(option
        .setName("platform")
        .setDescription("The platform allocation to remove.")
        .setRequired(true)
      ))
    )
    .addSubcommand(subcommand => subcommand
      .setName("view")
      .setDescription("View your entitlements and allocations for this server.")
    ),
  //===================================================
  // Permissions
  //===================================================
    new discord.SlashCommandBuilder()
      .setName("permissions")
      .setDescription("Manage access to BargazBot commands.")
      .addSubcommand(subcommand => subcommand
        .setName("add")
        .setDescription("Grant a user or role access to BargazBot.")
        .addMentionableOption(option => option
          .setName("target")
          .setDescription("The user or role to authorize.")
          .setRequired(false))
        .addBooleanOption(option => option
          .setName("everyone")
          .setDescription("Authorize the @everyone role instead.")
          .setRequired(false)))
      .addSubcommand(subcommand => subcommand
        .setName("edit")
        .setDescription("Edit an existing user or role permission profile.")
        .addMentionableOption(option => option
          .setName("target")
          .setDescription("The user or role to edit.")
          .setRequired(false))
        .addBooleanOption(option => option
          .setName("everyone")
          .setDescription("Edit the @everyone role instead.")
          .setRequired(false)))
      .addSubcommand(subcommand => subcommand
        .setName("remove")
        .setDescription("Remove an explicitly assigned user or role permission.")
        .addMentionableOption(option => option
          .setName("target")
          .setDescription("The user or role to remove.")
          .setRequired(true)))
      .addSubcommand(subcommand => subcommand
        .setName("list")
        .setDescription("View inherited, assigned, and public BargazBot permissions."))
];

// Registers BargazBot's slash commands with Discord
// client = Discord Client
export async function registerCommands(client) {
  const commandData = commands.map(command => command.toJSON());
  await client.application.commands.set(commandData);
  console.log(`Registered ${commandData.length} BargazBot commands.`);
}

// Registers BargazBot's slash commands with Discord
// client = Discord Client
export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) {return;}
  try {
    if (interaction.guild) {channelManager.ensureGuildData(interaction.guild);}
    entitlements.ensureUser(interaction.user);
    switch (interaction.commandName) {
      case "ping":         await handlePing(interaction); break;
      case "help":         await handleHelp(interaction); break;
      case "channels":     await handleChannels(interaction); break;
      case "entitlement":  await handleEntitlement(interaction); break;
      case "permissions":  await handlePermissions(interaction); break;
      case "notification": await handleNotification(interaction); break;
      default: await interaction.reply({content: "BargazBot does not recognize this command.", flags: discord.MessageFlags.Ephemeral});
    }
    if (interaction.guild) {await logging.logCommand(interaction);}
  } catch (error) {
    console.error(`Error handling /${interaction.commandName}:`,error);
    const response = {
      content:"BargazBot encountered an error while processing that command.",
      flags: discord.MessageFlags.Ephemeral
    };
    if (interaction.guild) {
      await logging.logCommand(
        interaction, {successful: false, details: error.message}
      ).catch(loggingError => {console.error("Failed to log command error:", loggingError);});
    }
    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp(response)
        .catch(() => {});
    } else {
      await interaction
        .reply(response)
        .catch(() => {});
    }
  }
}

// Responds to the ping command
// interaction = ChatInputCommandInteraction
async function handlePing(interaction) {await interaction.reply({content: "Pong!", flags: discord.MessageFlags.Ephemeral});}

// Displays BargazBot's command help information
// interaction = ChatInputCommandInteraction
async function handleHelp(interaction) {
  const embed =
    new discord.EmbedBuilder()
      .setTitle("BargazBot Help")
      .setDescription("BargazBot provides creator notifications and server management features.")
      .addFields(
        {name:"/notification", value:"Manage YouTube, Twitch, and Kick creator notifications."},
        {name:"/channels",     value:"Configure BargazBot's server-wide feature channels."},
        {name:"/entitlement",  value:"Allocate your creator-notification entitlement to this server."},
        {name: "/permissions", value: "Manage Full, Configuration, and Custom Access for users and roles. Includes add, edit, remove, and list commands."},
        {name:"/ping",         value:"Check whether BargazBot is responding."}
      )
      .setTimestamp();
  await interaction.reply({embeds: [embed], flags:discord.MessageFlags.Ephemeral});
}

// Routes channel commands after checking individual access
// interaction = ChatInputCommandInteraction
async function handleChannels(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (!await requireCommandAccess(interaction, "channels", subcommand)) {return;}
  switch (subcommand) {
    case "set": await handleChannelSet(interaction); break;
    case "list": await handleChannelList(interaction); break;
  }
}

// Sets a server channel for a BargazBot feature
// interaction = ChatInputCommandInteraction
async function handleChannelSet(interaction) {
  const purpose = interaction.options.getString("purpose", true);
  const channel = interaction.options.getChannel("channel", true);
  channelManager.setChannel(interaction.guild.id, purpose, channel.id);
  await logging.logConfigurationChange(interaction.guild,{
    user:interaction.user,
    title:"BargazBot Channel Changed",
    description:`${interaction.user} changed a BargazBot channel setting.`,
    fields: [
        {name:"Purpose",     value:purpose,      inline:true},
        {name:"New Channel", value:`${channel}`, inline: true}
      ]
  });
  await interaction.reply({content:`The **${purpose}** channel has been changed to ${channel}.`, flags:discord.MessageFlags.Ephemeral});
}

// Displays the server's configured BargazBot channels
// interaction = ChatInputCommandInteraction
async function handleChannelList(interaction) {
  const settings = channelManager.getChannelAssignments(interaction.guild.id);
  const formatChannel = channelId => channelId? `<#${channelId}>` : "Not configured";
  const embed =
    new discord.EmbedBuilder()
      .setTitle("BargazBot Channels")
      .addFields(
        {name:"Creator notification fallback", value:formatChannel(settings?.announcement_channel_id)},
        {name:"Welcome messages",              value:formatChannel(settings?.welcome_channel_id)},
        {name:"Goodbye messages",              value:formatChannel(settings?.goodbye_channel_id)},
        {name:"Server logs",                   value:formatChannel(settings?.logs_channel_id)},
        {name:"Status",                        value:formatChannel(settings?.status_channel_id)}
      )
      .setTimestamp();
  await interaction.reply({embeds: [embed], flags:discord.MessageFlags.Ephemeral});
}

// Routes entitlement commands after checking individual access
// interaction = ChatInputCommandInteraction
async function handleEntitlement(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (!await requireCommandAccess(interaction, "entitlement", subcommand)) {return;}
  switch (subcommand) {
    case "allocate": await handleEntitlementAllocate(interaction); break;
    case "remove": await handleEntitlementRemove(interaction); break;
    case "view": await handleEntitlementView(interaction); break;
  }
}

// Allocates a user's notification entitlement to the server
// interaction = ChatInputCommandInteraction
async function handleEntitlementAllocate(interaction) {
  const platform = interaction.options.getString("platform", true);
  const limitInput = interaction.options
    .getString("limit",true)
    .trim()
    .toLowerCase();
  let amount;

  if (limitInput === "unlimited") {amount = null;} else {
    amount = Number(limitInput);
    if (!Number.isInteger(amount) || amount < 0) {
      await interaction.reply({
        content:'The limit must be a whole number of 0 or greater, or the word **unlimited**.',
        flags:discord.MessageFlags.Ephemeral
      });
      return;
    }
  }
  const result = entitlements.setAllocation(interaction.user.id, interaction.guild.id, platform, amount);
  if (!result.success) {
    let message;
    switch (result.reason) {
      case "no-entitlement":      message = "You do not currently have a BargazBot entitlement for this platform."; break;
      case "not-unlimited":       message = "Your entitlement is not unlimited, so you cannot allocate unlimited capacity."; break;
      case "exceeds-entitlement": message = `That allocation exceeds your available entitlement. ` + `You can currently allocate up to **${result.available}** more to this server.`; break;
      case "allocation-conflict": message = "Your existing allocations conflict with this entitlement. Please review your allocations."; break;
      default:                    message = "BargazBot could not update that entitlement allocation.";
    }
    await interaction.reply({content: message, flags:discord.MessageFlags.Ephemeral});
    return;
  }
  await interaction.reply({
    content:result.unlimited
      ? `Allocated **unlimited ${notifications.getPlatformName(platform)}** creator-notification capacity to this server.`
      : `Allocated **${result.amount} ${notifications.getPlatformName(platform)}** creator-notification slot${result.amount === 1 ? "" : "s"} to this server.`,
    flags:discord.MessageFlags.Ephemeral
  });
}

// Removes a user's platform entitlement allocation from the server
// interaction = ChatInputCommandInteraction
async function handleEntitlementRemove(interaction) {
  const platform = interaction.options.getString("platform", true);
  const removed = entitlements.removeAllocation(interaction.user.id, interaction.guild.id, platform);
  await interaction.reply({
    content:removed
      ? `Your ${notifications.getPlatformName(platform)} allocation to this server has been set to **0**.`
      : `You did not have an entitlement allocation for ${notifications.getPlatformName(platform)} in this server.`,
    flags:discord.MessageFlags.Ephemeral
  });
}

// Displays a user's entitlements and server allocations
// interaction = ChatInputCommandInteraction
async function handleEntitlementView(interaction) {
  const summary = entitlements.getAllocationSummary(interaction.user.id, interaction.guild.id);
  if (!summary.entitlements) {await interaction.reply({content:"You do not currently have a BargazBot entitlement record.", flags:discord.MessageFlags.Ephemeral}); return;}
  const formatEntitlement = value => value === null ? "Unlimited" : String(value);
  const formatAllocation  = value => value === null ? "Unlimited" : String(value ?? 0);
  const allocation = summary.allocation ?? {};
  const embed =
    new discord.EmbedBuilder()
      .setTitle("Your BargazBot Entitlements")
      .setDescription("Entitlements are your total capacity. Allocations are the capacity you have contributed to this server.")
      .addFields(
        { name: "YouTube",
          value:`Entitlement: **${formatEntitlement(summary.entitlements.youtube_limit)}**\n` + `This server: **${formatAllocation(allocation.youtube_limit)}**`,
          inline: true },
        { name: "Twitch",
          value: `Entitlement: **${formatEntitlement(summary.entitlements.twitch_limit)}**\n` + `This server: **${formatAllocation(allocation.twitch_limit)}**`,
          inline: true },
        { name: "Kick", 
          value:`Entitlement: **${formatEntitlement(summary.entitlements.kick_limit)}**\n` + `This server: **${formatAllocation(allocation.kick_limit)}**`,
          inline: true }
      )
      .setTimestamp();
  await interaction.reply({embeds: [embed], flags:discord.MessageFlags.Ephemeral});
}

// Formats a permission target for Discord
// type = String, "user" or "role"
// id = String, Discord ID
function permissionTargetMention(type, id) {return type === permissions.PERMISSION_TYPES.ROLE ? `<@&${id}>` : `<@${id}>`;}

// Retrieves a user or role selected for permission management
// interaction = ChatInputCommandInteraction
function getPermissionTarget(interaction) {
  const everyone = interaction.options.getBoolean("everyone") ?? false;
  const target   = interaction.options.getMentionable("target");
  if (everyone && target) {return {error: "Select either a user/role or @everyone, not both."};}
  if (everyone)           {return {type: permissions.PERMISSION_TYPES.ROLE, id: interaction.guild.id, mention: "@everyone"};}
  if (!target)            {return {error: "You must select a user or role."};}
  const isRole = target instanceof discord.Role;
  const type   = isRole ? permissions.PERMISSION_TYPES.ROLE : permissions.PERMISSION_TYPES.USER;
  return {type, id: target.id, mention: isRole && target.id === interaction.guild.id ? "@everyone" : permissionTargetMention(type, target.id)};
}

// Creates a reusable access-level selection menu
// selected = String, current access level
function buildAccessLevelMenu(selected) {
  return new discord.ActionRowBuilder().addComponents(
    new discord.StringSelectMenuBuilder()
      .setCustomId("permission:level")
      .setPlaceholder("Choose an access level")
      .addOptions([
        {label: "Full Access", value: permissions.ACCESS_LEVELS.FULL, description: "All commands, including permission management", default: selected === permissions.ACCESS_LEVELS.FULL},
        {label: "Configuration Access", value: permissions.ACCESS_LEVELS.CONFIGURATION, description: "All configuration commands except /permissions", default: selected === permissions.ACCESS_LEVELS.CONFIGURATION},
        {label: "Custom Access", value: permissions.ACCESS_LEVELS.CUSTOM, description: "Select individual commands and subcommands", default: selected === permissions.ACCESS_LEVELS.CUSTOM}
      ])
  );
}

// Creates a command-category selection menu
// selected = String, selected command category
function buildCommandCategoryMenu(selected) {
  return new discord.ActionRowBuilder().addComponents(
    new discord.StringSelectMenuBuilder()
      .setCustomId("permission:category")
      .setPlaceholder("Choose a command category")
      .addOptions(Object.keys(permissions.COMMAND_PERMISSIONS).map(command => ({label: `/${command}`, value: command, default: selected === command})))
  );
}

// Creates the subcommand selection menu for one category
// category = String, command category
// selected = Set of Strings, selected command identifiers
function buildCustomCommandMenu(category, selected) {
  return new discord.ActionRowBuilder().addComponents(
    new discord.StringSelectMenuBuilder()
      .setCustomId("permission:commands")
      .setPlaceholder(`Select /${category} subcommands`)
      .setMinValues(0)
      .setMaxValues(permissions.COMMAND_PERMISSIONS[category].length)
      .addOptions(permissions.COMMAND_PERMISSIONS[category].map(subcommand => ({label: `/${category} ${subcommand}`, value: `${category}.${subcommand}`, default: selected.has(`${category}.${subcommand}`)})))
  );
}

// Creates navigation and confirmation buttons
// custom = Boolean, whether Custom Access is selected
function buildPermissionEditorButtons(custom) {
  return new discord.ActionRowBuilder().addComponents(
    new discord.ButtonBuilder().setCustomId("permission:review").setLabel("Review Changes").setStyle(discord.ButtonStyle.Primary),
    new discord.ButtonBuilder().setCustomId("permission:cancel").setLabel("Cancel").setStyle(discord.ButtonStyle.Secondary)
  );
}

// Formats a saved or proposed permission profile
// profile = Object or null
function formatPermissionProfile(profile) {
  if (!profile) {return "No explicit access";}
  if (profile.accessLevel === permissions.ACCESS_LEVELS.FULL) {return "Full Access";}
  if (profile.accessLevel === permissions.ACCESS_LEVELS.CONFIGURATION) {return "Configuration Access";}
  const selected    = permissions.getProfileCommands(profile);
  const all         = Object.entries(permissions.COMMAND_PERMISSIONS).flatMap(([command, names]) => names.map(name => `${command}.${name}`));
  const missing     = all.filter(command => !selected.includes(command));
  const useMissing  = missing.length > 0 && missing.length < selected.length;
  const shown       = useMissing ? missing : selected;
  const prefix      = useMissing ? "Custom Access — all except " : "Custom Access — only ";
  const description = shown.map(name => `\`/${name.replace(".", " ")}\``).join(", ");
  if (!shown.length)                             {return "Custom Access — none";}
  if (prefix.length + description.length <= 600) {return prefix + description;}
  return `${prefix}${shown.length} commands (${shown.slice(0, 5).map(name => `\`/${name.replace(".", " ")}\``).join(", ")}, and more)`;
}

// Creates the permission editor message
// target = Object, selected user or role
// level = String, access level
// category = String, selected command category
// selected = Set of Strings, selected commands
function buildPermissionEditor(target, level, category, selected) {
  const profile = {accessLevel: level, commands: [...selected]};
  const embed   = new discord.EmbedBuilder()
    .setTitle(`Edit BargazBot Permissions`)
    .setDescription(`Target: ${target.mention}\n\n**Selected Access:** ${formatPermissionProfile(profile)}\n\nChoose an access level. For Custom Access, select a category and its allowed subcommands.`);
  const components = [buildAccessLevelMenu(level)];
  if (level === permissions.ACCESS_LEVELS.CUSTOM) {components.push(buildCommandCategoryMenu(category)); components.push(buildCustomCommandMenu(category, selected));}
  components.push(buildPermissionEditorButtons(level === permissions.ACCESS_LEVELS.CUSTOM));
  return {embeds: [embed], components};
}

// Creates a confirmation screen with the permission differences
// target = Object
// oldProfile = Object or null
// newProfile = Object
function buildPermissionReview(target, oldProfile, newProfile) {
  const changes = permissions.comparePermissionProfiles(oldProfile, newProfile);
  const format  = values => values.length ? values.map(value => `\`/${value.replace(".", " ")}\``).join(", ").slice(0, 950) : "None";
  const embed   = new discord.EmbedBuilder()
    .setTitle("Confirm Permission Changes")
    .setDescription(`Target: ${target.mention}\n\n**Before:** ${formatPermissionProfile(oldProfile)}\n**After:** ${formatPermissionProfile(newProfile)}`)
    .addFields({name: "Commands Added", value: format(changes.added)}, {name: "Commands Removed", value: format(changes.removed)});
  const buttons = new discord.ActionRowBuilder().addComponents(
    new discord.ButtonBuilder().setCustomId("permission:save")  .setLabel("Confirm Changes").setStyle(discord.ButtonStyle.Success),
    new discord.ButtonBuilder().setCustomId("permission:back")  .setLabel("Back").setStyle(discord.ButtonStyle.Secondary),
    new discord.ButtonBuilder().setCustomId("permission:cancel").setLabel("Cancel").setStyle(discord.ButtonStyle.Danger)
  );
  return {embeds: [embed], components: [buttons]};
}

// Records which members currently have entitlement allocation access
// guild = Guild
// target = Object, permission target
async function getAllocationAccessSnapshot(guild, target) {
  const members = await guild.members.fetch();
  const affected = [...members.values()].filter(member =>
    !member.user.bot && (target.type === permissions.PERMISSION_TYPES.ROLE ? target.id === guild.id || member.roles.cache.has(target.id) : member.id === target.id)
  ); return affected.map(member => ({member, allowed: permissions.canUseCommand(member, "entitlement", "allocate")}));
}

// Removes allocations only from members who lost effective allocation access
// snapshot = Array, previous permission states
function cleanupRevokedAllocations(snapshot) {
  for (const {member, allowed} of snapshot) {
    if (allowed && !permissions.canUseCommand(member, "entitlement", "allocate")) {entitlements.removeGuildAllocations(member.id, member.guild.id);}
  }
}

// Routes the four permission commands
// interaction = ChatInputCommandInteraction
async function handlePermissions(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (!await requireCommandAccess(interaction, "permissions", subcommand)) {return;}
  switch (subcommand) {
    case "add":    await handlePermissionEditor(interaction, false); break;
    case "edit":   await handlePermissionEditor(interaction, true); break;
    case "remove": await handlePermissionRemove(interaction); break;
    case "list":   await handlePermissionList(interaction); break;
  }
}

// Opens an interactive editor for a user or role
// interaction = ChatInputCommandInteraction
// editing = Boolean, true for edit and false for add
async function handlePermissionEditor(interaction, editing) {
  const target = getPermissionTarget(interaction);
  if (target.error) {await interaction.reply({content: target.error, flags: discord.MessageFlags.Ephemeral}); return;}
  const original = permissions.getPermissionProfile(interaction.guild.id, target.type, target.id);
  if (editing && !original) {await interaction.reply({content: `${target.mention} does not have an explicit permission profile. Use \`/permissions add\` first.`, flags: discord.MessageFlags.Ephemeral}); return;}
  if (!editing && original) {await interaction.reply({content: `${target.mention} already has a permission profile. Use \`/permissions edit\` instead.`, flags: discord.MessageFlags.Ephemeral}); return;}
  let level     = original?.accessLevel ?? permissions.ACCESS_LEVELS.CONFIGURATION;
  let category  = "notification";
  let selected  = new Set(original?.commands ?? []);
  let reviewing = false;
  await interaction.reply({...buildPermissionEditor(target, level, category, selected), flags: discord.MessageFlags.Ephemeral});
  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({time: 300000});
  collector.on("collect", async component => {
    if (component.user.id !== interaction.user.id) {await component.reply({content: "Only the person who opened this editor can use it.", flags: discord.MessageFlags.Ephemeral});return;}
    if (!permissions.canUseCommand(component.member, "permissions", editing ? "edit" : "add")) {await component.update({content: "You no longer have permission to perform this action.", embeds: [], components: []}); collector.stop("denied"); return;}
    try {
      if (component.customId === "permission:cancel")   {await component.update({content: "Permission changes cancelled.", embeds: [], components: []}); collector.stop("cancelled"); return;}
      if (component.customId === "permission:level")    {level = component.values[0]; reviewing = false;}
      if (component.customId === "permission:category") {category = component.values[0]; reviewing = false;}
      if (component.customId === "permission:commands") {
        const prefix                = `${category}.`;
        const previouslyHadAllocate = selected.has("entitlement.allocate");
        const previouslyHadRemove   = selected.has("entitlement.remove");
        selected = new Set([...selected].filter(value => !value.startsWith(prefix)));
        for (const value of component.values) {selected.add(value);}
        if (category === "entitlement") {
          const hasAllocate = selected.has("entitlement.allocate");
          const hasRemove   = selected.has("entitlement.remove");
          if (previouslyHadRemove && !hasRemove) {selected.delete("entitlement.allocate");} else if (hasAllocate && !hasRemove) {selected.add("entitlement.remove");}
        } reviewing = false;
      }
      if (component.customId === "permission:review") {
        if (level === permissions.ACCESS_LEVELS.CUSTOM && selected.size === 0) {await component.reply({content: "Custom Access requires at least one selected command.", flags: discord.MessageFlags.Ephemeral}); return;}
        reviewing = true;
      }
      if (component.customId === "permission:back") {reviewing = false;}
      const proposed = {accessLevel: level, commands: level === permissions.ACCESS_LEVELS.CUSTOM ? permissions.normalizeCustomCommands([...selected]) : []};
      if (component.customId === "permission:save") {
        if (!reviewing) {await component.reply({content: "Review the changes before confirming.", flags: discord.MessageFlags.Ephemeral}); return;}
        await component.deferUpdate();
        const allocationSnapshot = await getAllocationAccessSnapshot(interaction.guild, target);
        const current = permissions.getPermissionProfile(interaction.guild.id, target.type, target.id);
        if (JSON.stringify(current?.accessLevel) !== JSON.stringify(original?.accessLevel) || JSON.stringify([...(current?.commands ?? [])].sort()) !== JSON.stringify([...(original?.commands ?? [])].sort())) {
          await interaction.editReply({content: "This permission profile changed while you were editing it. Please run the command again.", embeds: [], components: []}); collector.stop("changed"); return;
        }
        permissions.savePermissionProfile(interaction.guild.id, target.type, target.id, proposed.accessLevel, proposed.commands); cleanupRevokedAllocations(allocationSnapshot);
        await interaction.editReply({content: `Saved ${formatPermissionProfile(proposed)} for ${target.mention}.`, embeds: [], components: []}); collector.stop("saved");
        await logging.logPermissionChange(interaction.guild, {
          user: interaction.user,
          description: `${interaction.user} ${editing ? "edited" : "added"} BargazBot permissions for ${target.mention}.`,
          fields: [{name: "Previous Access", value: formatPermissionProfile(original).slice(0, 1024)}, {name: "New Access", value: formatPermissionProfile(proposed).slice(0, 1024)}]
        }).catch(error => console.error("Failed to log permission change:", error)); return;
      }
      await component.update(reviewing ? buildPermissionReview(target, original, proposed) : buildPermissionEditor(target, level, category, selected));
    } catch (error) {console.error("Permission editor error:", error);
      if (!component.replied && !component.deferred) {await component.reply({content: "The permission editor encountered an error.", flags: discord.MessageFlags.Ephemeral}).catch(() => {});}
      collector.stop("error");
      await interaction.editReply({content: "The permission editor encountered an error. No further changes can be made in this session.", embeds: [], components: []}).catch(() => {});
    }
  });
  collector.on("end", async (_, reason) => {if (["saved", "cancelled", "denied", "changed", "error"].includes(reason)) {return;} await interaction.editReply({content: "Permission editor expired. No changes were saved.", embeds: [], components: []}).catch(() => {});});
}

// Removes a permission grant after confirmation
// interaction = ChatInputCommandInteraction
async function handlePermissionRemove(interaction) {
  const target = getPermissionTarget(interaction);
  if (target.error)                                                                            {await interaction.reply({content: target.error, flags: discord.MessageFlags.Ephemeral}); return;}
  if (target.type === permissions.PERMISSION_TYPES.ROLE && target.id === interaction.guild.id) {await interaction.reply({content: "The @everyone permission profile cannot be removed. Use `/permissions edit` instead.", flags: discord.MessageFlags.Ephemeral}); return;}
  const original = permissions.getPermissionProfile(interaction.guild.id, target.type, target.id);
  if (!original) {await interaction.reply({content: `${target.mention} has no explicit permission profile to remove.`, flags: discord.MessageFlags.Ephemeral}); return;}
  const buttons = new discord.ActionRowBuilder().addComponents(
    new discord.ButtonBuilder().setCustomId("permission:remove-confirm").setLabel("Remove Permission").setStyle(discord.ButtonStyle.Danger),
    new discord.ButtonBuilder().setCustomId("permission:remove-cancel") .setLabel("Cancel").setStyle(discord.ButtonStyle.Secondary)
  );
  await interaction.reply({
    content: `Remove the explicit **${formatPermissionProfile(original)}** profile from ${target.mention}?\n\nOther applicable role permissions and inherited administrator access will remain.`,
    components: [buttons], flags: discord.MessageFlags.Ephemeral
  });
  const message   = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({time: 120000});
  collector.on("collect", async component => {
    if (component.user.id !== interaction.user.id)                             {await component.reply({content:  "This confirmation belongs to another user.",        flags: discord.MessageFlags.Ephemeral}); return;}
    if (component.customId === "permission:remove-cancel")                     {await component.update({content: "Permission removal cancelled.",                     components: []}); collector.stop("cancelled"); return;}
    if (!permissions.canUseCommand(component.member, "permissions", "remove")) {await component.update({content: "You no longer have permission to remove profiles.", components: []}); collector.stop("denied"); return;}
    try {
      await component.deferUpdate();
      const allocationSnapshot = await getAllocationAccessSnapshot(interaction.guild, target);
      const current = permissions.getPermissionProfile(interaction.guild.id, target.type, target.id);
      if (!current || current.accessLevel !== original.accessLevel || JSON.stringify([...current.commands].sort()) !== JSON.stringify([...original.commands].sort())) {
        await interaction.editReply({content: "This profile changed while awaiting confirmation. Please run the command again.", components: []}); collector.stop("changed"); return;
      }
      const removed = permissions.removePermission(interaction.guild.id, target.type, target.id);
      if (removed) {cleanupRevokedAllocations(allocationSnapshot);}
      await interaction.editReply({content: removed ? `Removed the explicit permission profile for ${target.mention}.` : "The permission profile could not be removed.", components: []}); collector.stop("completed");
      if (removed) {
        await logging.logPermissionChange(interaction.guild, {user: interaction.user, description: `${interaction.user} removed BargazBot permissions from ${target.mention}.`, fields: [{name: "Previous Access", value: formatPermissionProfile(original).slice(0, 1024)}]
        }).catch(error => console.error("Failed to log permission removal:", error));
      }
    } catch (error) {
      console.error("Permission removal error:", error);
      if (!component.replied && !component.deferred) {await component.reply({content: "Permission removal encountered an error.", flags: discord.MessageFlags.Ephemeral}).catch(() => {});}
      collector.stop("error");
      await interaction.editReply({content: "Permission removal encountered an error. Please check the current permissions before trying again.", components: []}).catch(() => {});
    }
  });
  collector.on("end", async (_, reason) => {if (reason !== "time") {return;} await interaction.editReply({content: "Permission removal confirmation expired.", components: []}).catch(() => {});});
}

// Creates a paginated read-only permission listing
// interaction = ChatInputCommandInteraction
async function handlePermissionList(interaction) {
  await interaction.deferReply({flags: discord.MessageFlags.Ephemeral});
  const entries   = permissions.getPermissions(interaction.guild.id);
  const owner     = await interaction.guild.fetchOwner();
  const inherited = new Map([[owner.id, owner]]);
  try {
    const members = await interaction.guild.members.fetch();
    for (const member of members.values()) {if (permissions.isGuildAdministrator(member)) {inherited.set(member.id, member);}}
  } catch (error) {console.warn("Could not retrieve all server administrators for the permission list:", error);}
  const sorted      = values => values.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
  const roleEntries = sorted(entries.filter(entry => entry.permission_type === permissions.PERMISSION_TYPES.ROLE).map(entry => ({
    name: interaction.guild.roles.cache.get(entry.target_id)?.name ?? entry.target_id,
    line: `${entry.target_id === interaction.guild.id ? "@everyone" : permissionTargetMention(entry.permission_type, entry.target_id)} — ${formatPermissionProfile(entry)}`
  })));
  const userEntries = sorted(entries.filter(entry => entry.permission_type === permissions.PERMISSION_TYPES.USER).map(entry => ({
    name: interaction.guild.members.cache.get(entry.target_id)?.displayName ?? interaction.client.users.cache.get(entry.target_id)?.username ?? entry.target_id,
    line: `${permissionTargetMention(entry.permission_type, entry.target_id)} — ${formatPermissionProfile(entry)}`
  })));
  const inheritedEntries = sorted([...inherited.values()].map(member => ({
    name: member.displayName,
    line: `${member} — Full Access (${member.id === owner.id ? "Server Owner" : "Administrator"})`
  })));
    const publicCommands = [...permissions.PUBLIC_COMMANDS.map(command => `\`/${command}\``), "`/permissions list`"];
  const pages = {
    all: [
      ...inheritedEntries.map(entry => `**Inherited:** ${entry.line}`),
      ...roleEntries.map(entry      => `**Role:** ${entry.line}`),
      ...userEntries.map(entry      => `**User:** ${entry.line}`),
      `**Public Commands:** ${publicCommands.join(", ")}`
    ],
    inherited: inheritedEntries.map(entry => entry.line),
    roles:     roleEntries.map(entry => entry.line),
    users:     userEntries.map(entry => entry.line),
    public:    publicCommands
  };
  let section    = "all";
  let page       = 0;
  const pageSize = 8;
  const render   = () => {
    const lines      = pages[section];
    const totalPages = Math.max(1, Math.ceil(lines.length / pageSize));
    page = Math.min(page, totalPages - 1);
    const shown = lines.slice(page * pageSize, (page + 1) * pageSize);
    const embed = new discord.EmbedBuilder()
      .setTitle("BargazBot Permissions")
      .setDescription((shown.join("\n\n") || "No entries in this category.").slice(0, 4000))
      .setFooter({text: `Page ${page + 1} of ${totalPages} • Read-only`});
    const menu = new discord.ActionRowBuilder().addComponents(
      new discord.StringSelectMenuBuilder()
        .setCustomId("permission:list-section")
        .setPlaceholder("Choose a category")
        .addOptions([
          {label: "All Permissions",  value: "all",       default: section === "all"},
          {label: "Inherited Access", value: "inherited", default: section === "inherited"},
          {label: "Authorized Roles", value: "roles",     default: section === "roles"},
          {label: "Authorized Users", value: "users",     default: section === "users"},
          {label: "Public Commands",  value: "public",    default: section === "public"}
        ])
    );

    const navigation = new discord.ActionRowBuilder().addComponents(
      new discord.ButtonBuilder().setCustomId("permission:list-prev").setLabel("Previous").setStyle(discord.ButtonStyle.Secondary).setDisabled(page === 0),
      new discord.ButtonBuilder().setCustomId("permission:list-next").setLabel("Next")    .setStyle(discord.ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
    return {embeds: [embed], components: [menu, navigation]};
  };

  await interaction.editReply(render());
  const message   = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({time: 300000});

  collector.on("collect", async component => {
    if (component.user.id !== interaction.user.id)        {await component.reply({content: "This menu belongs to another user.", flags: discord.MessageFlags.Ephemeral}); return;}
    if (component.customId === "permission:list-section") {section = component.values[0]; page = 0;}
    if (component.customId === "permission:list-prev")    {page--;}
    if (component.customId === "permission:list-next")    {page++;}
    await component.update(render());
  });
  collector.on("end", async () => {await interaction.editReply({components: []}).catch(() => {});});
}

// Routes notification commands after checking individual access
// interaction = ChatInputCommandInteraction
async function handleNotification(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (!await requireCommandAccess(interaction, "notification", subcommand)) {return;}
  switch (subcommand) {
    case "add":     await handleNotificationAdd(interaction); break;
    case "delete":  await handleNotificationDelete(interaction); break;
    case "edit":    await handleNotificationEdit(interaction); break;
    case "message": await handleNotificationMessage(interaction); break;
    case "channel": await handleNotificationChannel(interaction); break;
    case "refresh": await handleNotificationRefresh(interaction); break;
    case "list":    await handleNotificationList(interaction); break;
  }
}

// Adds a creator notification subscription to the server
// interaction = ChatInputCommandInteraction
async function handleNotificationAdd(interaction) {
  await interaction.deferReply({flags:discord.MessageFlags.Ephemeral});
  const platform            = interaction.options.getString("platform", true);
  const creator             = interaction.options.getString("creator", true);
  const nickname            = interaction.options.getString("nickname", true).trim();
  const notificationChannel = interaction.options.getChannel("channel");
  const customMessage       = interaction.options.getString("message");
  if (!nickname) {await interaction.editReply({content:"The notification nickname cannot be empty."}); return;}
  if (notifications.findGuildSubscription(interaction.guild.id, nickname, platform)) {
    await interaction.editReply({content:`A ${notifications.getPlatformName(platform)} notification already uses the nickname **${nickname}**.`}); return;
  }
  const result = await notifications.addSubscription(interaction.guild.id, platform, creator, nickname, notificationChannel ?.id ?? null, customMessage ?? null);
  if (!result.success) {if (result.reason === "already-exists") {await interaction.editReply({content:"This server is already following that creator on this platform."}); return;}
  if (result.reason === "entitlement-limit") {await interaction.editReply({content:
    `This server has used all of its ` +
    `${notifications.getPlatformName(platform)} creator notification limit ` +
    `(**${result.usage}/${result.limit}**). ` +
    `The limit much be increased before another channel can be added.`
  }); return;}
  await interaction.editReply({content:`BargazBot could not find that ${notifications.getPlatformName(platform)} channel.`}); return;}
  const destination = notificationChannel ? `${notificationChannel}` : "the server's BargazBot notification channel";
  await interaction.editReply({
    content:
      `Added **${result.channel.channel_name}** on ` +
      `**${notifications.getPlatformName(platform)}** ` +
      `with the nickname **${nickname}**.\n` +
      `Destination: ${destination}\n` +
      `Message: ${customMessage ? "Custom" : "BargazBot default"}`
  });
}

// Deletes a creator notification subscription from the server
// interaction = ChatInputCommandInteraction
async function handleNotificationDelete(interaction) {
  const platform = interaction.options.getString("platform", true);
  const nickname = interaction.options.getString("nickname", true);
  const result   = notifications.deleteSubscription(interaction.guild.id, nickname, platform);
  if (!result.success) {
    await interaction.reply({content:`No ${notifications.getPlatformName(platform)} creator notification was found with the nickname **${nickname}**.`, 
    flags:discord.MessageFlags.Ephemeral
    }); return;
  }
  await interaction.reply({
    content:
      `Deleted the **${result.subscription.nickname}** ` +
      `${notifications.getPlatformName(result.subscription.platform)} notification.`,
    flags:discord.MessageFlags.Ephemeral
  });
}

// Changes the nickname of an existing creator notification
// interaction = ChatInputCommandInteraction
async function handleNotificationEdit(interaction) {
  const platform    = interaction.options.getString("platform", true);
  const nickname    = interaction.options.getString("nickname", true);
  const newNickname = interaction.options.getString("new-nickname", true).trim();
  if (!newNickname) {await interaction.reply({content:"The new nickname cannot be empty.", flags:discord.MessageFlags.Ephemeral}); return;}
  const current = notifications.findGuildSubscription(interaction.guild.id, nickname, platform);
  if (!current) {
    await interaction.reply({
      content:`No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,
      flags:discord.MessageFlags.Ephemeral
    }); return;
  }
  const duplicate = notifications.findGuildSubscription(interaction.guild.id, newNickname, platform);
  if (duplicate && duplicate.channelId !== current.channelId) {
    await interaction.reply({
      content:`A ${notifications.getPlatformName(platform)} notification already uses the nickname **${newNickname}**.`,
      flags:discord.MessageFlags.Ephemeral
    }); return;
  }
  const result = notifications.editSubscription(interaction.guild.id, nickname, platform, newNickname);
  if (!result.success) {
    await interaction.reply({content:result.reason === "nickname-exists"
      ? `A ${notifications.getPlatformName(platform)} notification already uses the nickname **${newNickname}**.`
      : `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,
      flags:discord.MessageFlags.Ephemeral
    }); return;
  }
  await interaction.reply({content:`Changed the notification nickname from **${nickname}** to **${newNickname}**.`, flags:discord.MessageFlags.Ephemeral
  });
}

// Updates or resets a creator notification's custom message
// interaction = ChatInputCommandInteraction
async function handleNotificationMessage(interaction) {
  const platform      = interaction.options.getString("platform", true);
  const nickname      = interaction.options.getString("nickname", true);
  const customMessage = interaction.options.getString("message", false);
  const result        = notifications.setSubscriptionMessage(interaction.guild.id, nickname, platform, customMessage);
  if (!result.success) {await interaction.reply({
    content:`No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,
    flags:discord.MessageFlags.Ephemeral
  }); return;}
  await interaction.reply({content:customMessage === null
    ? `Restored **${nickname}** to BargazBot's default notification message.`
    : `Updated the custom notification message for **${nickname}**.`,
    flags:discord.MessageFlags.Ephemeral
  });
}

// Changes the destination channel for a creator notification
// interaction = ChatInputCommandInteraction
async function handleNotificationChannel(interaction) {
  const platform = interaction.options.getString("platform", true);
  const nickname = interaction.options.getString("nickname", true);
  const channel  = interaction.options.getChannel("channel", true);
  const result   = notifications.setSubscriptionChannel(interaction.guild.id, nickname, platform, channel.id);
  if (!result.success) {await interaction.reply({
    content:`No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,
    flags:  discord.MessageFlags.Ephemeral
  }); return;}          await interaction.reply({
    content:`Creator notifications for **${nickname}** will now be sent to ${channel}.`,
    flags:  discord.MessageFlags.Ephemeral
  });
}

// Requests a refresh of an existing creator notification
// interaction = ChatInputCommandInteraction
async function handleNotificationRefresh(interaction) {
  const platform = interaction.options.getString("platform", true);
  const nickname = interaction.options.getString("nickname", true);
  await interaction.deferReply({flags:discord.MessageFlags.Ephemeral});
  const result   = await notifications.refreshSubscription(interaction.client, interaction.guild.id, nickname, platform);
  if (!result.success) {await interaction.editReply({content:`No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`}); return;}
  await interaction.editReply({content:`Refreshed **${result.subscription.nickname}** on ` + `**${notifications.getPlatformName(result.subscription.platform)}**.`});
}

// Displays the server's configured creator notifications
// interaction = ChatInputCommandInteraction
async function handleNotificationList(interaction) {
  const platform      = interaction.options.getString("platform", false);
  const subscriptions = notifications.getGuildSubscriptions(interaction.guild.id, platform);
  if (!subscriptions.length) {await interaction.reply({
    content: platform ? `No ${notifications.getPlatformName(platform)} creator notifications are configured for this server.` : "No creator notifications are configured for this server.",
    flags:   discord.MessageFlags.Ephemeral
  }); return;}
  const lines =
    subscriptions.map(subscription => {
        const destination = subscription.discordChannelId ? `<#${subscription.discordChannelId}>` : "Default/fallback channel";
        const messageMode = subscription.customMessage ? "Custom message" : "Default message";
        return (
          `**${subscription.nickname}** — ` + `${notifications.getPlatformName(subscription.platform)}\n` +
          `${subscription.channelName}\n`   + `Destination: ${destination} • ${messageMode}`
        );
      }
    );
  const chunks = [];
  let current  = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n\n${line}` : line;
    if (candidate.length > 3900) {chunks.push(current); current = line;} else {current = candidate;}
  }
  if (current) {chunks.push(current);}
  const embeds =
    chunks.map((description, index) =>
        new discord.EmbedBuilder()
          .setTitle(index === 0 ? "Creator Notifications" : `Creator Notifications (${index + 1})`)
          .setDescription(description)
          .setTimestamp()
    );
  await interaction.reply({embeds, flags:discord.MessageFlags.Ephemeral});
}