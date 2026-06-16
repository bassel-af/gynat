// Minimal ambient declaration for `pg` (node-postgres), used only by the
// e2e-browser specs for DB setup/teardown. The `pg` package ships no bundled
// types and `@types/pg` is not installed; this covers exactly the surface the
// specs use (Client construct / connect / query / end). Replace with
// `@types/pg` if richer typing is ever needed.
declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[];
    rowCount: number;
  }

  export class Client {
    constructor(config?: { connectionString?: string } | string);
    connect(): Promise<void>;
    query<R = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
}
