interface FileSystemWritableFileStream {
    write(data: Blob | ArrayBuffer | ArrayBufferView | string): Promise<void>;
    close(): Promise<void>;
}

interface FileSystemFileHandle {
    readonly name: string;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
}
