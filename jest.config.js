// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // Loads mocks necessary for tests.
  setupFiles: ["./src/test/setup.js"],

  // Execute scripts within a DOM to allow JupyterLab code to run.
  testEnvironment: "jsdom",

  testMatch: ["<rootDir>/src/test/**/*.test.ts"],

  // Transpile all Typescript and Javascript files.
  transform: {
    "^.+\\.[tj]sx?$": require.resolve("babel-jest")
  },

  // Transpile all @jupyterlab JavaScript files.
  transformIgnorePatterns: [".*/node_modules/(?!@jupyterlab/).*.js"]
};
