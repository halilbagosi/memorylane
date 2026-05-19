"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "printQRCode", {
    enumerable: true,
    get: function() {
        return printQRCode;
    }
});
function _nodetty() {
    const data = /*#__PURE__*/ _interop_require_default(require("node:tty"));
    _nodetty = function() {
        return data;
    };
    return data;
}
function _toqr() {
    const data = require("toqr");
    _toqr = function() {
        return data;
    };
    return data;
}
const _env = require("./env");
const _log = /*#__PURE__*/ _interop_require_wildcard(require("../log"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) {
        return obj;
    }
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
        return {
            default: obj
        };
    }
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) {
        return cache.get(obj);
    }
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) {
                Object.defineProperty(newObj, key, desc);
            } else {
                newObj[key] = obj[key];
            }
        }
    }
    newObj.default = obj;
    if (cache) {
        cache.set(obj, newObj);
    }
    return newObj;
}
function printQRCode(url) {
    const qr = (0, _toqr().toQR)(url);
    const output = supportsSextants() ? createSextantOutput(qr) : createHalfblockOutput(qr);
    return {
        lines: output.split('\n').length,
        print () {
            _log.log(output);
        }
    };
}
/** On specific terminals we can print a smaller QR code */ function supportsSextants() {
    var _process_env_WT_SESSION, _process_env_KITTY_WINDOW_ID, _process_env_ALACRITTY_WINDOW_ID;
    if (_env.env.CI || !_nodetty().default.isatty(1) || !_nodetty().default.isatty(2)) {
        return false;
    } else if (process.env.COLOR === '0' || process.env.COLOR === 'false') {
        return false;
    }
    const isWindowsTerminal = process.platform === 'win32' && !!((_process_env_WT_SESSION = process.env.WT_SESSION) == null ? void 0 : _process_env_WT_SESSION.length);
    const isGhostty = process.env.TERM_PROGRAM === 'ghostty';
    const isWezterm = process.env.TERM_PROGRAM === 'WezTerm';
    const isKitty = !!((_process_env_KITTY_WINDOW_ID = process.env.KITTY_WINDOW_ID) == null ? void 0 : _process_env_KITTY_WINDOW_ID.length);
    const isAlacritty = !!((_process_env_ALACRITTY_WINDOW_ID = process.env.ALACRITTY_WINDOW_ID) == null ? void 0 : _process_env_ALACRITTY_WINDOW_ID.length);
    return isWindowsTerminal || isGhostty || isWezterm || isKitty || isAlacritty;
}
/** ANSI QR code output by using half-blocks (1x2-sized unicode blocks) */ function createHalfblockOutput(data) {
    const extent = Math.sqrt(data.byteLength) | 0;
    const CHAR_00 = '\u2588';
    const CHAR_10 = '\u2584';
    const CHAR_01 = '\u2580';
    const CHAR_11 = ' ';
    let output = '';
    output += CHAR_10.repeat(extent + 2);
    for(let row = 0; row < extent; row += 2){
        output += '\n' + CHAR_00;
        for(let col = 0; col < extent; col++){
            const value = data[row * extent + col] << 1 | data[(row + 1) * extent + col];
            switch(value){
                case 0:
                    output += CHAR_00;
                    break;
                case 1:
                    output += CHAR_01;
                    break;
                case 2:
                    output += CHAR_10;
                    break;
                case 3:
                    output += CHAR_11;
                    break;
            }
        }
        output += CHAR_00;
    }
    if (extent % 2 === 0) {
        output += '\n' + CHAR_01.repeat(extent + 2);
    }
    output += '\n';
    return output;
}
/** ANSI QR code output by using sextant-blocks (2x3-sized unicode blocks) */ function createSextantOutput(data) {
    const getChar = (p)=>{
        // Invert then reverse
        let char = p ^ 63;
        char = (char & 0xaa) >> 1 | (char & 0x55) << 1;
        char = (char & 0xcc) >> 2 | (char & 0x33) << 2;
        char = char >> 4 | char << 4;
        char = char >> 2 & 63;
        switch(char){
            case 0:
                return ' ';
            case 63:
                return '\u2588';
            case 21:
                return '\u258C';
            case 42:
                return '\u2590';
            default:
                return String.fromCodePoint(0x1fb00 + char - 1 - (char > 21 ? 1 : 0) - (char > 42 ? 1 : 0));
        }
    };
    const extent = Math.sqrt(data.byteLength) | 0;
    const padded = extent + 2;
    let output = '';
    for(let baseRow = 0; baseRow < padded; baseRow += 3){
        if (baseRow) output += '\n';
        for(let baseCol = 0; baseCol < padded; baseCol += 2){
            let p = 0;
            for(let dr = 0; dr < 3; dr++){
                for(let dc = 0; dc < 2; dc++){
                    const r = baseRow + dr;
                    const c = baseCol + dc;
                    const bit = 5 - (dr * 2 + dc);
                    let cell = 1; // default empty (out of bounds)
                    if (r < padded && c < padded) {
                        if (r === 0 || c === 0 || r === padded - 1 || c === padded - 1) {
                            cell = 0; // border is filled
                        } else if (r <= extent && c <= extent) {
                            cell = data[(r - 1) * extent + (c - 1)];
                        }
                    }
                    p |= (cell & 1) << bit;
                }
            }
            output += getChar(p);
        }
    }
    if (padded % 3 === 0) {
        // Only add newline if the padded output lines up with a newline exactly
        output += '\n';
    }
    return output;
}

//# sourceMappingURL=qr.js.map