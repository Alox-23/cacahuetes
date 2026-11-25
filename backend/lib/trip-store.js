// SQL shared by the trip API and the agent tools: one implementation of every route and preference write.
export const localTrip = "lower(trim(itinerary->'request'->>'city')) = 'marbella'";
export const routeView = row => ({ ...row.itinerary, saved: row.saved });

/** Keeps the previous itinerary in `history` so undo works; any change clears the rating. */
export const historyUpdate = 'history=history || jsonb_build_array(itinerary), itinerary=$4::jsonb, rating=NULL';
export const undoUpdate = "itinerary=COALESCE(history->-1,itinerary), history=CASE WHEN jsonb_array_length(history)>0 THEN history - (-1) ELSE history END, rating=NULL";

export async function readPreferences(db, owner) {
  const { rows } = await db.query('SELECT preferences FROM travel_preferences WHERE owner_key=$1', [owner]);
  return rows[0]?.preferences ?? null;
}

export async function writePreferences(db, owner, prefs) {
  await db.query(`INSERT INTO travel_preferences(owner_key,preferences) VALUES ($1,$2::jsonb)
    ON CONFLICT(owner_key) DO UPDATE SET preferences=EXCLUDED.preferences`, [owner, JSON.stringify(prefs)]);
}

export async function readRoute(db, id, owner) {
  const { rows: [row] } = await db.query(
    `SELECT itinerary,saved,revision,preferences FROM travel_routes WHERE id=$1 AND owner_key=$2 AND ${localTrip}`, [id, owner]);
  return row ?? null;
}

export async function insertRoute(db, owner, route, prefs) {
  await db.query('INSERT INTO travel_routes(id,owner_key,itinerary,preferences) VALUES ($1,$2,$3::jsonb,$4::jsonb)',
    [route.id, owner, JSON.stringify(route), JSON.stringify(prefs)]);
}

/**
 * Revision-checked update, so simultaneous edits cannot overwrite one another or undo the wrong version.
 * `set` is historyUpdate, undoUpdate or the rating column; `value` is $4. Returns the new row, or null on a conflict.
 */
export async function updateRoute(db, id, owner, revision, set, value) {
  const { rows: [row] } = await db.query(`UPDATE travel_routes SET ${set}, revision=revision+1
    WHERE id=$1 AND owner_key=$2 AND revision=$3 RETURNING itinerary,saved,revision,preferences`,
  [id, owner, revision, ...(value === undefined ? [] : [value])]);
  return row ?? null;
}
