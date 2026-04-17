export type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const ROUTES: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

export function getRouteFromHash(hash: string): RouteKey {
  return ROUTES[hash] ?? 'home';
}
