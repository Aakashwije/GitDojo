export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, if it is present. */
export function firstParam(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}
