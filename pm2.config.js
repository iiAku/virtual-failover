module.exports = {
  name: "Homemade VRRP running on a NUC", // Name of your application
  script: "start:prod", // npm script to run
  interpreter: "bun", // Bun interpreter
  interpreterArgs: ["run"], // Arguments to pass to the interpreter
  env: {
    PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`, // Add "~/.bun/bin/bun" to PATH
  },
  autorestart: true, // Automatically restart the application
  restart_delay: 5000, // Delay between restarts (in milliseconds)
  max_restarts: 10, // Maximum number of restarts
  watch: true, // Watch for file changes
  ignore_watch: ["node_modules", "logs"], // Ignore specific files or directories
};
