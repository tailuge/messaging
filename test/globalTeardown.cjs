/**
 * Global teardown - runs after all tests complete.
 * Ensures any lingering connections are cleaned up.
 */

const { forceCleanup } = require("./utils");

module.exports = async function globalTeardown() {
  await forceCleanup();
};
