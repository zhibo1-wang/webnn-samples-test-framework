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
        // load the models, the button is enabled before the page binds its click handler, the demo author
        // suggests waiting 30 seconds before clicking it
        await util.waitForElementEnabled(page, pageElement["loadModelsButton"]);
        await util.delay(30000);
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

    const result = { totalTime: await page.$eval(pageElement["runTotal"], (el) => el.textContent.trim()) };
    console.log("Test results: ", result);
    return result;
  }
}

module.exports = async function ({ config, backend, dataType, model }) {
  const instance = new ZImageTurbo(config);
  return await instance.execute(backend, dataType, model);
};
