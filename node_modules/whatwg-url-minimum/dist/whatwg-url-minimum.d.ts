type Or<T, U> = void extends T ? U : T;
interface _URL extends Or<URL, globalThis.URL> {}
interface _URLSearchParams extends Or<URLSearchParams, globalThis.URLSearchParams> {}

interface URLAbstract {
  scheme: string;
  username: string;
  password: string;
  host: string | null;
  port: number | null;
  path: string[];
  query: string | null;
  fragment: string | null;
  opaquePath: boolean;
}

declare const _implSymbol$1: unique symbol;
interface URLInternals {
  url: URLAbstract;
  query: URLSearchParams$1;
}
declare class URL$1 implements _URL {
  [_implSymbol$1]: URLInternals;
  constructor(input?: string | _URL, base?: string | _URL);
  static createObjectURL(_input: any): string;
  static revokeObjectURL(_input: any): void;
  static parse(input: string | _URL, base?: string | _URL): URL$1 | null;
  static canParse(input: string | _URL, base?: string | _URL): boolean;
  get href(): string;
  set href(value: string);
  get origin(): string;
  get protocol(): string;
  set protocol(value: string);
  get username(): string;
  set username(value: string);
  get password(): string;
  set password(value: string);
  get host(): string;
  set host(value: string);
  get hostname(): string;
  set hostname(value: string);
  get port(): string;
  set port(value: string);
  get pathname(): string;
  set pathname(value: string);
  get search(): string;
  set search(value: string);
  get searchParams(): URLSearchParams$1;
  get hash(): string;
  set hash(value: string);
  toJSON(): string;
  toString(): string;
}

declare const _implSymbol: unique symbol;
interface URLSearchParamsInternals {
  list: [string, string][];
  url: URL$1 | null;
}
declare class URLSearchParams$1 implements _URLSearchParams {
  [_implSymbol]: URLSearchParamsInternals;
  constructor(init?: string[][] | Record<string, string> | string | _URLSearchParams);
  get size(): number;
  append(name: string, value: string): void;
  delete(name: string, value?: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string, value?: string): boolean;
  set(name: string, value: string): void;
  sort(): void;
  forEach(
    callbackfn: (value: string, key: string, parent: _URLSearchParams) => void,
    thisArg?: any
  ): void;
  entries(): URLSearchParamsIterator<[string, string]>;
  keys(): URLSearchParamsIterator<string>;
  values(): URLSearchParamsIterator<string>;
  toString(): string;
  [Symbol.iterator](): URLSearchParamsIterator<[string, string]>;
}

export { URL$1 as URL, URLSearchParams$1 as URLSearchParams };
