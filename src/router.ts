export type RouteKey = 'home' | 'play' | 'rules' | 'cards';

const ROUTES: Record<string, RouteKey> = {
  '#/': 'home',
  '#/play': 'play',
  '#/rules': 'rules',
  '#/cards': 'cards',
};

const HREFS: Record<RouteKey, string> = {
  home: './#/',
  play: './#/play',
  rules: './#/rules',
  cards: './#/cards',
};

function normalizeHash(hash: string): string {
  const [path] = hash.split('?');

  if (path === '' || path === '#') {
    return '#/';
  }

  const withoutTrailingSlash = path.endsWith('/') && path !== '#/' ? path.slice(0, -1) : path;

  return withoutTrailingSlash || '#/';
}

export function getRouteFromHash(hash: string): RouteKey {
  return ROUTES[normalizeHash(hash)] ?? 'home';
}

export function getRouteHref(route: RouteKey): string {
  return HREFS[route];
}
