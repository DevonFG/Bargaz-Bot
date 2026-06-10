import sqlite3 from "sqlite3";
import {open } from "sqlite";
import { DB_PATH } from "./config.js";

const DB_PATH = process.env.DB_PATH || "./database/app.db";

let db;

// Initialize SQLite connection & Schema
export async function initDB() {
db = await open({
filename: DB_PATH,
driver: sqlite3.Database
});

await db.exec(` CREATE TABLE IF NOT EXISTS logs
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
