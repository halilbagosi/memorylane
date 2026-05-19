declare const enum ECLevel {
  M = 0,
  L = 1,
  H = 2,
  Q = 3,
}
declare const toQR: (content: string | Uint8Array, ec?: ECLevel) => Uint8Array<ArrayBuffer>;

export { toQR };
