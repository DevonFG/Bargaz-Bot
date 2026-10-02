import * as discord        from "discord.js";
import * as channelManager from "./channelManager.js";
import * as logging        from "./logging.js";
import * as permissions    from "./permissions.js";
import * as owner          from "./owner.js";

/*
=====================================================
Configuration Permission Check
=====================================================
*/

async function requireConfigurationAccess(
  interaction
) {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "This command can only be used in a Discord server.",
      flags: discord.MessageFlags.Ephemeral
    });
    return false;
  }

  const member =
    interaction.member;

  if (
    permissions.canConfigureBargazBot(member)
  ) {
    return true;
  }
  await interaction.reply({
    content:
      "You do not have permission to configure BargazBot in this server.",
    flags: discord.MessageFlags.Ephemeral
  });
  return false;
}

/*
=====================================================
Command Definitions
=====================================================
*/

const commands = [

  // --------------------------------------------------
  // General
  // --------------------------------------------------

  new discord.SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks whether BargazBot is responding."),

  new discord.SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows information about BargazBot's commands."),


  // --------------------------------------------------
  // Creator Notifications
  // --------------------------------------------------

  new discord.SlashCommandBuilder()
    .setName("notification")
    .setDescription("Manage creator notifications.")

    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a creator notification.")
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("delete")
        .setDescription("Delete a creator notification.")
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("edit")
        .setDescription("Edit a creator notification.")
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("message")
        .setDescription("Configure a notification message.")
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("refresh")
        .setDescription("Refresh information for a creator notification.")
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List this server's creator notifications.")
    ),


  // --------------------------------------------------
  // Channel Configuration
  // --------------------------------------------------

  new discord.SlashCommandBuilder()
    .setName("channels")
    .setDescription("Configure the channels used by BargazBot.")

    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Change the channel used by a feature.")

        .addStringOption(option =>
          option
            .setName("purpose")
            .setDescription("The feature to configure.")
            .setRequired(true)
            .addChoices(
              {
                name: "Creator notifications",
                value: "notifications"
              },
              {
                name: "Welcome messages",
                value: "welcome"
              },
              {
                name: "Goodbye messages",
                value: "goodbye"
              },
              {
                name: "Server logs",
                value: "logs"
              },
              {
                name: "BargazBot status",
                value: "status"
              }
            )
        )

        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel to use for this feature.")
            .addChannelTypes(discord.ChannelType.GuildText)
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("Show the channels currently used by BargazBot.")
    ),


  // --------------------------------------------------
  // Permissions
  // --------------------------------------------------

  new discord.SlashCommandBuilder()
    .setName("permissions")
    .setDescription("Manage who can configure BargazBot.")

    .addSubcommand(subcommand =>
      subcommand
        .setName("add-user")
        .setDescription("Give a user permission to configure BargazBot.")

        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to authorize.")
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("add-role")
        .setDescription("Give a role permission to configure BargazBot.")

        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("The role to authorize.")
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("remove-user")
        .setDescription(
          "Remove a user's BargazBot configuration permission."
        )

        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to remove.")
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("remove-role")
        .setDescription(
          "Remove a role's BargazBot configuration permission."
        )

        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("The role to remove.")
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("Show who can configure BargazBot.")
    ),


  // --------------------------------------------------
  // Owner-only
  // --------------------------------------------------

  new discord.SlashCommandBuilder()
    .setName("youtube_rss_mode")
    .setDescription("Manage YouTube RSS mode.")
];


/*
=====================================================
Command Registration
=====================================================
*/

export async function registerCommands(client) {
  const commandData = commands.map(command => command.toJSON());

  await client.application.commands.set(commandData);

  console.log(
    `Registered ${commandData.length} BargazBot commands.`
  );
}


/*
=====================================================
Interaction Router
=====================================================
*/

