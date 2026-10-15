// Node/libuv normalizes ru_maxrss to KiB on macOS, where the native API uses
// bytes. Other supported Unix platforms also expose this field in KiB.
export function maxRssKiBToBytes(value) {
  return value * 1024;
}
