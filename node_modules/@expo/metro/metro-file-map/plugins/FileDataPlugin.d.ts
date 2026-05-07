import type { FileMapPlugin, FileMapPluginInitOptions, FileMapPluginWorker, ReadonlyFileSystemChanges, V8Serializable } from "../flow-types";
export interface FileDataPluginOptions extends FileMapPluginWorker {
  readonly name: string;
  readonly cacheKey: string;
}
declare class FileDataPlugin<PerFileData extends void | V8Serializable = void | V8Serializable> implements FileMapPlugin<null, PerFileData> {
  readonly name: string;
  constructor($$PARAM_0$$: FileDataPluginOptions);
  initialize(initOptions: FileMapPluginInitOptions<null, PerFileData>): Promise<void>;
  getFileSystem(): any;
  onChanged(_changes: ReadonlyFileSystemChanges<null | undefined | PerFileData>): void;
  assertValid(): void;
  getSerializableSnapshot(): null;
  getCacheKey(): string;
  getWorker(): FileMapPluginWorker;
}
export default FileDataPlugin;