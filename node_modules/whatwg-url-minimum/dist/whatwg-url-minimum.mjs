function toUSVString(e) {
  return "string" == typeof e ? e : String(e);
}

function toObject(e, t) {
  if ("object" != typeof e || null == e) {
    let e = "";
    e += "The provided value is not an object";
    throw new TypeError(e);
  }
  return e;
}

function toIterator(e) {
  if (null != e && "object" == typeof e && "function" == typeof e[Symbol.iterator]) {
    const t = e[Symbol.iterator]();
    if (!t || "object" != typeof t) {
      throw new TypeError("Result of the Symbol.iterator method is not an object");
    }
    return t;
  } else {
    return;
  }
}

function toQueryPair(e) {
  let t;
  if (Array.isArray(e)) {
    if (2 === e.length) {
      const t = e;
      t[0] = toUSVString(t[0]);
      t[1] = toUSVString(t[1]);
      return t;
    }
  } else if (null != (t = toIterator(e))) {
    const e = toObject(t.next());
    const r = toObject(t.next());
    if (!e.done && !r.done) {
      return [ toUSVString(e.value), toUSVString(r.value) ];
    }
  }
  throw new TypeError("Each query pair must be an iterable [name, value] tuple");
}

const e = new TextEncoder;

const t = new TextDecoder("utf-8", {
  ignoreBOM: !0
});

function utf8Encode(t) {
  return e.encode(t);
}

function utf8Decode(e) {
  return t.decode(e);
}

function percentEncode(e) {
  const t = e.toString(16).toUpperCase();
  return 1 === t.length ? `%0${t}` : `%${t}`;
}

function decodeHexDigit(e) {
  if (e >= 48 && e <= 57) {
    return e - 48;
  } else if (e >= 65 && e <= 70) {
    return e - 65 + 10;
  } else if (e >= 97 && e <= 102) {
    return e - 97 + 10;
  } else {
    return -1;
  }
}

function percentDecodeBytes(e) {
  const t = new Uint8Array(e.byteLength);
  let r = 0;
  for (let n = 0; n < e.byteLength; ++n) {
    const s = e[n];
    if (37 !== s) {
      t[r++] = s;
    } else {
      const i = decodeHexDigit(e[n + 1]);
      const u = decodeHexDigit(e[n + 2]);
      if (i >= 0 && u >= 0) {
        t[r++] = i << 4 | u;
        n += 2;
      } else {
        t[r++] = s;
      }
    }
  }
  return t.slice(0, r);
}

function isC0ControlPercentEncode(e) {
  return e <= 31 || e > 126;
}

function isFragmentPercentEncode(e) {
  switch (e) {
   case 32:
   case 34:
   case 60:
   case 62:
   case 96:
    return !0;

   default:
    return isC0ControlPercentEncode(e);
  }
}

function isQueryPercentEncode(e) {
  switch (e) {
   case 32:
   case 34:
   case 35:
   case 60:
   case 62:
    return !0;

   default:
    return isC0ControlPercentEncode(e);
  }
}

function isSpecialQueryPercentEncode(e) {
  return isQueryPercentEncode(e) || 39 === e;
}

function isPathPercentEncode(e) {
  switch (e) {
   case 63:
   case 94:
   case 96:
   case 123:
   case 125:
    return !0;

   default:
    return isQueryPercentEncode(e);
  }
}

function isUserinfoPercentEncode(e) {
  switch (e) {
   case 47:
   case 58:
   case 59:
   case 61:
   case 64:
   case 91:
   case 92:
   case 93:
   case 124:
    return !0;

   default:
    return isPathPercentEncode(e);
  }
}

function isURLEncodedPercentEncode(e) {
  switch (e) {
   case 33:
   case 39:
   case 40:
   case 41:
   case 126:
    return !0;

   default:
    return function isComponentPercentEncode(e) {
      switch (e) {
       case 36:
       case 37:
       case 38:
       case 43:
       case 44:
        return !0;

       default:
        return isUserinfoPercentEncode(e);
      }
    }(e);
  }
}

function utf8PercentEncodeCodePoint(e, t) {
  const r = utf8Encode(String.fromCodePoint(e || 0));
  let n = "";
  for (let e = 0; e < r.length; e++) {
    n += t(r[e]) ? percentEncode(r[e]) : String.fromCharCode(r[e]);
  }
  return n;
}

function utf8PercentEncodeString(e, t, r = !1) {
  const n = utf8Encode(e);
  let s = "";
  for (let e = 0; e < n.length; e++) {
    if (r && 32 === n[e]) {
      s += "+";
    } else {
      s += t(n[e]) ? percentEncode(n[e]) : String.fromCharCode(n[e]);
    }
  }
  return s;
}

function replacePlusByteWithSpace(e) {
  let t = 0;
  while ((t = e.indexOf(43, 0)) > -1) {
    e[t] = 32;
  }
  return e;
}

