import fs from "fs";
import path from "path";
import fileURLToPath from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "botconfig.json");

// Loads the bot config, always pulling sensitive values from .env
export function loadConfig() {
  let saved = {};

  // Load any saved settings like welcome message from file if it exists
  if (fs.existsSync(configPath)) {
    saved = JSON.parse(fs.readFileSync(configPath));
  }

  // Always override sensitive values from .env so they never touch the file
  return {
    ownerServerId:      process.env.OWNER_SERVER_ID,
    announcementSource: process.env.OWNER_ANNOUNCEMENT_CHANNEL_ID,
    welcomeMessage:     saved.welcomeMessage || "Hello! I'm Bargaz Bot! I've created a channel for announcements. Use /setannouncementchannel to configure where you'd like announcements posted or keep announcements posted here!"
  };
}

// Saves welcome message to botconfig.json 
export function saveConfig(config) {
  const toSave = {
    welcomeMessage: config.welcomeMessage
  };
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2));
}