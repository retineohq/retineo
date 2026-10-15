export interface SqlExecutor {
  query(sql: string, params?: unknown[]): { rows: any[] } | Promise<{ rows: any[] }>;
  exec(sql: string): void | Promise<void>;
}

export interface SqlExecutorWithPump extends SqlExecutor {
  __pump?: () => Promise<void>;
  pumpSelects?: () => Promise<void>;
}

export class PostgresDatabase {
  constructor(private client: SqlExecutor, public schemaVersion: number = 1) {}

  async applySchema(schemaSql: string): Promise<void> {
    await this.client.exec(schemaSql);
  }
}

export function loadPostgresSchemaSql(schemaSql: string): string {
  return schemaSql;
}
