import { getDB } from "./storage.js";
import { PermissionFlagsBits } from "discord.js";

export const PERMISSION_TYPES =    {USER: "user", ROLE: "role"};
export const ACCESS_LEVELS =       {FULL: "full", CONFIGURATION: "configuration", CUSTOM: "custom"};
export const COMMAND_PERMISSIONS = {
  notification: ["add", "delete", "edit", "message", "channel", "refresh", "list"],
  channels: ["set", "list"],
  entitlement: ["allocate", "remove", "view"],
  permissions: ["add", "edit", "remove", "list"]
};
export const PUBLIC_COMMANDS = ["ping", "help"];

// Prevents invalid permission types from being stored in a database
// type = String, "user" or "role"
function validatePermissionType(type) {
  if (type !== PERMISSION_TYPES.USER && type !== PERMISSION_TYPES.ROLE) {
    throw new Error(`Unknown BargazBot permission type: ${type}`);
  }
}

// Checks if the Discord member is the server owner
// member = GuildMember
export function isGuildOwner(member) {
  if (!member?.guild) {return false;}
  return (member.id === member.guild.ownerId);
}

//Checks if the Discord member has Administrator permissions
// member = GuildMember
export function isGuildAdministrator(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

// Retieves all explicit user and role grants applicable to a member
// member = GuildMember
function getMemberPermissionEntries(member) {
  if (!member?.guild) {return [];}
  const db = getDB();
  const entries = [];
  const userPermission =
    db.prepare(`
      SELECT
        permission_type,
        target_id,
        can_manage_permissions
      FROM guild_permissions
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id = ?
      LIMIT 1
    `).get(member.guild.id, PERMISSION_TYPES.USER, member.id);
  if (userPermission) {entries.push(userPermission);}
  const memberRoleIds   = member.roles?.cache ? [...member.roles.cache.keys()] : Array.isArray(member.roles) ? member.roles : [];
  const roleIds         = [...new Set([member.guild.id, ...memberRoleIds])];
  if (roleIds.length === 0) {return entries;}
  const placeholders    = roleIds
    .map(() => "?")
    .join(", ");
  const rolePermissions =
    db.prepare(`
      SELECT
        permission_type,
        target_id,
        can_manage_permissions
      FROM guild_permissions
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id IN (${placeholders})
    `).all(member.guild.id, PERMISSION_TYPES.ROLE, ...roleIds);
  entries.push(...rolePermissions);
  return entries;
}

// Finds what permissions preset is assigned to a particular user or role
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// targetId = String, Discord user or role ID
export function getAccessLevel(guildId, type, targetId) {
  validatePermissionType(type);

  const db = getDB();
  const profile = db.prepare(`
    SELECT access_level
    FROM guild_permission_profiles
    WHERE guild_id = ?
      AND permission_type = ?
      AND target_id = ?
  `).get(guildId, type, targetId);

  if (profile) { return profile.access_level; }
  const legacy = getPermission(guildId, type, targetId);
  if (!legacy) { return null; }

  return Number(legacy.can_manage_permissions) === 1
    ? ACCESS_LEVELS.FULL
    : ACCESS_LEVELS.CONFIGURATION;
}

// Retrieves the individually authorized commands for a Custom Access profile
// guildId = String, Discord server ID
// type = String, "user" or "role"
// targetId = String, Discord user or role ID
export function getCustomCommands(guildId, type, targetId) {
  validatePermissionType(type);

  return getDB().prepare(`
    SELECT command_name
    FROM guild_command_permissions
    WHERE guild_id = ?
      AND permission_type = ?
      AND target_id = ?
      AND allowed = 1
  `).all(guildId, type, targetId).map(row => row.command_name);
}

// Determines whether a member can use a specific BargazBot command
// member = GuildMember
// command = String, Main command name i.e: "notification"
// subcommand = String, Subcommand name i.e: "add"
export function canUseCommand(member, command, subcommand = null) {
  if (!member?.guild) { return false; }
  if (PUBLIC_COMMANDS.includes(command)) {return subcommand === null;}
  if (!Object.hasOwn(COMMAND_PERMISSIONS, command)) {return false;}
  const allowed = getEffectiveCommands(member);
  if (subcommand) {
    if (!COMMAND_PERMISSIONS[command].includes(subcommand)) {return false;}
    return allowed.includes(`${command}.${subcommand}`);
  }
  return COMMAND_PERMISSIONS[command].some(name => allowed.includes(`${command}.${name}`));
}

// Validated a custom command selection and applies permission dependencies
// commands = Array of Strings, command identifiers
export function normalizeCustomCommands(commands) {
  const valid = new Set(
    Object.entries(COMMAND_PERMISSIONS)
      .flatMap(([command, subcommands]) => subcommands.map(subcommand => `${command}.${subcommand}`))
  );
  const selected = new Set(commands.filter(command => valid.has(command)));
  if (selected.has("entitlement.allocate")) { selected.add("entitlement.remove"); }
  return [...selected];
}

// Calculates the complete set of commands a member can use, combining all applicable grants
// member = GuildMember
export function getEffectiveCommands(member) {
  const allowed = new Set(PUBLIC_COMMANDS);
  if (!member?.guild) { return [...allowed]; }
  const allCommands = Object.entries(COMMAND_PERMISSIONS)
    .flatMap(([command, subcommands]) => subcommands.map(subcommand => `${command}.${subcommand}`));
  if (isGuildOwner(member) || isGuildAdministrator(member)) {return [...new Set([...allowed, ...allCommands])];}
  const entries = getMemberPermissionEntries(member);
  for (const entry of entries) {
    const level = getAccessLevel(member.guild.id, entry.permission_type, entry.target_id);
    if (level === ACCESS_LEVELS.FULL) {allCommands.forEach(command => allowed.add(command)); break;}
    if (level === ACCESS_LEVELS.CONFIGURATION) {allCommands
      .filter(command => !command.startsWith("permissions."))
      .forEach(command => allowed.add(command));
    }
    if (level === ACCESS_LEVELS.CUSTOM) {
      normalizeCustomCommands(getCustomCommands(member.guild.id, entry.permission_type, entry.target_id)).forEach(command => {
        if (allCommands.includes(command)) { allowed.add(command); }
      });
    }
  }

  // Allocate must never be usable without Remove.
  if (!allowed.has("entitlement.remove")) {allowed.delete("entitlement.allocate");}
  return [...allowed];
}

// Retrieves the original database record for a user or role
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// target_Id = String, Discord user or role ID
export function getPermission(guildId, type, targetId) {
  validatePermissionType(type);
  const db = getDB();
  return (
    db.prepare(`
      SELECT
        permission_type,
        target_id,
        can_manage_permissions,
        created_at
      FROM guild_permissions
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id = ?
      LIMIT 1
    `).get(guildId, type, targetId) ?? null
  );
}

// Legacy compatibility function for adding or updating a permission grant using the original boolean system
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// targetId = String, Discord user or role ID
// canManagePermissions = Boolean
export function addPermission(guildId, type, targetId, canManagePermissions = false) {
  const existing = getPermissionProfile(guildId, type, targetId);
  if (existing?.accessLevel === ACCESS_LEVELS.CUSTOM) {
    return {success: false, created: false, updated: false, reason: "custom_profile", permission: existing};
  }
  const accessLevel = canManagePermissions ? ACCESS_LEVELS.FULL : ACCESS_LEVELS.CONFIGURATION;
  const result = savePermissionProfile(guildId, type, targetId, accessLevel);
  return {...result, updated: !!existing && existing.accessLevel !== accessLevel, permission: getPermissionProfile(guildId, type, targetId)};
}

// Creates or update a permission profile, including preset and custom command selection
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// target_Id = String, Discord user or role ID
// accessLevel = String, "full", "configuration", or "custom"
// commands = Array of Strings, selected custom commands
export function savePermissionProfile(guildId, type, targetId, accessLevel, commands = []) {
  validatePermissionType(type);

  if (!Object.values(ACCESS_LEVELS).includes(accessLevel)) {throw new Error(`Invalid permission access level: ${accessLevel}`);}
  const db = getDB();
  const selectedCommands = accessLevel === ACCESS_LEVELS.CUSTOM
    ? normalizeCustomCommands(commands)
    : [];

  if (accessLevel === ACCESS_LEVELS.CUSTOM && selectedCommands.length === 0) {throw new Error("Custom Access requires at least one selected command.");}
  const canManage = accessLevel === ACCESS_LEVELS.FULL || (accessLevel === ACCESS_LEVELS.CUSTOM && selectedCommands.some(command => command.startsWith("permissions.") && command !== "permissions.list"));
  const save = db.transaction(() => {
    const existing = getPermission(guildId, type, targetId);
    
    db.prepare(`
      INSERT INTO guild_permissions (
        guild_id, permission_type, target_id, can_manage_permissions
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, permission_type, target_id)
      DO UPDATE SET can_manage_permissions = excluded.can_manage_permissions
    `).run(guildId, type, targetId, canManage ? 1 : 0);
    db.prepare(`
      INSERT INTO guild_permission_profiles (
        guild_id, permission_type, target_id, access_level, updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id, permission_type, target_id)
      DO UPDATE SET
        access_level = excluded.access_level,
        updated_at = CURRENT_TIMESTAMP
    `).run(guildId, type, targetId, accessLevel);
    db.prepare(`
      DELETE FROM guild_command_permissions
      WHERE guild_id = ? AND permission_type = ? AND target_id = ?
    `).run(guildId, type, targetId);

    const insert = db.prepare(`
      INSERT INTO guild_command_permissions (
        guild_id, permission_type, target_id, command_name, allowed
      )
      VALUES (?, ?, ?, ?, 1)
    `);

    for (const command of selectedCommands) {insert.run(guildId, type, targetId, command);}

    return {success: true, created: !existing, updated: !!existing, accessLevel, commands: selectedCommands};
  });
  return save();
}

// Retrieves the completed permission profile
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// target_Id = String, Discord user or role ID
export function getPermissionProfile(guildId, type, targetId) {
  validatePermissionType(type);

  const permission = getPermission(guildId, type, targetId);
  if (!permission) { return null; }

  const accessLevel = getAccessLevel(guildId, type, targetId);
  return {...permission, accessLevel, commands: accessLevel === ACCESS_LEVELS.CUSTOM ? getCustomCommands(guildId, type, targetId) : []};
}

// Legacy function for changing whether an existing grant includes permission-management access
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// targetId = String, Discord user or role ID
// canManagePermissions = Boolean
export function setPermissionManagement(guildId, type, targetId, canManagePermissions) {
  const existing = getPermissionProfile(guildId, type, targetId);
  if (!existing || existing.accessLevel === ACCESS_LEVELS.CUSTOM) {return false;}
  const accessLevel = canManagePermissions ? ACCESS_LEVELS.FULL : ACCESS_LEVELS.CONFIGURATION;
  savePermissionProfile(guildId, type, targetId, accessLevel);
  return true;
}

// Deletes a pre-assigned assigned permission grant
// guildId = String, Discord Server ID
// type = String, "user" or "role"
// target_Id = String, Discord user or role ID
export function removePermission(guildId, type, targetId) {
  validatePermissionType(type);

  if (type === PERMISSION_TYPES.ROLE && targetId === guildId) {return false;}
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM guild_permissions
    WHERE guild_id = ?
      AND permission_type = ?
      AND target_id = ?
  `).run(guildId, type, targetId);
  return result.changes > 0;
}

// Retrieves all authorized users and roles in a Discord server
// guildId = String, Discord Server ID
export function getPermissions(guildId) {
  const db = getDB();
  const entries = db.prepare(`
    SELECT
      permission_type,
      target_id,
      can_manage_permissions,
      created_at
    FROM guild_permissions
    WHERE guild_id = ?
    ORDER BY permission_type ASC, target_id ASC
  `).all(guildId);
  return entries.map(entry => {
    const accessLevel = getAccessLevel(guildId, entry.permission_type, entry.target_id);
    return {...entry, accessLevel, commands: accessLevel === ACCESS_LEVELS.CUSTOM ? getCustomCommands(guildId, entry.permission_type, entry.target_id) : []};
  });
}

// Converts a saved permission profile into a completed list
// profile = Object
export function getProfileCommands(profile) {
  if (!profile) { return []; }
  const allCommands = Object.entries(COMMAND_PERMISSIONS)
    .flatMap(([command, subcommands]) => subcommands.map(subcommand => `${command}.${subcommand}`));
  if (profile.accessLevel === ACCESS_LEVELS.FULL) {return allCommands;}
  if (profile.accessLevel === ACCESS_LEVELS.CONFIGURATION) {return allCommands.filter(command => !command.startsWith("permissions."));}
  if (profile.accessLevel === ACCESS_LEVELS.CUSTOM) {return normalizeCustomCommands(profile.commands ?? []);}
  return [];
}

// Compare two permission profiles to identify changes before saving
// oldProfile = Object
// newProfile = Object
export function comparePermissionProfiles(oldProfile, newProfile) {
  const previous = new Set(getProfileCommands(oldProfile));
  const current = new Set(getProfileCommands(newProfile));
  return {
    added: [...current].filter(command => !previous.has(command)),
    removed: [...previous].filter(command => !current.has(command)),
    unchanged: [...current].filter(command => previous.has(command))
  };
}