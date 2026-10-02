import * as discord from "discord.js";

import { getDB } from "./storage.js";
import * as channelManager from "./channelManager.js";

/*
=====================================================
Logging Categories
=====================================================
*/

export const LOG_CATEGORIES = {
  commands: {
    name: "Commands",
    defaultEnabled: true
  },

  configuration: {
    name: "Configuration",
    defaultEnabled: true
  },

  permissions: {
    name: "Permissions",
    defaultEnabled: true
  },

  subscriptions: {
    name: "Subscriptions",
    defaultEnabled: true
  },

  moderation: {
    name: "Moderation",
    defaultEnabled: true
  },

  automatic: {
    name: "Automatic actions",
    defaultEnabled: true
  },

  errors: {
    name: "Errors",
    defaultEnabled: true
  }
};

/*
=====================================================
Category Validation
=====================================================
*/

function getCategoryDefinition(category) {
  const definition =
    LOG_CATEGORIES[category];

  if (!definition) {
    throw new Error(
      `Unknown BargazBot log category: ${category}`
    );
  }
  return definition;
}

/*
=====================================================
Logging Settings
=====================================================
*/

export function isCategoryEnabled(
  guildId,
  category
) {
  const definition =
    getCategoryDefinition(category);
  const db = getDB();
  const row = db.prepare(`
    SELECT enabled
    FROM guild_log_settings
    WHERE guild_id = ?
      AND category = ?
  `).get(
    guildId,
    category
  );

  if (!row) {
    return definition.defaultEnabled;
  }
  return row.enabled === 1;
}


/*
=====================================================
Set Category Override
=====================================================
*/

export function setCategoryEnabled(
  guildId,
  category,
  enabled
) {
  const definition =
    getCategoryDefinition(category);
  const db = getDB();
  const normalizedEnabled =
    Boolean(enabled);

  if (
    normalizedEnabled ===
    definition.defaultEnabled
  ) {
    db.prepare(`
      DELETE FROM guild_log_settings
      WHERE guild_id = ?
        AND category = ?
    `).run(
      guildId,
      category
    );
    return;
  }

  db.prepare(`
    INSERT INTO guild_log_settings (
      guild_id,
      category,
      enabled,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

    ON CONFLICT(guild_id, category) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    guildId,
    category,
    normalizedEnabled ? 1 : 0
  );
}

/*
=====================================================
Reset Category
=====================================================
*/

export function resetCategory(
  guildId,
  category
) {
  getCategoryDefinition(category);

  const db = getDB();

  db.prepare(`
    DELETE FROM guild_log_settings
    WHERE guild_id = ?
      AND category = ?
  `).run(
    guildId,
    category
  );
}

/*
=====================================================
Get Effective Settings
=====================================================
*/

export function getLogSettings(guildId) {
  const db = getDB();
  const overrides = db.prepare(`
    SELECT category, enabled
    FROM guild_log_settings
    WHERE guild_id = ?
  `).all(guildId);
  const overrideMap =
    new Map(
      overrides.map(row => [
        row.category,
        row.enabled === 1
      ])
    );
  const settings = {};

  for (
    const [category, definition]
    of Object.entries(LOG_CATEGORIES)
  ) {
    settings[category] = {
      name: definition.name,

      enabled:
        overrideMap.has(category)
          ? overrideMap.get(category)
          : definition.defaultEnabled,

      isOverride:
        overrideMap.has(category)
    };
  }
  return settings;
}

/*
=====================================================
Embed Creation
=====================================================
*/

function buildLogEmbed({
  category,
  title,
  description,
  user = null,
  fields = [],
  timestamp = new Date()
}) {
  const definition =
    getCategoryDefinition(category);
  const embed =
    new discord.EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setFooter({
        text:
          `BargazBot • ${definition.name}`
      })
      .setTimestamp(timestamp);

  if (user) {
    embed.setAuthor({
      name:
        user.globalName ??
        user.username ??
        "Unknown user",

      iconURL:
        user.displayAvatarURL?.() ??
        undefined
    });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }
  return embed;
}

/*
=====================================================
Send Guild Log
=====================================================
*/

export async function logGuildEvent(
  guild,
  {
    category,
    title,
    description,
    user = null,
    fields = []
  }
) {
  if (!guild) {
    return false;
  }

  if (
    !isCategoryEnabled(
      guild.id,
      category
    )
  ) {
    return false;
  }

  const channel =
    await channelManager.getChannel(
      guild,
      "logs"
    );

  if (!channel?.isTextBased()) {
    return false;
  }

  const embed =
    buildLogEmbed({
      category,
      title,
      description,
      user,
      fields
    });

  try {
    await channel.send({
      embeds: [embed]
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to send BargazBot guild log for ` +
      `${guild.id}:`,
      error
    );
    return false;
  }
}

/*
=====================================================
Command Logging
=====================================================
*/

export async function logCommand(
  interaction,
  {
    successful = true,
    details = null
  } = {}
) {
  if (!interaction.guild) {
    return false;
  }

  const subcommand =
    interaction.options
      ?.getSubcommand(false);
  const commandName =
    subcommand
      ? `/${interaction.commandName} ${subcommand}`
      : `/${interaction.commandName}`;
  const fields = [
    {
      name: "Command",
      value: commandName,
      inline: true
    },
    {
      name: "Result",
      value:
        successful
          ? "Completed"
          : "Failed",
      inline: true
    }
  ];

  if (interaction.channelId) {
    fields.push({
      name: "Channel",
      value: `<#${interaction.channelId}>`,
      inline: true
    });
  }

  if (details) {
    fields.push({
      name: "Details",
      value: String(details),
      inline: false
    });
  }
  return await logGuildEvent(
    interaction.guild,
    {
      category: "commands",
      title: "BargazBot Command",
      description:
        `${interaction.user} used a BargazBot command.`,
      user: interaction.user,
      fields
    }
  );
}

/*
=====================================================
Configuration Logging
=====================================================
*/

export async function logConfigurationChange(
  guild,
  {
    user = null,
    title = "BargazBot Configuration Changed",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "configuration",
      title,
      description,
      user,
      fields
    }
  );
}

/*
=====================================================
Permission Logging
=====================================================
*/

export async function logPermissionChange(
  guild,
  {
    user = null,
    title = "BargazBot Permissions Changed",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "permissions",
      title,
      description,
      user,
      fields
    }
  );
}

/*
=====================================================
Subscription Logging
=====================================================
*/

export async function logSubscriptionChange(
  guild,
  {
    user = null,
    title = "Creator Notification Changed",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "subscriptions",
      title,
      description,
      user,
      fields
    }
  );
}

/*
=====================================================
Moderation Logging
=====================================================
*/

export async function logModerationAction(
  guild,
  {
    user = null,
    title = "BargazBot Moderation Action",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "moderation",
      title,
      description,
      user,
      fields
    }
  );
}

/*
=====================================================
Automatic Action Logging
=====================================================
*/

export async function logAutomaticAction(
  guild,
  {
    title = "BargazBot Automatic Action",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "automatic",
      title,
      description,
      fields
    }
  );
}

/*
=====================================================
Guild Error Logging
=====================================================
*/

export async function logGuildError(
  guild,
  {
    title = "BargazBot Error",
    description,
    fields = []
  }
) {
  return await logGuildEvent(
    guild,
    {
      category: "errors",
      title,
      description,
      fields
    }
  );
}