function parseUrlencoded(e) {
  const t = [];
  let r = 0;
  let n = 0;
  while (n < e.byteLength) {
    n = e.indexOf(38, r);
    if (n < 0) {
      n = e.byteLength;
    }
    const s = e.subarray(r, n);
    r = n + 1;
    if (0 === s.byteLength) {
      continue;
    }
    let i = s.indexOf(61);
    if (i < 0) {
      i = s.byteLength;
    }
    const u = replacePlusByteWithSpace(s.slice(0, i));
    const l = replacePlusByteWithSpace(s.slice(i + 1));
    const o = utf8Decode(percentDecodeBytes(u));
    const c = utf8Decode(percentDecodeBytes(l));
    t.push([ o, c ]);
  }
  return t;
}

function serializeUrlencoded(e) {
  let t = "";
  for (let r = 0; r < e.length; r++) {
    const n = utf8PercentEncodeString(e[r][0], isURLEncodedPercentEncode, !0);
    const s = utf8PercentEncodeString(e[r][1], isURLEncodedPercentEncode, !0);
    t += 0 !== r ? `&${n}=${s}` : `${n}=${s}`;
  }
  return t;
}

function parseIPv4Number(e) {
  let t = 10;
  if (e.length >= 2 && "0" === e[0] && ("x" === e[1] || "X" === e[1])) {
    e = e.slice(2);
    t = 16;
  } else if (e.length >= 2 && "0" === e[0]) {
    e = e.slice(1);
    t = 8;
  } else if ("" === e) {
    return -1;
  }
  let r = 0;
  for (let n = 0; n < e.length; n++) {
    const s = decodeHexDigit(e.charCodeAt(n));
    if (s >= t || s < 0) {
      return -1;
    }
    r = r * t + s;
  }
  return r;
}

function isSingleDot(e) {
  switch (e) {
   case ".":
   case "%2e":
   case "%2E":
    return !0;

   default:
    return !1;
  }
}

function isWindowsDriveLetterCodePoints(e, t) {
  return (e >= 65 && e <= 90 || e >= 97 && e <= 122) && (58 === t || 124 === t);
}

function isWindowsDriveLetterString(e) {
  return 2 === e.length && isWindowsDriveLetterCodePoints(e.codePointAt(0), e.codePointAt(1));
}

function containsForbiddenHostCodePoint(e) {
  return -1 !== e.search(/\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|<|>|\?|@|\[|\\|\]|\^|\|/u);
}

function isSpecial(e) {
  switch (e) {
   case "ftp":
   case "http":
   case "https":
   case "ws":
   case "wss":
   case "file":
    return !0;

   default:
    return !1;
  }
}

function defaultPort(e) {
  switch (e) {
   case "ftp":
    return 21;

   case "http":
   case "ws":
    return 80;

   case "https":
   case "wss":
    return 443;

   default:
    return null;
  }
}

function parseHost(e, t) {
  if ("[" === e[0]) {
    return "]" === e[e.length - 1] ? function parseIPv6(e) {
      const t = [ 0, 0, 0, 0, 0, 0, 0, 0 ];
      let r = null;
      let n = 0;
      let s = 0;
      const i = Array.from(e, e => e.codePointAt(0));
      if (58 === i[s]) {
        if (58 !== i[s + 1]) {
          return null;
        }
        s += 2;
        n++;
        r = n;
      }
      while (s < i.length) {
        if (8 === n) {
          return null;
        } else if (58 === i[s]) {
          if (null !== r) {
            return null;
          }
          s++;
          n++;
          r = n;
          continue;
        }
        let e = 0;
        let u = 0;
        let l = 0;
        while (l < 4 && (e = decodeHexDigit(i[s])) >= 0) {
          u = (u << 4) + e;
          s++;
          l++;
        }
        if (46 === i[s]) {
          if (0 === l) {
            return null;
          }
          if (n > 6) {
            return null;
          }
          s -= l;
          let e = 0;
          while (void 0 !== i[s]) {
            let r = 0;
            if (e > 0) {
              if (46 === i[s] && e < 4) {
                s++;
              } else {
                return null;
              }
            }
            if (null == i[s] || i[s] < 48 || i[s] > 57) {
              return null;
            }
            while (i[s] >= 48 && i[s] <= 57) {
              r = 10 * r + decodeHexDigit(i[s]);
              if (r > 255) {
                return null;
              }
              s++;
            }
            t[n] = 256 * t[n] + r;
            e++;
            if (e % 2 == 0) {
              n++;
            }
          }
          if (4 !== e) {
            return null;
          }
          break;
        } else if (58 === i[s]) {
          if (void 0 === i[++s]) {
            return null;
          }
        } else if (void 0 !== i[s]) {
          return null;
        }
        t[n] = u;
        n++;
      }
      if (null !== r) {
        let e = n - r;
        n = 7;
        while (0 !== n && e > 0) {
          const s = t[r + e - 1];
          t[r + e - 1] = t[n];
          t[n] = s;
          n--;
          e--;
        }
      } else if (null === r && 8 !== n) {
        return null;
      }
      return t;
    }(e.substring(1, e.length - 1)) : null;
  } else if (t) {
    return function parseOpaqueHost(e) {
      return !containsForbiddenHostCodePoint(e) ? utf8PercentEncodeString(e, isC0ControlPercentEncode) : null;
    }(e);
  } else {
    const t = utf8Decode(function percentDecodeString(e) {
      return percentDecodeBytes(utf8Encode(e));
    }(e));
    if (function isIPv4(e) {
      let t = e.length;
      let r = e.lastIndexOf(".", t - 2) + 1;
      if (46 === e.charCodeAt(t - 1)) {
        t--;
      }
      return t > r && parseIPv4Number(e.slice(r, t)) >= 0;
    }(t)) {
      return function parseIPv4(e) {
        const t = e.split(".");
        let r = t.length;
        if (!t[r - 1]) {
          r--;
        }
        if (r > 4) {
          return null;
        }
        let n = 0;
        for (let e = 0; e < r - 1; e++) {
          const r = parseIPv4Number(t[e]);
          if (r < 0 || r > 255) {
            return null;
          }
          n += r * (1 << 8 * (3 - e));
        }
        const s = parseIPv4Number(t[r - 1]);
        if (s < 0 || s >= 256 ** (5 - r)) {
          return null;
        }
        n += s;
        return n;
      }(t);
    } else if (containsForbiddenHostCodePoint(t)) {
      return null;
    } else {
      return function normalizeDomain(e) {
        const t = e.normalize("NFC").replace(/[\u3002\uFF0E\uFF61.]/g, ".").toLowerCase();
        return !/[\x00-\x20%]/g.test(t) ? t : null;
      }(t);
    }
  }
}

