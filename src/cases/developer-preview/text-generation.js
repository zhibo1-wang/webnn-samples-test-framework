const util = require("../../utils/util.js");
const BaseSample = require("./base-sample.js");

class TextGeneration extends BaseSample {
  constructor(config) {
    super(config, "text-generation");
    this.config.timeout *= 3;
  }

  async run(page, backend, dataType, model) {
    const result = {
      ttft: [],
      tps: []
    };

    await Promise.race([
      (async () => {
        await util.waitForElementEnabled(page, "#send-button");
        for (const { question, answer } of this.sampleConfig.cases) {
          await page.type("#user-input", "This is a correctness test. " + question);
          await page.click("#send-button");
          await util.waitForElementEnabled(page, "#send-button");

          const timeToFirstToken = await page.$eval(
            '.performance-data[title="Time to first token"] .tokens-per-second-performance-data',
            (el) => el.textContent.trim()
          );
          const tokensPerSecond = await page.$eval(
            '.performance-data[title="tokens per second"] .tokens-per-second-performance-data',
            (el) => el.textContent.trim()
          );
          result.ttft.push(util.formatTimeResult(timeToFirstToken));
          result.tps.push(util.formatTimeResult(tokensPerSecond));

          const lastResponse = await page.$$(".response-message");
          const responseText = await (
            await lastResponse[lastResponse.length - 1].getProperty("textContent")
          ).jsonValue();
          if (responseText.trim() !== answer.trim()) {
            throw new Error(`Got "${responseText.trim()}", expected "${answer.trim()}" for the question "${question}"`);
          }
        }
      })(),
      util.throwOnUncaughtException(page)
    ]);

    console.log(result);
    return result;
  }
}

module.exports = async function ({ config, backend, dataType, model }) {
  const textGeneration = new TextGeneration(config);
  return await textGeneration.execute(backend, dataType, model);
};
