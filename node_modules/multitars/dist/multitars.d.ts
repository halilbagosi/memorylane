type ReadableStreamLike<T> = ReadableStream<T> | AsyncIterable<T> | Iterable<T>;
declare function streamToAsyncIterable<T>(stream: ReadableStream<T>): AsyncIterable<T>;
interface SafeIteratorSourceOptions {
  signal?: AbortSignal;
  expectedLength?: number | bigint;
}
interface BodyReadableStream<T> extends ReadableStream<T> {
  signal: AbortSignal;
}
/** Converts an `AsyncIterable` or `Iterable` into a safe `ReadableStream` with a safety `AbortSignal`
 * @remarks
 * This helper converts an iterable to a `ReadableStream` with a paired `AbortSignal`. The `AbortSignal`
 * will abort when the underlying iterable errors.
 *
 * A common problem with Fetch Standard implementations is that a `ReaadbleStream` passed to
 * a request does not propagate its error once the request has started. This prevents the
 * request from being cancelled and the error from propagating to the response when the input
 * Readable Stream errors.
 * This helper provides an AbortSignal to forcefully abort the request when the underlying iterable
 * errors.
 *
 * @param iterable - The AsyncIterable to wrap and catch errors from
 * @param sourceOptions - An optional `expectedLength` and parent `signal` that may propagate to the output `ReadableStream`
 * @returns `BodyReadableStream` that is a converted `ReadableStream` of the iterable with a `signal: AbortSignal` property that aborts when the iterable errors.
 */
declare function iterableToStream<T>(
  iterable: AsyncIterable<T> | Iterable<T>,
  sourceOptions?: SafeIteratorSourceOptions
): BodyReadableStream<T>;

interface StreamFileOptions {
  type?: string;
  lastModified?: number;
  size?: number;
}
declare const StreamFile_base: {
  new (fileBits: BlobPart[], fileName: string, options?: FilePropertyBag): File;
  prototype: File;
};
declare class StreamFile extends StreamFile_base implements File {
  #private;
  constructor(
    stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[],
    name: string,
    options: StreamFileOptions
  );
  get lastModified(): number;
  get size(): number;
  get name(): string;
  set name(name: string);
  get type(): string;
  set type(type: string);
  stream(): ReadableStream<Uint8Array<ArrayBuffer>>;
  bytes(): Promise<Uint8Array<ArrayBuffer>>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json(): Promise<any>;
  slice(): never;
}

interface MultipartPartOptions extends StreamFileOptions {
  headers?: MultipartHeaders;
}
interface MultipartHeaders {
  'content-disposition'?: string;
  'content-length'?: string;
  'content-type'?: string;
  [headerName: string]: string | undefined;
}
declare class MultipartPart extends StreamFile {
  headers: MultipartHeaders;
  constructor(
    stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[],
    name: string,
    options?: MultipartPartOptions
  );
}

interface ParseMultipartParams {
  /** The `Content-Type` header value */
  contentType: string;
}
/** Provide tar entry iterator */
declare function parseMultipart(
  stream: ReadableStreamLike<Uint8Array>,
  params: ParseMultipartParams
): AsyncGenerator<MultipartPart>;

type FormValue = string | Uint8Array<ArrayBuffer> | MultipartPart | Blob | File;
type FormEntry = readonly [name: string, value: FormValue];
declare const multipartContentType: string;
declare function streamMultipart(
  entries: ReadableStreamLike<FormEntry>
): AsyncGenerator<Uint8Array<ArrayBuffer>>;

declare const enum InternalTypeFlag {
  OLD_FILE = 0,
  CONTIGUOUS_FILE = 55,
  CHAR_DEV = 51,
  BLOCK_DEV = 52,
  FIFO = 54,
  LONG_LINK_NAME = 75,
  LONG_NAME = 76,
  OLD_LONG_NAME = 78,
  TAPE_VOL = 86,
  GAX = 103,
  PAX = 120,
}
declare enum TarTypeFlag {
  FILE = 48,
  LINK = 49,
  SYMLINK = 50,
  DIRECTORY = 53,
}
interface TarChunkHeader {
  name: string;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  mtime: number;
  typeflag: TarTypeFlag | InternalTypeFlag;
  linkname: string | null;
  uname: string | null;
  gname: string | null;
  devmajor: number;
  devminor: number;
}
interface TarHeader extends TarChunkHeader {
  _prefix?: string;
  _longName?: string;
  _longLinkName?: string;
  _paxName?: string;
  _paxLinkName?: string;
  _paxSize?: number;
}
type TarChunkTypeFlag = Exclude<TarTypeFlag, TarTypeFlag.FILE>;
declare class TarChunk extends StreamFile implements TarChunkHeader {
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
  typeflag: TarChunkTypeFlag;
  linkname: string | null;
  uname: string | null;
  gname: string | null;
  devmajor: number;
  devminor: number;
  constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[], header: TarHeader);
}
declare class TarFile extends StreamFile implements TarChunkHeader {
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
  typeflag: TarTypeFlag.FILE;
  linkname: null;
  uname: string | null;
  gname: string | null;
  devmajor: number;
  devminor: number;
  static from(
    stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[],
    name: string,
    options: StreamFileOptions
  ): TarFile;
  constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[], header: TarHeader);
}

/** Provide tar entry iterator */
declare function untar(stream: ReadableStreamLike<Uint8Array>): AsyncGenerator<TarFile | TarChunk>;

declare function tar(
  entries: ReadableStreamLike<TarChunk | TarFile>
): AsyncGenerator<Uint8Array<ArrayBuffer>>;

export {
  MultipartPart,
  StreamFile,
  TarChunk,
  TarFile,
  TarTypeFlag,
  iterableToStream,
  multipartContentType,
  parseMultipart,
  streamMultipart,
  streamToAsyncIterable,
  tar,
  untar,
};
export type { FormEntry, FormValue, MultipartHeaders, MultipartPartOptions, StreamFileOptions };
