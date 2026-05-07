"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.default = void 0;
class FileDataPlugin {
  #worker;
  #cacheKey;
  #files;
  constructor({ name, worker, filter, cacheKey }) {
    this.name = name;
    this.#worker = {
      worker,
      filter,
    };
    this.#cacheKey = cacheKey;
  }
  async initialize(initOptions) {
    this.#files = initOptions.files;
  }
  getFileSystem() {
    const files = this.#files;
    if (files == null) {
      throw new Error(`${this.name} plugin has not been initialized`);
    }
    return files;
  }
  onChanged(_changes) {}
  assertValid() {}
  getSerializableSnapshot() {
    return null;
  }
  getCacheKey() {
    return this.#cacheKey;
  }
  getWorker() {
    return this.#worker;
  }
}
exports.default = FileDataPlugin;
