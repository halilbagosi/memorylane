import { Readable as e, PassThrough as t, Transform as n, pipeline as o, Stream as r } from "node:stream";

import * as s from "node:https";

import * as i from "node:http";

import * as a from "node:url";

import { arrayBuffer as c, blob as l, text as f } from "node:stream/consumers";

import { isAnyArrayBuffer as u } from "node:util/types";

import { randomBytes as d } from "node:crypto";

import * as p from "node:buffer";

import * as y from "node:zlib";

import * as h from "node:net";

const m = globalThis.File || p.File;

if (void 0 === globalThis.File) {
  globalThis.File = m;
}

const g = Blob;

const b = URLSearchParams;

const w = URL;

let T;

let L;

let _;

let v;

if ("undefined" != typeof Request) {
  T = Request;
}

if ("undefined" != typeof Response) {
  L = Response;
}

if ("undefined" != typeof Headers) {
  _ = Headers;
}

if ("undefined" != typeof FormData) {
  v = FormData;
}

const R = "\r\n";

const A = "-".repeat(2);

const isReadable = t => e.isReadable(t);

const isReadableStream = e => "object" == typeof e && "function" == typeof e.getReader && "function" == typeof e.cancel && "function" == typeof e.tee;

const isBlob = e => {
  if ("object" == typeof e && "function" == typeof e.arrayBuffer && "string" == typeof e.type && "function" == typeof e.stream && "function" == typeof e.constructor) {
    const t = e[Symbol.toStringTag];
    return !!t && (t.startsWith("Blob") || t.startsWith("File"));
  } else {
    return !1;
  }
};

const getFormHeader = (e, t, n) => {
  let o = `${A}${e}${R}`;
  o += `Content-Disposition: form-data; name="${t}"`;
  if (isBlob(n)) {
    o += `; filename="${n.name ?? "blob"}"${R}`;
    o += `Content-Type: ${n.type || "application/octet-stream"}`;
  }
  return `${o}${R}${R}`;
};

const getFormFooter = e => `${A}${e}${A}${R}${R}`;

const E = new TextEncoder;

const extractBody = t => {
  let n = null;
  let o;
  let r = null;
  if (null == t) {
    o = null;
    r = 0;
  } else if ("string" == typeof t) {
    const e = E.encode(`${t}`);
    n = "text/plain;charset=UTF-8";
    r = e.byteLength;
    o = e;
  } else if ((e => "object" == typeof e && "function" == typeof e.append && "function" == typeof e.delete && "function" == typeof e.get && "function" == typeof e.getAll && "function" == typeof e.has && "function" == typeof e.set && "function" == typeof e.sort && "URLSearchParams" === e[Symbol.toStringTag])(t)) {
    const e = E.encode(t.toString());
    o = e;
    r = e.byteLength;
    n = "application/x-www-form-urlencoded;charset=UTF-8";
  } else if (isBlob(t)) {
    r = t.size;
    n = t.type || null;
    o = t.stream();
  } else if (t instanceof Uint8Array) {
    o = t;
    r = t.byteLength;
  } else if (u(t)) {
    const e = new Uint8Array(t);
    o = e;
    r = e.byteLength;
  } else if (ArrayBuffer.isView(t)) {
    const e = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
    o = e;
    r = e.byteLength;
  } else if (isReadableStream(t)) {
    o = t;
  } else if ((e => "object" == typeof e && "function" == typeof e.append && "function" == typeof e.set && "function" == typeof e.get && "function" == typeof e.getAll && "function" == typeof e.delete && "function" == typeof e.keys && "function" == typeof e.values && "function" == typeof e.entries && "function" == typeof e.constructor && "FormData" === e[Symbol.toStringTag])(t)) {
    const s = `formdata-${d(8).toString("hex")}`;
    n = `multipart/form-data; boundary=${s}`;
    r = ((e, t) => {
      let n = Buffer.byteLength(getFormFooter(t));
      for (const [o, r] of e) {
        n += Buffer.byteLength(getFormHeader(t, o, r)) + (isBlob(r) ? r.size : Buffer.byteLength(`${r}`)) + 2;
      }
      return n;
    })(t, s);
    o = e.from(async function* generatorOfFormData(e, t) {
      const n = new TextEncoder;
      for (const [o, r] of e) {
        if (isBlob(r)) {
          yield n.encode(getFormHeader(t, o, r));
          yield* r.stream();
          yield n.encode(R);
        } else {
          yield n.encode(getFormHeader(t, o, r) + r + R);
        }
      }
      yield n.encode(getFormFooter(t));
    }(t, s));
  } else if ((t => "function" == typeof t.getBoundary && "function" == typeof t.hasKnownLength && "function" == typeof t.getLengthSync && e.isReadable(t))(t)) {
    n = `multipart/form-data; boundary=${t.getBoundary()}`;
    r = t.hasKnownLength() ? t.getLengthSync() : null;
    o = t;
  } else if (isReadable(t)) {
    o = t;
  } else if ((e => "function" == typeof e[Symbol.asyncIterator] || "function" == typeof e[Symbol.iterator])(t)) {
    o = e.from(t);
  } else {
    const e = E.encode(`${t}`);
    n = "text/plain;charset=UTF-8";
    o = e;
    r = e.byteLength;
  }
  return {
    contentLength: r,
    contentType: n,
    body: o
  };
};

