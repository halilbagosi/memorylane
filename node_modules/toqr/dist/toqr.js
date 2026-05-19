Object.defineProperty(exports, "__esModule", {
  value: !0
});

const t = new Uint8Array(512);

const e = new Uint8Array(256);

for (let n = 0, o = 1; n < 255; n++) {
  t[n] = o;
  e[o] = n;
  o <<= 1;
  if (256 & o) {
    o ^= 285;
  }
}

for (let e = 255; e < 512; e++) {
  t[e] = t[e - 255];
}

const gmul = (n, o) => n > 0 && o > 0 ? t[e[n] + e[o]] : 0;

const gpow = (n, o) => t[o * e[n] % 255];

const genRS = t => {
  const e = new Uint8Array(t + 2);
  const n = new Uint8Array(t + 1);
  n[0] = 1;
  for (let o = 0; o < t; o++) {
    const t = gpow(2, o);
    e.fill(0, 0, o + 2);
    for (let r = 0; r < o + 1; r++) {
      e[r] ^= n[r];
      e[r + 1] ^= gmul(n[r], t);
    }
    for (let t = 0; t < o + 2; t++) {
      n[t] = e[t];
    }
  }
  return n;
};

const encodeRS = (t, e) => {
  const n = genRS(e);
  const o = new Uint8Array(t.byteLength + n.byteLength - 1);
  o.set(t);
  for (let e = 0; e < t.byteLength; e++) {
    const t = o[e];
    if (t) {
      for (let r = 1; r < n.byteLength; r++) {
        o[e + r] ^= gmul(n[r], t);
      }
    }
  }
  return o.subarray(t.byteLength);
};

const n = [ 0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706 ];

const o = [ [ 0, 0, 0, 0 ], [ 10, 7, 17, 13 ], [ 16, 10, 28, 22 ], [ 26, 15, 44, 36 ], [ 36, 20, 64, 52 ], [ 48, 26, 88, 72 ], [ 64, 36, 112, 96 ], [ 72, 40, 130, 108 ], [ 88, 48, 156, 132 ], [ 110, 60, 192, 160 ], [ 130, 72, 224, 192 ], [ 150, 80, 264, 224 ], [ 176, 96, 308, 260 ], [ 198, 104, 352, 288 ], [ 216, 120, 384, 320 ], [ 240, 132, 432, 360 ], [ 280, 144, 480, 408 ], [ 308, 168, 532, 448 ], [ 338, 180, 588, 504 ], [ 364, 196, 650, 546 ], [ 416, 224, 700, 600 ], [ 442, 224, 750, 644 ], [ 476, 252, 816, 690 ], [ 504, 270, 900, 750 ], [ 560, 300, 960, 810 ], [ 588, 312, 1050, 870 ], [ 644, 336, 1110, 952 ], [ 700, 360, 1200, 1020 ], [ 728, 390, 1260, 1050 ], [ 784, 420, 1350, 1140 ], [ 812, 450, 1440, 1200 ], [ 868, 480, 1530, 1290 ], [ 924, 510, 1620, 1350 ], [ 980, 540, 1710, 1440 ], [ 1036, 570, 1800, 1530 ], [ 1064, 570, 1890, 1590 ], [ 1120, 600, 1980, 1680 ], [ 1204, 630, 2100, 1770 ], [ 1260, 660, 2220, 1860 ], [ 1316, 720, 2310, 1950 ], [ 1372, 750, 2430, 2040 ] ];

const r = [ [ 0, 0, 0, 0 ], [ 1, 1, 1, 1 ], [ 1, 1, 1, 1 ], [ 1, 1, 2, 2 ], [ 2, 1, 4, 2 ], [ 2, 1, 4, 4 ], [ 4, 2, 4, 4 ], [ 4, 2, 5, 6 ], [ 4, 2, 6, 6 ], [ 5, 2, 8, 8 ], [ 5, 4, 8, 8 ], [ 5, 4, 11, 8 ], [ 8, 4, 11, 10 ], [ 9, 4, 16, 12 ], [ 9, 4, 16, 16 ], [ 10, 6, 18, 12 ], [ 10, 6, 16, 17 ], [ 11, 6, 19, 16 ], [ 13, 6, 21, 18 ], [ 14, 7, 25, 21 ], [ 16, 8, 25, 20 ], [ 17, 8, 25, 23 ], [ 17, 9, 34, 23 ], [ 18, 9, 30, 25 ], [ 20, 10, 32, 27 ], [ 21, 12, 35, 29 ], [ 23, 12, 37, 34 ], [ 25, 12, 40, 34 ], [ 26, 13, 42, 35 ], [ 28, 14, 45, 38 ], [ 29, 15, 48, 40 ], [ 31, 16, 51, 43 ], [ 33, 17, 54, 45 ], [ 35, 18, 57, 48 ], [ 37, 19, 60, 51 ], [ 38, 19, 63, 53 ], [ 40, 20, 66, 56 ], [ 43, 21, 70, 59 ], [ 45, 22, 74, 62 ], [ 47, 24, 77, 65 ], [ 49, 25, 81, 68 ] ];

