import * as discord from "discord.js";

import * as appLogger from "./appLogger.js";
import { EnvVar } from "./config.js";
import * as channelManager from "./channelManager.js";


let client = null;
let initialized = false;


/*
=====================================================
Owner Channel Configuration
=====================================================
*/

const OWNER_CHANNELS = {
  status: "OWNER_STATUS_CHANNEL",
  updates: "OWNER_UPDATES_CHANNEL",
  console: "OWNER_CONSOLE_CHANNEL",
  errors: "OWNER_ERRORS_CHANNEL"
};


/*
=====================================================
Initialization
=====================================================
*/

export function initOwnerSystem(
  discordClient
) {
  if (initialized) {
    return;
  }

  client = discordClient;
  initialized = true;

  appLogger.setLogEventHandler(
    handleApplicationLogEvent
  );

  console.log(
    "BargazBot owner system initialized."
  );
}


/*
=====================================================
Owner Access
=====================================================
*/

export function isOwner(
  userOrId
) {
  if (!EnvVar.OWNER_USER_ID) {
    return false;
  }

  const userId =
    typeof userOrId === "string"
      ? userOrId
      : userOrId?.id;

  return (
    userId ===
    EnvVar.OWNER_USER_ID
  );
}


/*
=====================================================
Owner Server
=====================================================
*/

export async function getOwnerServer() {
  if (
    !client ||
    !EnvVar.OWNER_SERVER_ID
  ) {
    return null;
  }

  const cachedGuild =
    client.guilds.cache.get(
      EnvVar.OWNER_SERVER_ID
    );

  if (cachedGuild) {
    return cachedGuild;
  }

  return await client.guilds
    .fetch(
      EnvVar.OWNER_SERVER_ID
    )
    .catch(() => null);
}


/*
=====================================================
Owner Channels
=====================================================
*/

export async function getOwnerChannel(
  purpose
) {
  const envName =
    OWNER_CHANNELS[purpose];

  if (!envName) {
    throw new Error(
      `Unknown BargazBot owner channel purpose: ${purpose}`
    );
  }

  const channelId =
    EnvVar[envName];

  if (!channelId) {
    return null;
  }

  const guild =
    await getOwnerServer();

  if (!guild) {
    return null;
  }

  const cachedChannel =
    guild.channels.cache.get(
      channelId
    );

  if (
    cachedChannel?.isTextBased() &&
    !cachedChannel.isThread()
  ) {
    return cachedChannel;
  }

  const fetchedChannel =
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (
    !fetchedChannel?.isTextBased() ||
    fetchedChannel.isThread()
  ) {
    return null;
  }

  return fetchedChannel;
}


/*
=====================================================
Diagnostic Formatting
=====================================================
*/

function truncateMessage(
  message,
  maxLength = 1900
) {
  const text =
    String(
      message ?? ""
    );

  if (
    text.length <= maxLength
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      maxLength - 20
    ) +
    "\n...[truncated]"
  );
}


function formatLogMessage(
  event
) {
  const level =
    String(
      event?.level ??
      "info"
    ).toUpperCase();

  const message =
    truncateMessage(
      event?.message ??
      ""
    );

  return (
    `**${level}**\n` +
    "```text\n" +
    message +
    "\n```"
  );
}


/*
=====================================================
Diagnostic Delivery
=====================================================
*/

async function sendDiagnostic(
  purpose,
  content
) {
  const channel =
    await getOwnerChannel(
      purpose
    );

  if (!channel) {
    return false;
  }

  try {
    await channel.send({
      content
    });

    return true;

  } catch (error) {
    process.stderr.write(
      "Failed to send BargazBot owner diagnostic: " +
      `${error?.stack ?? error}\n`
    );

    return false;
  }
}


/*
=====================================================
Application Log Events
=====================================================
*/

async function handleApplicationLogEvent(
  event
) {
  await sendDiagnostic(
    "console",
    formatLogMessage(event)
  );

  if (
    event.level === "error"
  ) {
    await sendDiagnostic(
      "errors",
      formatLogMessage(event)
    );
  }
}


/*
=====================================================
Owner Updates
=====================================================
*/

export async function handleOwnerMessage(
  message
) {
  if (
    !message ||
    message.author?.bot
  ) {
    return;
  }

  if (
    message.guildId !==
      EnvVar.OWNER_SERVER_ID ||
    message.channelId !==
      EnvVar.OWNER_UPDATES_CHANNEL
  ) {
    return;
  }

  /*
   * Only the configured BargazBot owner
   * can trigger a global update.
   */

  if (
    !isOwner(
      message.author
    )
  ) {
    return;
  }

  await broadcastOwnerUpdate(
    message
  );
}


/*
=====================================================
Owner Update Embed
=====================================================
*/

function buildOwnerUpdateEmbed(
  sourceMessage
) {
  const description =
    sourceMessage.content?.trim() ||
    "BargazBot update";

  return new discord.EmbedBuilder()
    .setTitle(
      "BargazBot Update"
    )
    .setDescription(
      description
    )
    .setTimestamp();
}


/*
=====================================================
Owner Update Broadcast
=====================================================
*/

async function broadcastOwnerUpdate(
  sourceMessage
) {
  if (!client) {
    throw new Error(
      "Cannot broadcast BargazBot owner update before the owner system is initialized."
    );
  }

  const embed =
    buildOwnerUpdateEmbed(
      sourceMessage
    );

  let sentCount = 0;
  let failedCount = 0;

  for (
    const guild
    of client.guilds.cache.values()
  ) {
    /*
     * Do not send the broadcast back into
     * BargazBot's owner server.
     */

    if (
      guild.id ===
      EnvVar.OWNER_SERVER_ID
    ) {
      continue;
    }

    try {
      /*
       * ensureChannel() handles all cases:
       *
       * - configured channel exists
       * - configured channel was deleted
       * - migrated server has no assignment
       * - an existing #bargazbot can be reused
       * - a new #bargazbot must be created
       */

      const channel =
        await channelManager
          .ensureChannel(
            guild,
            "notifications"
          );

      if (
        !channel?.isTextBased() ||
        channel.isThread()
      ) {
        throw new Error(
          "No usable notification channel was available."
        );
      }

      await channel.send({
        embeds: [embed]
      });

      sentCount++;

    } catch (error) {
      failedCount++;

      process.stderr.write(
        "Failed to send owner update to guild " +
        `${guild.id} (${guild.name}): ` +
        `${error?.stack ?? error}\n`
      );
    }
  }

  console.log(
    "Owner update broadcast completed.",
    {
      sent: sentCount,
      failed: failedCount
    }
  );

  return {
    sent: sentCount,
    failed: failedCount
  };
}


/*
=====================================================
Owner Status Channel
=====================================================
*/

export async function getOwnerStatusChannel() {
  return await getOwnerChannel(
    "status"
  );
}
