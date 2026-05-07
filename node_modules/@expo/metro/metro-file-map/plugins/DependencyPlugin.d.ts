/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 * @format
 * @oncall react_native
 */

import type { Path } from "../flow-types";
import FileDataPlugin from "./FileDataPlugin";
export interface DependencyPluginOptions {
  /** Path to custom dependency extractor module */
  readonly dependencyExtractor?: null | string;
  /** Whether to compute dependencies (performance optimization) */
  readonly computeDependencies: boolean;
}
declare class DependencyPlugin extends FileDataPlugin<ReadonlyArray<string> | null> {
  constructor(options: DependencyPluginOptions);
  getDependencies(mixedPath: Path): null | undefined | ReadonlyArray<string>;
}
export default DependencyPlugin;