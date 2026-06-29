import { NextResponse } from 'next/server';

import * as helpers from './helpers';

import type { MaybePromise } from './types/maybe-promise';
import type { UnionToIntersection } from './types/union-to-intersection';
import type { NextRequest, NextFetchEvent } from 'next/server';

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

/**
 * Extracts the `Context` type parameter from a {@link Proxy}.
 *
 * @template P - A {@link Proxy} type.
 *
 * @example
 * ```ts
 * import type { Proxy, InferProxyContext } from '@praha/next-proxy';
 *
 * type CustomProxy = Proxy<{ userId: string }>;
 * type Context = InferProxyContext<CustomProxy>; // { userId: string }
 * ```
 */
export type InferProxyContext<P> = P extends Proxy<infer C> ? C : never;

/** The collection of built-in helper utilities exposed to filter functions. */
export type ProxyHelpers = typeof helpers;

/**
 * Options passed to the `filter` callback of {@link DefineProxyOptions} and
 * {@link DefineProxyChainOptions}.
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

/** @internal Merges the `Context` types of every proxy in a tuple into a single intersection type. */
type MergeProxyContexts<Proxies extends Proxy[]> = UnionToIntersection<InferProxyContext<Proxies[number]>> extends Record<string, unknown>
  ? UnionToIntersection<InferProxyContext<Proxies[number]>>
  : {};

/**
 * Options accepted by {@link defineProxy.chain}.
 *
 * @template Proxies - Tuple of {@link Proxy} types that form the chain.
 */
export type DefineProxyChainOptions<Proxies extends Proxy[]> = {
  /** Ordered a list of proxies to execute. They run left-to-right; each receives the next proxy as its `next` argument. */
  proxies: Proxies;
  /**
   * Optional predicate that gates the entire chain.
   *
   * When omitted, the chain always runs.
   * When provided and returning `false`, the request is passed directly to `next` without invoking any proxy.
   */
  filter?: (options: ProxyFilterOptions<MergeProxyContexts<Proxies>>) => boolean;
};

/**
 * Composes multiple proxies into an ordered pipeline that shares a single context object.
 *
 * Proxies execute in the order they appear in `options.proxies` (left-to-right).
 * Each proxy receives the following proxy in the array as its `next` function, so calling
 * `next(request)` inside a handler passes control to the next proxy in the chain.
 * The last proxy's `next` resolves to the `next` argument supplied when the chain is invoked
 * (defaulting to {@link NextResponse.next}).
 *
 * The merged `Context` type is the intersection of every individual proxy's `Context`,
 * making data written by an upstream proxy available to all downstream proxies.
 *
 * @template Proxies - Tuple of {@link Proxy} types that form the pipeline.
 *
 * @param options - Proxies to chain and an optional gate filter.
 * @returns A {@link Proxy} whose context is the intersection of all chained proxies' contexts.
 *
 * @example
 * ```ts
 * import { defineProxy } from '@praha/next-proxy';
 *
 * type AuthContext = { userId: string };
 *
 * const authProxy = defineProxy<AuthContext>({
 *   handler: ({ request, next, context }) => {
 *     context.userId = resolveUserId(request);
 *     return next(request);
 *   },
 * });
 *
 * const loggingProxy = defineProxy({
 *   handler: ({ request, next }) => {
 *     console.log(request.nextUrl.pathname);
 *     return next(request);
 *   },
 * });
 *
 * // In Next.js proxy.ts:
 * export const proxy = defineProxy.chain({
 *   filter: ({ request, helpers }) => helpers.matches(request, /^\/api\//),
 *   proxies: [authProxy, loggingProxy],
 * });
 * ```
 */
defineProxy.chain = <Proxies extends Proxy[]>(options: DefineProxyChainOptions<Proxies>): Proxy<MergeProxyContexts<Proxies>> => {
  return async ({ request, event, next = defaultNext, context = {} }) => {
    if (!options.filter || options.filter({ request, event, context, helpers })) {
      const chain = options.proxies.reduceRight<ProxyNext>((next, proxy) => {
        return (request) => proxy({ request, event, next, context });
      }, next);

      return await chain(request);
    }

    return next(request);
  };
};
