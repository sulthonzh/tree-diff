export interface TreeEntry {
    path: string;
    type: "file" | "dir" | "symlink" | "other";
    size: number;
    hash?: string;
    linkTarget?: string;
}
export interface TreeSnapshot {
    root: string;
    entries: Map<string, TreeEntry>;
    timestamp: number;
}
export type ChangeType = "added" | "removed" | "modified" | "type_changed" | "unchanged";
export interface DiffEntry {
    path: string;
    changeType: ChangeType;
    before?: TreeEntry;
    after?: TreeEntry;
    sizeDelta?: number;
}
export interface DiffResult {
    leftRoot: string;
    rightRoot: string;
    entries: DiffEntry[];
    summary: {
        added: number;
        removed: number;
        modified: number;
        typeChanged: number;
        unchanged: number;
        totalSizeDelta: number;
    };
}
export interface ScanOptions {
    ignore?: string[];
    followSymlinks?: boolean;
    hashFiles?: boolean;
    maxDepth?: number;
}
export interface DiffOptions {
    ignore?: string[];
    hashFiles?: boolean;
    maxDepth?: number;
    contentDiff?: boolean;
}
export interface FormatOptions {
    format?: "text" | "json" | "markdown";
    showUnchanged?: boolean;
    color?: boolean;
}
export declare function scanTree(root: string, options?: ScanOptions): Promise<TreeSnapshot>;
export declare function diffTrees(left: TreeSnapshot, right: TreeSnapshot): DiffResult;
export declare function formatText(result: DiffResult, options?: FormatOptions): string;
export declare function formatJSON(result: DiffResult, options?: FormatOptions): string;
export declare function formatMarkdown(result: DiffResult, options?: FormatOptions): string;
export declare function formatResult(result: DiffResult, options?: FormatOptions): string;
