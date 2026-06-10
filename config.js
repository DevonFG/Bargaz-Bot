import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ENV Variables
// OWNER_SERVER_ID, OWNER_ANNOUNCEMENT_CHANNEL_ID, OWNER_LOG_CHANNEL_ID,
// OWNER_WARNING_CHANNEL_ID, BOT_TOKEN, YOUTUBE_API_KEY, TWITCH_CLIENT_ID,
// and TWITCH_CLIENT_SECRET as of v26.6.15
export const EnvVar = process.env;

// File Paths
export const DATA_DIR = "/home/devon/data/discord-bot";

export const DB_PATH = path.join(DATA_DIR, "database/app.db");
export const LOG_DIR = path.join(DATA_DIR, "logs");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");

// Json Config
const configPath = path.join(__dirname, "bot-config.json");


// Loads the bot config, always pulling sensitive values from .env
export function loadConfig() {
  let saved = {};

  // Load any saved settings like welcome message from file if it exists
  if (fs.existsSync(configPath)) {
    try { 
	saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (err) {
	console.error("failed to parse bot-config.json:", err);
    }
  }

  // Always override sensitive values from .env so they never touch the file
  return {
    welcomeMessage:     saved.welcomeMessage || "Hello! I'm Bargaz Bot! I've created a channel for announcements. Use /setannouncementchannel to configure where you'd like announcements posted or keep announcements posted here!"
  };
}

// Saves welcome message to botconfig.json 
export function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2));
}
