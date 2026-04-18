export type RouteId = 'home' | 'play' | 'rules' | 'cards';

export type RouteDefinition = {
  id: RouteId;
  label: string;
  hash: `#/${string}` | '#/';
  blurb: string;
};

export const routes: RouteDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    hash: '#/',
    blurb: 'Overview, campaign pitch, and quick links into the game.',
  },
  {
    id: 'play',
    label: 'Play',
    hash: '#/play',
    blurb: 'Encounter screen for the duel campaign.',
  },
  {
    id: 'rules',
    label: 'Rules',
    hash: '#/rules',
    blurb: 'How turns, resources, and victory work.',
  },
  {
    id: 'cards',
    label: 'Cards',
    hash: '#/cards',
    blurb: 'Reference gallery for the card pool.',
  },
];

export function getRouteByHash(hash: string): RouteDefinition {
  const match = routes.find((route) => route.hash === hash);
  return match ?? routes[0];
}
