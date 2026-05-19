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

import type { CanonicalPath, FileMetadata, FileSystemListener, ReadonlyFileSystemChanges } from "../flow-types";
export declare class FileSystemChangeAggregator implements FileSystemListener {
  directoryAdded(canonicalPath: CanonicalPath): void;
  directoryRemoved(canonicalPath: CanonicalPath): void;
  fileAdded(canonicalPath: CanonicalPath, data: FileMetadata): void;
  fileModified(canonicalPath: CanonicalPath, oldData: FileMetadata, newData: FileMetadata): void;
  fileRemoved(canonicalPath: CanonicalPath, data: FileMetadata): void;
  getSize(): number;
  getView(): ReadonlyFileSystemChanges<FileMetadata>;
  getMappedView<T>(metadataMapFn: (metadata: FileMetadata) => T): ReadonlyFileSystemChanges<T>;
}