const s = [ 0, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97, 101, 105, 109, 113, 117, 121, 125, 129, 133, 137, 141, 145, 149, 153, 157, 161, 165, 169, 173, 177 ];

const c = [ [], [], [ 4, 16 ], [ 4, 20 ], [ 4, 24 ], [ 4, 28 ], [ 4, 32 ], [ 4, 20, 36 ], [ 4, 22, 40 ], [ 4, 24, 44 ], [ 4, 26, 48 ], [ 4, 28, 52 ], [ 4, 30, 56 ], [ 4, 32, 60 ], [ 4, 24, 44, 64 ], [ 4, 24, 46, 68 ], [ 4, 24, 48, 72 ], [ 4, 28, 52, 76 ], [ 4, 28, 54, 80 ], [ 4, 28, 56, 84 ], [ 4, 32, 60, 88 ], [ 4, 26, 48, 70, 92 ], [ 4, 24, 48, 72, 96 ], [ 4, 28, 52, 76, 100 ], [ 4, 26, 52, 78, 104 ], [ 4, 30, 56, 82, 108 ], [ 4, 28, 56, 84, 112 ], [ 4, 32, 60, 88, 116 ], [ 4, 24, 48, 72, 96, 120 ], [ 4, 28, 52, 76, 100, 124 ], [ 4, 24, 50, 76, 102, 128 ], [ 4, 28, 54, 80, 106, 132 ], [ 4, 32, 58, 84, 110, 136 ], [ 4, 28, 56, 84, 112, 140 ], [ 4, 32, 60, 88, 116, 144 ], [ 4, 28, 52, 76, 100, 124, 148 ], [ 4, 22, 48, 74, 100, 126, 152 ], [ 4, 26, 52, 78, 104, 130, 156 ], [ 4, 30, 56, 82, 108, 134, 160 ], [ 4, 24, 52, 80, 108, 136, 164 ], [ 4, 28, 56, 84, 112, 140, 168 ] ];

const makeSegments = (t, e, r) => {
  const s = n[e] - o[e][r];
  const c = new Uint8Array(s);
  let f = 0;
  let l = 0;
  if (e > 9) {
    const e = 65535 & t.byteLength;
    c[0] = 64 | e >>> 12 & 15;
    c[1] = e >>> 4 & 255;
    f = (15 & e) << 4;
    l = 2;
  } else {
    const e = 255 & t.byteLength;
    c[0] = 64 | e >>> 4 & 15;
    f = (15 & e) << 4;
    l = 1;
  }
  let i = 0;
  while (i + 1 < t.byteLength) {
    const e = t[i++] << 8 | t[i++];
    c[l++] = f | e >>> 12;
    c[l++] = e >>> 4 & 255;
    f = e << 4 & 240;
  }
  if (i < t.byteLength) {
    c[l++] = f | t[i] >>> 4;
    f = t[i] << 4 & 240;
  }
  c[l++] = f;
  for (let t = 0; l < s; t++) {
    c[l++] = 1 & t ? 17 : 236;
  }
  return c;
};

const getBestVersion = (t, e) => {
  for (let r = 1; r <= 40; r++) {
    let s = n[r] - o[r][e];
    s -= r > 9 ? 3 : 2;
    if (s >= t.byteLength) {
      return r;
    }
  }
  throw new RangeError("Bytes exceed max length");
};

const encodeData = (t, e, n) => {
  const s = t.byteLength + o[e][n];
  const c = r[e][n];
  const f = c - s % c;
  const l = t.byteLength / c | 0;
  const i = (s / c | 0) - l;
  const y = t.byteLength;
  const a = new Uint8Array(s);
  for (let e = 0, n = 0; e < c; e++) {
    const o = e < f ? l : l + 1;
    const r = encodeRS(t.subarray(n, n + o), i);
    for (let r = 0; r < o; r++) {
      a[r < l ? r * c + e : l * c + (e - f)] = t[n + r];
    }
    for (let t = 0; t < i; t++) {
      a[y + t * c + e] = r[t];
    }
    n += o;
  }
  return a;
};

