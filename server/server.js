const { port } = require("./config");
const { createApp } = require("./app");

const app = createApp();

app.listen(port, () => {
  console.log(`NSAP Creator Manager listening on port ${port}`);
});
