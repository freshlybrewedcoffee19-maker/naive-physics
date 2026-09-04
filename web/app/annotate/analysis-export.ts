export const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const makeCsv = (columns: readonly string[], rows: Array<Array<string | number | null>>) =>
  [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

export const downloadBlob = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const writeTarHeader = (name: string, size: number) => {
  const header = new Uint8Array(512);
  const encoder = new TextEncoder();
  const write = (value: string, offset: number, length: number) => header.set(encoder.encode(value).slice(0, length), offset);
  write(name, 0, 100);
  write("0000644\0", 100, 8);
  write("0000000\0", 108, 8);
  write("0000000\0", 116, 8);
  write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12);
  write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, "0")}\0`, 136, 12);
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  write("ustar\0", 257, 6);
  write("00", 263, 2);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
};

export const makeTar = (files: Array<{ name: string; content: string | Blob }>) => {
  const encoder = new TextEncoder();
  return Promise.all(files.map(async ({ name, content }) => {
    const data = typeof content === "string" ? encoder.encode(content) : new Uint8Array(await content.arrayBuffer());
    const padding = new Uint8Array((512 - data.length % 512) % 512);
    return [writeTarHeader(name, data.length), data, padding];
  })).then((entries) => new Blob([...entries.flat(), new Uint8Array(1024)], { type: "application/x-tar" }));
};
