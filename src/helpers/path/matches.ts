import type { MaybeArray } from '../../types/maybe-array';
import type { NextRequest } from 'next/server';

/**
 * Checks whether the request's pathname matches any of the given patterns.
 *
 * Accepts a single pattern or an array of patterns. Each pattern can be either:
 * - A `string`: matched by strict equality against `request.nextUrl.pathname`.
 * - A `RegExp`: matched using {@link String.prototype.match}.
 *
 * Returns `false` when `pattern` is falsy or an empty array (no patterns to match against).
 *
 * @param request - The incoming Next.js request whose `nextUrl.pathname` is tested.
 * @param pattern - One or more string or regular-expression patterns to match against the pathname.
 * @returns `true` if the pathname satisfies at least one pattern; `false` otherwise.
 *
 * @example
 * ```ts
 * // String pattern — exact match
 * matches(request, '/api/health');
 * ```
 *
 * @example
 * ```ts
 * // RegExp pattern — prefix match
 * matches(request, /^\/api\//);
 * ```
 *
 * @example
 * ```ts
 * // Array of mixed patterns — matches if any one of them satisfies
 * matches(request, ['/login', /^\/public\//]);
 * ```
 */
export const matches = (request: NextRequest, pattern: MaybeArray<string | RegExp>): boolean => {
  const includes = pattern ? (Array.isArray(pattern) ? pattern : [pattern]) : [];
  return includes.some((value) => {
    return typeof value === 'string' ? value === request.nextUrl.pathname : request.nextUrl.pathname.match(value) !== null;
  });
};
