import { simulateEncounter } from '../game/duel';

export type PlayHeroSummary = {
  id: 'enemy' | 'player';
  name: string;
  health: number;
  detail: string;
};

export type PlayZone = {
  id:
    | 'enemy-deck'
    | 'enemy-hand'
    | 'enemy-battlefield'
    | 'shared-battlefield'
    | 'player-battlefield'
    | 'player-hand'
    | 'player-resources'
    | 'player-discard'
    | 'player-deck';
  label: string;
  value: string;
  emphasis?: boolean;
};

export type TurnControl = {
  label: string;
  tone?: 'primary' | 'secondary';
};

export type EncounterLogEntry = {
  turn: number;
  actor: string;
  mana: string;
  health: string;
  actions: string[];
};

export type PlayPageLayout = {
  heroes: PlayHeroSummary[];
  zones: PlayZone[];
  turnControls: TurnControl[];
  encounterSummary: string;
  encounterLog: EncounterLogEntry[];
};

export function createPlayPageLayout(): PlayPageLayout {
  const encounter = simulateEncounter();
  const lastEnemyTurn = [...encounter.turns].reverse().find((turn) => turn.actor === 'Enemy AI');
  const lastTurn = encounter.turns[encounter.turns.length - 1];

  return {
    heroes: [
      {
        id: 'enemy',
        name: encounter.enemy.name,
        health: encounter.enemy.heroHealth,
        detail: lastEnemyTurn?.actions[lastEnemyTurn.actions.length - 1]?.summary ?? 'Enemy AI is waiting for its first legal turn.',
      },
      {
        id: 'player',
        name: encounter.player.name,
        health: encounter.player.heroHealth,
        detail: `${encounter.player.discardCount} cards spent, ${encounter.player.deckCount} cards left in deck.`,
      },
    ],
    zones: [
      { id: 'enemy-deck', label: 'Enemy deck', value: `${encounter.enemy.deckCount} cards` },
      { id: 'enemy-hand', label: 'Enemy hand', value: `${encounter.enemy.handCount} cards` },
      {
        id: 'enemy-battlefield',
        label: 'Enemy battlefield',
        value: describeBoard(encounter.enemy.board),
      },
      {
        id: 'shared-battlefield',
        label: 'Combat lane',
        value: `${encounter.winner} wins after ${encounter.turns.length} turns`,
        emphasis: true,
      },
      {
        id: 'player-battlefield',
        label: 'Your battlefield',
        value: describeBoard(encounter.player.board),
      },
      { id: 'player-hand', label: 'Your hand', value: `${encounter.player.handCount} cards` },
      {
        id: 'player-resources',
        label: 'Resources',
        value: `${lastTurn.endMana} of ${lastTurn.startMana} floating on the last turn`,
      },
      { id: 'player-discard', label: 'Discard pile', value: `${encounter.player.discardCount} cards` },
      { id: 'player-deck', label: 'Draw pile', value: `${encounter.player.deckCount} cards` },
    ],
    turnControls: [
      { label: 'Draw and charge', tone: 'secondary' },
      { label: 'Play legal cards', tone: 'secondary' },
      { label: 'Attack and pass', tone: 'primary' },
    ],
    encounterSummary: `${encounter.winner} closes the duel with deterministic turns, visible mana spend, and explicit attack logs.`,
    encounterLog: encounter.turns.map((turn) => ({
      turn: turn.turn,
      actor: turn.actor,
      mana: `${turn.startMana} -> ${turn.endMana}`,
      health: `Player ${turn.playerHeroHealth} / Enemy ${turn.enemyHeroHealth}`,
      actions: turn.actions.map((action) => action.summary),
    })),
  };
}

export const playPageLayout = createPlayPageLayout();

function describeBoard(board: { name: string; attack: number; health: number }[]) {
  if (board.length === 0) {
    return 'Empty';
  }

  return board.map((unit) => `${unit.name} ${unit.attack}/${unit.health}`).join(', ');
}
