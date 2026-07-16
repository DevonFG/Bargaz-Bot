import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";

let db;

// Initialize SQLite connection & Schema
export function initDB() {
  db = new Database(DB_PATH);

  db.exec(` CREATE TABLE IF NOT EXISTS logs
    (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    severity TEXT, -- info, warn, error, critical
    scope TEXT, -- guild, global, system, external
    type TEXT, -- logs, notifications, setup, etc
    trigger TEXT, -- command, auto, update, etc
    action TEXT -- /addchannel, newlog, etc
    guild_id TEXT,
    user_id TEXT,
    channel_id TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
