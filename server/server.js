const { port } = require("./config");
const { createApp } = require("./app");
const { closeDatabase } = require("./db");

async function start() {
  const app = await createApp();
  const server = app.listen(port, () => {
    console.log(`NSAP Creator Manager listening on port ${port}`);
  });

  const shutdown = () => server.close(async () => { await closeDatabase(); process.exit(0); });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
});
