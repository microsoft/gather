// babel.config.js
// All presets and plugins in this file, except for preset-typescript, are for transpiling
// @jupyterlab source code during tests. preset-typescript is for transpiling the source code
// from this project while running tests.
module.exports = {
  plugins: ["@babel/plugin-proposal-class-properties", "inline-react-svg"],
  presets: [
    "@babel/preset-typescript",
    ["@babel/preset-env", { targets: { node: "current" } }],
    "@babel/preset-react"
  ]
};
