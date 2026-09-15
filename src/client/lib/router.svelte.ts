// Minimal history-API router: tracks the current URL and turns clicks on
// same-origin links into client-side navigation.

export const router = $state({ path: location.pathname, search: location.search });

function sync(): void {
  router.path = location.pathname;
  router.search = location.search;
}

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  sync();
  if (!replace) window.scrollTo(0, 0);
}

export function queryParam(name: string): string | null {
  return new URLSearchParams(router.search).get(name);
}

window.addEventListener('popstate', sync);

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest('a');
  if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return;
  // API URLs (e.g. CSV downloads) must go to the server.
  if (link.pathname.startsWith('/api/')) return;
  event.preventDefault();
  navigate(link.pathname + link.search + link.hash);
});
