import { getStorageKey } from '../content/gameData'
import { type CampaignState, type DuelState } from './state'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function saveCampaignState(storage: StorageLike, campaign: CampaignState): void {
  storage.setItem(campaign.storageKey, JSON.stringify(campaign))
}

export function loadCampaignState(
  storage: StorageLike,
  namespace: string
): CampaignState | null {
  return readJson<CampaignState>(storage, getStorageKey(namespace, 'campaign'))
}

export function saveDuelState(storage: StorageLike, duel: DuelState): void {
  storage.setItem(duel.storageKey, JSON.stringify(duel))
}

export function loadDuelState(
  storage: StorageLike,
  namespace: string,
  encounterId: string
): DuelState | null {
  return readJson<DuelState>(storage, getStorageKey(namespace, `duel:${encounterId}`))
}

function readJson<T>(storage: StorageLike, key: string): T | null {
  const value = storage.getItem(key)

  if (!value) {
    return null
  }

  return JSON.parse(value) as T
}
