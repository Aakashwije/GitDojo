import type postgres from "postgres";

export declare class DatabaseUrlError extends Error {}

export interface ConnectionConfig {
  url: string;
  options: postgres.Options<Record<string, postgres.PostgresType>>;
}

export declare function connectionConfig(
  connectionString: string,
  options?: { purpose?: "app" | "migrate"; env?: Record<string, string | undefined> },
): ConnectionConfig;

export declare function describeDatabase(connectionString: string): string;
