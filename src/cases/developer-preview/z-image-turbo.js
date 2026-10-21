const util = require("../../utils/util.js");
const DeveloperPreviewSample = require("./developer-preview-sample.js");
const pageElementTotal = require("../../page-elements/developer-preview.js");

class ZImageTurbo extends DeveloperPreviewSample {
  constructor(config) {
    super(config, "z-image-turbo");
    this.recordMemory = true;
    this.timeoutMultiplier = 3;
  }

  async run(page, backend, dataType, model) {
    const pageElement = pageElementTotal[this.sample];

    await Promise.race([
      (async () => {
        // load the models
        await util.waitForElementEnabled(page, pageElement["loadModelsButton"]);
        await page.click(pageElement["loadModelsButton"]);
        await util.waitForElementEnabled(page, pageElement["generateImageButton"]);

        // generate an image with the default prompt, the total time is shown when it is done
        await page.click(pageElement["generateImageButton"]);
        await page.waitForFunction(
          (selector) => {
            const element = document.querySelector(selector);
            return element.style.display !== "none" && /^\d+\.?\d*\s*ms/.test(element.textContent.trim());
          },
          {},
          pageElement["finalTime"]
        );
      })(),
      util.throwOnFailedLog(page),
      util.throwOnUncaughtException(page)
    ]);

    // Session creation times shown by the page, excluding model downloads.
    // Keep the same list format as SDXL: Text Encoder, Transformer, VAE, Safety Checker.
    const buildTime = [];
    for (const modelName of ["textEncoder", "transformer", "vae", "safetyChecker"]) {
      const time = await page.$eval(pageElement[`${modelName}Create`], (el) => el.textContent.trim());
      if (modelName === "safetyChecker" && !time) continue;
      if (!time || !Number.isFinite(Number(time)) || Number(time) < 0) {
        throw new Error(`Invalid ${modelName} session creation time: ${time}`);
      }
      buildTime.push(time);
    }
    const inferenceTime = await page.$eval(pageElement.runTotal, (el) => el.textContent.trim());
    const result = { all: { buildTime, inferenceTime } };
    console.log("Test results: ", result);
    return result;
  }
}

module.exports = async function ({ config, backend, dataType, model }) {
  const instance = new ZImageTurbo(config);
  return await instance.execute(backend, dataType, model);
};
