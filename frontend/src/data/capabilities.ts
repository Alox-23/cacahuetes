import type { DataModule } from '../contract/types'

/**
 * Optional features a data module may declare on top of the contract. The UI
 * feature-detects them instead of checking which module is in use.
 * `moveStop`: refineRoute understands { type: "move_stop" } (mock only for now;
 * the HTTP API has no endpoint yet, so reordering is hidden in API mode).
 */
export type DataCapabilities = { capabilities?: { moveStop?: boolean } }

export function canMoveStops(data: DataModule): boolean {
  return (data as DataModule & DataCapabilities).capabilities?.moveStop === true
}
