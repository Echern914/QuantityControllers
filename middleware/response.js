/* ============================================================
   VENUECORE - Response Helpers
   Standardized API response formatting & pagination
   ============================================================ */

/**
 * Paginate a SQLite query result set.
 * When ?page is passed, returns { data, pagination }.
 * Otherwise returns the raw array (with optional defaultLimit) for backwards compatibility.
 *
 * @param {object} db - better-sqlite3 instance
 * @param {string} sql - Base query (without LIMIT/OFFSET)
 * @param {array} params - Bound parameters
 * @param {object} query - req.query with optional page, per_page
 * @param {object} [opts] - Options
 * @param {number} [opts.defaultLimit] - Max rows when not paginating (0 = unlimited)
 * @returns {{ data, pagination } | array}
 */
function paginate(db, sql, params, query, opts = {}) {
  const page = parseInt(query.page);
  if (!Number.isFinite(page) || page < 1) {
    // No pagination requested — return raw array (backwards compat)
    if (opts.defaultLimit) {
      return db.prepare(`${sql} LIMIT ?`).all(...params, opts.defaultLimit);
    }
    return db.prepare(sql).all(...params);
  }

  const perPage = Math.min(Math.max(1, parseInt(query.per_page) || 50), 500);
  const offset = (page - 1) * perPage;

  // Count total rows
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const { total } = db.prepare(countSql).get(...params);

  // Fetch page
  const pagedSql = `${sql} LIMIT ? OFFSET ?`;
  const data = db.prepare(pagedSql).all(...params, perPage, offset);

  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total_count: total,
      total_pages: Math.ceil(total / perPage),
      has_more: offset + data.length < total,
    },
  };
}

module.exports = { paginate };
