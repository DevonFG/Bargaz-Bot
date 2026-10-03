import { getDB } from "./storage.js";


/*
=====================================================
Platform Configuration
=====================================================
*/

const PLATFORM_COLUMNS = {
  youtube: "youtube_limit",
  twitch: "twitch_limit",
  kick: "kick_limit"
};

const SUBSCRIPTION_TABLES = {
  youtube: "guild_youtube_subs",
  twitch: "guild_twitch_subs",
  kick: "guild_kick_subs"
};


/*
=====================================================
Platform Helpers
=====================================================
*/

function normalizePlatform(platform) {
  const key =
    String(platform ?? "")
      .trim()
      .toLowerCase();

  if (!PLATFORM_COLUMNS[key]) {
    throw new Error(
      `Unknown entitlement platform: ${platform}`
    );
  }

  return key;
}


function getPlatformColumn(platform) {
  return PLATFORM_COLUMNS[
    normalizePlatform(platform)
  ];
}


function getSubscriptionTable(platform) {
  return SUBSCRIPTION_TABLES[
    normalizePlatform(platform)
  ];
}


/*
=====================================================
User Entitlements
=====================================================
*/

export function ensureUser(
  user
) {
  if (!user?.id) {
    return;
  }

  const db = getDB();

  db.prepare(`
    INSERT INTO users (
      user_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      updated_at =
        CURRENT_TIMESTAMP
  `).run(
    user.id
  );

  db.prepare(`
    INSERT INTO user_entitlements (
      user_id,
      youtube_limit,
      twitch_limit,
      kick_limit,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      NULL,
      NULL,
      NULL,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(user_id)
    DO NOTHING
  `).run(
    user.id
  );
}

export function getUserEntitlements(
  userId
) {
  const db = getDB();

  return (
    db.prepare(`
      SELECT
        user_id,
        youtube_limit,
        twitch_limit,
        kick_limit,
        created_at,
        updated_at
      FROM user_entitlements
      WHERE user_id = ?
    `).get(
      userId
    ) ??
    null
  );
}


export function getUserEntitlement(
  userId,
  platform
) {
  const column =
    getPlatformColumn(platform);

  const entitlement =
    getUserEntitlements(
      userId
    );

  if (!entitlement) {
    return {
      exists: false,
      unlimited: false,
      limit: 0
    };
  }

  const value =
    entitlement[column];

  if (value === null) {
    return {
      exists: true,
      unlimited: true,
      limit: null
    };
  }

  return {
    exists: true,
    unlimited: false,
    limit: Number(value)
  };
}


/*
=====================================================
User Allocations
=====================================================
*/

export function getUserAllocation(
  userId,
  guildId
) {
  const db = getDB();

  return (
    db.prepare(`
      SELECT
        user_id,
        guild_id,
        youtube_limit,
        twitch_limit,
        kick_limit,
        created_at,
        updated_at
      FROM entitlement_allocations
      WHERE user_id = ?
        AND guild_id = ?
    `).get(
      userId,
      guildId
    ) ??
    null
  );
}


export function getAllocatedTotal(
  userId,
  platform,
  excludeGuildId = null
) {
  const column =
    getPlatformColumn(platform);

  const db = getDB();

  const rows =
    excludeGuildId
      ? db.prepare(`
          SELECT ${column} AS allocation
          FROM entitlement_allocations
          WHERE user_id = ?
            AND guild_id != ?
        `).all(
          userId,
          excludeGuildId
        )
      : db.prepare(`
          SELECT ${column} AS allocation
          FROM entitlement_allocations
          WHERE user_id = ?
        `).all(
          userId
        );

  let total = 0;

  for (const row of rows) {
    if (row.allocation === null) {
      return null;
    }

    total += Number(
      row.allocation
    );
  }

  return total;
}


/*
=====================================================
Set Allocation
=====================================================
*/

