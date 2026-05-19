"use strict";

const defaultDependencyExtractor = require("./dependencyExtractor");
module.exports = class DependencyExtractorWorker {
  #dependencyExtractor;
  constructor({ dependencyExtractor }) {
    if (dependencyExtractor != null) {
      this.#dependencyExtractor = require(dependencyExtractor);
    }
  }
  processFile(data, utils) {
    const content = utils.getContent().toString();
    const { filePath } = data;
    const dependencies =
      this.#dependencyExtractor != null
        ? this.#dependencyExtractor.extract(
            content,
            filePath,
            defaultDependencyExtractor.extract,
          )
        : defaultDependencyExtractor.extract(content);
    return Array.from(dependencies);
  }
};