const setSquare = (t, e, n, o, r) => {
  const s = (n + r) * e;
  for (let c = n * e; c < s; c += e) {
    t.fill(1, c + o, c + o + r);
  }
};

const setPattern = (t, e, n, o, r) => {
  const s = n * e + o;
  for (let n = 0; n < r; n++) {
    for (let o = 0; o < r; o++) {
      const c = o < r - 1 - o ? o : r - 1 - o;
      const f = n < r - 1 - n ? n : r - 1 - n;
      t[s + n * e + o] = 1 !== (c < f ? c : f) ? 1 : 0;
    }
  }
};

const writeFinderPatterns = (t, e, n) => {
  const o = n - 7;
  setPattern(t, n, 0, 0, 7);
  setPattern(t, n, o, 0, 7);
  setPattern(t, n, 0, o, 7);
  setSquare(e, n, 0, 0, 8);
  setSquare(e, n, o - 1, 0, 8);
  setSquare(e, n, 0, o - 1, 8);
};

const writeAlignmentPatterns = (t, e, n, o) => {
  const r = c[o];
  for (let o = 0; o < r.length; o++) {
    const s = r[o];
    for (let c = 0; c < r.length; c++) {
      if ((o || c % (r.length - 1)) && (c || o % (r.length - 1))) {
        const o = r[c];
        setPattern(t, n, s, o, 5);
        setSquare(e, n, s, o, 5);
      }
    }
  }
};

const writeTimingPatterns = (t, e, n) => {
  const o = n - 7;
  for (let r = 8; r < o; r++) {
    const o = r * n + 6;
    if (!e[o]) {
      e[o] = 1;
      t[o] = (r + 1) % 2;
    }
    const s = 6 * n + r;
    if (!e[s]) {
      e[s] = 1;
      t[s] = (r + 1) % 2;
    }
  }
};

const reserveFormatInfo = (t, e) => {
  const n = e - 7 - 1;
  t[8 * e + 8] = 1;
  for (let o = 0; o < 8; o++) {
    t[o * e + 8] = 1;
    t[8 * e + o] = 1;
    t[(n + o) * e + 8] = 1;
    t[8 * e + n + o] = 1;
  }
};

const reserveVersionInfo = (t, e, n) => {
  if (n >= 7) {
    const n = e - 7 - 4;
    for (let o = 0; o < 6; o++) {
      for (let r = 0; r < 3; r++) {
        t[(n + r) * e + o] = 1;
        t[o * e + n + r] = 1;
      }
    }
  }
};

const writeData = (t, e, n, o) => {
  let r = 0;
  let s = n - 1;
  let c = -1;
  let f = 7;
  while (r < o.byteLength) {
    if (6 === s) {
      s--;
    }
    for (let l = 0; l < n; l++) {
      for (let i = 0; i < 2; i++) {
        const y = s - i;
        const a = -1 === c ? n - l - 1 : l;
        if (e[a * n + y]) {
          continue;
        }
        t[a * n + y] = o[r] >>> f & 1;
        if (0 === f--) {
          f = 7;
          if (++r >= o.byteLength) {
            return;
          }
        }
      }
    }
    c = -c;
    s -= 2;
  }
};

