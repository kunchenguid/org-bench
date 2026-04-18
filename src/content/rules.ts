export type RulesSection = {
  title: string;
  body: string;
};

export const rulesSections: RulesSection[] = [
  {
    title: 'Goal',
    body:
      'Break the rogue AI defense line before it breaks yours. Reduce the opposing core to zero integrity while keeping enough tempo to survive the next exchange.',
  },
  {
    title: 'Turn Flow',
    body:
      'At the start of your turn, draw 1 card, ready your rig, and resolve any start-of-turn effects. Then spend your action window to deploy units, trigger tactics, and line up the attack that forces the enemy AI off its script.',
  },
  {
    title: 'Card Types',
    body:
      'Creatures hold the lane and trade damage over multiple turns, while signals are fast tactical effects that bend one combat step in your favor. Winning lists mix durable creatures with signals that punish predictable AI responses.',
  },
  {
    title: 'Winning Tips',
    body:
      'Pressure early when the enemy is open, bank defense when the retaliation math looks bad, and treat each encounter like a read on the next AI pattern instead of a single isolated fight.',
  },
];
