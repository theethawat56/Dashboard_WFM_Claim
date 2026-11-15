export const ZIP_PART_LIMIT = 800 * 1024 * 1024;

export interface ZipPartPlan {
  id: number;
  kind: "zip" | "file";
  fileIndexes: number[];
  bytes: number;
}

/** Group whole files into ZIP parts of at most `limit` bytes. A file larger than the limit stays one download. */
export function planZipParts(sizes: number[], limit = ZIP_PART_LIMIT): ZipPartPlan[] {
  const parts: ZipPartPlan[] = [];
  let indexes: number[] = [];
  let bytes = 0;

  const push = (kind: "zip" | "file", fileIndexes: number[], partBytes: number) => {
    parts.push({ id: parts.length + 1, kind, fileIndexes, bytes: partBytes });
  };

  const flush = () => {
    if (indexes.length === 0) return;
    push("zip", indexes, bytes);
    indexes = [];
    bytes = 0;
  };

  sizes.forEach((size, index) => {
    const known = Number.isFinite(size) && size >= 0;
    if (!known || size > limit) {
      flush();
      push("file", [index], known ? size : 0);
      return;
    }
    if (indexes.length > 0 && bytes + size > limit) flush();
    indexes.push(index);
    bytes += size;
  });
  flush();
  return parts;
}
