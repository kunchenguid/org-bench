export function createPlayPageLayout() {
  return {
    zones: [
      { id: 'player-hand', value: 'Player hand' },
      { id: 'shared-battlefield', value: 'Battlefield' },
      { id: 'opponent-hand', value: 'Opponent hand' },
    ],
    encounterSummary: 'Ashen Vanguard wins after 6 turns in the deterministic preview lane so layout and persistence hooks stay deterministic.',
    turnControls: [{ label: 'Draw and charge' }, { label: 'Attack and pass' }],
  };
}
