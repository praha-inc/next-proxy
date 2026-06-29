import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, test, vi } from 'vitest';

import { defineProxy } from './index';

import type { NextFetchEvent } from 'next/server';

const event = {} as NextFetchEvent;
const createRequest = (pathname: string) => new NextRequest(new URL(`http://localhost${pathname}`));

describe('defineProxy', () => {
  describe('when filter is not specified', () => {
    const handler = vi.fn(() => NextResponse.next());
    const proxy = defineProxy({ handler });

    test('should call handler for all paths', async () => {
      await proxy({ request: createRequest('/foo'), event });
      await proxy({ request: createRequest('/bar'), event });

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
      await proxy({ request: createRequest('/foo'), event });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should not call handler for non-matching paths', async () => {
      await proxy({ request: createRequest('/bar'), event });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('when next is not specified', () => {
    const proxy = defineProxy({
      handler: ({ request, next }) => next(request),
    });

    test('should return NextResponse.next() when next is called from handler', async () => {
      const response = await proxy({ request: createRequest('/foo'), event });

      expect(response.status).toBe(200);
    });
  });

  describe('when next is specified', () => {
    const next = vi.fn(() => new NextResponse(null, { headers: { custom: 'test' } }));
    const proxy = defineProxy({
      handler: ({ request, next }) => next(request),
    });

    test('should call the specified next when next is called from handler', async () => {
      const response = await proxy({ request: createRequest('/foo'), event, next });

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.headers.get('custom')).toEqual('test');
    });
  });

  describe('when context is provided', () => {
    const handler = vi.fn(() => NextResponse.next());
    const proxy = defineProxy<{ userId: string }>({ handler });
    const context = { userId: 'user-1' };

    test('should pass context to handler', async () => {
      await proxy({ request: createRequest('/foo'), event, context });

      expect(handler).toHaveBeenCalledWith({
        request: expect.anything(),
        event: expect.anything(),
        next: expect.any(Function),
        context,
      });
    });
  });
});
