import type { Component } from 'svelte';

export type PageParams = Record<string, string>;

interface Route {
  pattern: RegExp;
  load: () => Promise<{ default: Component<any> }>;
  /** Requires the presenter to be logged in. */
  admin?: boolean;
}

// Pages are loaded on demand, so students' phones never download the admin UI.
const routes: Route[] = [
  { pattern: /^\/$/, load: () => import('./pages/Home.svelte') },
  { pattern: /^\/admin\/login\/?$/, load: () => import('./pages/admin/Login.svelte') },
  { pattern: /^\/admin\/?$/, load: () => import('./pages/admin/Dashboard.svelte'), admin: true },
  {
    pattern: /^\/admin\/quizzes\/(?<id>\d+)\/?$/,
    load: () => import('./pages/admin/QuizEditor.svelte'),
    admin: true,
  },
  {
    pattern: /^\/admin\/quizzes\/(?<id>\d+)\/preview\/?$/,
    load: () => import('./pages/admin/QuizPreview.svelte'),
    admin: true,
  },
];

const notFound: Route = { pattern: /.*/, load: () => import('./pages/NotFound.svelte') };

export function matchRoute(path: string): { route: Route; params: PageParams } {
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (match) return { route, params: { ...match.groups } };
  }
  return { route: notFound, params: {} };
}
