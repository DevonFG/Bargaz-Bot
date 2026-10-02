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
Permission Check
=====================================================
*/

export function canConfigureBargazBot(member) {
  if (!member?.guild) {
    return false;
  }

  if (
    member.id ===
    member.guild.ownerId
  ) {
    return true;
  }

  const db = getDB();
  const userPermission =
    db.prepare(`
      SELECT 1
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
    return true;
  }

  const roleIds =
    [...member.roles.cache.keys()];

  if (roleIds.length === 0) {
    return false;
  }

  const placeholders =
    roleIds
      .map(() => "?")
      .join(", ");
  const rolePermission =
    db.prepare(`
      SELECT 1
      FROM guild_permissions
      WHERE guild_id = ?
        AND permission_type = ?
        AND target_id IN (${placeholders})
      LIMIT 1
    `).get(
      member.guild.id,
      PERMISSION_TYPES.ROLE,
      ...roleIds
    );
  return Boolean(rolePermission);
}

/*
=====================================================
Add Permission
=====================================================
*/

export function addPermission(
  guildId,
  type,
  targetId
) {
  validatePermissionType(type);

  const db = getDB();
  const result =
    db.prepare(`
      INSERT OR IGNORE INTO guild_permissions (
        guild_id,
        permission_type,
        target_id,
        created_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      guildId,
      type,
      targetId
    );
  return result.changes > 0;
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
  return result.changes > 0;
}

/*
=====================================================
List Permissions
=====================================================
*/

export function getPermissions(guildId) {
  const db = getDB();
  return db.prepare(`
    SELECT
      permission_type,
      target_id,
      created_at
    FROM guild_permissions
    WHERE guild_id = ?
    ORDER BY
      permission_type ASC,
      created_at ASC
  `).all(guildId);
}