const xorPatternN0 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      if (!(e[n] || o + s & 1)) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN1 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      if (!(e[n] || 1 & o)) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN2 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let o = 0; o < n; o++) {
      const n = r + o;
      if (!e[n] && o % 3 == 0) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN3 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      if (!e[n] && (o + s) % 3 == 0) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN4 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    const s = o / 2 | 0;
    for (let o = 0; o < n; o++) {
      const n = r + o;
      if (!(e[n] || s + (o / 3 | 0) & 1)) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN5 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      const c = o * s;
      if (!e[n] && (1 & c) + c % 3 == 0) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN6 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      const c = o * s;
      if (!e[n] && ((1 & c) + c % 3) % 2 == 0) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPatternN7 = (t, e, n) => {
  for (let o = 0, r = 0; o < n; o++, r += n) {
    for (let s = 0; s < n; s++) {
      const n = r + s;
      if (!(e[n] || o * s % 3 + (o + s & 1) & 1)) {
        t[n] ^= 1;
      }
    }
  }
};

const xorPattern = (t, e, n, o) => {
  switch (o) {
   case 0:
    return xorPatternN0(t, e, n);

   case 1:
    return xorPatternN1(t, e, n);

   case 2:
    return xorPatternN2(t, e, n);

   case 3:
    return xorPatternN3(t, e, n);

   case 4:
    return xorPatternN4(t, e, n);

   case 5:
    return xorPatternN5(t, e, n);

   case 6:
    return xorPatternN6(t, e, n);

   case 7:
    return xorPatternN7(t, e, n);
  }
};

const computePenalty = (t, e) => {
  let n = 0;
  let o = 0;
  for (let r = 0; r < e; r++) {
    let s = 1;
    let c = 1;
    let f = 0;
    let l = 0;
    for (let i = 0; i < e; i++) {
      const y = r * e + i;
      const a = i * e + r;
      o += t[y];
      if (i > 0) {
        if (t[y - 1] === t[y]) {
          s++;
        } else {
          if (s >= 5) {
            n += s - 5 + 3;
          }
          s = 1;
        }
        if (t[a - e] === t[a]) {
          c++;
        } else {
          if (c >= 5) {
            n += c - 5 + 3;
          }
          c = 1;
        }
      }
      if (r < e - 1 && i < e - 1 && t[y] === t[y + 1] && t[y] === t[y + e] && t[y] === t[y + e + 1]) {
        n += 3;
      }
      f = f << 1 & 2047 | t[y];
      l = l << 1 & 2047 | t[a];
      if (i >= 10) {
        if (1488 === f || 93 === f) {
          n += 40;
        }
        if (1488 === l || 93 === l) {
          n += 40;
        }
      }
    }
    if (s >= 5) {
      n += s - 5 + 3;
    }
    if (c >= 5) {
      n += c - 5 + 3;
    }
  }
  const r = 100 * Math.abs(o / t.byteLength - .5);
  n += 10 * Math.floor(r / 5);
  return n;
};

const applyBestPattern = (t, e, n) => {
  let o = 0;
  let r = 0;
  const s = new Uint8Array(t.byteLength);
  for (let c = 0; c <= 7; c += 1) {
    s.set(t);
    xorPattern(s, e, n, c);
    const f = computePenalty(s, n);
    if (0 === c || f < o) {
      o = f;
      r = c;
    }
  }
  xorPattern(t, e, n, r);
  return r;
};

const encodeFormatInfo = (t, e) => {
  const n = (t << 3 | e) << 10;
  let o = n;
  for (let t = 0; t < 5; t++) {
    if (o & 1 << 14 - t) {
      o ^= 1335 << 4 - t;
    }
  }
  return 21522 ^ (o | n);
};

const writeFormatInfo = (t, e, n, o) => {
  const r = encodeFormatInfo(n, o);
  let s = 14;
  for (let n = 0; n < 6; n++) {
    t[8 * e + n] = r >> s-- & 1;
  }
  t[8 * e + 7] = r >> s-- & 1;
  t[8 * e + 8] = r >> s-- & 1;
  t[7 * e + 8] = r >> s-- & 1;
  for (let n = 0; n < 6; n++) {
    t[(5 - n) * e + 8] = r >> s-- & 1;
  }
  s = 14;
  for (let n = 0; n < 7; n++) {
    t[(e - 1 - n) * e + 8] = r >> s-- & 1;
  }
  t[(e - 8) * e + 8] = 1;
  for (let n = 0; n < 8; n++) {
    t[8 * e + e - 8 + n] = r >> s-- & 1;
  }
};

const encodeVersionInfo = t => {
  const e = t << 12;
  let n = e;
  for (let t = 0; t < 6; t++) {
    if (n & 1 << 17 - t) {
      n ^= 7973 << 5 - t;
    }
  }
  return n | e;
};

const writeVersionInfo = (t, e, n) => {
  if (n >= 7) {
    const o = encodeVersionInfo(n);
    for (let n = 0; n < 6; n++) {
      for (let r = 0; r < 3; r++) {
        const s = o >>> 3 * n + r & 1;
        t[(e - 11 + r) * e + n] = s;
        t[n * e + e - 11 + r] = s;
      }
    }
  }
};

const encodeBytes = (t, e) => {
  const n = getBestVersion(t, e);
  const o = makeSegments(t, n, e);
  const r = encodeData(o, n, e);
  const c = s[n];
  const f = new Uint8Array(c * c);
  const l = new Uint8Array(c * c);
  writeFinderPatterns(f, l, c);
  writeAlignmentPatterns(f, l, c, n);
  writeTimingPatterns(f, l, c);
  reserveFormatInfo(l, c);
  reserveVersionInfo(l, c, n);
  writeData(f, l, c, r);
  const i = applyBestPattern(f, l, c);
  writeFormatInfo(f, c, e, i);
  writeVersionInfo(f, c, n);
  return f;
};

const f = new TextEncoder;

exports.toQR = (t, e = 1) => {
  const n = "string" == typeof t ? f.encode(t) : t;
  return encodeBytes(n, e);
};
//# sourceMappingURL=toqr.js.map
