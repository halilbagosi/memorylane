"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    LogStream: function() {
        return LogStream;
    },
    writeEvent: function() {
        return writeEvent;
    }
});
function _nodebuffer() {
    const data = require("node:buffer");
    _nodebuffer = function() {
        return data;
    };
    return data;
}
function _nodeevents() {
    const data = require("node:events");
    _nodeevents = function() {
        return data;
    };
    return data;
}
function _nodefs() {
    const data = /*#__PURE__*/ _interop_require_default(require("node:fs"));
    _nodefs = function() {
        return data;
    };
    return data;
}
function _nodepath() {
    const data = /*#__PURE__*/ _interop_require_default(require("node:path"));
    _nodepath = function() {
        return data;
    };
    return data;
}
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const BUSY_WRITE_TIMEOUT = 100;
const HIGH_WATER_MARK = 16387; /*16KB*/ 
function writeEvent(dest, category, kind, payload) {
    const timestamp = Date.now();
    const rest = JSON.stringify(payload).slice(1);
    const line = rest.length > 1 ? `{"_e":"${category}:${kind}","_t":${timestamp},${rest}\n` : `{"_e":"${category}:${kind}","_t":${timestamp}}\n`;
    dest._writeln(line);
}
class LogStream extends _nodeevents().EventEmitter {
    #fd;
    #file;
    #writing;
    #ending;
    #flushPending;
    #destroyed;
    #opening;
    #output;
    #len;
    #lines;
    #head;
    #partialLine;
    #onRelease;
    constructor(dest){
        super(), this.#fd = -1, this.#file = null, this.#writing = false, this.#ending = false, this.#flushPending = false, this.#destroyed = false, this.#opening = false, this.#output = '', this.#len = 0, this.#lines = [], this.#head = 0, this.#partialLine = 0, this.#onRelease = (err, written)=>this.#release(err, written);
        if (typeof dest === 'number') {
            _nodefs().default.fsyncSync(dest);
            this.#fd = dest;
            process.nextTick(()=>this.emit('ready'));
        } else if (typeof dest === 'string') {
            this.#openFile(dest);
        }
    }
    get file() {
        return this.#file;
    }
    get fd() {
        return this.#fd;
    }
    get writing() {
        return this.#writing;
    }
    get writable() {
        return !this.#destroyed && !this.#ending;
    }
    #release(error, written) {
        if (error) {
            if (error.code === 'EAGAIN' || error.code === 'EBUSY') {
                setTimeout(()=>this.#writeLine(), BUSY_WRITE_TIMEOUT);
            } else {
                this.#writing = false;
                this.emit('error', error);
            }
        } else {
            this.emit('write', written);
            if (written === this.#output.length) {
                // Fast path: complete write (exact for ASCII, the common case for JSONL)
                this.#len -= this.#output.length;
                this.#output = '';
                if (this.#lines.length - this.#head > this.#partialLine) {
                    this.#writeLine();
                } else if (this.#ending) {
                    this.#writing = false;
                    this.#close();
                } else {
                    this.#writing = false;
                    if (this.#flushPending) {
                        this.emit('drain');
                    }
                }
            } else {
                // Multi-byte complete write (written > length) or partial write (written < length)
                const outputLength = _nodebuffer().Buffer.byteLength(this.#output);
                if (outputLength > written) {
                    const output = _nodebuffer().Buffer.from(this.#output).toString('utf8', written);
                    this.#len -= this.#output.length - output.length;
                    this.#output = output;
                } else {
                    this.#len -= this.#output.length;
                    this.#output = '';
                }
                if (this.#output || this.#lines.length - this.#head > this.#partialLine) {
                    this.#writeLine();
                } else if (this.#ending) {
                    this.#writing = false;
                    this.#close();
                } else {
                    this.#writing = false;
                    if (this.#flushPending) {
                        this.emit('drain');
                    }
                }
            }
        }
    }
    #openFile(file) {
        this.#opening = true;
        this.#writing = true;
        const onOpened = (error, fd)=>{
            if (error) {
                this.#writing = false;
                this.#opening = false;
                this.emit('error', error);
            } else {
                this.#fd = fd;
                this.#file = file;
                this.#opening = false;
                this.#writing = false;
                this.emit('ready');
                if (this.#destroyed) {
                // do nothing when we're already closing the file
                } else if (!this.writing && this.#lines.length - this.#head > this.#partialLine || this.#flushPending) {
                    this.#writeLine();
                }
            }
        };
        _nodefs().default.mkdir(_nodepath().default.dirname(file), {
            recursive: true
        }, (err)=>{
            if (err) return onOpened(err);
            _nodefs().default.open(file, 'a', 438, onOpened);
        });
    }
    #close() {
        if (this.#fd === -1) {
            this.once('ready', ()=>this.#close());
            return;
        }
        this.#destroyed = true;
        this.#partialLine = 0;
        this.#lines.length = 0;
        this.#head = 0;
        const onClose = (error)=>{
            if (error) {
                this.emit('error', error);
                this.emit('close', error);
            } else {
                if (this.#ending && !this.#writing) this.emit('finish');
                this.emit('close');
            }
        };
        fsFsync(this.#fd, (error)=>{
            if (!error && !isStdFd(this.#fd)) {
                _nodefs().default.close(this.#fd, onClose);
            } else {
                onClose(); // Error intentionally ignored, assume closed
            }
        });
    }
    #writeLine() {
        this.#writing = true;
        if (!this.#output) {
            const end = this.#lines.length - this.#partialLine;
            if (end > this.#head) {
                this.#output = this.#lines[this.#head++] || '';
                // Batch multiple lines into one write call below HWM, to avoid
                // excessive syscalls after when lines accumulated during a previous write
                while(this.#head < end && this.#output.length < HIGH_WATER_MARK){
                    this.#output += this.#lines[this.#head++];
                }
                if (this.#head === this.#lines.length) {
                    this.#lines.length = 0;
                    this.#head = 0;
                }
            }
        }
        _nodefs().default.write(this.#fd, this.#output, this.#onRelease);
    }
    _end() {
        if (!this.#destroyed && !this.#ending) {
            this.#ending = true;
            if (this.#opening) {
                this.once('ready', ()=>this._end());
            } else if (!this.#writing && this.#fd >= 0) {
                if (this.#lines.length - this.#head > this.#partialLine) {
                    this.#writeLine();
                } else {
                    this.#close();
                }
            }
        }
        return this;
    }
    end(arg1, arg2, arg3) {
        const maybeCb = arg3 || arg2 || arg1;
        const input = typeof arg1 !== 'function' ? arg1 : undefined;
        const encoding = typeof arg2 === 'string' ? arg2 : 'utf8';
        const cb = typeof maybeCb === 'function' ? maybeCb : undefined;
        if (typeof input === 'string') {
            this.write(input, encoding);
        } else if (input != null) {
            this.write(input);
        }
        if (cb) this.once('close', cb);
        return this._end();
    }
    destroy() {
        if (!this.#destroyed) this.#close();
    }
    flush(cb) {
        if (this.#destroyed) {
            cb == null ? void 0 : cb();
        } else {
            const onDrain = ()=>{
                if (!this.#destroyed) {
                    fsFsync(this.#fd, (error)=>{
                        this.#flushPending = false;
                        if ((error == null ? void 0 : error.code) === 'EBADF') {
                            cb == null ? void 0 : cb(); // If fd is closed, ignore the error
                        } else {
                            cb == null ? void 0 : cb(error);
                        }
                    });
                } else {
                    this.#flushPending = false;
                    cb == null ? void 0 : cb();
                }
                this.off('error', onError);
            };
            const onError = (err)=>{
                this.#flushPending = false;
                this.off('drain', onDrain);
                cb == null ? void 0 : cb(err);
            };
            this.#flushPending = true;
            this.once('drain', onDrain);
            this.once('error', onError);
            if (!this.#writing) {
                if (this.#lines.length - this.#head > this.#partialLine || this.#output) {
                    // There are complete lines or remaining output to write
                    this.#writeLine();
                } else {
                    // Nothing complete to write, emit drain immediately
                    process.nextTick(()=>this.emit('drain'));
                }
            }
        }
    }
    _writeln(data) {
        this.#len += data.length;
        if (!this.#writing && this.#lines.length === this.#head && !this.#output) {
            // Fast path: When no write is pending, directly write the line
            this.#writing = true;
            this.#output = data;
            _nodefs().default.write(this.#fd, data, this.#onRelease);
        } else {
            this.#lines.push(data);
            if (!this.#writing) {
                this.#writeLine();
            }
        }
        return this.#len < HIGH_WATER_MARK;
    }
    _write(data) {
        if (this.#destroyed) {
            return false;
        }
        this.#len += data.length;
        // Fast path: For complete lines with no pending partial we can skip the work below
        if (this.#partialLine === 0 && data.charCodeAt(data.length - 1) === 10 /*'\n'*/ ) {
            return this._writeln(data);
        }
        let startIdx = 0;
        let endIdx = -1;
        while((endIdx = data.indexOf('\n', startIdx)) > -1){
            const line = data.slice(startIdx, endIdx + 1);
            if (this.#partialLine > 0) {
                this.#lines[this.#lines.length - 1] += line;
            } else {
                this.#lines.push(line);
            }
            this.#partialLine = 0;
            startIdx = ++endIdx;
        }
        if (startIdx < data.length) {
            const line = data.slice(startIdx);
            if (this.#partialLine > 0) {
                this.#lines[this.#lines.length - 1] += line;
            } else {
                this.#lines.push(data.slice(startIdx));
            }
            this.#partialLine = 1;
        }
        if (!this.#writing && this.#lines.length - this.#head > this.#partialLine) {
            this.#writeLine();
        }
        return this.#len < HIGH_WATER_MARK;
    }
    write(input, arg2, arg3) {
        const maybeCb = arg3 || arg2;
        const encoding = typeof arg2 === 'string' ? arg2 : 'utf8';
        const data = typeof input === 'string' ? input : _nodebuffer().Buffer.from(input).toString(encoding);
        const cb = typeof maybeCb === 'function' ? maybeCb : undefined;
        try {
            return this._write(data);
        } finally{
            cb == null ? void 0 : cb();
        }
    }
    [Symbol.dispose]() {
        this.destroy();
    }
}
const isStdFd = (fd)=>{
    switch(fd){
        case 1:
        case 2:
        case process.stdout.fd:
        case process.stderr.fd:
            return true;
        default:
            return false;
    }
};
const fsFsync = (fd, cb)=>{
    try {
        _nodefs().default.fsync(fd, cb);
    } catch (error) {
        cb(error);
    }
};

//# sourceMappingURL=stream.js.map