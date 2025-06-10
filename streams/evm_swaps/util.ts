export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export const nullToUndefined = (x: object) => {
  for (const key in x) {
    if (x[key] === null) x[key] = undefined;
  }
  return x;
};
