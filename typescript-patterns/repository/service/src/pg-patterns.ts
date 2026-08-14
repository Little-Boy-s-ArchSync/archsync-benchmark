import { Client as PgClient, Pool } from "pg";
import * as pg from "pg";

const client = new PgClient({ connectionString: "postgres://postgres:5432/orders" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const namespaceClient = new pg.Client({ connectionString: "postgresql://postgres:5432/orders" });
const unusedClient = new PgClient({ connectionString: "postgres://postgres:5432/unused" });
const fakeDatabase = new CustomClient({ connectionString: "postgres://postgres:5432/fake" });
const queryText = "select * from orders";

export async function exercisePgPatterns(): Promise<void> {
  await client.query("select 1");
  await pool.query(queryText);
  await namespaceClient.query("select 2");
  await client.query("select 3");

  await fakeDatabase.query("select 4");
  await query("select 5");
  void unusedClient;
  void "database.query('select 6')";
}

declare function query(statement: string): Promise<void>;
declare class CustomClient {
  constructor(options: { connectionString: string });
  query(statement: string): Promise<void>;
}

