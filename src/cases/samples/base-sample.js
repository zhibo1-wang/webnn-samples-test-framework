const util = require("../../utils/util.js");
const _ = require("lodash");

/**
 * Base class for all sample tests.
 * Provides common functionality for browser management, result handling, and navigation.
 */
class BaseSample {
  constructor(config, source, sample) {
    this.config = config;
    this.sampleConfig = this.config[this.source][this.sample];
    this.source = source;
    this.sample = sample;
  }

  /**
   * Main entry point for running tests
   * @param {string} [backend] - Optional backend filter
   * @param {string} [dataType] - Optional dataType filter
   * @param {string} [model] - Optional model filter
   */
  async execute(backend, dataType, model) {
    if (backend && dataType && model) {
      return _.set({}, [this.sample, backend, dataType, model], await this.runCase(backend, dataType, model));
    } else {
      return await this.runCases();
    }
  }

  /**
   * Run all test cases by iterating through config
   */
  async runCases() {
    let results = {};
    for (let backend in this.sampleConfig) {
      if (!["cpu", "gpu", "npu"].includes(backend)) continue;
      for (let dataType in this.sampleConfig[backend]) {
        for (let model of this.sampleConfig[backend][dataType]) {
          _.merge(
            results,
            _.set({}, [this.sample, backend, dataType, model], await this.runCase(backend, dataType, model))
          );
        }
      }
    }
    return results;
  }

  /**
   * Run a single test case with browser lifecycle management
   */
  async runCase(backend, dataType, model) {
    if (!["cpu", "gpu", "npu"].includes(backend)) {
      console.warn(`Invalid backend: ${backend}`);
      return;
    }

    console.log(`${this.source} ${this.sample} ${backend} ${dataType} ${model} testing...`);
    const screenshotFilename = `${this.source}_${this.sample}_${backend}_${dataType}_${model}`;
    let browser = null;
    let page = null;
    try {
      browser = await util.launchBrowser(this.config);
      page = (await browser.pages())[0];
      page.setDefaultTimeout(this.config.timeout);

      const url = `${this.config.samplesBasicUrl}${this.config.samplesUrl[this.sample]}`;
      await page.goto(url, { waitUntil: "networkidle0" });
      return await this.run(page, backend, dataType, model);
    } catch (error) {
      console.warn(error.message);
      return error.message;
    } finally {
      if (page) await util.saveScreenshot(page, screenshotFilename);
      if (browser) await browser.close();
    }
  }

  /**
   * Run the actual test logic - must be implemented by subclasses
   */
  async run(page, backend, dataType, model) {
    throw new Error("run() must be implemented");
  }
}

module.exports = BaseSample;