function serializeHost(e) {
  if ("number" == typeof e) {
    return function serializeIPv4(e) {
      const t = 255;
      let r = "";
      r += `${(e >>> 24 & t).toString(10)}.`;
      r += `${(e >>> 16 & t).toString(10)}.`;
      r += `${(e >>> 8 & t).toString(10)}.`;
      r += (e & t).toString(10);
      return r;
    }(e);
  } else if (Array.isArray(e)) {
    return `[${function serializeIPv6(e) {
      const t = function findTheIPv6AddressCompressedPieceIndex(e) {
        let t = -1;
        let r = -1;
        let n = 1;
        let s = 0;
        for (let i = 0; i < e.length; ++i) {
          if (0 !== e[i]) {
            if (s > n) {
              t = r;
              n = s;
            }
            r = -1;
            s = 0;
          } else {
            if (-1 === r) {
              r = i;
            }
            ++s;
          }
        }
        return s > n ? r : t;
      }(e);
      let r = "";
      let n = !1;
      for (let s = 0; s <= 7; ++s) {
        if (n && 0 === e[s]) {
          continue;
        } else if (n) {
          n = !1;
        }
        if (t === s) {
          r += 0 === s ? "::" : ":";
          n = !0;
          continue;
        }
        r += e[s].toString(16);
        if (7 !== s) {
          r += ":";
        }
      }
      return r;
    }(e)}]`;
  } else {
    return e;
  }
}

function shortenPath(e) {
  if (e.path.length > 0 && (1 !== e.path.length || "file" !== e.scheme || !function isNormalizedWindowsDriveLetter(e) {
    return /^[A-Za-z]:$/u.test(e);
  }(e.path[0]))) {
    e.path.pop();
  }
}

function includesCredentials(e) {
  return "" !== e.username || "" !== e.password;
}

function cannotHaveAUsernamePasswordPort(e) {
  return null === e.host || "" === e.host || "file" === e.scheme;
}

var r = 11, n = 18, s = 19, i = 21, u = 22;

function parseURL(e, t, r, n) {
  const s = function parseURLRaw(e, t, r, n) {
    if (!t) {
      e = function trimControlChars(e) {
        let t = 0;
        let r = e.length;
        for (;t < r; ++t) {
          if (e.charCodeAt(t) > 32) {
            break;
          }
        }
        for (;r > t; --r) {
          if (e.charCodeAt(r - 1) > 32) {
            break;
          }
        }
        return e.substring(t, r);
      }(e);
    }
    e = function trimTabAndNewline(e) {
      return e.replace(/\u0009|\u000A|\u000D/gu, "");
    }(e);
    const s = {
      pointer: 0,
      input: Array.from(e, e => e.codePointAt(0)),
      buffer: "",
      base: r || null,
      url: t || {
        scheme: "",
        username: "",
        password: "",
        host: null,
        port: null,
        path: [],
        query: null,
        fragment: null,
        opaquePath: !1
      },
      failure: !1,
      atSignSeen: !1,
      passwordTokenSeen: !1,
      insideBrackets: !1,
      initialMode: n || 0
    };
    for (let e = n || 2; s.pointer <= s.input.length; ++s.pointer) {
      const t = s.input[s.pointer];
      e = next(e, s, t, null != t ? String.fromCodePoint(t) : "");
      if (0 === e) {
        s.failure = !1;
        break;
      } else if (1 === e) {
        s.failure = !0;
        break;
      }
    }
    return s;
  }(e, t, r, n);
  return !s.failure ? s.url : null;
}

