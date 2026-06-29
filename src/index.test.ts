import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, test, vi } from 'vitest';

import { defineProxy } from './index';

import type { ProxyHandler } from './index';
import type { NextFetchEvent } from 'next/server';

const event = {} as NextFetchEvent;
const createRequest = (pathname: string) => new NextRequest(new URL(`http://localhost${pathname}`));

describe('defineProxy', () => {
  describe('when filter is not specified', () => {
    const handler = vi.fn(() => NextResponse.next());
    const proxy = defineProxy({ handler });

    test('should call handler for all paths', async () => {
      await proxy(createRequest('/foo'), event);
      await proxy(createRequest('/bar'), event);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('when filter is specified', () => {
    const handler = vi.fn(() => NextResponse.next());
    const proxy = defineProxy({
      handler,
      filter: ({ request, helpers }) => helpers.path.matches(request, '/foo'),
    });

    test('should call handler for matching paths', async () => {
      await proxy(createRequest('/foo'), event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should not call handler for non-matching paths', async () => {
      await proxy(createRequest('/bar'), event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('when next is not specified', () => {
    const proxy = defineProxy({
      handler: ({ request, next }) => next(request),
    });

    test('should return NextResponse.next() when next is called from handler', async () => {
      const response = await proxy(createRequest('/foo'), event);

      expect(response.status).toBe(200);
    });
  });

  describe('when next is specified', () => {
    const next = vi.fn(() => new NextResponse(null, { headers: { custom: 'test' } }));
    const proxy = defineProxy({
      handler: ({ request, next }) => next(request),
    });

    test('should call the specified next when next is called from handler', async () => {
      const response = await proxy(createRequest('/foo'), event, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.headers.get('custom')).toEqual('test');
    });
  });

  describe('when context is provided', () => {
    const handler = vi.fn(() => NextResponse.next());
    const proxy = defineProxy<{ userId: string }>({ handler });
    const context = { userId: 'user-1' };

    test('should pass context to handler', async () => {
      await proxy(createRequest('/foo'), event, undefined, context);

      expect(handler).toHaveBeenCalledWith({
        request: expect.anything(),
        event: expect.anything(),
        next: expect.any(Function),
        context,
      });
    });
  });
});

describe('defineProxy.chain', () => {
  describe('when multiple proxies are chained', () => {
    const order: number[] = [];

    const proxy1 = defineProxy({
      handler: async ({ request, next }) => {
        order.push(1);
        return next(request);
      },
    });

    const proxy2 = defineProxy({
      handler: async ({ request, next }) => {
        order.push(2);
        return next(request);
      },
    });

    const chained = defineProxy.chain({ proxies: [proxy1, proxy2] });

    test('should execute in order starting from the first proxy', async () => {
      await chained(createRequest('/foo'), event);

      expect(order).toEqual([1, 2]);
    });
  });

  describe('when context is shared across multiple proxies', () => {
    let receivedContext: Record<string, unknown> = {};

    const proxy1 = defineProxy<{ userId: string }>({
      handler: async ({ request, next, context }) => {
        context.userId = 'user-1';
        return next(request);
      },
    });

    const proxy2 = defineProxy<{ role: string }>({
      handler: async ({ request, next, context }) => {
        context.role = 'admin';
        return next(request);
      },
    });

    const proxy3 = defineProxy<{ userId: string; role: string }>({
      handler: async ({ request, next, context }) => {
        receivedContext = { ...context };
        return next(request);
      },
    });

    const chained = defineProxy.chain({ proxies: [proxy1, proxy2, proxy3] });

    test('should merge contexts from different proxies and make them available to subsequent proxies', async () => {
      await chained(createRequest('/foo'), event);

      expect(receivedContext).toEqual({ userId: 'user-1', role: 'admin' });
    });
  });

  describe('when filter is specified for the chain', () => {
    const handler = vi.fn<ProxyHandler>(async ({ request, next }) => next(request));
    const proxy = defineProxy({ handler });
    const chained = defineProxy.chain({
      proxies: [proxy],
      filter: ({ request, helpers }) => helpers.path.matches(request, '/foo'),
    });

    test('should execute the entire chain for matching paths', async () => {
      await chained(createRequest('/foo'), event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should skip the entire chain for non-matching paths', async () => {
      await chained(createRequest('/bar'), event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('when an error is thrown in the second proxy', () => {
    const proxy1 = defineProxy({
      handler: async ({ request, next }) => {
        try {
          return await next(request);
        } catch {
          return new NextResponse('caught', { status: 500 });
        }
      },
    });

    const proxy2 = defineProxy({
      handler: () => {
        throw new Error('proxy2 error');
      },
    });

    const chained = defineProxy.chain({ proxies: [proxy1, proxy2] });

    test('should be caught by the first proxy', async () => {
      const response = await chained(createRequest('/foo'), event);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('caught');
    });
  });

  describe('when the first proxy is skipped', () => {
    const apiGuard = vi.fn<ProxyHandler>(({ request, next }) => {
      return next(request);
    });

    const webGuard = vi.fn<ProxyHandler>(({ request, next }) => {
      return next(request);
    });

    const proxy = defineProxy.chain({
      proxies: [
        defineProxy({ handler: apiGuard, filter: ({ request, helpers }) => helpers.path.matches(request, '/api') }),
        defineProxy({ handler: webGuard }),
      ],
    });

    test('should execute the second proxy', async () => {
      await proxy(createRequest('/account'), event);

      expect(apiGuard).toHaveBeenCalledTimes(0);
      expect(webGuard).toHaveBeenCalledTimes(1);
    });
  });

  describe('when chains are nested', () => {
    const order: number[] = [];

    const innerProxy1 = defineProxy({
      handler: async ({ request, next }) => {
        order.push(1);
        return next(request);
      },
    });

    const innerProxy2 = defineProxy({
      handler: async ({ request, next }) => {
        order.push(2);
        return next(request);
      },
    });

    const outerProxy = defineProxy({
      handler: async ({ request, next }) => {
        order.push(3);
        return next(request);
      },
    });

    const innerChain = defineProxy.chain({ proxies: [innerProxy1, innerProxy2] });
    const chained = defineProxy.chain({ proxies: [innerChain, outerProxy] });

    test('should execute all proxies in order', async () => {
      await chained(createRequest('/foo'), event);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('when nested chain has a filter that skips', () => {
    const innerHandler = vi.fn<ProxyHandler>(async ({ request, next }) => {
      return next(request);
    });
    const outerHandler = vi.fn<ProxyHandler>(async ({ request, next }) => {
      return next(request);
    });

    const innerChain = defineProxy.chain({
      proxies: [defineProxy({ handler: innerHandler })],
      filter: ({ request, helpers }) => helpers.path.matches(request, '/api'),
    });

    const chained = defineProxy.chain({ proxies: [innerChain, defineProxy({ handler: outerHandler })] });

    test('should skip inner chain but still execute outer proxy', async () => {
      await chained(createRequest('/foo'), event);

      expect(innerHandler).not.toHaveBeenCalled();
      expect(outerHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('when context is shared across nested chains', () => {
    let receivedContext: Record<string, unknown> = {};

    const innerProxy = defineProxy<{ fromInner: string }>({
      handler: async ({ request, next, context }) => {
        context.fromInner = 'inner-value';
        return next(request);
      },
    });

    const outerProxy = defineProxy<{ fromInner: string; fromOuter: string }>({
      handler: async ({ request, next, context }) => {
        receivedContext = { ...context };
        return next(request);
      },
    });

    const innerChain = defineProxy.chain({ proxies: [innerProxy] });
    const chained = defineProxy.chain({ proxies: [innerChain, outerProxy] });

    test('should propagate context set in inner chain to outer proxy', async () => {
      await chained(createRequest('/foo'), event);

      expect(receivedContext).toEqual({ fromInner: 'inner-value' });
    });
  });
});
