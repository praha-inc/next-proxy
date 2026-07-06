# @praha/next-proxy

[![npm version](https://badge.fury.io/js/@praha%2Fnext-proxy.svg)](https://www.npmjs.com/package/@praha/next-proxy)
[![npm download](https://img.shields.io/npm/dm/@praha/next-proxy.svg)](https://www.npmjs.com/package/@praha/next-proxy)
[![license](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/praha-inc/next-proxy/blob/main/LICENSE)
[![Github](https://img.shields.io/github/followers/praha-inc?label=Follow&logo=github&style=social)](https://github.com/orgs/praha-inc/followers)

A lightweight utility for chaining Next.js proxy.

## 👏 Getting Started

### Installation

```bash
npm install @praha/next-proxy
```

### Usage

Use `defineProxy` to create a single proxy. The `handler` receives the request, event, a `next` function, and a shared `context` object, and must return a `NextResponse`.

```ts
// proxy.ts
import { defineProxy } from '@praha/next-proxy';

export const proxy = defineProxy({
  handler: ({ request, next }) => {
    console.log(request.nextUrl.pathname);
    return next(request);
  },
});
```

#### Filter — run only on matching paths

Pass a `filter` predicate to skip the handler when the condition is not met. The built-in `helpers.path.matches` utility accepts a string (exact match) or a `RegExp`.

```ts
import { defineProxy } from '@praha/next-proxy';

const apiProxy = defineProxy({
  filter: ({ request, helpers }) => helpers.path.matches(request, /^\/api\//),
  handler: ({ request, next }) => {
    // only runs for /api/* routes
    return next(request);
  },
});
```

`helpers.path.matches` also accepts an array of patterns — the handler runs when **any** of them match:

```ts
import { defineProxy } from '@praha/next-proxy';

const apiProxy = defineProxy({
  filter: ({ request, helpers }) =>
    helpers.path.matches(request, ['/login', /^\/public\//]),
  handler: ({ request, next }) => {
    // only runs for /login and /public/* routes
    return next(request);
  },
});
```

#### Context — share data across proxies

Annotate a proxy with a generic type to describe data it produces or consumes. Upstream proxies write to `context`; downstream proxies read from it.

```ts
import { defineProxy } from '@praha/next-proxy';

type AuthContext = { userId: string };

const authProxy = defineProxy<AuthContext>({
  handler: async ({ request, next, context }) => {
    context.userId = await resolveUserId(request);
    return next(request);
  },
});
```

#### Chain — compose proxies into a pipeline

Use `defineProxy.chain` to wire multiple proxies together. They execute left-to-right; each proxy's `next` calls the next one in the array. A single `context` object is shared across the entire chain.

```ts
import { defineProxy } from '@praha/next-proxy';

type AuthContext = { userId: string };

const authProxy = defineProxy<AuthContext>({
  handler: async ({ request, next, context }) => {
    context.userId = await resolveUserId(request);
    return next(request);
  },
});

const loggingProxy = defineProxy({
  handler: ({ request, next }) => {
    console.log(request.nextUrl.pathname);
    return next(request);
  },
});

export const proxy = defineProxy.chain({
  proxies: [authProxy, loggingProxy],
});
```

A `filter` on the chain gates **all** proxies at once — when it returns `false` the entire pipeline is skipped:

```ts
import { defineProxy } from '@praha/next-proxy';

type AuthContext = { userId: string };

const authProxy = defineProxy<AuthContext>({
  handler: async ({ request, next, context }) => {
    context.userId = await resolveUserId(request);
    return next(request);
  },
});

const loggingProxy = defineProxy({
  handler: ({ request, next }) => {
    console.log(request.nextUrl.pathname);
    return next(request);
  },
});

export const proxy = defineProxy.chain({
  filter: ({ request, helpers }) => helpers.path.matches(request, /^\/api\//),
  proxies: [authProxy, loggingProxy],
});
```

## 🤝 Contributing

Contributions, issues and feature requests are welcome.

Feel free to check [issues page](https://github.com/praha-inc/next-proxy/issues) if you want to contribute.

## 📝 License

Copyright © [PrAha, Inc.](https://www.praha-inc.com/)

This project is [```MIT```](https://github.com/praha-inc/next-proxy/blob/main/LICENSE) licensed.
