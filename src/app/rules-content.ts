export type RuleSection = {
  title: string;
  intro: string;
  items: string[];
};

export type LadderStep = {
  name: string;
  goal: string;
};

export const rulesSections: RuleSection[] = [
  {
    title: 'Turn Flow',
    intro: 'Every round follows the same order, so plan your whole turn before you commit cards.',
    items: [
      'Draw one card at the start of your turn.',
      'Gain 1 resource for the turn, then spend resources to play cards from hand.',
      'Play creatures onto your battlefield and cast spells before combat starts.',
      'Combat resolves after both players finish playing cards, then the turn passes.',
    ],
  },
  {
    title: 'Resources',
    intro: 'Resources are your mana for the turn. Efficient spending usually wins close games.',
    items: [
      'Each card has a cost shown on it.',
      'You gain a fresh resource each turn, which increases your options as the match goes longer.',
      'Unused resources do not matter if you are falling behind on the board, so spend early turns to develop.',
    ],
  },
  {
    title: 'Card Types',
    intro: 'The core deck has two card types, and each one asks for different timing.',
    items: [
      'Creatures stay in play and can attack or block on later combats.',
      'Spells resolve once, apply their text immediately, then move to the discard pile.',
      'Curve out with creatures first, then use spells to swing a race or remove blockers.',
    ],
  },
  {
    title: 'Combat',
    intro: 'Board control decides most matches. Learn when to attack and when to leave blockers back.',
    items: [
      'Your ready creatures attack during combat unless an effect says otherwise.',
      'Enemy creatures block opposing attackers one-for-one when they are available to block.',
      'Unblocked attack damage hits the opposing hero, while blocked creatures deal damage to each other.',
      "Damage equal to or greater than a creature's health defeats it and sends it to the discard pile.",
    ],
  },
  {
    title: 'Victory',
    intro: 'Matches end fast once one side loses tempo, so keep the end conditions in mind.',
    items: [
      'Reduce the opposing hero to zero health to win immediately.',
      'If a player must draw from an empty deck, they lose the match.',
      'When the board is stable, count lethal damage for the next two turns before committing a spell.',
    ],
  },
  {
    title: 'Keywords',
    intro: 'Keywords shorten card text. The first ladder decks lean on a small set of them.',
    items: [
      'Charge: this creature can attack on the turn it enters play.',
      'Guard: enemy attackers must get through this creature before they can hit your hero.',
      'Draw: the effect gives you extra cards immediately.',
      'Burn: the effect deals direct damage without needing an attack.',
    ],
  },
];

export const ladderSteps: LadderStep[] = [
  {
    name: 'Rookie Table',
    goal: 'Learn to spend all of your early resources and keep at least one blocker on board.',
  },
  {
    name: 'Gauntlet Match',
    goal: 'Start trading creatures efficiently instead of racing every turn.',
  },
  {
    name: 'Arena Trial',
    goal: 'Play around combat tricks and save burn spells to finish the hero when possible.',
  },
  {
    name: 'Champion Duel',
    goal: 'Win a long game by protecting your health total and planning two turns ahead.',
  },
];