function next(e, t, l, o) {
  switch (e) {
   case 1:
   case 0:
    return e;

   case 2:
    return parseSchemeStart(t, l, o);

   case 3:
    return parseScheme(t, l, o);

   case 4:
    return parseNoScheme(t, l);

   case 5:
    return parseSpecialRelativeOrAuthority(t, l);

   case 6:
    return parsePathOrAuthority(t, l);

   case 7:
    return parseRelative(t, l);

   case 8:
    return parseRelativeSlash(t, l);

   case 9:
    return parseSpecialAuthoritySlashes(t, l);

   case 10:
    return parseSpecialAuthorityIgnoreSlashes(t, l);

   case r:
    return parseAuthority(t, l, o);

   case 12:
   case 13:
    return parseHostname(t, l, o);

   case 14:
    return parsePort(t, l, o);

   case 15:
    return parseFile(t, l);

   case 16:
    return parseFileSlash(t, l);

   case 17:
    return parseFileHost(t, l, o);

   case n:
    return parsePathStart(t, l);

   case s:
    return parsePath(t, l);

   case 20:
    return parseOpaquePath(t, l);

   case i:
    return parseQuery(t, l, o);

   case u:
    return parseFragment(t, l);
  }
}

const parseSchemeStart = (e, t, r) => {
  if (null != t && (t >= 65 && t <= 90 || t >= 97 && t <= 122)) {
    e.buffer += r.toLowerCase();
    return 3;
  } else if (!e.initialMode) {
    --e.pointer;
    return 4;
  } else {
    return 1;
  }
};

const parseScheme = (e, t, r) => {
  if (null != t && (43 === t || 45 === t || 46 === t || t >= 65 && t <= 90 || t >= 97 && t <= 122 || t >= 48 && t <= 57)) {
    e.buffer += r.toLowerCase();
    return 3;
  } else if (58 === t) {
    if (e.initialMode) {
      if (isSpecial(e.url.scheme) !== isSpecial(e.buffer)) {
        return 0;
      } else if ((includesCredentials(e.url) || null !== e.url.port) && "file" === e.buffer) {
        return 0;
      } else if ("file" === e.url.scheme && "" === e.url.host) {
        return 0;
      }
    }
    e.url.scheme = e.buffer;
    if (e.initialMode) {
      if (e.url.port === defaultPort(e.url.scheme)) {
        e.url.port = null;
      }
      return 0;
    }
    e.buffer = "";
    if ("file" === e.url.scheme) {
      return 15;
    } else if (isSpecial(e.url.scheme) && null !== e.base && e.base.scheme === e.url.scheme) {
      return 5;
    } else if (isSpecial(e.url.scheme)) {
      return 9;
    } else if (47 === e.input[e.pointer + 1]) {
      e.pointer++;
      return 6;
    } else {
      e.url.path = [ "" ];
      e.url.opaquePath = !0;
      return 20;
    }
  } else if (!e.initialMode) {
    e.buffer = "";
    e.pointer = -1;
    return 4;
  } else {
    return 1;
  }
};

const parseNoScheme = (e, t, r) => {
  if (null === e.base || e.base.opaquePath && 35 !== t) {
    return 1;
  } else if (e.base.opaquePath && 35 === t) {
    e.url.scheme = e.base.scheme;
    e.url.path = e.base.path.slice();
    e.url.opaquePath = e.base.opaquePath;
    e.url.query = e.base.query;
    e.url.fragment = "";
    return u;
  } else if ("file" === e.base.scheme) {
    e.pointer--;
    return 15;
  } else {
    e.pointer--;
    return 7;
  }
};

const parseSpecialRelativeOrAuthority = (e, t, r) => {
  if (47 === t && 47 === e.input[e.pointer + 1]) {
    ++e.pointer;
    return 10;
  } else {
    e.pointer--;
    return 7;
  }
};

const parsePathOrAuthority = (e, t, n) => {
  if (47 === t) {
    return r;
  } else {
    e.pointer--;
    return s;
  }
};

const parseRelative = (e, t, r) => {
  e.url.scheme = e.base.scheme;
  if (47 === t) {
    return 8;
  } else if (isSpecial(e.url.scheme) && 92 === t) {
    return 8;
  } else {
    e.url.username = e.base.username;
    e.url.password = e.base.password;
    e.url.host = e.base.host;
    e.url.port = e.base.port;
    e.url.path = e.base.path.slice();
    e.url.query = e.base.query;
    if (63 === t) {
      e.url.query = "";
      return i;
    } else if (35 === t) {
      e.url.fragment = "";
      return u;
    } else if (null != t) {
      e.url.query = null;
      e.url.path.pop();
      e.pointer--;
      return s;
    } else {
      return 7;
    }
  }
};

const parseRelativeSlash = (e, t, n) => {
  if (isSpecial(e.url.scheme) && (47 === t || 92 === t)) {
    return 10;
  } else if (47 === t) {
    return r;
  } else {
    e.url.username = e.base.username;
    e.url.password = e.base.password;
    e.url.host = e.base.host;
    e.url.port = e.base.port;
    e.pointer--;
    return s;
  }
};

const parseSpecialAuthoritySlashes = (e, t, r) => {
  if (47 === t && 47 === e.input[e.pointer + 1]) {
    e.pointer++;
  } else {
    e.pointer--;
  }
  return 10;
};

