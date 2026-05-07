Object.defineProperty(exports, "__esModule", {
  value: !0
});

var e = require("node:stream");

var t = require("node:https");

var n = require("node:http");

var o = require("node:url");

var r = require("node:stream/consumers");

var s = require("node:util/types");

var a = require("node:crypto");

var i = require("node:buffer");

var c = require("node:zlib");

var l = require("node:net");

function _interopNamespaceDefault(e) {
  var t = Object.create(null);
  if (e) {
    Object.keys(e).forEach((function(n) {
      if ("default" !== n) {
        var o = Object.getOwnPropertyDescriptor(e, n);
        Object.defineProperty(t, n, o.get ? o : {
          enumerable: !0,
          get: function() {
            return e[n];
          }
        });
      }
    }));
  }
  t.default = e;
  return t;
}

var f = _interopNamespaceDefault(t);

var u = _interopNamespaceDefault(n);

var p = _interopNamespaceDefault(o);

var d = _interopNamespaceDefault(i);

var y = _interopNamespaceDefault(c);

var h = _interopNamespaceDefault(l);

const m = globalThis.File || d.File;

if (void 0 === globalThis.File) {
  globalThis.File = m;
}

const b = Blob;

const g = URLSearchParams;

const w = URL;

exports.Request = void 0;

exports.Response = void 0;

exports.Headers = void 0;

exports.FormData = void 0;

if ("undefined" != typeof Request) {
  exports.Request = Request;
}

if ("undefined" != typeof Response) {
  exports.Response = Response;
}

if ("undefined" != typeof Headers) {
  exports.Headers = Headers;
}

if ("undefined" != typeof FormData) {
  exports.FormData = FormData;
}

const T = "\r\n";

const v = "-".repeat(2);

const isReadable = t => e.Readable.isReadable(t);

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
  let o = `${v}${e}${T}`;
  o += `Content-Disposition: form-data; name="${t}"`;
  if (isBlob(n)) {
    o += `; filename="${n.name ?? "blob"}"${T}`;
    o += `Content-Type: ${n.type || "application/octet-stream"}`;
  }
  return `${o}${T}${T}`;
};

const getFormFooter = e => `${v}${e}${v}${T}${T}`;

const _ = new TextEncoder;

