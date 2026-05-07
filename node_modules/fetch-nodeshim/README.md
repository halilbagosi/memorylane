# fetch-nodeshim

A looser implementation of `fetch` that bypasses Node.js' built-in `fetch`.
Some implementations (specifically ones that provide undici-based shims)
or some versions of Node.js may ship with a built-in version of `undici`
that's older and/or missing patches.

This implementation of `fetch` uses built-ins as much as possible,
using global `Request`, `Response`, and `Headers`, whether they're provided
by a polyfill or by Node.js itself.
However, it's a looser and more permissive implementation that calls
into `node:http` and `node:https` instead.

Think of it as `@remix-run/web-fetch`, but lighter.
