import * as buffer from 'node:buffer';
import * as buffer$1 from 'buffer';
import * as undici_types from 'undici-types';
import { Readable } from 'node:stream';

type Or<T, U> = void extends T ? U : T;
type HeadersInit = string[][] | Record<string, string | ReadonlyArray<string>> | _Headers;
type FormDataEntryValue = string | _File;
type RequestInfo = string | _URL | _Request;
interface _Iterable<T, TReturn = any, TNext = any>
  extends Or<Iterable<T, TReturn, TNext>, globalThis.Iterable<T, TReturn, TNext>> {}
interface _AsyncIterable<T, TReturn = any, TNext = any>
  extends Or<AsyncIterable<T, TReturn, TNext>, globalThis.AsyncIterable<T, TReturn, TNext>> {}
interface _ReadableStream<T = any> extends Or<ReadableStream<T>, globalThis.ReadableStream<T>> {}
type BodyInit$1 =
  | ArrayBuffer
  | _Blob
  | NodeJS.ArrayBufferView
  | _URLSearchParams
  | _ReadableStream
  | _AsyncIterable<Uint8Array>
  | _FormData
  | _Iterable<Uint8Array>
  | null
  | string;
interface FileClass extends Or<typeof globalThis.File, typeof buffer.File> {}
interface _File extends _Blob, Or<File, globalThis.File> {
  readonly name: string;
  readonly lastModified: number;
}
interface _File extends Or<globalThis.File, buffer.File> {}
declare const _File: FileClass;
interface _RequestInit extends Or<RequestInit, globalThis.RequestInit> {
  connectTimeout?: number;
  duplex?: 'half';
}
interface _ResponseInit extends Or<ResponseInit, globalThis.ResponseInit> {}
interface BlobClass extends Or<typeof Blob, typeof globalThis.Blob> {}
interface _Blob extends Or<Blob, globalThis.Blob> {}
declare const _Blob: BlobClass;
interface URLSearchParamsClass
  extends Or<typeof URLSearchParams, typeof globalThis.URLSearchParams> {}
interface _URLSearchParams extends Or<URLSearchParams, globalThis.URLSearchParams> {}
declare const _URLSearchParams: URLSearchParamsClass;
interface URLClass extends Or<typeof URL, typeof globalThis.URL> {}
interface _URL extends Or<URL, globalThis.URL> {}
declare const _URL: URLClass;
interface RequestClass extends Or<typeof Request, typeof globalThis.Request> {
  new (input: RequestInfo, init?: _RequestInit | Or<RequestInit, globalThis.RequestInit>): _Request;
}
interface ResponseClass extends Or<typeof Response, typeof globalThis.Response> {
  new (body?: BodyInit$1, init?: _ResponseInit): _Response;
}
interface HeadersClass extends Or<typeof Headers, typeof globalThis.Headers> {
  new (init?: HeadersInit): _Headers;
}
interface FormDataClass extends Or<typeof FormData, typeof globalThis.FormData> {}
interface _Request extends Or<Request, globalThis.Request> {}
declare let _Request: RequestClass;
interface _Response extends Or<Response, globalThis.Response> {}
declare let _Response: ResponseClass;
interface _Headers extends Or<Headers, globalThis.Headers> {}
declare let _Headers: HeadersClass;
interface _FormData
  extends Or<FormData & _Iterable<[string, FormDataEntryValue]>, globalThis.FormData> {}
declare let _FormData: FormDataClass;

declare function _fetch(input: string | _URL | _Request, init?: _RequestInit): Promise<_Response>;

type BodyInit = Exclude<RequestInit['body'], undefined | null> | FormDataPolyfill | Readable;
interface FormDataPolyfill extends Readable {
  getBoundary(): string;
  getLengthSync(): number;
  hasKnownLength(): number;
}
declare const kBodyInternals: unique symbol;
declare class Body {
  private [kBodyInternals];
  constructor(init: BodyInit | null);
  get body(): Uint8Array<ArrayBufferLike> | ReadableStream<any> | Readable | null;
  get bodyUsed(): boolean;
  arrayBuffer(): Promise<ArrayBuffer | Uint8Array<ArrayBufferLike> | null>;
  formData(): Promise<undici_types.FormData>;
  blob(): Promise<buffer$1.Blob>;
  json(): Promise<any>;
  text(): Promise<string>;
}

export {
  _Blob as Blob,
  Body,
  type BodyInit$1 as BodyInit,
  _File as File,
  _FormData as FormData,
  type FormDataEntryValue,
  _Headers as Headers,
  type HeadersInit,
  _Request as Request,
  type RequestInfo,
  type _RequestInit as RequestInit,
  _Response as Response,
  type _ResponseInit as ResponseInit,
  _URL as URL,
  _URLSearchParams as URLSearchParams,
  _fetch as default,
  _fetch as fetch,
};
