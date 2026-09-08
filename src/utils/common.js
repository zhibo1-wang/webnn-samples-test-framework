const path = require("path");

const dayjs = require("dayjs");

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
 * Derive a short label identifying the config file, e.g. "config.npu.json" -> "npu".
 * The default "config.json" maps to "" so existing single-config setups are unaffected.
 * @param {string} configPath - Path (or basename) of the config file used for this run.
 * @returns {string} Config label, empty string for the default config.
 */
function getConfigLabel(configPath) {
  const base = path.basename(configPath, ".json");
  return base.replace(/^config\.?/, "");
}

module.exports = {
  getTimestamp,
  delay,
  getConfigLabel
};
