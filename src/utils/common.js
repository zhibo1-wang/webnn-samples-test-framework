const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");

function ensureDir(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
}

function getTimestamp(minute = false) {
  const timestamp = Date.now();
  let formattedTimestamp;
  if (minute === true) {
    formattedTimestamp = dayjs(timestamp).format("YYYYMMDDHHmm");
  } else {
    formattedTimestamp = dayjs(timestamp).format("YYYYMMDD");
  }
  return formattedTimestamp;
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

/**
 * Return a promise that rejects after the specified timeout.
 * Intended to be used with Promise.race() by the caller.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} [message] - Optional custom error message.
 * @returns {Promise<never>}
 */
function throwOnTimeout(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms);
  });
}

const outDir = path.join(path.resolve(__dirname), "../../out").replace(/\\/g, "/");
ensureDir(outDir);

module.exports = {
  ensureDir,
  getTimestamp,
  delay,
  throwOnTimeout,
  outDir
};
