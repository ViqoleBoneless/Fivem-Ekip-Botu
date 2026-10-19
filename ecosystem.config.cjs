module.exports = {
  apps: [
    {
      name: "ekip-botu",
      script: "./index.js",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
