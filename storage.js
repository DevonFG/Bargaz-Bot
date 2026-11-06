import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";

let db;

// Initialize SQLite connection & Schema
export function initDB() {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS guilds (
      guild_id TEXT PRIMARY KEY,
      guild_name TEXT,
      owner_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS guild_members (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id TEXT PRIMARY KEY,
      youtube_limit INTEGER DEFAULT NULL,
      twitch_limit INTEGER DEFAULT NULL,
      kick_limit INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS entitlement_allocations (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      youtube_limit INTEGER DEFAULT 0,
      twitch_limit INTEGER DEFAULT 0,
      kick_limit INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      announcement_channel_id TEXT,
      welcome_channel_id TEXT,
      goodbye_channel_id TEXT,
      logs_channel_id TEXT,
      updates_channel_id TEXT,
      status_channel_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_log_settings (
      guild_id TEXT NOT NULL,
      category TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, category),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS youtube_channels (
      channel_id TEXT PRIMARY KEY,
      channel_name TEXT,
      channel_url TEXT,
      channel_handle TEXT,
      uploads_playlist_id TEXT,
      last_upload_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS youtube_recent_ids (
      channel_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      newest_id TEXT,
      previous_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, content_type),
      FOREIGN KEY (channel_id) REFERENCES youtube_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS twitch_channels (
      channel_id TEXT PRIMARY KEY,
      channel_name TEXT,
      channel_url TEXT,
      channel_handle TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS kick_channels (
      channel_id TEXT PRIMARY KEY,
      channel_name TEXT,
      channel_url TEXT,
      channel_handle TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS guild_youtube_subs (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      nickname TEXT,
      discord_channel_id TEXT,
      custom_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, channel_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES youtube_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_twitch_subs (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      nickname TEXT,
      discord_channel_id TEXT,
      custom_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, channel_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES twitch_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_kick_subs (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      nickname TEXT,
      discord_channel_id TEXT,
      custom_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, channel_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES kick_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS youtube_content (
      video_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      title TEXT,
      thumbnail_url TEXT,
      scheduled_start_time DATETIME,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES youtube_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS twitch_content (
      stream_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT,
      thumbnail_url TEXT,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES twitch_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS kick_content (
      channel_id TEXT PRIMARY KEY,
      title TEXT,
      thumbnail_url TEXT,
      started_at DATETIME,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES kick_channels(channel_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_permissions (
      guild_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      can_manage_permissions INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_permissions IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, permission_type, target_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_permission_profiles (
      guild_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'configuration'
        CHECK (access_level IN ('full', 'configuration', 'custom')),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, permission_type, target_id),
      FOREIGN KEY (guild_id, permission_type, target_id)
        REFERENCES guild_permissions(guild_id, permission_type, target_id)
        ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS guild_command_permissions (
      guild_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0
        CHECK (allowed IN (0,1)),
      PRIMARY KEY (guild_id, permission_type, target_id, command_name),
      FOREIGN KEY (guild_id, permission_type, target_id)
        REFERENCES guild_permissions(guild_id, permission_type, target_id)
        ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS notification_messages (
      guild_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      content_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      discord_channel_id TEXT NOT NULL,
      discord_message_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, platform, content_id, event_type),
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS notification_refresh_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      used_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_notification_refresh_usage
      ON notification_refresh_usage (guild_id, platform, used_at);
  `);


const guildSettingsColumns = db.prepare("PRAGMA table_info(guild_settings)").all().map(column => column.name);
if (!guildSettingsColumns.includes("updates_channel_id")) {
  db.exec("ALTER TABLE guild_settings ADD COLUMN updates_channel_id TEXT");
  db.exec("UPDATE guild_settings SET updates_channel_id = COALESCE(announcement_channel_id, status_channel_id, logs_channel_id)");
  console.log("Added BargazBot Updates channel setting.");
}

// Note: Adding new columns of data requires a 1-time command in addition to adding to CREATE TABLE
// REMOVE THE db.prepare DURING THE NEXT UPDATE!!!
db.prepare(`
  INSERT OR IGNORE INTO guild_permission_profiles (
    guild_id,
    permission_type,
    target_id,
    access_level
  )
  SELECT
    guild_id,
    permission_type,
    target_id,
    CASE
      WHEN can_manage_permissions = 1 THEN 'full'
      ELSE 'configuration'
    END
  FROM guild_permissions
`).run();
  console.log("SQLite initialized at:", DB_PATH);
  return db;
}


// Get active DB connection
export function getDB() {
  if (databaseClosing) {throw new Error("SQLite is shutting down. New database operations are disabled.");}
  if (!db) {throw new Error("SQLite not initialized. Call initDB() first.");}
  return db;
}


let databaseClosing = false;
export function isDatabaseClosing() {return databaseClosing;}
export function closeDB() {
  if (databaseClosing) {return !db || !db.open;}
  databaseClosing = true;
  if (!db || !db.open) {return true;}
  try {db.close(); console.log("SQLite database closed.");                   return true;
  } catch (error) {console.error("Unable to close SQLite database:", error); return false;}
}