const $ = Symbol("kBodyInternals");

class Body {
  constructor(e) {
    this[$] = extractBody(e);
  }
  get body() {
    return this[$].body;
  }
  get bodyUsed() {
    const {body: t} = this[$];
    if (isReadable(t)) {
      return e.isDisturbed(t);
    } else if (isReadableStream(t)) {
      return t.locked;
    } else {
      return !1;
    }
  }
  async arrayBuffer() {
    const {body: e} = this[$];
    return null != e && !u(e) ? c(e) : e;
  }
  async formData() {
    const {body: e, contentLength: t, contentType: n} = this[$];
    const o = {};
    if (t) {
      o["Content-Length"] = t;
    }
    if (n) {
      o["Content-Type"] = n;
    }
    return new L(e, {
      headers: o
    }).formData();
  }
  async blob() {
    const {body: e, contentType: t} = this[$];
    const n = null !== e ? [ !u(e) ? await l(e) : e ] : [];
    return new g(n, {
      type: t ?? void 0
    });
  }
  async json() {
    return JSON.parse(await this.text());
  }
  async text() {
    const {body: e} = this[$];
    return null == e || u(e) ? (new TextDecoder).decode(await this.arrayBuffer()) : f(e);
  }
}

class InflateStream extends n {
  constructor(e) {
    super();
    this._opts = e;
  }
  _transform(e, t, n) {
    if (!this._inflate) {
      if (0 === e.length) {
        n();
        return;
      }
      this._inflate = 8 == (15 & e[0]) ? y.createInflate(this._opts) : y.createInflateRaw(this._opts);
      this._inflate.on("data", this.push.bind(this));
      this._inflate.on("end", (() => this.push(null)));
      this._inflate.on("error", (e => this.destroy(e)));
    }
    this._inflate.write(e, t, n);
  }
  _final(e) {
    if (this._inflate) {
      this._inflate.once("finish", e);
      this._inflate.end();
      this._inflate = void 0;
    } else {
      e();
    }
  }
}

const getHttpProxyUrl = () => process.env.HTTP_PROXY ?? process.env.http_proxy;

const createProxyPattern = e => {
  if (!(e = e.trim()).startsWith(".")) {
    e = `^${e}`;
  }
  if (!e.endsWith(".") || e.includes(":")) {
    e += "$";
  }
  return (e = e.replace(/\./g, "\\.").replace(/\*/g, "[\\w.]+")) ? new RegExp(e, "i") : null;
};

const matchesNoProxy = e => {
  const t = process.env.NO_PROXY ?? process.env.no_proxy;
  if ("*" === t || "1" === t || "true" === t) {
    return !0;
  } else if (t) {
    for (const n of t.split(",")) {
      const t = createProxyPattern(n);
      if (t) {
        const n = e.hostname || e.host;
        const o = n && `${n}:${e.port || e.defaultPort || 80}`;
        if (n && t.test(n) || o && t.test(o)) {
          return !0;
        }
      }
    }
    return !1;
  } else {
    return !1;
  }
};

