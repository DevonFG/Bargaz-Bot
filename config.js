const fs   = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "botconfig.json");

// Loads the bot config, always pulling sensitive values from .env
function loadConfig() {
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
function saveConfig(config) {
  const toSave = {
    welcomeMessage: config.welcomeMessage
  };
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2));
}

module.exports = { loadConfig, saveConfig };