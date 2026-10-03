import { getDB } from "./storage.js";


/*
=====================================================
Permission Types
=====================================================
*/

export const PERMISSION_TYPES = {
  USER: "user",
  ROLE: "role"
};


/*
=====================================================
Validation
=====================================================
*/

function validatePermissionType(type) {
  if (
    type !== PERMISSION_TYPES.USER &&
    type !== PERMISSION_TYPES.ROLE
  ) {
    throw new Error(
      `Unknown BargazBot permission type: ${type}`
    );
  }
}


/*
=====================================================
Server Owner
=====================================================
*/

export function isGuildOwner(member) {
  if (!member?.guild) {
    return false;
  }

  return (
    member.id ===
    member.guild.ownerId
  );
}


/*
=====================================================
Get Matching Permission Entries
=====================================================
*/

function getMemberPermissionEntries(
  member
) {
  if (!member?.guild) {
    return [];
  }

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
    `).get(
      member.guild.id,
      PERMISSION_TYPES.USER,
      member.id
    );

  if (userPermission) {
    entries.push(
      userPermission
    );
  }

  const roleIds =
    [...member.roles.cache.keys()];

  if (roleIds.length === 0) {
    return entries;
  }

  const placeholders =
    roleIds
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
    `).all(
      member.guild.id,
      PERMISSION_TYPES.ROLE,
      ...roleIds
    );

  entries.push(
    ...rolePermissions
  );

  return entries;
}


/*
=====================================================
Configuration Permission Check
=====================================================
*/

export function canConfigureBargazBot(
  member
) {
  if (!member?.guild) {
    return false;
  }

  // The current Discord server owner
  // always has full BargazBot access.
  if (isGuildOwner(member)) {
    return true;
  }

  return (
    getMemberPermissionEntries(
      member
    ).length > 0
  );
}


/*
=====================================================
Permission Management Check
=====================================================
*/

export function canManagePermissions(
  member
) {
  if (!member?.guild) {
    return false;
  }

  // The current Discord server owner
  // always controls BargazBot permissions.
  if (isGuildOwner(member)) {
    return true;
  }

  const entries =
    getMemberPermissionEntries(
      member
    );

  return entries.some(
    entry =>
      Number(
        entry.can_manage_permissions
      ) === 1
  );
}


/*
=====================================================
Get Permission
=====================================================
*/

export function getPermission(
  guildId,
  type,
  targetId
) {
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
    `).get(
      guildId,
      type,
      targetId
    ) ??
    null
  );
}


/*
=====================================================
Add or Update Permission
=====================================================
*/

export function addPermission(
  guildId,
  type,
  targetId,
  canManagePermissions = false
) {
  validatePermissionType(type);

  const db = getDB();

  const existing =
    getPermission(
      guildId,
      type,
      targetId
    );

  const manageValue =
    canManagePermissions
      ? 1
      : 0;

  if (existing) {
    if (
      Number(
        existing.can_manage_permissions
      ) === manageValue
    ) {
      return {
        success: true,
        created: false,
        updated: false,
        permission: existing
      };
    }

    db.prepare(`
      UPDATE guild_permissions
      SET can_manage_permissions = ?
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id = ?
    `).run(
      manageValue,
      guildId,
      type,
      targetId
    );

    return {
      success: true,
      created: false,
      updated: true,

      permission: {
        ...existing,
        can_manage_permissions:
          manageValue
      }
    };
  }

  db.prepare(`
    INSERT INTO guild_permissions (
      guild_id,
      permission_type,
      target_id,
      can_manage_permissions,
      created_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP
    )
  `).run(
    guildId,
    type,
    targetId,
    manageValue
  );

  return {
    success: true,
    created: true,
    updated: false,

    permission: {
      permission_type: type,
      target_id: targetId,
      can_manage_permissions:
        manageValue
    }
  };
}


/*
=====================================================
Change Permission Management Access
=====================================================
*/

export function setPermissionManagement(
  guildId,
  type,
  targetId,
  canManagePermissions
) {
  validatePermissionType(type);

  const db = getDB();

  const result =
    db.prepare(`
      UPDATE guild_permissions
      SET can_manage_permissions = ?
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id = ?
    `).run(
      canManagePermissions
        ? 1
        : 0,
      guildId,
      type,
      targetId
    );

  return (
    result.changes > 0
  );
}


/*
=====================================================
Remove Permission
=====================================================
*/

export function removePermission(
  guildId,
  type,
  targetId
) {
  validatePermissionType(type);

  const db = getDB();

  const result =
    db.prepare(`
      DELETE FROM guild_permissions
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id = ?
    `).run(
      guildId,
      type,
      targetId
    );

  return (
    result.changes > 0
  );
}


/*
=====================================================
List Permissions
=====================================================
*/

export function getPermissions(
  guildId
) {
  const db = getDB();

  return db.prepare(`
    SELECT
      permission_type,
      target_id,
      can_manage_permissions,
      created_at
    FROM guild_permissions
    WHERE guild_id = ?
    ORDER BY
      permission_type ASC,
      created_at ASC
  `).all(
    guildId
  );
}