const P = {
  keepAlive: !0,
  keepAliveMsecs: 1e3
};

let x;

let S;

let C;

let H;

const createRequestOptions = (e, t, n) => {
  const o = {
    host: `${n.host}:${n.port}`,
    connection: t ? "keep-alive" : "close"
  };
  if (e.username || e.password) {
    const t = decodeURIComponent(e.username || "");
    const n = decodeURIComponent(e.password || "");
    const r = Buffer.from(`${t}:${n}`).toString("base64");
    o["proxy-authorization"] = `Basic ${r}`;
  }
  return {
    method: "CONNECT",
    host: e.hostname,
    port: e.port,
    path: `${n.host}:${n.port}`,
    setHost: !1,
    agent: !1,
    proxyEnv: {},
    timeout: 5e3,
    headers: o,
    servername: "https:" === e.protocol ? e.hostname : void 0
  };
};

class HttpProxyAgent extends i.Agent {
  constructor(e, t) {
    super(t);
    this._proxy = e;
    this._keepAlive = !!t.keepAlive;
  }
  createConnection(e, t) {
    const n = ("http:" === this._proxy.protocol ? i : s).request(createRequestOptions(this._proxy, this._keepAlive, e));
    n.once("connect", ((e, o, r) => {
      n.removeAllListeners();
      o.removeAllListeners();
      if (200 === e.statusCode) {
        t(null, o);
      } else {
        o.destroy();
        t(new Error(`HTTP Proxy Network Error: ${e.statusMessage || e.statusCode}`), null);
      }
    }));
    n.once("timeout", (() => {
      n.destroy(new Error("HTTP Proxy timed out"));
    }));
    n.once("error", (e => {
      n.removeAllListeners();
      t(e, null);
    }));
    n.end();
  }
}

class HttpsProxyAgent extends s.Agent {
  constructor(e, t) {
    super(t);
    this._proxy = e;
    this._keepAlive = !!t.keepAlive;
  }
  createConnection(e, t) {
    const n = ("http:" === this._proxy.protocol ? i : s).request(createRequestOptions(this._proxy, this._keepAlive, e));
    n.once("connect", ((o, r, s) => {
      n.removeAllListeners();
      r.removeAllListeners();
      if (200 === o.statusCode) {
        const n = {
          ...e,
          socket: r
        };
        h._normalizeArgs(n);
        const o = super.createConnection(n);
        t?.(null, o);
      } else {
        r.destroy();
        t?.(new Error(`HTTP Proxy Network Error: ${o.statusMessage || o.statusCode}`), null);
      }
    }));
    n.once("timeout", (() => {
      n.destroy(new Error("HTTP Proxy timed out"));
    }));
    n.once("error", (e => {
      n.removeAllListeners();
      t?.(e, null);
    }));
    n.end();
    return n.socket;
  }
}

const headersOfRawHeaders = e => {
  const t = new _;
  for (let n = 0; n < e.length; n += 2) {
    t.append(e[n], e[n + 1]);
  }
  return t;
};

const methodToHttpOption = e => {
  const t = e?.toUpperCase();
  switch (t) {
   case "CONNECT":
   case "TRACE":
   case "TRACK":
    throw new TypeError(`Failed to construct 'Request': '${e}' HTTP method is unsupported.`);

   case "DELETE":
   case "GET":
   case "HEAD":
   case "OPTIONS":
   case "POST":
   case "PUT":
    return t;

   default:
    return e ?? "GET";
  }
};

const urlToHttpOptions = e => {
  const t = new w(e);
  switch (t.protocol) {
   case "http:":
   case "https:":
    return a.urlToHttpOptions(t);

   default:
    throw new TypeError(`URL scheme "${t.protocol}" is not supported.`);
  }
};

