// enumerate records in typed way
export const typedEntries = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj) as [keyof T, T[keyof T]][];
