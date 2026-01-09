const fs = require("fs");
const prettier = require("prettier");
const { env } = require("./env");
const { ensureDir, getTimestamp, outDir } = require("./common");
const path = require("path");

async function saveJsonFile(data) {
  const jsonData = JSON.stringify(data);
  const formattedJsonData = await prettier.format(jsonData, { parser: "json" });
  const timestamp = getTimestamp();
  const fileName = env.env === "production" ? getTimestamp() : getTimestamp(true);
  const directoryPath = `${outDir}/${timestamp}`;
  ensureDir(directoryPath);
  const filePath = `${directoryPath}/${fileName}.json`;
  try {
    fs.writeFileSync(filePath, formattedJsonData, "utf8");
    console.log("json file has been saved in " + filePath);
  } catch (error) {
    console.log("json file save failed", error);
  }
  return filePath;
}

function copyFile(source, target, { targetName } = {}) {
  const targetPath = path.join(target, targetName || path.basename(source));
  ensureDir(target);

  try {
    fs.copyFileSync(source, targetPath);
    console.log(`File copied to ${targetPath}`);
  } catch (error) {
    console.error(`Error copying file: ${error}`);
  }
}

module.exports = {
  saveJsonFile,
  copyFile
};
