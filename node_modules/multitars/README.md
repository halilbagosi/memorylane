# multitars

`multitars` is a memory-efficient parser and producer of [Tar archives](https://www.gnu.org/software/tar/manual/html_node/Standard.html)
and [`multipart/form-data` bodies](https://datatracker.ietf.org/doc/html/rfc2388).

## Implementation

The goal of `multitars` is to allow any JavaScript runtime that supports the
[Web Streams API standard](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
to efficiently consume and/or produce Tar and form-data `ReadableStream` data without buffering
them in full.

This has been built with the explicit purpose in mind to:

- Accept `Request` bodies in the `tar` or `multipart/form-data` format
- Send `Request` bodies in the `tar` or `multipart/form-data` format
- Transform arbitrarily-sized `tar` or `multipart/form-data` streams

As such, the underlying implementation uses fixed block size reading to parse
Tar chunks and Form-data boundaries, switching to pull-based reading when possible
to keep overhead to a minimum.

- The tar implementation should match [`node-tar`](https://github.com/isaacs/node-tar)'s support of the Tar format (including PAX)
- The multipart implementation optionally accepts a `Content-Length` header in boundaries
- Both parsers operate on `StreamFile` which extends the standard `File` API

## API Reference

### `ReadableStreamLike<T>`

```ts
export type ReadableStreamLike<T> =
  | ReadableStream<T>
  | AsyncIterable<T>
  | Iterable<T>;
```

All input arguments to stream helper functions support receiving data as either `ReadableStream`,
`AsyncIterable`, or `Iterable`.

### `parseMultipart(stream: ReadableStreamLike<Uint8Array>, params: ParseMultipartParams) => AsyncGenerator<StreamFile>`

- Accepts a stream of `Uint8Array` binary data
- **Parameters**
  - `contentType`: The raw `Content-Type` header to search a `boundary=*` in

Returns an async iterable (as `AsyncGenerator`) of `StreamFile` with individual form-data values.

When a `StreamFile` isn't consumed, it's skipped before the next one is emitted.

### `streamMultipart(entries: ReadableStreamLike<FormEntry>): AsyncGenerator<Uint8Array>`

- Accepts a stream of `FormEntry`s
  - `[string, string | Uint8Array | Blob | File]` tuples

Returns an async iterable of `Uint8Array` chunks encoding the output body stream.

### `multipartContentType: string`

The string value that `Content-Type` should be set to when sending `streamMultipart()`'s output as request bodies.
This contains a seeded multipart boundary identifier.

### `untar(stream: ReadableStreamLike<Uint8Array>) => AsyncGenerator<TarFile | TarChunk>`

- Accepts a stream of `Uint8Array` binary data

Returns an async iterable (as `AsyncGenerator`) of `TarFile`, for files in the Tar archive, and `TarChunk` for non-files.

When a `TarFile`/`TarChunk` isn't consumed, it's skipped before the next one is emitted.

### `tar(entries: ReadableStreamLike<TarChunk | TarFile> | Iterable<TarChunk | TarFile>) => AsyncGenerator<Uint8Array>`

- Accepts a stream of `TarChunk`s and `TarFile`s

Returns an async iterable of `Uint8Array` chunks encoding the output Tar archive stream.
The Tar archive will use PAX headers in its output.

### `interface TarChunkHeader`

A `TarFile` or `TarChunk` represent entries in a Tar archive. They have a set of common properties based on the Tar headers.

**Properties:**

- `mode`: Permission fields
- `uid`: User ID (if applicable/set, otherwise `0`)
- `gid`: Group ID (if applicable/set, otherwise `0`)
- `mtime`: Modified Time (if applicable/set, otherwise `0`)
- `linkname`: Only set for symlinks (the linked to name)
- `uname`: User Name (if applicable/set)
- `gname`: Group Name (if applicable/set)
- `typeflag: TarTypeFlag`: The type of the Tar entry

### `enum TarTypeFlag`

```ts
export enum TarTypeFlag {
  FILE = 48 /* '0': regular file */,
  LINK = 49 /* '1': link */,
  SYMLINK = 50 /* '2': symbolic link */,
  DIRECTORY = 53 /* '5': directory */,
}
```

### `class TarFile implements TarChunkHeader`

A `TarFile` represents a file in a Tar archive. It can be consumed or streamed like a regular `File`.
Its `typeflag` property is always set to `TarTypeFlag.FILE`.

### `class TarChunk implements TarChunkHeader`

A `TarChunk` represents a non-file in a Tar archive, which are hardlinks, symlinks, or directories.
They typically don't carry content bodies, but their content is preserved if they do contain any data.

Note that `TarChunk`s for directories (`typeflag: TarTypeFlag.DIRECTORY`) are optional and `multitars` does
not validate the directory structure of Tar archives since it streams any Tar contents. Tar archives may
contain nested files in directories without any `TarChunk` for directories being emitted.

### `streamToIterable(stream: ReadableStream) => AsyncIterable`

- Accepts a `ReadableStream`

Returns an `AsyncIterable` emitting the `ReadableStream`'s values.
This is an identity function if the runtime supports `Symbol.asyncIterator` on `ReadableStream`.

### `iterableToStream(iterable: AsyncIterable<T> | Iterable<T>, sourceOptions?: SafeIteratorSourceOptions) => BodyReadableStream<T>`

- Accepts an `AsyncIterable` or `Iterable`
- **Parameters**
  - `signal?: AbortSignal`: A parent `AbortSignal` to abort the returned `ReadableStream` on
  - `expectedLength?: number | bigint`: The expected length of the stream (Specific to Cloudflare workerd)

Returns a `BodyReadableStream` that emits the values of the passed iterable. `BodyReadableStream`
extends a regular `ReadableStream` with an added `signal: AbortSignal` property. This signal will
abort when the input iterable emits an error.

A common problem with Fetch Standard implementations is that a `ReadbleStream` passed to
a request does not propagate its error once the request has started. This prevents the
request from being cancelled and the error from propagating to the response when the input
Readable Stream errors.

The `BodyReadableStream` provides a `signal: AbortSignal` property so the underlying iterable error
can forcefully be propagated into a `fetch` call.
