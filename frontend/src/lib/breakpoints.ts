/**
 * Layout breakpoints (docs/design/tokens.json → desktop.breakpoint, guarded by
 * tokens.test.ts). CSS variables cannot be used in media queries, so CSS files
 * repeat these numbers literally: 768px (tablet) and 1024px (desktop).
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  maxContent: 1440,
} as const
