"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.FileSystemChangeAggregator = void 0;
class FileSystemChangeAggregator {
  #addedDirectories = new Set();
  #removedDirectories = new Set();
  #addedFiles = new Map();
  #modifiedFiles = new Map();
  #removedFiles = new Map();
  #initialMetadata = new Map();
  directoryAdded(canonicalPath) {
    if (!this.#removedDirectories.delete(canonicalPath)) {
      this.#addedDirectories.add(canonicalPath);
    }
  }
  directoryRemoved(canonicalPath) {
    if (!this.#addedDirectories.delete(canonicalPath)) {
      this.#removedDirectories.add(canonicalPath);
    }
  }
  fileAdded(canonicalPath, data) {
    if (this.#removedFiles.delete(canonicalPath)) {
      this.#modifiedFiles.set(canonicalPath, data);
    } else {
      this.#addedFiles.set(canonicalPath, data);
    }
  }
  fileModified(canonicalPath, oldData, newData) {
    if (this.#addedFiles.has(canonicalPath)) {
      this.#addedFiles.set(canonicalPath, newData);
    } else {
      if (!this.#initialMetadata.has(canonicalPath)) {
        this.#initialMetadata.set(canonicalPath, oldData);
      }
      this.#modifiedFiles.set(canonicalPath, newData);
    }
  }
  fileRemoved(canonicalPath, data) {
    if (!this.#addedFiles.delete(canonicalPath)) {
      let initialData = this.#initialMetadata.get(canonicalPath);
      if (!initialData) {
        initialData = data;
        this.#initialMetadata.set(canonicalPath, initialData);
      }
      this.#modifiedFiles.delete(canonicalPath);
      this.#removedFiles.set(canonicalPath, initialData);
    }
  }
  getSize() {
    return (
      this.#addedDirectories.size +
      this.#removedDirectories.size +
      this.#addedFiles.size +
      this.#modifiedFiles.size +
      this.#removedFiles.size
    );
  }
  getView() {
    return {
      addedDirectories: this.#addedDirectories,
      removedDirectories: this.#removedDirectories,
      addedFiles: this.#addedFiles,
      modifiedFiles: this.#modifiedFiles,
      removedFiles: this.#removedFiles,
    };
  }
  getMappedView(metadataMapFn) {
    return {
      addedDirectories: this.#addedDirectories,
      removedDirectories: this.#removedDirectories,
      addedFiles: mapIterable(this.#addedFiles, metadataMapFn),
      modifiedFiles: mapIterable(this.#modifiedFiles, metadataMapFn),
      removedFiles: mapIterable(this.#removedFiles, metadataMapFn),
    };
  }
}
exports.FileSystemChangeAggregator = FileSystemChangeAggregator;
function mapIterable(map, metadataMapFn) {
  return {
    *[Symbol.iterator]() {
      for (const [path, metadata] of map) {
        yield [path, metadataMapFn(metadata)];
      }
    },
  };
}
