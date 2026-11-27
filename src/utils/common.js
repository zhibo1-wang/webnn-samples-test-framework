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

// Identifies one execution: its start minute plus the config label, e.g. "202611271533-litert".
// The result file is named after it and the screenshots of its cases are saved in the folder of the same name.
let runId = "";

function startRun(configLabel = "") {
  runId = getTimestamp(true) + (configLabel ? `-${configLabel}` : "");
}

function getRunId() {
  return runId || getTimestamp(true);
}

module.exports = {
  getTimestamp,
  startRun,
  getRunId,
  delay,
  getConfigLabel
};
