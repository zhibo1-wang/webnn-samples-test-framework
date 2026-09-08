const fs = require("fs");
const path = require("path");
const os = require("os");

const hostname = os.hostname();
const sourceDir = path.join(__dirname, `../../out/`);
const dataRootDir = path.join(__dirname, `../data/`);

// Result file names are `<date>[<HHmm>][-<configLabel>].json` (see src/utils/fs.js saveJsonFile).
// Group by configLabel so each config gets its own `<hostname>[-<configLabel>]` bucket, matching
// the trends copy logic in src/main.js and avoiding results from different configs on the same
// day overwriting each other.
const RESULT_FILE_PATTERN = /^\d{8}(?:\d{4})?(?:-(.+))?\.json$/;

if (!fs.existsSync(sourceDir)) {
  console.warn(`The directory ${sourceDir} does not exist.`);
  return;
}

fs.readdir(sourceDir, (err, dates) => {
  if (err || dates.length === 0) {
    console.warn(`No results found in source directory ${sourceDir}.`);
    return;
  }

  dates.forEach((dateDir) => {
    const datePath = path.join(sourceDir, dateDir);
    if (fs.statSync(datePath).isDirectory()) {
      fs.readdir(datePath, (err, files) => {
        if (err) {
          console.error(`Error reading date directory ${dateDir}: ${err}`);
          return;
        }

        // Group files by configLabel, then keep only the latest file per label.
        const latestByLabel = new Map();
        files
          .filter((file) => path.extname(file) === ".json")
          .forEach((file) => {
            const match = file.match(RESULT_FILE_PATTERN);
            if (!match) return;
            const label = match[1] ?? "";
            const filePath = path.join(datePath, file);
            const mtime = fs.statSync(filePath).mtime;
            const current = latestByLabel.get(label);
            if (!current || mtime > current.mtime) {
              latestByLabel.set(label, { file, mtime });
            }
          });

        latestByLabel.forEach(({ file }, label) => {
          const destinationDir = path.join(dataRootDir, label ? `${hostname}-${label}` : hostname);
          if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
          }

          const sourceFile = path.join(datePath, file);
          const newFileName = file.substring(0, 8) + ".json";
          const destinationFile = path.join(destinationDir, newFileName);

          fs.copyFile(sourceFile, destinationFile, (err) => {
            if (err) {
              console.error(`Error copying file ${file}: ${err}`);
            } else {
              console.log(`Copied ${file} to ${destinationFile}`);
            }
          });
        });
      });
    }
  });
});