const parseSpecialAuthorityIgnoreSlashes = (e, t, n) => {
  if (47 !== t && 92 !== t) {
    e.pointer--;
    return r;
  } else {
    return 10;
  }
};

const parseAuthority = (e, t, n) => {
  if (64 === t) {
    if (e.atSignSeen) {
      e.buffer = `%40${e.buffer}`;
    }
    e.atSignSeen = !0;
    const t = Array.from(e.buffer, e => e.codePointAt(0));
    for (let r = 0; r < t.length; r++) {
      const t = e.buffer.codePointAt(r);
      if (58 === t && !e.passwordTokenSeen) {
        e.passwordTokenSeen = !0;
        continue;
      }
      const n = utf8PercentEncodeCodePoint(t, isUserinfoPercentEncode);
      if (e.passwordTokenSeen) {
        e.url.password += n;
      } else {
        e.url.username += n;
      }
    }
    e.buffer = "";
    return r;
  } else if (null == t || 35 === t || 47 === t || 63 === t || 92 === t && isSpecial(e.url.scheme)) {
    if (e.atSignSeen && "" === e.buffer) {
      return 1;
    }
    e.pointer -= [ ...e.buffer ].length + 1;
    e.buffer = "";
    return 13;
  } else {
    e.buffer += n;
    return r;
  }
};

const parseHostname = (e, t, r) => {
  if (e.initialMode && "file" === e.url.scheme) {
    e.pointer--;
    return 17;
  } else if (58 === t && !e.insideBrackets) {
    if ("" === e.buffer) {
      return 1;
    }
    if (13 === e.initialMode) {
      return 1;
    }
    const t = parseHost(e.buffer, !isSpecial(e.url.scheme));
    if (null === t) {
      return 1;
    }
    e.url.host = serializeHost(t);
    e.buffer = "";
    return 14;
  } else if (null == t || 35 === t || 47 === t || 63 === t || 92 === t && isSpecial(e.url.scheme)) {
    e.pointer--;
    if (isSpecial(e.url.scheme) && "" === e.buffer) {
      return 1;
    } else if (e.initialMode && "" === e.buffer && (includesCredentials(e.url) || null !== e.url.port)) {
      return 1;
    }
    const t = parseHost(e.buffer, !isSpecial(e.url.scheme));
    if (null === t) {
      return 1;
    }
    e.url.host = serializeHost(t);
    e.buffer = "";
    return e.initialMode ? 0 : n;
  } else {
    if (91 === t) {
      e.insideBrackets = !0;
    } else if (93 === t) {
      e.insideBrackets = !1;
    }
    e.buffer += r;
    return 13;
  }
};

const parsePort = (e, t, r) => {
  if (null != t && t >= 48 && t <= 57) {
    e.buffer += r;
    return 14;
  } else if (e.initialMode || null == t || 35 === t || 47 === t || 63 === t || 92 === t && isSpecial(e.url.scheme)) {
    if ("" !== e.buffer) {
      const t = parseInt(e.buffer, 10);
      if (t > 65535) {
        return 1;
      }
      e.url.port = t === defaultPort(e.url.scheme) ? null : t;
      e.buffer = "";
      if (e.initialMode) {
        return 0;
      }
    }
    if (e.initialMode) {
      return 1;
    } else {
      e.pointer--;
      return n;
    }
  } else {
    return 1;
  }
};

function startsWithWindowsDriveLetter(e, t) {
  const r = e.length - t;
  if (r < 2) {
    return !1;
  }
  if (!isWindowsDriveLetterCodePoints(e[t], e[t + 1])) {
    return !1;
  } else if (2 === r) {
    return !0;
  } else {
    const r = e[t + 2];
    return 47 === r || 92 === r || 63 === r || 35 === r;
  }
}

const parseFile = (e, t, r) => {
  e.url.scheme = "file";
  e.url.host = "";
  if (47 === t || 92 === t) {
    return 16;
  } else if ("file" === e.base?.scheme) {
    e.url.host = e.base.host;
    e.url.path = e.base.path.slice();
    e.url.opaquePath = e.base.opaquePath;
    e.url.query = e.base.query;
    if (63 === t) {
      e.url.query = "";
      return i;
    } else if (35 === t) {
      e.url.fragment = "";
      return u;
    } else if (null != t) {
      e.url.query = null;
      if (!startsWithWindowsDriveLetter(e.input, e.pointer)) {
        shortenPath(e.url);
      } else {
        e.url.path = [];
      }
      e.pointer--;
      return s;
    } else {
      return 15;
    }
  } else {
    e.pointer--;
    return s;
  }
};

const parseFileSlash = (e, t, r) => {
  if (47 === t || 92 === t) {
    return 17;
  } else {
    if (null !== e.base && "file" === e.base.scheme) {
      if (!startsWithWindowsDriveLetter(e.input, e.pointer) && function isNormalizedWindowsDriveLetterString(e) {
        if (2 === e.length) {
          const t = e.codePointAt(0);
          const r = e.codePointAt(1);
          return (t >= 65 && t <= 90 || t >= 97 && t <= 122) && 58 === r;
        } else {
          return !1;
        }
      }(e.base.path[0])) {
        e.url.path.push(e.base.path[0]);
      }
      e.url.host = e.base.host;
    }
    e.pointer--;
    return s;
  }
};

