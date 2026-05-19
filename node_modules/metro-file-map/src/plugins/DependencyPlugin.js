"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.default = void 0;
var _workerExclusionList = _interopRequireDefault(
  require("../workerExclusionList"),
);
var _FileDataPlugin = _interopRequireDefault(require("./FileDataPlugin"));
function _interopRequireDefault(e) {
  return e && e.__esModule ? e : { default: e };
}
class DependencyPlugin extends _FileDataPlugin.default {
  constructor(options) {
    const { dependencyExtractor, computeDependencies } = options;
    let cacheKey;
    if (dependencyExtractor != null) {
      const extractor = require(dependencyExtractor);
      cacheKey = extractor.getCacheKey?.() ?? dependencyExtractor;
    } else {
      cacheKey = "default-dependency-extractor";
    }
    super({
      name: "dependencies",
      cacheKey,
      worker: {
        modulePath: require.resolve("./dependencies/worker.js"),
        setupArgs: {
          dependencyExtractor: dependencyExtractor ?? null,
        },
      },
      filter: ({ normalPath, isNodeModules }) => {
        if (!computeDependencies) {
          return false;
        }
        if (isNodeModules) {
          return false;
        }
        const ext = normalPath.substr(normalPath.lastIndexOf("."));
        return !_workerExclusionList.default.has(ext);
      },
    });
  }
  getDependencies(mixedPath) {
    const result = this.getFileSystem().lookup(mixedPath);
    if (result.exists && result.type === "f") {
      return result.pluginData ?? [];
    }
    return null;
  }
}
exports.default = DependencyPlugin;
