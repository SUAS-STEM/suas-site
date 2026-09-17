import { cleanOriginalName } from "@/lib/devUploads";

export const MAX_PARAM_FILE_BYTES = 16 * 1024 * 1024;

export function cleanVersionName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function parseParameterFile(text: string) {
  const parameters: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith(";") || trimmed.startsWith("QGC")) continue;
    const comma = trimmed.indexOf(",");
    const parts = comma >= 0 ? [trimmed.slice(0, comma).trim(), trimmed.slice(comma + 1).trim()] : trimmed.split(/\s+/, 2);
    const name = parts[0]?.trim();
    const value = parts[1]?.trim();
    if (!name || value == null || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) continue;
    parameters[name] = value;
  }
  return parameters;
}

export function isParameterFile(fileName: string) {
  return /\.(?:param|parm|params|txt)$/i.test(cleanOriginalName(fileName));
}