export function setAllocation(
  userId,
  guildId,
  platform,
  amount
) {
  const key =
    normalizePlatform(platform);

  const column =
    getPlatformColumn(key);

  const entitlement =
    getUserEntitlement(
      userId,
      key
    );

  if (!entitlement.exists) {
    return {
      success: false,
      reason: "no-entitlement"
    };
  }

  const unlimitedAllocation =
    amount === null;

  if (
    unlimitedAllocation &&
    !entitlement.unlimited
  ) {
    return {
      success: false,
      reason: "not-unlimited"
    };
  }

  if (
    !unlimitedAllocation &&
    (
      !Number.isInteger(amount) ||
      amount < 0
    )
  ) {
    return {
      success: false,
      reason: "invalid-amount"
    };
  }

  const allocatedElsewhere =
    getAllocatedTotal(
      userId,
      key,
      guildId
    );

  if (
    !entitlement.unlimited &&
    allocatedElsewhere === null
  ) {
    return {
      success: false,
      reason: "allocation-conflict"
    };
  }

  if (
    !entitlement.unlimited &&
    (
      allocatedElsewhere +
      amount >
      entitlement.limit
    )
  ) {
    return {
      success: false,
      reason: "exceeds-entitlement",

      available:
        entitlement.limit -
        allocatedElsewhere
    };
  }

  const db = getDB();

  db.prepare(`
    INSERT INTO entitlement_allocations (
      user_id,
      guild_id,
      youtube_limit,
      twitch_limit,
      kick_limit,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      0,
      0,
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      user_id,
      guild_id
    )
    DO NOTHING
  `).run(
    userId,
    guildId
  );

  db.prepare(`
    UPDATE entitlement_allocations
    SET ${column} = ?,
        updated_at =
          CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND guild_id = ?
  `).run(
    amount,
    userId,
    guildId
  );

  return {
    success: true,
    unlimited:
      unlimitedAllocation,
    amount
  };
}


/*
=====================================================
Remove Allocation
=====================================================
*/

export function removeAllocation(
  userId,
  guildId,
  platform
) {
  const column =
    getPlatformColumn(platform);

  const db = getDB();

  const existing =
    getUserAllocation(
      userId,
      guildId
    );

  if (!existing) {
    return false;
  }

  /*
   * Zero means this user is contributing no
   * capacity to this guild. NULL cannot be
   * used here because NULL means unlimited.
   */

  const result =
    db.prepare(`
      UPDATE entitlement_allocations
      SET ${column} = 0,
          updated_at =
            CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND guild_id = ?
    `).run(
      userId,
      guildId
    );

  return (
    result.changes > 0
  );
}


/*
=====================================================
Guild Capacity
=====================================================
*/

export function getGuildCapacity(
  guildId,
  platform
) {
  const column =
    getPlatformColumn(platform);

  const db = getDB();

  const rows =
    db.prepare(`
      SELECT ${column} AS allocation
      FROM entitlement_allocations
      WHERE guild_id = ?
    `).all(
      guildId
    );

  let capacity = 0;

  for (const row of rows) {
    if (row.allocation === null) {
      return {
        unlimited: true,
        limit: null
      };
    }

    capacity += Number(
      row.allocation
    );
  }

  return {
    unlimited: false,
    limit: capacity
  };
}


/*
=====================================================
Guild Usage
=====================================================
*/

export function getGuildUsage(
  guildId,
  platform
) {
  const table =
    getSubscriptionTable(platform);

  const db = getDB();

  const row =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE guild_id = ?
    `).get(
      guildId
    );

  return Number(
    row?.count ?? 0
  );
}


/*
=====================================================
Capacity Check
=====================================================
*/

export function canAddSubscription(
  guildId,
  platform
) {
  const capacity =
    getGuildCapacity(
      guildId,
      platform
    );

  const usage =
    getGuildUsage(
      guildId,
      platform
    );

  if (capacity.unlimited) {
    return {
      allowed: true,
      unlimited: true,
      usage,
      limit: null
    };
  }

  return {
    allowed:
      usage < capacity.limit,

    unlimited: false,
    usage,
    limit:
      capacity.limit
  };
}


/*
=====================================================
Allocation Summary
=====================================================
*/

export function getAllocationSummary(
  userId,
  guildId
) {
  const allocation =
    getUserAllocation(
      userId,
      guildId
    );

  const entitlements =
    getUserEntitlements(
      userId
    );

  return {
    allocation,
    entitlements
  };
}
