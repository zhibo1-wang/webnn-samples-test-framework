const fs = require("fs");
const path = require("path");
const prettier = require("prettier");
const { getRunId } = require("./common");

function ensureDir(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
}

const outDir = path.join(path.resolve(__dirname), "../../out").replace(/\\/g, "/");
ensureDir(outDir);

async function saveJsonFile(data) {
  const jsonData = JSON.stringify(data);
  const formattedJsonData = await prettier.format(jsonData, { parser: "json" });
  const fileName = getRunId();
  const directoryPath = `${outDir}/${fileName.slice(0, 8)}`;
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
  ensureDir,
  outDir,
  saveJsonFile,
  copyFile
};