const parseFileHost = (e, t, r) => {
  if (null == t || 47 === t || 92 === t || 63 === t || 35 === t) {
    e.pointer--;
    if (!e.initialMode && isWindowsDriveLetterString(e.buffer)) {
      return s;
    } else if ("" === e.buffer) {
      e.url.host = "";
      return e.initialMode ? 0 : n;
    } else {
      let t = parseHost(e.buffer, !isSpecial(e.url.scheme));
      if (null === t) {
        return 1;
      }
      if ("localhost" === t) {
        t = "";
      }
      e.url.host = serializeHost(t);
      e.buffer = "";
      return e.initialMode ? 0 : n;
    }
  } else {
    e.buffer += r;
    return 17;
  }
};

const parsePathStart = (e, t, r) => {
  if (isSpecial(e.url.scheme)) {
    if (92 !== t && 47 !== t) {
      e.pointer--;
    }
    return s;
  } else if (!e.initialMode && 63 === t) {
    e.url.query = "";
    return i;
  } else if (!e.initialMode && 35 === t) {
    e.url.fragment = "";
    return u;
  } else if (null != t) {
    if (47 !== t) {
      e.pointer--;
    }
    return s;
  } else if (e.initialMode && null === e.url.host) {
    e.url.path.push("");
    return n;
  } else {
    return n;
  }
};

const parsePath = (e, t, r) => {
  if (null == t || 47 === t || isSpecial(e.url.scheme) && 92 === t || !e.initialMode && (63 === t || 35 === t)) {
    const r = isSpecial(e.url.scheme) && 92 === t;
    if (function isDoubleDot(e) {
      switch (e) {
       case "..":
       case "%2e.":
       case "%2E.":
       case ".%2e":
       case ".%2E":
       case "%2e%2e":
       case "%2E%2e":
       case "%2e%2E":
       case "%2E%2E":
        return !0;

       default:
        return !1;
      }
    }(e.buffer)) {
      shortenPath(e.url);
      if (47 !== t && !r) {
        e.url.path.push("");
      }
    } else if (isSingleDot(e.buffer) && 47 !== t && !r) {
      e.url.path.push("");
    } else if (!isSingleDot(e.buffer)) {
      if ("file" === e.url.scheme && 0 === e.url.path.length && isWindowsDriveLetterString(e.buffer)) {
        e.buffer = `${e.buffer[0]}:`;
      }
      e.url.path.push(e.buffer);
    }
    e.buffer = "";
    if (63 === t) {
      e.url.query = "";
      return i;
    } else if (35 === t) {
      e.url.fragment = "";
      return u;
    } else {
      return s;
    }
  } else {
    e.buffer += utf8PercentEncodeCodePoint(t, isPathPercentEncode);
    return s;
  }
};

const parseOpaquePath = (e, t, r) => {
  if (63 === t) {
    e.url.query = "";
    return i;
  } else if (35 === t) {
    e.url.fragment = "";
    return u;
  } else if (32 === t) {
    const t = e.input[e.pointer + 1];
    if (63 === t || 35 === t) {
      e.url.path[0] += "%20";
    } else {
      e.url.path[0] += " ";
    }
    return 20;
  } else {
    if (null != t) {
      e.url.path[0] += utf8PercentEncodeCodePoint(t, isC0ControlPercentEncode);
    }
    return 20;
  }
};

const parseQuery = (e, t, r) => {
  if (null == t || !e.initialMode && 35 === t) {
    const r = isSpecial(e.url.scheme) ? isSpecialQueryPercentEncode : isQueryPercentEncode;
    e.url.query += utf8PercentEncodeString(e.buffer, r);
    e.buffer = "";
    if (35 === t) {
      e.url.fragment = "";
      return u;
    } else {
      return i;
    }
  } else {
    e.buffer += r;
    return i;
  }
};

const parseFragment = (e, t, r) => {
  if (null != t) {
    e.url.fragment += utf8PercentEncodeCodePoint(t, isFragmentPercentEncode);
  }
  return u;
};

function serializePath(e) {
  if (e.opaquePath) {
    return e.path[0];
  } else {
    let t = "";
    for (const r of e.path) {
      t += `/${r}`;
    }
    return t;
  }
}

function serializeURLOrigin(e) {
  switch (e.scheme) {
   case "blob":
    {
      const t = parseURL(serializePath(e), null, null, 0);
      if (null === t) {
        return "null";
      } else if ("http" !== t.scheme && "https" !== t.scheme) {
        return "null";
      } else {
        return serializeURLOrigin(t);
      }
    }

   case "ftp":
   case "http":
   case "https":
   case "ws":
   case "wss":
    return function serializeOrigin(e) {
      let t = `${e.scheme}://`;
      t += e.host;
      if (null !== e.port) {
        t += `:${e.port}`;
      }
      return t;
    }(e);

   default:
    return "null";
  }
}

const l = Symbol("URLImpl");

