export const ROUTES = [
  { path: '/', title: /Backend engineer/ },
  { path: '/work', title: /^Work · / },
  { path: '/work/scopetrace', title: /^ScopeTrace/ },
  { path: '/work/support-intelligence', title: /^Delta Support Intelligence/ },
  { path: '/work/resume-screener', title: /^AI Résumé Screener/ },
  { path: '/about', title: /^About · / },
  { path: '/colophon', title: /^Colophon · / },
] as const;

export const NOT_FOUND = '/this-page-does-not-exist';
