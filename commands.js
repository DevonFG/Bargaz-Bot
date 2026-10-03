import * as discord        from "discord.js";
import * as channelManager from "./channelManager.js";
import * as logging        from "./logging.js";
import * as permissions    from "./permissions.js";
import * as notifications  from "./notifications.js";
import * as entitlements   from "./entitlements.js";

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
      flags:
        discord.MessageFlags.Ephemeral
    });

    return false;
  }

  if (
    permissions.canConfigureBargazBot(
      interaction.member
    )
  ) {
    return true;
  }

  await interaction.reply({
    content:
      "You do not have permission to configure BargazBot in this server.",
    flags:
      discord.MessageFlags.Ephemeral
  });

  return false;
}


/*
=====================================================
Permission Management Check
=====================================================
*/

async function requirePermissionManagementAccess(
  interaction
) {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "This command can only be used in a Discord server.",
      flags:
        discord.MessageFlags.Ephemeral
    });

    return false;
  }

  if (
    permissions.canManagePermissions(
      interaction.member
    )
  ) {
    return true;
  }

  await interaction.reply({
    content:
      "You can configure BargazBot, but you do not have permission to manage who else can configure it.",
    flags:
      discord.MessageFlags.Ephemeral
  });

  return false;
}


/*
=====================================================
Platform Choices
=====================================================
*/

function addPlatformChoices(option) {
  return option.addChoices(
    {
      name: "YouTube",
      value: "youtube"
    },
    {
      name: "Twitch",
      value: "twitch"
    },
    {
      name: "Kick",
      value: "kick"
    }
  );
}


/*
=====================================================
Command Definitions
=====================================================
*/

