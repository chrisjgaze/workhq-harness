const express = require("express");
const path = require("path");

const app = express();
const port = process.env.WEB_PORT || 8080;
const publicDirectory = path.resolve(__dirname, "..", "public");

app.use(express.static(publicDirectory));

app.listen(port, () => {
  console.log(`Demo hub running on http://localhost:${port}`);
});
