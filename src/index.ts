import { NextResponse } from 'next/server';

import type { MaybeArray } from './types/maybe-array';
import type { MaybePromise } from './types/maybe-promise';
import type { NextRequest, NextFetchEvent } from 'next/server';

const toArray = <T>(value?: MaybeArray<T>): T[] => {
  return value ? (Array.isArray(value) ? value : [value]) : [];
};

/**
 * A function that forwards the request to the next handler in the chain.
 *
 * @param request - The incoming Next.js request to forward.
 * @returns A {@link NextResponse} produced by the next handler.
 */
export type ProxyNext = (request: NextRequest) => MaybePromise<NextResponse>;

const defaultNext: ProxyNext = (request) => NextResponse.next({ request });

/** Options that are always provided when a {@link Proxy} is invoked. */
export type RequiredProxyOptions = {
  request: NextRequest;
  event: NextFetchEvent;
};

/** Options that a caller may omit when invoking a {@link Proxy}. */
export type OptionalProxyOptions<Context extends Record<string, unknown> = {}> = {
  /** Forwards the request to the next handler. Defaults to {@link NextResponse.next}. */
  next: ProxyNext;
  /** Arbitrary data shared across proxies in a chain. */
  context: Partial<Context>;
};

/**
 * The handler function that contains the proxy's core logic.
 *
 * Receives all required and optional proxy options and must return a {@link NextResponse}.
 *
 * @template Context - Shape of the shared context object passed through the proxy chain.
 */
export type ProxyHandler<Context extends Record<string, unknown> = {}>
  = (options: RequiredProxyOptions & OptionalProxyOptions<Context>) => MaybePromise<NextResponse>;

/**
 * A proxy that can be invoked directly or composed with {@link defineProxy.chain}.
 *
 * Callers may omit {@link OptionalProxyOptions} fields; sensible defaults are applied internally.
 *
 * @template Context - Shape of the shared context object passed through the proxy chain.
 */
export type Proxy<Context extends Record<string, unknown> = {}>
  = (options: RequiredProxyOptions & Partial<OptionalProxyOptions<Context>>) => MaybePromise<NextResponse>;

/** The collection of built-in helper utilities exposed to filter functions. */
export type ProxyHelpers = {
  path: {
    matches: (request: NextRequest, pattern: MaybeArray<string | RegExp>) => boolean;
  };
};

const helpers: ProxyHelpers = {
  path: {
    matches: (request, pattern) => {
      return toArray(pattern).some((value) => {
        return typeof value === 'string' ? value === request.nextUrl.pathname : request.nextUrl.pathname.match(value) !== null;
      });
    },
  },
};

/**
 * Options passed to the `filter` callback of {@link DefineProxyOptions}.
 *
 * @template Context - Shape of the shared context object.
 */
export type ProxyFilterOptions<Context extends Record<string, unknown> = {}> = {
  request: NextRequest;
  event: NextFetchEvent;
  /** Built-in path and request helpers. */
  helpers: ProxyHelpers;
  /** Shared context accumulated by upstream proxies. */
  context: Partial<Context>;
};

/**
 * Options accepted by {@link defineProxy}.
 *
 * @template Context - Shape of the shared context object this proxy operates on.
 */
export type DefineProxyOptions<Context extends Record<string, unknown> = {}> = {
  /** Core logic executed when the proxy is active. */
  handler: ProxyHandler<Context>;
  /**
   * Optional predicate that determines whether the proxy should run.
   *
   * When omitted, the proxy always runs.
   * When provided and returning `false`, the request is forwarded to `next` without invoking `handler`.
   */
  filter?: (options: ProxyFilterOptions<Context>) => boolean;
};

/**
 * Creates a single proxy from a handler and an optional filter.
 *
 * The returned {@link Proxy} can be used directly as a Next.js proxy or composed with
 * {@link defineProxy.chain} to build a pipeline of proxies.
 *
 * Execution flow:
 * 1. If `filter` is provided and returns `false`, the request is passed to `next` unchanged.
 * 2. Otherwise, `handler` is called with the request, event, next function, and context.
 *
 * @template Context - Shape of the arbitrary data that `handler` may read from or write to.
 *   When composing proxies with {@link defineProxy.chain}, each proxy's `Context` is merged
 *   and shared across the entire chain.
 *
 * @param options - Handler and optional filter configuration.
 * @returns A {@link Proxy} ready to be invoked by Next.js proxy or chained with other proxies.
 *
 * @example
 * ```ts
 * import { defineProxy } from '@praha/next-proxy';
 *
 * // Basic usage — log every request and pass it through
 * const loggingProxy = defineProxy({
 *   handler: ({ request, next }) => {
 *     console.log(request.nextUrl.pathname);
 *     return next(request);
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * import { defineProxy } from '@praha/next-proxy';
 *
 * // With a filter — only run on /api/* routes
 * const apiProxy = defineProxy({
 *   filter: ({ request, helpers }) => helpers.matches(request, /^\/api\//),
 *   handler: ({ request, next }) => {
 *     // ...
 *     return next(request);
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * import { defineProxy } from '@praha/next-proxy';
 *
 * // With typed context — populate context for downstream proxies
 * type AuthContext = { userId: string };
 *
 * const authProxy = defineProxy<AuthContext>({
 *   handler: async ({ request, next, context }) => {
 *     context.userId = await resolveUserId(request);
 *     return next(request);
 *   },
 * });
 * ```
 */
export const defineProxy = <Context extends Record<string, unknown> = {}>(
  options: DefineProxyOptions<Context>,
): Proxy<Context> => {
  return ({ request, event, next = defaultNext, context = {} }) => {
    if (!options.filter || options.filter({ request, event, context, helpers })) {
      return options.handler({ request, event, next, context });
    }

    return next(request);
  };
};
