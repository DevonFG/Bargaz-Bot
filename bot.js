import dotenv from "dotenv"; // loads .env file so process.env variables are available
import path from "path";
import express from "express";

dotenv.config();

import * as discord         from "discord.js";
import * as channelManager  from "./channelManager.js";
import * as commands        from "./commands.js";
import * as appLogger       from "./appLogger.js";
import * as owner           from "./owner.js";
import * as platformManager from "./platformManager.js";
import * as entitlements    from "./entitlements.js";

import { startUpsNotifier } from "./upsNotifier.js";
import { initDB }           from "./storage.js";



// Create a server for runtime/endpoints
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => { res.status(200).send("Bargaz-Bot online"); });
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

console.log("REACHED LISTEN STEP", PORT); //Temporary code for debugging

// Start server
app.listen(PORT, () => { console.log(`Health server listening on ${PORT}`); });

// Set up the Discord client with the permissions it needs
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,        // allows bot to see servers
    discord.GatewayIntentBits.GuildMessages, // allows bot to see messages
    discord.GatewayIntentBits.MessageContent, // allows bot to read message content
    discord.GatewayIntentBits.GuildMembers   // allows bot to see members
  ]
});

appLogger.initAppLogger();
appLogger.captureConsole();

process.on("uncaughtException", error => {console.error("Uncaught exception:", error);});
process.on("unhandledRejection", reason => {console.error("Unhandled promise rejection:", reason);});

initDB();

// When the bot first starts up and is ready
client.once("clientReady", async () => {
  owner.initOwnerSystem(client);
  console.log(`Logged in as ${client.user.tag}!`);

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()){
        if (member.user.bot){ continue; }
        entitlements.ensureUser( member.user );
      }
      console.log(`Registered ${members.filter(member => !member.user.bot).size} users from ${guild.name}.`);
    } catch (error) { console.error(`Failed to register users from ${guild.anme}:`,error);
  }
}

  await startUpsNotifier(client);
  await commands.registerCommands(client);
  await platformManager.startPlatformManager(client);

});

// When a new member joins a server
client.on(
  "guildMemberAdd",
  member => {
    if (member.user.bot) {
      return;
    }

    entitlements.ensureUser(
      member.user
    );
  }
);

// When the bot joins a new server setup guild
client.on("guildCreate", async (guild) => {
  try {
    await channelManager.setupGuild(guild);
    console.log(`Set up BargazBot channels for guild: ${guild.name} (${guild.id})`);
  } catch (error) {
    console.error(
      `Failed to set up BargazBot channels for guild ${guild.name} (${guild.id}):`, error
    );
  }
});

client.on("messageCreate", async (message) => {
  await owner.handleOwnerMessage(message);
});

// Start setup of /commands
client.on("interactionCreate", async (interaction) => {
  await commands.handleInteraction(interaction);
});

// Log the bot in using the token from the .env file
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error("Discord login failed:", err);
});
