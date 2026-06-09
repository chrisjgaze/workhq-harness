const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const services = [
  spawn(process.execPath, [path.join(__dirname, "proxy.js")], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit"
  }),
  spawn(process.execPath, [path.join(__dirname, "static.js")], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit"
  })
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  services.forEach(service => service.kill());
  process.exit(exitCode);
}

services.forEach(service => {
  service.on("error", error => {
    console.error(error);
    stop(1);
  });

  service.on("exit", code => {
    if (!stopping && code !== 0) {
      stop(code || 1);
    }
  });
});

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
