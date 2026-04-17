export const playBoardZones = [
  'Enemy health',
  'Player health',
  'Resources',
  'Battlefield',
  'Hand',
  'Deck',
  'Discard',
  'Action controls',
  'Turn flow',
] as const;

export function getPlayBoardZones(): string[] {
  return [...playBoardZones];
}
