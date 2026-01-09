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

const outDir = path.join(path.resolve(__dirname), "../../out").replace(/\\/g, "/");
ensureDir(outDir);

module.exports = {
  ensureDir,
  getTimestamp,
  delay,
  outDir
};