async function _fetch(n, a) {
  const c = (e => null != e && "object" == typeof e && "body" in e)(n);
  const l = c ? n.url : n;
  const f = a?.body ?? (c ? n.body : null);
  const u = a?.signal ?? (c ? n.signal : void 0);
  const d = (e => {
    switch (e) {
     case "follow":
     case "manual":
     case "error":
      return e;

     case void 0:
      return "follow";

     default:
      throw new TypeError(`Request constructor: ${e} is not an accepted type. Expected one of follow, manual, error.`);
    }
  })(a?.redirect ?? (c ? n.redirect : void 0));
  let p = new w(l);
  let h = extractBody(f);
  let m = 0;
  let g = a?.headers ?? (c ? n.headers : void 0);
  const b = {
    ...urlToHttpOptions(p),
    timeout: a?.connectTimeout ?? 3e4,
    method: methodToHttpOption(c ? n.method : a?.method),
    signal: u
  };
  return await new Promise((function _call(n, a) {
    b.agent = "https:" === b.protocol ? (e => {
      const t = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? getHttpProxyUrl();
      if (!t) {
        H = void 0;
        return;
      } else if (matchesNoProxy(e)) {
        return;
      } else if (!C || C !== t) {
        H = void 0;
        try {
          C = t;
          H = new HttpsProxyAgent(new URL(t), P);
        } catch (e) {
          const n = new Error(`Invalid HTTPS_PROXY URL: "${t}".\n` + e?.message || e);
          n.cause = e;
          throw n;
        }
        return H;
      } else {
        return H;
      }
    })(b) : (e => {
      const t = getHttpProxyUrl();
      if (!t) {
        S = void 0;
        return;
      } else if (matchesNoProxy(e)) {
        return;
      } else if (!x || x !== t) {
        S = void 0;
        try {
          x = t;
          S = new HttpProxyAgent(new URL(t), P);
        } catch (e) {
          const n = new Error(`Invalid HTTP_PROXY URL: "${t}".\n` + e?.message || e);
          n.cause = e;
          throw n;
        }
        return S;
      } else {
        return S;
      }
    })(b);
    const c = b.method;
    const l = ("https:" === b.protocol ? s : i).request(b);
    let T;
    const destroy = e => {
      if (e) {
        l?.destroy(u?.aborted ? u.reason : e);
        T?.destroy(u?.aborted ? u.reason : e);
        a(u?.aborted ? u.reason : e);
      }
      u?.removeEventListener("abort", destroy);
    };
    u?.addEventListener("abort", destroy);
    l.on("timeout", (() => {
      if (!T) {
        const e = new Error("Request timed out");
        e.code = "ETIMEDOUT";
        destroy(e);
      }
    }));
    l.on("response", (e => {
      if (u?.aborted) {
        return;
      }
      T = e;
      T.setTimeout(0);
      T.socket.unref();
      T.on("error", destroy);
      const r = {
        status: T.statusCode,
        statusText: T.statusMessage,
        headers: headersOfRawHeaders(T.rawHeaders)
      };
      if (301 === (s = r.status) || 302 === s || 303 === s || 307 === s || 308 === s) {
        const e = r.headers.get("Location");
        const t = null != e ? ((e, t) => {
          try {
            return new w(e, t);
          } catch {
            return null;
          }
        })(e, p) : null;
        if ("error" === d) {
          a(new Error("URI requested responds with a redirect, redirect mode is set to error"));
          return;
        } else if ("manual" === d && e) {
          r.headers.set("Location", t?.href ?? e);
        } else if ("follow" === d) {
          if (null === t) {
            a(new Error("URI requested responds with an invalid redirect URL"));
            return;
          } else if (++m > 20) {
            a(new Error(`maximum redirect reached at: ${p}`));
            return;
          } else if ("http:" !== t.protocol && "https:" !== t.protocol) {
            a(new Error("URL scheme must be a HTTP(S) scheme"));
            return;
          }
          if (303 === r.status || (301 === r.status || 302 === r.status) && "POST" === c) {
            h = extractBody(null);
            b.method = "GET";
            (e => {
              if (e) {
                for (const t in e) {
                  switch (t.toLowerCase()) {
                   case "content-length":
                   case "content-type":
                    delete e[t];
                  }
                }
              }
            })(g);
          } else if (null != h.body && null == h.contentLength) {
            a(new Error("Cannot follow redirect with a streamed body"));
            return;
          } else {
            h = extractBody(f);
          }
          Object.assign(b, urlToHttpOptions(p = t));
          return _call(n, a);
        }
      }
      var s;
      let i = T;
      const _ = r.headers.get("Content-Encoding")?.toLowerCase();
      if ("HEAD" === c || 204 === r.status || 304 === r.status) {
        i = null;
      } else if (null != _) {
        r.headers.set("Content-Encoding", _);
        i = o(i, (e => {
          switch (e) {
           case "br":
            return y.createBrotliDecompress({
              flush: y.constants.BROTLI_OPERATION_FLUSH,
              finishFlush: y.constants.BROTLI_OPERATION_FLUSH
            });

           case "gzip":
           case "x-gzip":
            return y.createGunzip({
              flush: y.constants.Z_SYNC_FLUSH,
              finishFlush: y.constants.Z_SYNC_FLUSH
            });

           case "deflate":
           case "x-deflate":
            return new InflateStream({
              flush: y.constants.Z_SYNC_FLUSH,
              finishFlush: y.constants.Z_SYNC_FLUSH
            });

           default:
            return new t;
          }
        })(_), destroy);
        l.on("error", destroy);
      }
      if (null != i) {
        !function attachRefLifetime(e, t) {
          const {_read: n} = e;
          e.on("close", (() => {
            t.unref();
          }));
          e._read = function _readRef(...o) {
            e._read = n;
            t.ref();
            return n.apply(this, o);
          };
        }(i, T.socket);
      }
      n(function createResponse(e, t, n) {
        const o = new L(e, t);
        Object.defineProperty(o, "url", {
          value: n.url
        });
        if ("default" !== n.type) {
          Object.defineProperty(o, "type", {
            value: n.type
          });
        }
        if (n.redirected) {
          Object.defineProperty(o, "redirected", {
            value: n.redirected
          });
        }
        return o;
      }(i, r, {
        type: "default",
        url: p.toString(),
        redirected: m > 0
      }));
    }));
    l.on("error", destroy);
    if (g) {
      g = ((e, t) => {
        let n;
        if (!Array.isArray(t) && !(o = t, null != o && "object" == typeof o && ("append" in o && "function" == typeof o.append || o instanceof _))) {
          n = t;
        } else {
          n = Object.create(null);
          const e = new Map;
          for (const [o, r] of t) {
            const t = o.toLowerCase();
            let s = e.get(t) ?? o;
            if (!e.has(t)) {
              e.set(t, o);
            }
            if (Array.isArray(n[s])) {
              n[s].push(r);
            } else if (null != n[s]) {
              n[s] = [ n[s], r ];
            } else {
              n[s] = r;
            }
          }
        }
        var o;
        for (const t in n) {
          e.setHeader(t, n[t]);
        }
        return n;
      })(l, g);
    }
    if (!l.hasHeader("Accept")) {
      l.setHeader("Accept", "*/*");
    }
    if (!l.hasHeader("Content-Type") && h.contentType) {
      l.setHeader("Content-Type", h.contentType);
    }
    if (null == h.body && ("POST" === c || "PUT" === c || "PATCH" === c)) {
      l.setHeader("Content-Length", "0");
    } else if (null != h.body && null != h.contentLength) {
      l.setHeader("Content-Length", `${h.contentLength}`);
    }
    if (null == h.body) {
      l.end();
    } else if (h.body instanceof Uint8Array) {
      l.write(h.body);
      l.end();
    } else {
      const t = h.body instanceof r ? h.body : e.fromWeb(h.body);
      o(t, l, destroy);
    }
  }));
}

export { g as Blob, Body, m as File, v as FormData, _ as Headers, T as Request, L as Response, w as URL, b as URLSearchParams, _fetch as default, _fetch as fetch };
//# sourceMappingURL=minifetch.mjs.map
