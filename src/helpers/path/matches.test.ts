import { describe, expect, test } from 'vitest';

import { matches } from './matches';

import type { NextRequest } from 'next/server';

const createRequest = (pathname: string) => ({ nextUrl: { pathname } }) as NextRequest;

describe('matches', () => {
  describe('when pattern is a string', () => {
    test('should return true when pathname exactly matches the pattern', () => {
      expect(matches(createRequest('/foo'), '/foo')).toBe(true);
    });

    test('should return false when pathname does not match the pattern', () => {
      expect(matches(createRequest('/foo'), '/bar')).toBe(false);
    });

    test('should return false when pathname only partially matches the pattern', () => {
      expect(matches(createRequest('/foo/bar'), '/foo')).toBe(false);
    });
  });

  describe('when pattern is a RegExp', () => {
    test('should return true when pathname matches the regex', () => {
      expect(matches(createRequest('/foo/bar'), /^\/foo/)).toBe(true);
    });

    test('should return false when pathname does not match the regex', () => {
      expect(matches(createRequest('/baz'), /^\/foo/)).toBe(false);
    });
  });

  describe('when pattern is an array of strings', () => {
    test('should return true when pathname matches one of the strings', () => {
      expect(matches(createRequest('/bar'), ['/foo', '/bar'])).toBe(true);
    });

    test('should return false when pathname matches none of the strings', () => {
      expect(matches(createRequest('/baz'), ['/foo', '/bar'])).toBe(false);
    });
  });

  describe('when pattern is an array of RegExps', () => {
    test('should return true when pathname matches one of the regexes', () => {
      expect(matches(createRequest('/api/users'), [/^\/api/, /^\/admin/])).toBe(true);
    });

    test('should return false when pathname matches none of the regexes', () => {
      expect(matches(createRequest('/foo'), [/^\/api/, /^\/admin/])).toBe(false);
    });
  });

  describe('when pattern is a mixed array of strings and RegExps', () => {
    test('should return true when pathname matches the string entry', () => {
      expect(matches(createRequest('/foo'), ['/foo', /^\/api/])).toBe(true);
    });

    test('should return true when pathname matches the regex entry', () => {
      expect(matches(createRequest('/api/users'), ['/foo', /^\/api/])).toBe(true);
    });

    test('should return false when pathname matches neither entry', () => {
      expect(matches(createRequest('/bar'), ['/foo', /^\/api/])).toBe(false);
    });
  });
});