class URL {
  constructor(e, t) {
    if (void 0 === e && void 0 === t) {
      throw new TypeError('The "url" argument must be specified.');
    }
    e = toUSVString(e);
    if (null != t) {
      t = toUSVString(t);
    }
    let r = null;
    if (null != t) {
      r = parseURL(t, null, null, 0);
      if (null == r) {
        throw new TypeError(`Invalid base URL: ${t}`);
      }
    }
    const n = parseURL(e, null, r, 0);
    if (null == n) {
      throw new TypeError(`Invalid URL: ${e}`);
    }
    this[l] = {
      url: n,
      query: createSearchParams(this, n.query)
    };
  }
  static createObjectURL(e) {
    throw new TypeError("URL.createObjetURL is unsupported");
  }
  static revokeObjectURL(e) {}
  static parse(e, t) {
    try {
      return new URL(e, t);
    } catch {
      return null;
    }
  }
  static canParse(e, t) {
    let r = null;
    if (null != t) {
      r = parseURL(`${t}`, null, null, 0);
      if (null == r) {
        return !1;
      }
    }
    return null != parseURL(`${e}`, null, r, 0);
  }
  get href() {
    return function serializeURL(e) {
      let t = `${e.scheme}:`;
      if (null !== e.host) {
        t += "//";
        if ("" !== e.username || "" !== e.password) {
          t += e.username;
          if ("" !== e.password) {
            t += `:${e.password}`;
          }
          t += "@";
        }
        t += e.host;
        if (null !== e.port) {
          t += `:${e.port}`;
        }
      }
      if (null === e.host && !e.opaquePath && e.path.length > 1 && "" === e.path[0]) {
        t += "/.";
      }
      t += serializePath(e);
      if (null !== e.query) {
        t += `?${e.query}`;
      }
      if (null !== e.fragment) {
        t += `#${e.fragment}`;
      }
      return t;
    }(this[l].url);
  }
  set href(e) {
    const t = parseURL(e = toUSVString(e), null, null, 0);
    if (null == t) {
      throw new TypeError(`Invalid URL: ${e}`);
    }
    this[l].url = t;
    updateSearchParams(this[l].query, t.query);
  }
  get origin() {
    return serializeURLOrigin(this[l].url);
  }
  get protocol() {
    return `${this[l].url.scheme}:`;
  }
  set protocol(e) {
    parseURL(`${e = toUSVString(e)}:`, this[l].url, null, 2);
  }
  get username() {
    return this[l].url.username;
  }
  set username(e) {
    e = toUSVString(e);
    if (!cannotHaveAUsernamePasswordPort(this[l].url)) {
      !function setURLUsername(e, t) {
        e.username = utf8PercentEncodeString(t, isUserinfoPercentEncode);
      }(this[l].url, e);
    }
  }
  get password() {
    return this[l].url.password;
  }
  set password(e) {
    e = toUSVString(e);
    if (!cannotHaveAUsernamePasswordPort(this[l].url)) {
      !function setURLPassword(e, t) {
        e.password = utf8PercentEncodeString(t, isUserinfoPercentEncode);
      }(this[l].url, e);
    }
  }
  get host() {
    const {url: e} = this[l];
    if (null == e.host) {
      return "";
    } else if (null == e.port) {
      return serializeHost(e.host);
    } else {
      return `${serializeHost(e.host)}:${e.port}`;
    }
  }
  set host(e) {
    e = toUSVString(e);
    if (!this[l].url.opaquePath) {
      parseURL(e, this[l].url, null, 12);
    }
  }
  get hostname() {
    const {url: e} = this[l];
    return null != e.host ? serializeHost(e.host) : "";
  }
  set hostname(e) {
    e = toUSVString(e);
    if (!this[l].url.opaquePath) {
      parseURL(e, this[l].url, null, 13);
    }
  }
  get port() {
    const {url: e} = this[l];
    return null != e.port ? `${e.port}` : "";
  }
  set port(e) {
    e = toUSVString(e);
    const {url: t} = this[l];
    if (!cannotHaveAUsernamePasswordPort(t)) {
      if (!e) {
        t.port = null;
      } else {
        parseURL(e, t, null, 14);
      }
    }
  }
  get pathname() {
    return serializePath(this[l].url);
  }
  set pathname(e) {
    e = toUSVString(e);
    const {url: t} = this[l];
    if (!t.opaquePath) {
      t.path = [];
      parseURL(e, t, null, n);
    }
  }
  get search() {
    const {url: e} = this[l];
    return e.query ? `?${e.query}` : "";
  }
  set search(e) {
    e = toUSVString(e);
    const {url: t, query: r} = this[l];
    if (!e) {
      t.query = null;
      updateSearchParams(r, null);
    } else {
      const n = "?" === e[0] ? e.substring(1) : e;
      t.query = "";
      parseURL(n, t, null, i);
      updateSearchParams(r, t.query);
    }
  }
  get searchParams() {
    return this[l].query;
  }
  get hash() {
    const {url: e} = this[l];
    return e.fragment ? `#${e.fragment}` : "";
  }
  set hash(e) {
    e = toUSVString(e);
    const {url: t} = this[l];
    if (!e) {
      t.fragment = null;
    } else {
      const r = "#" === e[0] ? e.substring(1) : e;
      t.fragment = "";
      parseURL(r, t, null, u);
    }
  }
  toJSON() {
    return this.href;
  }
  toString() {
    return this.href;
  }
}

