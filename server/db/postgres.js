const { Pool } = require("pg");

function createPostgresAdapter(connectionString, sslEnabled) {
  const pool = new Pool({
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));

  const wrap = (client = pool) => ({
    type: "postgres",
    async exec(sql) { await client.query(sql); },
    async all(sql, params = []) { return (await client.query(sql, params)).rows; },
    async get(sql, params = []) { return (await client.query(sql, params)).rows[0] || null; },
    async run(sql, params = []) { return client.query(sql, params); },
  });

  return {
    ...wrap(),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
}

module.exports = { createPostgresAdapter };
