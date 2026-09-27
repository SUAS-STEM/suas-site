export const MAX_FOLDER_NAME_LENGTH = 80;
export const MAX_FOLDER_DEPTH = 10;
export const MAX_FOLDER_PATH_LENGTH = 800;

export function isValidFolderName(value: string) {
  return value.length > 0 &&
    value.length <= MAX_FOLDER_NAME_LENGTH &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !/[\/\\\u0000-\u001f\u007f]/u.test(value);
}

export function isValidFolderPath(value: string) {
  if (!value) return true;
  if (value.length > MAX_FOLDER_PATH_LENGTH) return false;
  const parts = value.split("/");
  return parts.length <= MAX_FOLDER_DEPTH && parts.every(isValidFolderName);
}

export function childFolderName(folderPath: string, childPath: string) {
  const prefix = folderPath ? `${folderPath}/` : "";
  if (!childPath.startsWith(prefix)) return null;
  const name = childPath.slice(prefix.length);
  return name && !name.includes("/") ? name : null;
}