const o = Symbol("URLSearchParamsImpl");

const c = Symbol.dispose || Symbol.for("dispose");

function createSearchParams(e, t) {
  const r = new URLSearchParams;
  r[o].url = e;
  if (t) {
    r[o].list = parseUrlencoded(utf8Encode(t));
  }
  return r;
}

function updateSearchParams(e, t) {
  if (t) {
    e[o].list = parseUrlencoded(utf8Encode(t));
  } else {
    e[o].list.length = 0;
  }
}

function updateInternalURL(e) {
  if (e.url) {
    const t = serializeUrlencoded(e.list);
    !function updateURLQuery(e, t) {
      e[l].url.query = t;
    }(e.url, t || null);
  }
}

const a = "undefined" != typeof Iterator ? Iterator : Object;

class URLSearchParamsIteratorImpl extends a {
  constructor(e, t) {
    super();
    this[o] = {
      ptr: e,
      map: t,
      index: 0
    };
  }
  next() {
    const e = this[o];
    return e.index < e.ptr.list.length ? {
      value: e.map(e.ptr.list[e.index++]),
      done: !1
    } : {
      value: void 0,
      done: !0
    };
  }
  [Symbol.iterator]() {
    return this;
  }
  [c]() {}
}

class URLSearchParams {
  constructor(e) {
    const t = this[o] = {
      list: [],
      url: null
    };
    let r;
    if (Array.isArray(e)) {
      for (let r = 0; r < e.length; r++) {
        t.list.push(toQueryPair(e[r]));
      }
    } else if (null != (r = toIterator(e))) {
      let e;
      while (!(e = toObject(r.next())).done) {
        t.list.push(toQueryPair(e.value));
      }
    } else if ("object" == typeof e && null != e) {
      const r = Object.keys(e);
      for (let n = 0; n < r.length; n++) {
        const s = toUSVString(e[r[n]]);
        t.list.push([ r[n], s ]);
      }
    } else if (void 0 !== e) {
      let r = toUSVString(e);
      r = "?" === r[0] ? r.substring(1) : r;
      t.list = parseUrlencoded(utf8Encode(r));
    }
  }
  get size() {
    return this[o].list.length;
  }
  append(e, t) {
    this[o].list.push([ toUSVString(e), toUSVString(t) ]);
    updateInternalURL(this[o]);
  }
  delete(e, t) {
    e = toUSVString(e);
    t = null != t ? toUSVString(t) : void 0;
    const {list: r} = this[o];
    let n = 0;
    while (n < r.length) {
      if (r[n][0] === e && (null == t || r[n][1] === t)) {
        r.splice(n, 1);
      } else {
        n++;
      }
    }
    updateInternalURL(this[o]);
  }
  get(e) {
    e = toUSVString(e);
    const {list: t} = this[o];
    for (let r = 0; r < t.length; r++) {
      if (t[r][0] === e) {
        return t[r][1];
      }
    }
    return null;
  }
  getAll(e) {
    e = toUSVString(e);
    const t = [];
    const {list: r} = this[o];
    for (let n = 0; n < r.length; n++) {
      if (r[n][0] === e) {
        t.push(r[n][1]);
      }
    }
    return t;
  }
  has(e, t) {
    e = toUSVString(e);
    t = null != t ? toUSVString(t) : void 0;
    const {list: r} = this[o];
    for (let n = 0; n < r.length; n++) {
      if (r[n][0] === e && (null == t || r[n][1] === t)) {
        return !0;
      }
    }
    return !1;
  }
  set(e, t) {
    e = toUSVString(e);
    t = toUSVString(t);
    const {list: r} = this[o];
    let n = !1;
    let s = 0;
    while (s < r.length) {
      if (r[s][0] === e) {
        if (n) {
          r.splice(s, 1);
        } else {
          n = !0;
          r[s][1] = t;
          s++;
        }
      } else {
        s++;
      }
    }
    if (!n) {
      r.push([ e, t ]);
    }
    updateInternalURL(this[o]);
  }
  sort() {
    this[o].list.sort((e, t) => {
      if (e[0] < t[0]) {
        return -1;
      } else if (e[0] > t[0]) {
        return 1;
      } else {
        return 0;
      }
    });
    updateInternalURL(this[o]);
  }
  forEach(e, t) {
    if ("function" != typeof e) {
      throw new TypeError('The "callback" argument must be of type function');
    }
    const {list: r} = this[o];
    for (let n = 0; n < r.length; n++) {
      e.call(t, r[n][1], r[n][0], this);
    }
  }
  entries() {
    return new URLSearchParamsIteratorImpl(this[o], e => e);
  }
  keys() {
    return new URLSearchParamsIteratorImpl(this[o], e => e[0]);
  }
  values() {
    return new URLSearchParamsIteratorImpl(this[o], e => e[1]);
  }
  toString() {
    return serializeUrlencoded(this[o].list);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

export { URL, URLSearchParams };
//# sourceMappingURL=whatwg-url-minimum.mjs.map
