# minifetch

## 0.4.10

### Patch Changes

- Preserve casing of headers when they're passed as non-Headers input, i.e. as tuple list or dictionary
  Submitted by [@kitten](https://github.com/kitten) (See [#41](https://github.com/kitten/fetch-nodeshim/pull/41))

## 0.4.9

### Patch Changes

- Add configurable `connectTimeout` to override connection timeout. The default will now also be 30s if the request contains `text/html` in the `Accept` header
  Submitted by [@kitten](https://github.com/kitten) (See [#39](https://github.com/kitten/fetch-nodeshim/pull/39))

## 0.4.8

### Patch Changes

- ⚠️ Fix `fetch(new Request(...), init)` case, where `init` should take precedence over the request
  Submitted by [@kitten](https://github.com/kitten) (See [#37](https://github.com/kitten/fetch-nodeshim/pull/37))

## 0.4.7

### Patch Changes

- Avoid `setHeaders` to increase consistency, fix `Set-Cookie` case for older Node versions, and work around bug in Bun <=1.3.9
  Submitted by [@kitten](https://github.com/kitten) (See [#35](https://github.com/kitten/fetch-nodeshim/pull/35))

## 0.4.6

### Patch Changes

- Replace undici `Response` with `node:stream/consumers` in body helper
  Submitted by [@kitten](https://github.com/kitten) (See [#32](https://github.com/kitten/fetch-nodeshim/pull/32))

## 0.4.5

### Patch Changes

- ⚠️ Fix `Content-Type` being overridden for string inputs when it's already set
  Submitted by [@kitten](https://github.com/kitten) (See [#30](https://github.com/kitten/fetch-nodeshim/pull/30))

## 0.4.4

### Patch Changes

- Limit state in which `incoming.socket` is unrefed and instead `.ref()` it when the body is being read, and `.unref()` it again when reading stops
  Submitted by [@kitten](https://github.com/kitten) (See [#28](https://github.com/kitten/fetch-nodeshim/pull/28))

## 0.4.3

### Patch Changes

- ⚠️ Fix typo in `NO_PROXY` construction
  Submitted by [@kitten](https://github.com/kitten) (See [#18](https://github.com/kitten/fetch-nodeshim/pull/18))
- Set `Content-Length: 0` when `response.body` is `null` for `PATCH` as well
  Submitted by [@kitten](https://github.com/kitten) (See [#23](https://github.com/kitten/fetch-nodeshim/pull/23))
- Protect against invalid `Location` URI
  Submitted by [@kitten](https://github.com/kitten) (See [#26](https://github.com/kitten/fetch-nodeshim/pull/26))
- Issue an explicit `ETIMEDOUT` when the request times out
  Submitted by [@kitten](https://github.com/kitten) (See [#24](https://github.com/kitten/fetch-nodeshim/pull/24))
- ⚠️ Fix `Set-Cookie` list handling by capturing them with `Headers#append`
  Submitted by [@kitten](https://github.com/kitten) (See [#20](https://github.com/kitten/fetch-nodeshim/pull/20))
- Reset `requestOptions.agent` on retry/redirect
  Submitted by [@kitten](https://github.com/kitten) (See [#27](https://github.com/kitten/fetch-nodeshim/pull/27))
- ⚠️ Fix `_final` on `InflateStream` calling `callback` before full flush
  Submitted by [@kitten](https://github.com/kitten) (See [#25](https://github.com/kitten/fetch-nodeshim/pull/25))
- Propagate errors for duplex request/response streams, and ensure early errors propagate to the Response stream
  Submitted by [@kitten](https://github.com/kitten) (See [#16](https://github.com/kitten/fetch-nodeshim/pull/16))
- Protect against missing `Symbol.toStringTag`
  Submitted by [@kitten](https://github.com/kitten) (See [#19](https://github.com/kitten/fetch-nodeshim/pull/19))

## 0.4.2

### Patch Changes

- Unref the incoming socket when the timeout is disabled, to prevent body streams that never start from keeping processes alive
  Submitted by [@kitten](https://github.com/kitten) (See [#14](https://github.com/kitten/fetch-nodeshim/pull/14))

## 0.4.1

### Patch Changes

- Add sane default timeout to `http.request`
  Submitted by [@kitten](https://github.com/kitten) (See [#12](https://github.com/kitten/fetch-nodeshim/pull/12))

## 0.4.0

### Minor Changes

- Add automatic configuration for `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` similar to the upcoming Node 24+ built-in support. Agents will automatically be created and used when these environment variables are set
  Submitted by [@kitten](https://github.com/kitten) (See [#8](https://github.com/kitten/fetch-nodeshim/pull/8))

### Patch Changes

- Prevent outright error when `--no-experimental-fetch` is set, which causes `Request`, `Response`, `FormData`, and `Headers` to not be available globally
  Submitted by [@kitten](https://github.com/kitten) (See [#11](https://github.com/kitten/fetch-nodeshim/pull/11))
- Update rollup config for reduced output and exclude sources from sourcemaps
  Submitted by [@kitten](https://github.com/kitten) (See [#9](https://github.com/kitten/fetch-nodeshim/pull/9))

## 0.3.0

### Minor Changes

- Add `Body` mixin as export
  Submitted by [@kitten](https://github.com/kitten) (See [#6](https://github.com/kitten/fetch-nodeshim/pull/6))

## 0.2.1

### Patch Changes

- Provenance Release
  Submitted by [@kitten](https://github.com/kitten) (See [#4](https://github.com/kitten/fetch-nodeshim/pull/4))

## 0.2.0

### Minor Changes

- Add web standard type/globals re-exports and polyfill `File` from `node:buffer`
  Submitted by [@kitten](https://github.com/kitten) (See [#1](https://github.com/kitten/fetch-nodeshim/pull/1))

### Patch Changes

- Add missing constructor type overloads and add missing `Blob` re-export
  Submitted by [@kitten](https://github.com/kitten) (See [#2](https://github.com/kitten/fetch-nodeshim/pull/2))

## 0.1.0

Initial Release.
