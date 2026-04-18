export type CampaignStatus = 'in_progress' | 'lost' | 'won';

export type CampaignProgress = {
  clearedEncounterIds: string[];
  currentEncounterId: string | null;
  encounterIds: string[];
  status: CampaignStatus;
};

export function createCampaignProgress(encounterIds: string[]): CampaignProgress {
  return {
    clearedEncounterIds: [],
    currentEncounterId: encounterIds[0] ?? null,
    encounterIds: [...encounterIds],
    status: 'in_progress',
  };
}

export function advanceEncounter(progress: CampaignProgress): CampaignProgress {
  if (progress.currentEncounterId === null) {
    return progress;
  }

  const nextClearedEncounterIds = [...progress.clearedEncounterIds, progress.currentEncounterId];
  const nextEncounter = progress.encounterIds[nextClearedEncounterIds.length] ?? null;

  return {
    ...progress,
    clearedEncounterIds: nextClearedEncounterIds,
    currentEncounterId: nextEncounter,
    status: nextEncounter === null ? 'won' : 'in_progress',
  };
}

export function markEncounterFailed(progress: CampaignProgress): CampaignProgress {
  return {
    ...progress,
    status: 'lost',
  };
}
