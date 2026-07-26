/** @type {import('jest').Config} */
module.exports = {
  rootDir: "..",
  testRegex: ".e2e-spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  moduleFileExtensions: ["js", "json", "ts"],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/test/setup-e2e.ts"],
  testTimeout: 30000,
};
