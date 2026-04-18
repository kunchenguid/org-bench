import { createCampaignState, createDuelState } from './state';
import {
  loadCampaignState,
  loadDuelState,
  saveCampaignState,
  saveDuelState
} from './persistence';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}

describe('game persistence', () => {
  it('saves and loads campaign state using the namespaced campaign key', () => {
    const storage = createStorage();
    const campaign = createCampaignState('oracle-seed-01');

    campaign.completedEncounterIds = ['ashen-adept'];
    campaign.currentEncounterId = 'mirror-warden';
    campaign.remainingEncounterIds = ['cinder-tyrant'];

    saveCampaignState(storage, campaign);

    expect(loadCampaignState(storage, 'oracle-seed-01')).toEqual(campaign);
  });

  it('saves and loads duel state using the encounter-specific key', () => {
    const storage = createStorage();
    const duel = createDuelState('oracle-seed-01', 'ashen-adept');

    duel.phase = 'main';
    duel.turnNumber = 2;
    duel.player.health = 17;

    saveDuelState(storage, duel);

    expect(loadDuelState(storage, 'oracle-seed-01', 'ashen-adept')).toEqual(duel);
  });

  it('returns null when no saved payload exists', () => {
    const storage = createStorage();

    expect(loadCampaignState(storage, 'oracle-seed-01')).toBeNull();
    expect(loadDuelState(storage, 'oracle-seed-01', 'ashen-adept')).toBeNull();
  });
});
