"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "resolveWatchFolders", {
    enumerable: true,
    get: function() {
        return resolveWatchFolders;
    }
});
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
// NOTE(@kitten): This is a heuristic and shouldn't trigger. However, if we erroneously start the watch folders
// traversal, we never want to create a situation where (for whatever reason) it gets stuck,
// or slows the startup down by an unreasonable amount
const MAX_DEPTH = 6;
function resolveWatchFolders(pkgName, { deep }) {
    const seen = new Set();
    const folders = new Set();
    const recurse = (pkgName, fromPath = undefined, depth = 0)=>{
        if (seen.has(pkgName) || depth > MAX_DEPTH) {
            return;
        } else {
            seen.add(pkgName);
        }
        let target;
        try {
            target = require.resolve(`${pkgName}/package.json`, {
                paths: fromPath ? [
                    fromPath
                ] : undefined
            });
        } catch  {
            return;
        }
        let folder = _nodepath().default.dirname(_nodepath().default.dirname(target));
        if (pkgName[0] === '@') {
            folder = _nodepath().default.dirname(folder);
        }
        folders.add(folder);
        if (deep) {
            const pkg = require(target);
            if (pkg.dependencies != null && typeof pkg.dependencies === 'object') {
                for(const pkgName in pkg.dependencies)recurse(pkgName, target, depth + 1);
            }
            if (pkg.peerDependencies != null && typeof pkg.peerDependencies === 'object') {
                for(const pkgName in pkg.peerDependencies)recurse(pkgName, target, depth + 1);
            }
        }
    };
    recurse(pkgName);
    return [
        ...folders
    ];
}

//# sourceMappingURL=resolveWatchFolders.js.map