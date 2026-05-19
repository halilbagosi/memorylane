"use strict";

const excludedExtensions = require("../../workerExclusionList");
const path = require("path");
const PACKAGE_JSON = path.sep + "package.json";
module.exports = class Worker {
  #hasteImpl = null;
  constructor({ hasteImplModulePath }) {
    if (hasteImplModulePath != null) {
      this.#hasteImpl = require(hasteImplModulePath);
    }
  }
  processFile(data, utils) {
    let hasteName = null;
    const { filePath } = data;
    if (filePath.endsWith(PACKAGE_JSON)) {
      try {
        const fileData = JSON.parse(utils.getContent().toString());
        if (fileData.name) {
          hasteName = fileData.name;
        }
      } catch (err) {
        throw new Error(`Cannot parse ${filePath} as JSON: ${err.message}`);
      }
    } else if (
      !excludedExtensions.has(filePath.substr(filePath.lastIndexOf(".")))
    ) {
      if (!this.#hasteImpl) {
        throw new Error("computeHaste is true but hasteImplModulePath not set");
      }
      hasteName = this.#hasteImpl.getHasteName(filePath) || null;
    }
    return hasteName;
  }
};
