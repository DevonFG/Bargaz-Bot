import * as discord from "discord.js";

import * as appLogger      from "./appLogger.js";
import { EnvVar }          from "./config.js";
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

export function initOwnerSystem(discordClient) {
  if (initialized) {
    return;
  }
  client = discordClient;
  initialized = true;
  appLogger.setLogEventHandler(
    handleApplicationLogEvent
  );
  console.log("BargazBot owner system initialized.");
}

/*
=====================================================
Owner Access
=====================================================
*/

export function isOwner(userOrId) {
  if (!EnvVar.OWNER_USER_ID) {
    return false;
  }
  const userId =
    typeof userOrId === "string"
      ? userOrId
      : userOrId?.id;
  return userId === EnvVar.OWNER_USER_ID;
}

/*
=====================================================
Owner Server
=====================================================
*/

export async function getOwnerServer() {
  if (!client || !EnvVar.OWNER_SERVER_ID) {
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
    .fetch(EnvVar.OWNER_SERVER_ID)
    .catch(() => null);
}

/*
=====================================================
Owner Channels
=====================================================
*/

export async function getOwnerChannel(purpose) {
  const envName = OWNER_CHANNELS[purpose];

  if (!envName) {
    throw new Error(
      `Unknown BargazBot owner channel purpose: ${purpose}`
    );
  }
  const channelId = EnvVar[envName];

  if (!channelId) {
    return null;
  }
  const guild = await getOwnerServer();

  if (!guild) {
    return null;
  }
  const cachedChannel =
    guild.channels.cache.get(channelId);

  if (cachedChannel?.isTextBased()) {
    return cachedChannel;
  }
  const fetchedChannel =
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (!fetchedChannel?.isTextBased()) {
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
  if (message.length <= maxLength) {
    return message;
  }
  return (
    message.slice(
      0,
      maxLength - 20
    ) +
    "\n...[truncated]"
  );
}


function formatLogMessage(event) {
  const level =
    event.level.toUpperCase();
  const message =
    truncateMessage(event.message);
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
    await getOwnerChannel(purpose);

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

async function handleApplicationLogEvent(event) {
  await sendDiagnostic(
    "console",
    formatLogMessage(event)
  );

  if (event.level === "error") {
    await sendDiagnostic(
      "errors",
      formatLogMessage(event)
    );
  }
}

/*
=====================================================
Owner Updates (Announcements)
=====================================================
*/

export async function handleOwnerMessage(message) {
  if (message.author.bot) {
    return;
  }

  if (
    message.guildId !== EnvVar.OWNER_SERVER_ID ||
    message.channelId !== EnvVar.OWNER_UPDATES_CHANNEL
  ) {
    return;
  }
  await broadcastOwnerUpdate(message);
}


async function broadcastOwnerUpdate(
  sourceMessage
) {
  if (!client) {
    return;
  }
  const embed =
    new discord.EmbedBuilder()
      .setTitle("BargazBot Update")
      .setDescription(
        sourceMessage.content ||
        "BargazBot update"
      )
      .setTimestamp();

  let sentCount = 0;
  let failedCount = 0;

  for (
    const guild
    of client.guilds.cache.values()
  ) {

    if (guild.id === EnvVar.OWNER_SERVER_ID) {continue;}

    try {
      const channel =
        await channelManager.getChannel(
          guild,
          "notifications"
        );

      if (!channel?.isTextBased()) {
        failedCount++;
        continue;
      }
      await channel.send({
        embeds: [embed]
      });
      sentCount++;
    } catch (error) {
      failedCount++;
      process.stderr.write(
        `Failed to send owner update to guild ` +
        `${guild.id}: ` +
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
}


/*
=====================================================
Owner Status Channel
=====================================================
*/

export async function getOwnerStatusChannel() {
  return await getOwnerChannel("status");
}
