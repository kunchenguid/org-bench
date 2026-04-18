export type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const routeMap: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

export function getCurrentRoute(hash: string): RouteKey {
  return routeMap[hash] || 'home';
}

export function getRouteHref(route: RouteKey) {
  switch (route) {
    case 'play':
      return '#/play';
    case 'rules':
      return '#/rules';
    case 'cards':
      return '#/cards';
    case 'home':
    default:
      return '#/';
  }
}