export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    switch (interaction.commandName) {
      case "ping":
        await handlePing(interaction);
        break;

      case "help":
        await handleHelp(interaction);
        break;

      case "channels":
        await handleChannels(interaction);
        break;

      case "permissions":
        await handlePermissions(interaction);
        break;

      case "notification":
        await handleNotification(interaction);
        break;

      case "youtube_rss_mode":
        await handleYouTubeRssMode(interaction);
        break;
      default:
        await interaction.reply({
          content: "BargazBot does not recognize this command.",
          flags: discord.MessageFlags.Ephemeral
        });
    }
    if (interaction.guild) {
      await logging.logCommand(interaction);
    }
  } catch (error) {
    console.error(
      `Error handling /${interaction.commandName}:`,
      error
    );

    const response = {
      content:
        "BargazBot encountered an error while processing that command.",
      flags: discord.MessageFlags.Ephemeral
    };

    if (interaction.guild) {
      await logging.logCommand (
        interaction,
        {
          successful: false,
          details: error.message
        }
      ).catch(loggingError => {
        console.error("Failed to log command error:", loggingError);
      });
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
}


/*
=====================================================
General Commands
=====================================================
*/

async function handlePing(interaction) {
  await interaction.reply({
    content: "Pong!",
    flags: discord.MessageFlags.Ephemeral
  });
}


async function handleHelp(interaction) {
  const embed = new discord.EmbedBuilder()
    .setTitle("BargazBot Help")
    .setDescription(
      "BargazBot provides creator notifications and server management features."
    )
    .addFields(
      {
        name: "/notification",
        value:
          "Manage creator notifications.\n" +
          "`add` • `delete` • `edit` • `message` • `refresh` • `list`"
      },
      {
        name: "/channels",
        value:
          "Configure which Discord channels BargazBot uses.\n" +
          "`set` • `list`"
      },
      {
        name: "/permissions",
        value:
          "Manage who is allowed to configure BargazBot.\n" +
          "`add-user` • `add-role` • `remove-user` • `remove-role` • `list`"
      },
      {
        name: "/ping",
        value:
          "Check whether BargazBot is responding."
      }
    )
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Channel Commands
=====================================================
*/

async function handleChannels(interaction) {
  if (!await requireConfigurationAccess(interaction)){return;}
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "set":
      await handleChannelSet(interaction);
      break;
    case "list":
      await handleChannelList(interaction);
      break;
    default:
      throw new Error(
        `Unknown /channels subcommand: ${subcommand}`
      );
  }
}


async function handleChannelSet(interaction) {
  const purpose = interaction.options.getString(
    "purpose",
    true
  );

  const channel = interaction.options.getChannel(
    "channel",
    true
  );

  channelManager.setChannel(
    interaction.guild.id,
    purpose,
    channel.id
  );

  await logging.logConfigurationChange(
    interaction.guild,
    {
      user: interaction.user,
      title: "BargazBot Channel Changed",
      description: `${interaction.user} changed a Bargazbot channel setting.`,
      fields: [{
          name: "Purpose",
          value: purpose,
          inline: true,
        },
        {
          name: "New Channel",
          value: `${channel}`,
          inline: true
        }
      ]
    }
  );

  await interaction.reply({
    content:
      `The **${purpose}** channel has been changed to ${channel}.`,
    flags: discord.MessageFlags.Ephemeral
  });
}


async function handleChannelList(interaction) {
  const settings =
    channelManager.getChannelAssignments(
      interaction.guild.id
    );

  if (!settings) {
    await interaction.reply({
      content:
        "BargazBot does not have channel settings stored for this server.",
      flags: discord.MessageFlags.Ephemeral
    });

    return;
  }

  const formatChannel = channelId =>
    channelId ? `<#${channelId}>` : "Not configured";

  const embed = new discord.EmbedBuilder()
    .setTitle("BargazBot Channels")
    .addFields(
      {
        name: "Creator notifications",
        value: formatChannel(
          settings.announcement_channel_id
        )
      },
      {
        name: "Welcome messages",
        value: formatChannel(
          settings.welcome_channel_id
        )
      },
      {
        name: "Goodbye messages",
        value: formatChannel(
          settings.goodbye_channel_id
        )
      },
      {
        name: "Server logs",
        value: formatChannel(
          settings.logs_channel_id
        )
      },
      {
        name: "Status",
        value: formatChannel(
          settings.status_channel_id
        )
      }
    )
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Permissions Commands
=====================================================
*/

async function handlePermissions(interaction) {
  if( !await requireConfigurationAccess(interaction)){return;}

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "add-user": await handlePermissionAddUser(interaction); break;
    case "add-role": await handlePermissionAddRole(interaction); break;
    case "remove-user": await handlePermissionRemoveUser(interaction); break;
    case "remove-role": await handlePermissionRemoveRole(interaction); break;
    case "list": await handlePermissionList(interaction); break;

    default: throw new Error(`Unknown /permissions subcommand: ${subcommand}`);
  }
}

async function handlePermissionAddUser(
  interaction
) {
  const user =
    interaction.options.getUser(
      "user",
      true
    );
  const added =
    permissions.addPermission(
      interaction.guild.id,
      permissions.PERMISSION_TYPES.USER,
      user.id
    );
  await logging.logPermissionChange(
    interaction.guild,
    {
      user: interaction.user,
      description:
        `${interaction.user} granted BargazBot configuration access to ${user}.`,
      fields: [
        {
          name: "User",
          value: `${user}`,
          inline: true
        }
      ]
    }
  );
  await interaction.reply({
    content:
      added
        ? `${user} can now configure BargazBot.`
        : `${user} already has an explicit BargazBot permission entry.`,
    flags: discord.MessageFlags.Ephemeral
  });
}

async function handlePermissionAddRole(
  interaction
) {
  const role =
    interaction.options.getRole(
      "role",
      true
    );
  const added =
    permissions.addPermission(
      interaction.guild.id,
      permissions.PERMISSION_TYPES.ROLE,
      role.id
    );
  await logging.logPermissionChange(
    interaction.guild,
    {
      user: interaction.user,
      description:
        `${interaction.user} granted BargazBot configuration access to ${role}.`,
      fields: [
        {
          name: "Role",
          value: `${role}`,
          inline: true
        }
      ]
    }
  );
  await interaction.reply({
    content:
      added
        ? `${role} can now configure BargazBot.`
        : `${role} already has BargazBot configuration access.`,
    flags: discord.MessageFlags.Ephemeral
  });
}

async function handlePermissionRemoveUser(
  interaction
) {
  const user =
    interaction.options.getUser(
      "user",
      true
    );
  const removed =
    permissions.removePermission(
      interaction.guild.id,
      permissions.PERMISSION_TYPES.USER,
      user.id
    );
  if (removed) {
    await logging.logPermissionChange(
      interaction.guild,
      {
        user: interaction.user,

        description:
          `${interaction.user} removed BargazBot configuration access from ${user}.`,

        fields: [
          {
            name: "User",
            value: `${user}`,
            inline: true
          }
        ]
      }
    );
  }
  await interaction.reply({
    content:
      removed
        ? `${user}'s BargazBot configuration permission was removed.`
        : `${user} did not have an explicit BargazBot permission entry.`,
    flags: discord.MessageFlags.Ephemeral
  });
}

async function handlePermissionRemoveRole(
  interaction
) {
  const role =
    interaction.options.getRole(
      "role",
      true
    );
  const removed =
    permissions.removePermission(
      interaction.guild.id,
      permissions.PERMISSION_TYPES.ROLE,
      role.id
    );
  if (removed) {
    await logging.logPermissionChange(
      interaction.guild,
      {
        user: interaction.user,

        description:
          `${interaction.user} removed BargazBot configuration access from ${role}.`,

        fields: [
          {
            name: "Role",
            value: `${role}`,
            inline: true
          }
        ]
      }
    );
  }
  await interaction.reply({
    content:
      removed
        ? `${role}'s BargazBot configuration permission was removed.`
        : `${role} did not have an explicit BargazBot permission entry.`,
    flags: discord.MessageFlags.Ephemeral
  });
}

async function handlePermissionList(
  interaction
) {
  const entries =
    permissions.getPermissions(
      interaction.guild.id
    );
  const users = [];
  const roles = [];

  for (const entry of entries) {
    if (
      entry.permission_type ===
      permissions.PERMISSION_TYPES.USER
    ) {
      users.push(
        `<@${entry.target_id}>`
      );
    }

    if (
      entry.permission_type ===
      permissions.PERMISSION_TYPES.ROLE
    ) {
      roles.push(
        `<@&${entry.target_id}>`
      );
    }
  }

  const embed =
    new discord.EmbedBuilder()
      .setTitle(
        "BargazBot Configuration Permissions"
      )
      .setDescription(
        "The server owner always has configuration access."
      )
      .addFields(
        {
          name: "Authorized Users",
          value:
            users.length > 0
              ? users.join("\n")
              : "None",
          inline: false
        },
        {
          name: "Authorized Roles",
          value:
            roles.length > 0
              ? roles.join("\n")
              : "None",
          inline: false
        }
      )
      .setTimestamp();
  await interaction.reply({
    embeds: [embed],
    flags: discord.MessageFlags.Ephemeral
  });
}

/*
=====================================================
Creator Notification Commands
=====================================================

TEMPORARY:
The command interface is defined above, but the creator
notification system is being redesigned.

Eventually these subcommands will route into the new
notification/platform infrastructure.
=====================================================
*/

async function handleNotification(interaction) {
  if ( !await requireConfigurationAccess(interaction)){return;}
  await interaction.reply({
    content:
      "The BargazBot notification system is currently being rebuilt.",
    flags: discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Owner-only Commands
=====================================================
*/

async function handleYouTubeRssMode(interaction) {
  if (!owner.isOwner(interaction.user)) {
    await interaction.reply({
      content:
        "This command is restricted to the BargazBot owner.",
      flags: discord.MessageFlags.Ephemeral
    });
    return;
  }
  await interaction.reply({
    content:
      "The YouTube RSS controls are currently being rebuilt.",
    flags: discord.MessageFlags.Ephemeral
  });
}
