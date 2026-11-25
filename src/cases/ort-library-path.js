const fs = require("fs");

module.exports = async function ({ config }) {
  let errors = [];
  config.browserArgs.forEach((arg) => {
    const match = arg.match(/--webnn-ort-library-path-for-testing=([^"]+)/);
    if (match) {
      if (!fs.existsSync(`${match[1]}/onnxruntime.dll`)) {
        errors.push(
          `The specified --webnn-ort-library-path-for-testing="${match[1]}" directory does not contain onnxruntime.dll`
        );
      }
    } else {
      const epMatch = arg.match(/--webnn-ort-ep-library-path-for-testing=(.*)/);
      if (epMatch) {
        // Format: EP1?path1,EP2?path2
        for (const entry of epMatch[1].split(",")) {
          const file = entry.slice(entry.indexOf("?") + 1);
          if (!fs.existsSync(file)) {
            errors.push(`The specified file "${file}" in ${arg} does not exist`);
          }
        }
      }
    }
  });
  return errors.length > 0 ? { error: errors } : {};
};
