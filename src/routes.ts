export const routes = ['home', 'play', 'rules', 'cards'] as const;

export type RouteId = (typeof routes)[number];

export const getRouteFromHash = (hash: string): RouteId => {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase();

  return routes.find((route) => route === normalized) ?? 'home';
};
