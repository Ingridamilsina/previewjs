export interface Reader {
  listeners: {
    add(listener: ReaderListener): void;
    remove(listener: ReaderListener): void;
  };
  read(filePath: string): Promise<Entry | null>;
  readSync(filePath: string): EntrySync | null;
}

export interface Writer {
  /**
   * Returns true if the content were modified.
   */
  updateFile(filePath: string, sourceText: string | null): boolean;
}

export type Entry = File | Directory;

export interface File {
  kind: "file";
  name: string;
  realPath(): Promise<string | null>;
  lastModifiedMillis(): Promise<number>;
  size(): Promise<number>;
  read(): Promise<string>;
}

export interface Directory {
  kind: "directory";
  name: string;
  entries(): Promise<Entry[]>;
}

export type EntrySync = FileSync | DirectorySync;

export interface FileSync {
  kind: "file";
  name: string;
  realPath(): string | null;
  lastModifiedMillis(): number;
  size(): number;
  read(): string;
}

export interface DirectorySync {
  kind: "directory";
  name: string;
  entries(): EntrySync[];
}

export interface ReaderListener {
  observedPaths: Set<string>;
  onChange: (filePath: string, info: ReaderListenerInfo) => void;
}

export interface ReaderListenerInfo {
  virtual: boolean;
}