const commands = [

  new discord.SlashCommandBuilder()
    .setName("ping")
    .setDescription(
      "Checks whether BargazBot is responding."
    ),

  new discord.SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Shows information about BargazBot's commands."
    ),


  /*
  ===================================================
  Creator Notifications
  ===================================================
  */

  new discord.SlashCommandBuilder()
    .setName("notification")
    .setDescription(
      "Manage creator notifications."
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription(
          "Add a creator notification."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The creator's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("creator")
            .setDescription(
              "The creator's channel URL, handle, or username."
            )
            .setRequired(true)
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "A nickname used to manage this notification."
            )
            .setRequired(true)
        )

        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription(
              "The Discord channel where notifications will be sent."
            )
            .setRequired(false)
            .addChannelTypes(
              discord.ChannelType.GuildText,
              discord.ChannelType.GuildAnnouncement
            )
        )

        .addStringOption(option =>
          option
            .setName("message")
            .setDescription(
              "Optional custom message sent with this creator's notifications."
            )
            .setRequired(false)
            .setMaxLength(2000)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("delete")
        .setDescription(
          "Delete a creator notification."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The notification's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "The notification nickname."
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("edit")
        .setDescription(
          "Rename a creator notification."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The notification's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "The notification's current nickname."
            )
            .setRequired(true)
        )

        .addStringOption(option =>
          option
            .setName("new-nickname")
            .setDescription(
              "The new nickname."
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("message")
        .setDescription(
          "Configure a creator's notification message."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The notification's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "The notification nickname."
            )
            .setRequired(true)
        )

        .addStringOption(option =>
          option
            .setName("message")
            .setDescription(
              "Custom message, or leave blank to restore the default."
            )
            .setRequired(false)
            .setMaxLength(2000)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("channel")
        .setDescription(
          "Change a creator notification's destination channel."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The notification's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "The notification nickname."
            )
            .setRequired(true)
        )

        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription(
              "The Discord channel where notifications will be sent."
            )
            .setRequired(true)
            .addChannelTypes(
              discord.ChannelType.GuildText,
              discord.ChannelType.GuildAnnouncement
            )
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("refresh")
        .setDescription(
          "Refresh information for a creator notification."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The notification's platform."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("nickname")
            .setDescription(
              "The notification nickname."
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription(
          "List this server's creator notifications."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "Only show notifications from one platform."
              )
              .setRequired(false)
          )
        )
    ),


  /*
  ===================================================
  Channel Configuration
  ===================================================
  */

  new discord.SlashCommandBuilder()
    .setName("channels")
    .setDescription(
      "Configure the channels used by BargazBot."
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription(
          "Change the channel used by a feature."
        )

        .addStringOption(option =>
          option
            .setName("purpose")
            .setDescription(
              "The feature to configure."
            )
            .setRequired(true)
            .addChoices(
              {
                name:
                  "Creator notification fallback",
                value:
                  "notifications"
              },
              {
                name:
                  "Welcome messages",
                value:
                  "welcome"
              },
              {
                name:
                  "Goodbye messages",
                value:
                  "goodbye"
              },
              {
                name:
                  "Server logs",
                value:
                  "logs"
              },
              {
                name:
                  "BargazBot status",
                value:
                  "status"
              }
            )
        )

        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription(
              "The channel to use for this feature."
            )
            .addChannelTypes(
              discord.ChannelType.GuildText,
              discord.ChannelType.GuildAnnouncement
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription(
          "Show the channels currently used by BargazBot."
        )
    ),

  /*
  ===================================================
  Entitlements
  ===================================================
  */

  new discord.SlashCommandBuilder()
    .setName("entitlement")
    .setDescription(
      "Manage your BargazBot entitlement allocation."
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("allocate")
        .setDescription(
          "Allocate some of your entitlement to this server."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The platform to allocate."
              )
              .setRequired(true)
          )
        )

        .addStringOption(option =>
          option
            .setName("limit")
            .setDescription(
              'The number of notifications to allocate, or "unlimited".'
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove your allocation for a platform from this server."
        )

        .addStringOption(option =>
          addPlatformChoices(
            option
              .setName("platform")
              .setDescription(
                "The platform allocation to remove."
              )
              .setRequired(true)
          )
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription(
          "View your entitlements and allocations for this server."
        )
    ),

  /*
  ===================================================
  Permissions
  ===================================================
  */

  new discord.SlashCommandBuilder()
    .setName("permissions")
    .setDescription(
      "Manage who can configure BargazBot."
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("add-user")
        .setDescription(
          "Give a user permission to configure BargazBot."
        )

        .addUserOption(option =>
          option
            .setName("user")
            .setDescription(
              "The user to authorize."
            )
            .setRequired(true)
        )

        .addBooleanOption(option =>
          option
            .setName(
              "can-manage-permissions"
            )
            .setDescription(
              "Allow this user to grant or revoke BargazBot permissions."
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("add-role")
        .setDescription(
          "Give a role permission to configure BargazBot."
        )

        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription(
              "The role to authorize."
            )
            .setRequired(true)
        )

        .addBooleanOption(option =>
          option
            .setName(
              "can-manage-permissions"
            )
            .setDescription(
              "Allow this role to grant or revoke BargazBot permissions."
            )
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
            .setDescription(
              "The user to remove."
            )
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
            .setDescription(
              "The role to remove."
            )
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription(
          "Show who can configure BargazBot."
        )
    )
];


/*
=====================================================
Command Registration
=====================================================
*/

export async function registerCommands(
  client
) {
  const commandData =
    commands.map(
      command =>
        command.toJSON()
    );

  await client.application.commands.set(
    commandData
  );

  console.log(
    `Registered ${commandData.length} BargazBot commands.`
  );
}


/*
=====================================================
Interaction Router
=====================================================
*/

export async function handleInteraction(
  interaction
) {
  if (
    !interaction.isChatInputCommand()
  ) {
    return;
  }

  try {
    if (interaction.guild) {
      channelManager.ensureGuildData(
        interaction.guild
      );
    }

    entitlements.ensureUser(
      interaction.user
    );

    switch (
      interaction.commandName
    ) {
      case "ping":
        await handlePing(
          interaction
        );
        break;

      case "help":
        await handleHelp(
          interaction
        );
        break;

      case "channels":
        await handleChannels(
          interaction
        );
        break;

      case "entitlement":
        await handleEntitlement(
          interaction
        );
        break;

      case "permissions":
        await handlePermissions(
          interaction
        );
        break;

      case "notification":
        await handleNotification(
          interaction
        );
        break;

      default:
        await interaction.reply({
          content:
            "BargazBot does not recognize this command.",
          flags:
            discord.MessageFlags.Ephemeral
        });
    }

    if (interaction.guild) {
      await logging.logCommand(
        interaction
      );
    }

  } catch (error) {
    console.error(
      `Error handling /${interaction.commandName}:`,
      error
    );

    const response = {
      content:
        "BargazBot encountered an error while processing that command.",
      flags:
        discord.MessageFlags.Ephemeral
    };

    if (interaction.guild) {
      await logging.logCommand(
        interaction,
        {
          successful: false,
          details:
            error.message
        }
      ).catch(
        loggingError => {
          console.error(
            "Failed to log command error:",
            loggingError
          );
        }
      );
    }

    if (
      interaction.replied ||
      interaction.deferred
    ) {
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


/*
=====================================================
General Commands
=====================================================
*/

async function handlePing(
  interaction
) {
  await interaction.reply({
    content: "Pong!",
    flags:
      discord.MessageFlags.Ephemeral
  });
}


async function handleHelp(
  interaction
) {
  const embed =
    new discord.EmbedBuilder()
      .setTitle(
        "BargazBot Help"
      )
      .setDescription(
        "BargazBot provides creator notifications and server management features."
      )
      .addFields(
        {
          name:
            "/notification",
          value:
            "Manage YouTube, Twitch, and Kick creator notifications."
        },
        {
          name:
            "/channels",
          value:
            "Configure BargazBot's server-wide feature channels."
        },
        {
          name:
            "/entitlement",
          value:
            "Allocate your creator-notification entitlement to this server."
        },
        {
          name:
            "/permissions",
          value:
            "Manage who is allowed to configure BargazBot."
        },
        {
          name:
            "/ping",
          value:
            "Check whether BargazBot is responding."
        }
      )
      .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Channel Commands
=====================================================
*/

async function handleChannels(
  interaction
) {
  if (
    !await requireConfigurationAccess(
      interaction
    )
  ) {
    return;
  }

  switch (
    interaction.options
      .getSubcommand()
  ) {
    case "set":
      await handleChannelSet(
        interaction
      );
      break;

    case "list":
      await handleChannelList(
        interaction
      );
      break;
  }
}


async function handleChannelSet(
  interaction
) {
  const purpose =
    interaction.options.getString(
      "purpose",
      true
    );

  const channel =
    interaction.options.getChannel(
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
      user:
        interaction.user,

      title:
        "BargazBot Channel Changed",

      description:
        `${interaction.user} changed a BargazBot channel setting.`,

      fields: [
        {
          name: "Purpose",
          value: purpose,
          inline: true
        },
        {
          name:
            "New Channel",
          value:
            `${channel}`,
          inline: true
        }
      ]
    }
  );

  await interaction.reply({
    content:
      `The **${purpose}** channel has been changed to ${channel}.`,
    flags:
      discord.MessageFlags.Ephemeral
  });
}


async function handleChannelList(
  interaction
) {
  const settings =
    channelManager
      .getChannelAssignments(
        interaction.guild.id
      );

  const formatChannel =
    channelId =>
      channelId
        ? `<#${channelId}>`
        : "Not configured";

  const embed =
    new discord.EmbedBuilder()
      .setTitle(
        "BargazBot Channels"
      )
      .addFields(
        {
          name:
            "Creator notification fallback",
          value:
            formatChannel(
              settings
                ?.announcement_channel_id
            )
        },
        {
          name:
            "Welcome messages",
          value:
            formatChannel(
              settings
                ?.welcome_channel_id
            )
        },
        {
          name:
            "Goodbye messages",
          value:
            formatChannel(
              settings
                ?.goodbye_channel_id
            )
        },
        {
          name:
            "Server logs",
          value:
            formatChannel(
              settings
                ?.logs_channel_id
            )
        },
        {
          name:
            "Status",
          value:
            formatChannel(
              settings
                ?.status_channel_id
            )
        }
      )
      .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags:
      discord.MessageFlags.Ephemeral
  });
}

/*
=====================================================
Entitlement Commands
=====================================================
*/

async function handleEntitlement(
  interaction
) {
  if (
    !await requireConfigurationAccess(
      interaction
    )
  ) {
    return;
  }

  switch (
    interaction.options
      .getSubcommand()
  ) {
    case "allocate":
      await handleEntitlementAllocate(
        interaction
      );
      break;

    case "remove":
      await handleEntitlementRemove(
        interaction
      );
      break;

    case "view":
      await handleEntitlementView(
        interaction
      );
      break;
  }
}


/*
=====================================================
Allocate Entitlement
=====================================================
*/

/*
=====================================================
Allocate Entitlement
=====================================================
*/

async function handleEntitlementAllocate(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const limitInput =
    interaction.options
      .getString(
        "limit",
        true
      )
      .trim()
      .toLowerCase();

  let amount;

  if (
    limitInput === "unlimited"
  ) {
    amount = null;

  } else {
    amount =
      Number(limitInput);

    if (
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      await interaction.reply({
        content:
          'The limit must be a whole number of 0 or greater, or the word **unlimited**.',

        flags:
          discord.MessageFlags.Ephemeral
      });

      return;
    }
  }

  const result =
    entitlements.setAllocation(
      interaction.user.id,
      interaction.guild.id,
      platform,
      amount
    );

  if (!result.success) {
    let message;

    switch (result.reason) {
      case "no-entitlement":
        message =
          "You do not currently have a BargazBot entitlement for this platform.";
        break;

      case "not-unlimited":
        message =
          "Your entitlement is not unlimited, so you cannot allocate unlimited capacity.";
        break;

      case "exceeds-entitlement":
        message =
          `That allocation exceeds your available entitlement. ` +
          `You can currently allocate up to **${result.available}** more to this server.`;
        break;

      case "allocation-conflict":
        message =
          "Your existing allocations conflict with this entitlement. Please review your allocations.";
        break;

      default:
        message =
          "BargazBot could not update that entitlement allocation.";
    }

    await interaction.reply({
      content: message,
      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.reply({
    content:
      result.unlimited
        ? `Allocated **unlimited ${notifications.getPlatformName(platform)}** creator-notification capacity to this server.`
        : `Allocated **${result.amount} ${notifications.getPlatformName(platform)}** creator-notification slot${result.amount === 1 ? "" : "s"} to this server.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}

/*
=====================================================
Remove Entitlement Allocation
=====================================================
*/

async function handleEntitlementRemove(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const removed =
    entitlements.removeAllocation(
      interaction.user.id,
      interaction.guild.id,
      platform
    );

  await interaction.reply({
    content:
      removed
        ? `Your ${notifications.getPlatformName(platform)} allocation to this server has been set to **0**.`
        : `You did not have an entitlement allocation for ${notifications.getPlatformName(platform)} in this server.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
View Entitlements
=====================================================
*/

async function handleEntitlementView(
  interaction
) {
  const summary =
    entitlements.getAllocationSummary(
      interaction.user.id,
      interaction.guild.id
    );

  if (!summary.entitlements) {
    await interaction.reply({
      content:
        "You do not currently have a BargazBot entitlement record.",

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const formatEntitlement =
    value =>
      value === null
        ? "Unlimited"
        : String(value);

  const formatAllocation =
    value =>
      value === null
        ? "Unlimited"
        : String(
            value ?? 0
          );

  const allocation =
    summary.allocation ?? {};

  const embed =
    new discord.EmbedBuilder()
      .setTitle(
        "Your BargazBot Entitlements"
      )
      .setDescription(
        "Entitlements are your total capacity. Allocations are the capacity you have contributed to this server."
      )
      .addFields(
        {
          name: "YouTube",
          value:
            `Entitlement: **${formatEntitlement(summary.entitlements.youtube_limit)}**\n` +
            `This server: **${formatAllocation(allocation.youtube_limit)}**`,
          inline: true
        },
        {
          name: "Twitch",
          value:
            `Entitlement: **${formatEntitlement(summary.entitlements.twitch_limit)}**\n` +
            `This server: **${formatAllocation(allocation.twitch_limit)}**`,
          inline: true
        },
        {
          name: "Kick",
          value:
            `Entitlement: **${formatEntitlement(summary.entitlements.kick_limit)}**\n` +
            `This server: **${formatAllocation(allocation.kick_limit)}**`,
          inline: true
        }
      )
      .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags:
      discord.MessageFlags.Ephemeral
  });
}

/*
=====================================================
Permission Commands
=====================================================
*/

async function handlePermissions(
  interaction
) {
  if (
    !await requirePermissionManagementAccess(
      interaction
    )
  ) {
    return;
  }

  switch (
    interaction.options
      .getSubcommand()
  ) {
    case "add-user":
      await handlePermissionAddUser(
        interaction
      );
      break;

    case "add-role":
      await handlePermissionAddRole(
        interaction
      );
      break;

    case "remove-user":
      await handlePermissionRemoveUser(
        interaction
      );
      break;

    case "remove-role":
      await handlePermissionRemoveRole(
        interaction
      );
      break;

    case "list":
      await handlePermissionList(
        interaction
      );
      break;
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

  const canManagePermissions =
    interaction.options.getBoolean(
      "can-manage-permissions",
      true
    );

  if (
    user.id ===
    interaction.guild.ownerId
  ) {
    await interaction.reply({
      content:
        "The server owner already has full BargazBot configuration and permission-management access.",

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const result =
    permissions.addPermission(
      interaction.guild.id,
      permissions
        .PERMISSION_TYPES
        .USER,
      user.id,
      canManagePermissions
    );

  const managementText =
    canManagePermissions
      ? "They can also manage BargazBot permissions."
      : "They cannot manage BargazBot permissions.";

  await logging.logPermissionChange(
    interaction.guild,
    {
      user:
        interaction.user,

      description:
        `${interaction.user} granted or updated BargazBot configuration access for ${user}.`,

      fields: [
        {
          name: "User",
          value:
            `${user}`,
          inline: true
        },
        {
          name:
            "Can Manage Permissions",
          value:
            canManagePermissions
              ? "Yes"
              : "No",
          inline: true
        }
      ]
    }
  );

  let actionText;

  if (result.created) {
    actionText =
      `${user} can now configure BargazBot.`;

  } else if (result.updated) {
    actionText =
      `${user}'s BargazBot permissions were updated.`;

  } else {
    actionText =
      `${user} already had these BargazBot permissions.`;
  }

  await interaction.reply({
    content:
      `${actionText}\n${managementText}`,

    flags:
      discord.MessageFlags.Ephemeral
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

  const canManagePermissions =
    interaction.options.getBoolean(
      "can-manage-permissions",
      true
    );

  const result =
    permissions.addPermission(
      interaction.guild.id,
      permissions
        .PERMISSION_TYPES
        .ROLE,
      role.id,
      canManagePermissions
    );

  const managementText =
    canManagePermissions
      ? "Members with this role can also manage BargazBot permissions."
      : "Members with this role cannot manage BargazBot permissions.";

  await logging.logPermissionChange(
    interaction.guild,
    {
      user:
        interaction.user,

      description:
        `${interaction.user} granted or updated BargazBot configuration access for ${role}.`,

      fields: [
        {
          name: "Role",
          value:
            `${role}`,
          inline: true
        },
        {
          name:
            "Can Manage Permissions",
          value:
            canManagePermissions
              ? "Yes"
              : "No",
          inline: true
        }
      ]
    }
  );

  let actionText;

  if (result.created) {
    actionText =
      `${role} can now configure BargazBot.`;

  } else if (result.updated) {
    actionText =
      `${role}'s BargazBot permissions were updated.`;

  } else {
    actionText =
      `${role} already had these BargazBot permissions.`;
  }

  await interaction.reply({
    content:
      `${actionText}\n${managementText}`,

    flags:
      discord.MessageFlags.Ephemeral
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

  if (
    user.id ===
    interaction.guild.ownerId
  ) {
    await interaction.reply({
      content:
        "The server owner's BargazBot permissions cannot be removed.",

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const removed =
    permissions.removePermission(
      interaction.guild.id,
      permissions
        .PERMISSION_TYPES
        .USER,
      user.id
    );

  if (removed) {
    await logging.logPermissionChange(
      interaction.guild,
      {
        user:
          interaction.user,

        description:
          `${interaction.user} removed BargazBot configuration access from ${user}.`,

        fields: [
          {
            name: "User",
            value:
              `${user}`,
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

    flags:
      discord.MessageFlags.Ephemeral
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
      permissions
        .PERMISSION_TYPES
        .ROLE,
      role.id
    );

  if (removed) {
    await logging.logPermissionChange(
      interaction.guild,
      {
        user:
          interaction.user,

        description:
          `${interaction.user} removed BargazBot configuration access from ${role}.`,

        fields: [
          {
            name: "Role",
            value:
              `${role}`,
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

    flags:
      discord.MessageFlags.Ephemeral
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
    const management =
      Number(
        entry.can_manage_permissions
      ) === 1
        ? " — Can manage permissions"
        : "";

    if (
      entry.permission_type ===
      permissions
        .PERMISSION_TYPES
        .USER
    ) {
      users.push(
        `<@${entry.target_id}>${management}`
      );
    }

    if (
      entry.permission_type ===
      permissions
        .PERMISSION_TYPES
        .ROLE
    ) {
      roles.push(
        `<@&${entry.target_id}>${management}`
      );
    }
  }

  const embed =
    new discord.EmbedBuilder()
      .setTitle(
        "BargazBot Configuration Permissions"
      )
      .setDescription(
        "The current server owner always has full configuration and permission-management access."
      )
      .addFields(
        {
          name:
            "Authorized Users",
          value:
            users.length
              ? users.join("\n")
              : "None"
        },
        {
          name:
            "Authorized Roles",
          value:
            roles.length
              ? roles.join("\n")
              : "None"
        }
      )
      .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Creator Notification Router
=====================================================
*/

async function handleNotification(
  interaction
) {
  if (
    !await requireConfigurationAccess(
      interaction
    )
  ) {
    return;
  }

  switch (
    interaction.options
      .getSubcommand()
  ) {
    case "add":
      await handleNotificationAdd(
        interaction
      );
      break;

    case "delete":
      await handleNotificationDelete(
        interaction
      );
      break;

    case "edit":
      await handleNotificationEdit(
        interaction
      );
      break;

    case "message":
      await handleNotificationMessage(
        interaction
      );
      break;

    case "channel":
      await handleNotificationChannel(
        interaction
      );
      break;

    case "refresh":
      await handleNotificationRefresh(
        interaction
      );
      break;

    case "list":
      await handleNotificationList(
        interaction
      );
      break;
  }
}


/*
=====================================================
Add Creator Notification
=====================================================
*/

async function handleNotificationAdd(
  interaction
) {
  await interaction.deferReply({
    flags:
      discord.MessageFlags.Ephemeral
  });

  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const creator =
    interaction.options.getString(
      "creator",
      true
    );

  const nickname =
    interaction.options
      .getString(
        "nickname",
        true
      )
      .trim();

  const notificationChannel =
    interaction.options.getChannel(
      "channel"
    );

  const customMessage =
    interaction.options.getString(
      "message"
    );

  if (!nickname) {
    await interaction.editReply({
      content:
        "The notification nickname cannot be empty."
    });

    return;
  }

  if (
    notifications
      .findGuildSubscription(
        interaction.guild.id,
        nickname,
        platform
      )
  ) {
    await interaction.editReply({
      content:
        `A ${notifications.getPlatformName(platform)} notification already uses the nickname **${nickname}**.`
    });

    return;
  }

  const result =
    await notifications
      .addSubscription(
        interaction.guild.id,
        platform,
        creator,
        nickname,
        notificationChannel
          ?.id ??
          null,
        customMessage ??
          null
      );

  if (!result.success) {
    if (
      result.reason ===
      "already-exists"
    ) {
      await interaction.editReply({
        content:
          "This server is already following that creator on this platform."
      });

      return;
    }

  if (
    result.reason ===
    "entitlement-limit"
  ) {
    await interaction.editReply({
      content:
        `This server has used all of its ` +
        `${notifications.getPlatformName(platform)} creator notification limit ` +
        `(**${result.usage}/${result.limit}**). ` +
        `The limit much be increased before another channel can be added.`
    });
    return;
  }

    await interaction.editReply({
      content:
        `BargazBot could not find that ${notifications.getPlatformName(platform)} channel.`
    });

    return;
  }

  const destination =
    notificationChannel
      ? `${notificationChannel}`
      : "the server's BargazBot notification channel";

  await interaction.editReply({
    content:
      `Added **${result.channel.channel_name}** on ` +
      `**${notifications.getPlatformName(platform)}** ` +
      `with the nickname **${nickname}**.\n` +
      `Destination: ${destination}\n` +
      `Message: ${
        customMessage
          ? "Custom"
          : "BargazBot default"
      }`
  });
}


/*
=====================================================
Delete Creator Notification
=====================================================
*/

async function handleNotificationDelete(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const nickname =
    interaction.options.getString(
      "nickname",
      true
    );

  const result =
    notifications
      .deleteSubscription(
        interaction.guild.id,
        nickname,
        platform
      );

  if (!result.success) {
    await interaction.reply({
      content:
        `No ${notifications.getPlatformName(platform)} creator notification was found with the nickname **${nickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.reply({
    content:
      `Deleted the **${result.subscription.nickname}** ` +
      `${notifications.getPlatformName(result.subscription.platform)} notification.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Edit Creator Notification Nickname
=====================================================
*/

async function handleNotificationEdit(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const nickname =
    interaction.options.getString(
      "nickname",
      true
    );

  const newNickname =
    interaction.options
      .getString(
        "new-nickname",
        true
      )
      .trim();

  if (!newNickname) {
    await interaction.reply({
      content:
        "The new nickname cannot be empty.",

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const current =
    notifications
      .findGuildSubscription(
        interaction.guild.id,
        nickname,
        platform
      );

  if (!current) {
    await interaction.reply({
      content:
        `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const duplicate =
    notifications
      .findGuildSubscription(
        interaction.guild.id,
        newNickname,
        platform
      );

  if (
    duplicate &&
    duplicate.channelId !==
      current.channelId
  ) {
    await interaction.reply({
      content:
        `A ${notifications.getPlatformName(platform)} notification already uses the nickname **${newNickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const result =
    notifications
      .editSubscription(
        interaction.guild.id,
        nickname,
        platform,
        newNickname
      );

  if (!result.success) {
    await interaction.reply({
      content:
        result.reason ===
        "nickname-exists"
          ? `A ${notifications.getPlatformName(platform)} notification already uses the nickname **${newNickname}**.`
          : `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.reply({
    content:
      `Changed the notification nickname from **${nickname}** to **${newNickname}**.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Creator Notification Message
=====================================================
*/

async function handleNotificationMessage(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const nickname =
    interaction.options.getString(
      "nickname",
      true
    );

  const customMessage =
    interaction.options.getString(
      "message",
      false
    );

  const result =
    notifications
      .setSubscriptionMessage(
        interaction.guild.id,
        nickname,
        platform,
        customMessage
      );

  if (!result.success) {
    await interaction.reply({
      content:
        `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.reply({
    content:
      customMessage === null
        ? `Restored **${nickname}** to BargazBot's default notification message.`
        : `Updated the custom notification message for **${nickname}**.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Creator Notification Channel
=====================================================
*/

async function handleNotificationChannel(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const nickname =
    interaction.options.getString(
      "nickname",
      true
    );

  const channel =
    interaction.options.getChannel(
      "channel",
      true
    );

  const result =
    notifications
      .setSubscriptionChannel(
        interaction.guild.id,
        nickname,
        platform,
        channel.id
      );

  if (!result.success) {
    await interaction.reply({
      content:
        `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`,

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.reply({
    content:
      `Creator notifications for **${nickname}** will now be sent to ${channel}.`,

    flags:
      discord.MessageFlags.Ephemeral
  });
}


/*
=====================================================
Refresh Creator Notification
=====================================================
*/

async function handleNotificationRefresh(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      true
    );

  const nickname =
    interaction.options.getString(
      "nickname",
      true
    );

  await interaction.deferReply({
    flags:
      discord.MessageFlags.Ephemeral
  });

  const result =
    await notifications
      .refreshSubscription(
        interaction.client,
        interaction.guild.id,
        nickname,
        platform
      );

  if (!result.success) {
    await interaction.editReply({
      content:
        `No ${notifications.getPlatformName(platform)} notification was found with the nickname **${nickname}**.`
    });

    return;
  }

  await interaction.editReply({
    content:
      `Refreshed **${result.subscription.nickname}** on ` +
      `**${notifications.getPlatformName(result.subscription.platform)}**.`
  });
}


/*
=====================================================
List Creator Notifications
=====================================================
*/

async function handleNotificationList(
  interaction
) {
  const platform =
    interaction.options.getString(
      "platform",
      false
    );

  const subscriptions =
    notifications
      .getGuildSubscriptions(
        interaction.guild.id,
        platform
      );

  if (!subscriptions.length) {
    await interaction.reply({
      content:
        platform
          ? `No ${notifications.getPlatformName(platform)} creator notifications are configured for this server.`
          : "No creator notifications are configured for this server.",

      flags:
        discord.MessageFlags.Ephemeral
    });

    return;
  }

  const lines =
    subscriptions.map(
      subscription => {
        const destination =
          subscription
            .discordChannelId
            ? `<#${subscription.discordChannelId}>`
            : "Default/fallback channel";

        const messageMode =
          subscription
            .customMessage
            ? "Custom message"
            : "Default message";

        return (
          `**${subscription.nickname}** — ` +
          `${notifications.getPlatformName(subscription.platform)}\n` +
          `${subscription.channelName}\n` +
          `Destination: ${destination} • ${messageMode}`
        );
      }
    );

  const chunks = [];

  let current = "";

  for (const line of lines) {
    const candidate =
      current
        ? `${current}\n\n${line}`
        : line;

    if (
      candidate.length >
      3900
    ) {
      chunks.push(
        current
      );

      current = line;

    } else {
      current =
        candidate;
    }
  }

  if (current) {
    chunks.push(
      current
    );
  }

  const embeds =
    chunks.map(
      (
        description,
        index
      ) =>
        new discord
          .EmbedBuilder()
          .setTitle(
            index === 0
              ? "Creator Notifications"
              : `Creator Notifications (${index + 1})`
          )
          .setDescription(
            description
          )
          .setTimestamp()
    );

  await interaction.reply({
    embeds,
    flags:
      discord.MessageFlags.Ephemeral
  });
}
