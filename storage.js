/*
=====================================================
BargazBot Database Structure
=====================================================
*/

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
  `);

// Note: Adding new columns of data requires a 1-time command in addition to adding to CREATE TABLE

  console.log("SQLite initialized at:", DB_PATH);
  return db;
}

// Get active DB connection
export function getDB() {
  if (!db) {
    throw new Error("SQLite not initialized. Call initDB() first.");
  }
  return db;
}