const extractBody = t => {
  let n = null;
  let o;
  let r = null;
  if (null == t) {
    o = null;
    r = 0;
  } else if ("string" == typeof t) {
    const e = _.encode(`${t}`);
    n = "text/plain;charset=UTF-8";
    r = e.byteLength;
    o = e;
  } else if ((e => "object" == typeof e && "function" == typeof e.append && "function" == typeof e.delete && "function" == typeof e.get && "function" == typeof e.getAll && "function" == typeof e.has && "function" == typeof e.set && "function" == typeof e.sort && "URLSearchParams" === e[Symbol.toStringTag])(t)) {
    const e = _.encode(t.toString());
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
  } else if (s.isAnyArrayBuffer(t)) {
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
    const s = `formdata-${a.randomBytes(8).toString("hex")}`;
    n = `multipart/form-data; boundary=${s}`;
    r = ((e, t) => {
      let n = Buffer.byteLength(getFormFooter(t));
      for (const [o, r] of e) {
        n += Buffer.byteLength(getFormHeader(t, o, r)) + (isBlob(r) ? r.size : Buffer.byteLength(`${r}`)) + 2;
      }
      return n;
    })(t, s);
    o = e.Readable.from(async function* generatorOfFormData(e, t) {
      const n = new TextEncoder;
      for (const [o, r] of e) {
        if (isBlob(r)) {
          yield n.encode(getFormHeader(t, o, r));
          yield* r.stream();
          yield n.encode(T);
        } else {
          yield n.encode(getFormHeader(t, o, r) + r + T);
        }
      }
      yield n.encode(getFormFooter(t));
    }(t, s));
  } else if ((t => "function" == typeof t.getBoundary && "function" == typeof t.hasKnownLength && "function" == typeof t.getLengthSync && e.Readable.isReadable(t))(t)) {
    n = `multipart/form-data; boundary=${t.getBoundary()}`;
    r = t.hasKnownLength() ? t.getLengthSync() : null;
    o = t;
  } else if (isReadable(t)) {
    o = t;
  } else if ((e => "function" == typeof e[Symbol.asyncIterator] || "function" == typeof e[Symbol.iterator])(t)) {
    o = e.Readable.from(t);
  } else {
    const e = _.encode(`${t}`);
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

const x = Symbol("kBodyInternals");

class InflateStream extends e.Transform {
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

const L = {
  keepAlive: !0,
  keepAliveMsecs: 1e3
};

let R;

let A;

let P;

let E;

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

class HttpProxyAgent extends u.Agent {
  constructor(e, t) {
    super(t);
    this._proxy = e;
    this._keepAlive = !!t.keepAlive;
  }
  createConnection(e, t) {
    const n = ("http:" === this._proxy.protocol ? u : f).request(createRequestOptions(this._proxy, this._keepAlive, e));
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

class HttpsProxyAgent extends f.Agent {
  constructor(e, t) {
    super(t);
    this._proxy = e;
    this._keepAlive = !!t.keepAlive;
  }
  createConnection(e, t) {
    const n = ("http:" === this._proxy.protocol ? u : f).request(createRequestOptions(this._proxy, this._keepAlive, e));
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
  const t = new exports.Headers;
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
    return p.urlToHttpOptions(t);

   default:
    throw new TypeError(`URL scheme "${t.protocol}" is not supported.`);
  }
};

async function _fetch(t, n) {
  const o = (e => null != e && "object" == typeof e && "body" in e)(t);
  const r = o ? t.url : t;
  const s = n?.body ?? (o ? t.body : null);
  const a = n?.signal ?? (o ? t.signal : void 0);
  const i = (e => {
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
  })(n?.redirect ?? (o ? t.redirect : void 0));
  let c = new w(r);
  let l = extractBody(s);
  let p = 0;
  let d = n?.headers ?? (o ? t.headers : void 0);
  const h = {
    ...urlToHttpOptions(c),
    timeout: n?.connectTimeout ?? 3e4,
    method: methodToHttpOption(o ? t.method : n?.method),
    signal: a
  };
  return await new Promise((function _call(t, n) {
    h.agent = "https:" === h.protocol ? (e => {
      const t = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? getHttpProxyUrl();
      if (!t) {
        E = void 0;
        return;
      } else if (matchesNoProxy(e)) {
        return;
      } else if (!P || P !== t) {
        E = void 0;
        try {
          P = t;
          E = new HttpsProxyAgent(new URL(t), L);
        } catch (e) {
          const n = new Error(`Invalid HTTPS_PROXY URL: "${t}".\n` + e?.message || e);
          n.cause = e;
          throw n;
        }
        return E;
      } else {
        return E;
      }
    })(h) : (e => {
      const t = getHttpProxyUrl();
      if (!t) {
        A = void 0;
        return;
      } else if (matchesNoProxy(e)) {
        return;
      } else if (!R || R !== t) {
        A = void 0;
        try {
          R = t;
          A = new HttpProxyAgent(new URL(t), L);
        } catch (e) {
          const n = new Error(`Invalid HTTP_PROXY URL: "${t}".\n` + e?.message || e);
          n.cause = e;
          throw n;
        }
        return A;
      } else {
        return A;
      }
    })(h);
    const o = h.method;
    const r = ("https:" === h.protocol ? f : u).request(h);
    let m;
    const destroy = e => {
      if (e) {
        r?.destroy(a?.aborted ? a.reason : e);
        m?.destroy(a?.aborted ? a.reason : e);
        n(a?.aborted ? a.reason : e);
      }
      a?.removeEventListener("abort", destroy);
    };
    a?.addEventListener("abort", destroy);
    r.on("timeout", (() => {
      if (!m) {
        const e = new Error("Request timed out");
        e.code = "ETIMEDOUT";
        destroy(e);
      }
    }));
    r.on("response", (f => {
      if (a?.aborted) {
        return;
      }
      m = f;
      m.setTimeout(0);
      m.socket.unref();
      m.on("error", destroy);
      const u = {
        status: m.statusCode,
        statusText: m.statusMessage,
        headers: headersOfRawHeaders(m.rawHeaders)
      };
      if (301 === (b = u.status) || 302 === b || 303 === b || 307 === b || 308 === b) {
        const e = u.headers.get("Location");
        const r = null != e ? ((e, t) => {
          try {
            return new w(e, t);
          } catch {
            return null;
          }
        })(e, c) : null;
        if ("error" === i) {
          n(new Error("URI requested responds with a redirect, redirect mode is set to error"));
          return;
        } else if ("manual" === i && e) {
          u.headers.set("Location", r?.href ?? e);
        } else if ("follow" === i) {
          if (null === r) {
            n(new Error("URI requested responds with an invalid redirect URL"));
            return;
          } else if (++p > 20) {
            n(new Error(`maximum redirect reached at: ${c}`));
            return;
          } else if ("http:" !== r.protocol && "https:" !== r.protocol) {
            n(new Error("URL scheme must be a HTTP(S) scheme"));
            return;
          }
          if (303 === u.status || (301 === u.status || 302 === u.status) && "POST" === o) {
            l = extractBody(null);
            h.method = "GET";
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
            })(d);
          } else if (null != l.body && null == l.contentLength) {
            n(new Error("Cannot follow redirect with a streamed body"));
            return;
          } else {
            l = extractBody(s);
          }
          Object.assign(h, urlToHttpOptions(c = r));
          return _call(t, n);
        }
      }
      var b;
      let g = m;
      const T = u.headers.get("Content-Encoding")?.toLowerCase();
      if ("HEAD" === o || 204 === u.status || 304 === u.status) {
        g = null;
      } else if (null != T) {
        u.headers.set("Content-Encoding", T);
        g = e.pipeline(g, (t => {
          switch (t) {
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
            return new e.PassThrough;
          }
        })(T), destroy);
        r.on("error", destroy);
      }
      if (null != g) {
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
        }(g, m.socket);
      }
      t(function createResponse(e, t, n) {
        const o = new exports.Response(e, t);
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
      }(g, u, {
        type: "default",
        url: c.toString(),
        redirected: p > 0
      }));
    }));
    r.on("error", destroy);
    if (d) {
      d = ((e, t) => {
        let n;
        if (!Array.isArray(t) && !(o = t, null != o && "object" == typeof o && ("append" in o && "function" == typeof o.append || o instanceof exports.Headers))) {
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
      })(r, d);
    }
    if (!r.hasHeader("Accept")) {
      r.setHeader("Accept", "*/*");
    }
    if (!r.hasHeader("Content-Type") && l.contentType) {
      r.setHeader("Content-Type", l.contentType);
    }
    if (null == l.body && ("POST" === o || "PUT" === o || "PATCH" === o)) {
      r.setHeader("Content-Length", "0");
    } else if (null != l.body && null != l.contentLength) {
      r.setHeader("Content-Length", `${l.contentLength}`);
    }
    if (null == l.body) {
      r.end();
    } else if (l.body instanceof Uint8Array) {
      r.write(l.body);
      r.end();
    } else {
      const t = l.body instanceof e.Stream ? l.body : e.Readable.fromWeb(l.body);
      e.pipeline(t, r, destroy);
    }
  }));
}

exports.Blob = b;

exports.Body = class Body {
  constructor(e) {
    this[x] = extractBody(e);
  }
  get body() {
    return this[x].body;
  }
  get bodyUsed() {
    const {body: t} = this[x];
    if (isReadable(t)) {
      return e.Readable.isDisturbed(t);
    } else if (isReadableStream(t)) {
      return t.locked;
    } else {
      return !1;
    }
  }
  async arrayBuffer() {
    const {body: e} = this[x];
    return null != e && !s.isAnyArrayBuffer(e) ? r.arrayBuffer(e) : e;
  }
  async formData() {
    const {body: e, contentLength: t, contentType: n} = this[x];
    const o = {};
    if (t) {
      o["Content-Length"] = t;
    }
    if (n) {
      o["Content-Type"] = n;
    }
    return new exports.Response(e, {
      headers: o
    }).formData();
  }
  async blob() {
    const {body: e, contentType: t} = this[x];
    const n = null !== e ? [ !s.isAnyArrayBuffer(e) ? await r.blob(e) : e ] : [];
    return new b(n, {
      type: t ?? void 0
    });
  }
  async json() {
    return JSON.parse(await this.text());
  }
  async text() {
    const {body: e} = this[x];
    return null == e || s.isAnyArrayBuffer(e) ? (new TextDecoder).decode(await this.arrayBuffer()) : r.text(e);
  }
};

exports.File = m;

exports.URL = w;

exports.URLSearchParams = g;

exports.default = _fetch;

exports.fetch = _fetch;
//# sourceMappingURL=minifetch.js.map
