/**
 * Base class for switch tests that run multiple configurations in a single browser session.
 * Unlike BaseSample which creates a new browser for each test, BaseSwitchTest reuses
 * the same browser/page across all test configurations.
 */
const util = require("../../utils/util.js");

class BaseSwitchTest {
  constructor(config, source, sample) {
    this.config = config;
    this.source = source;
    this.sample = sample;
    this.sampleConfig = this.config[this.source][this.sample];
  }

  /**
   * Main entry point - creates browser/page and calls run()
   */
  async execute() {
    let browser = null;
    let results = {};
    try {
      browser = await util.launchBrowser(this.config);
      const page = (await browser.pages())[0];
      page.setDefaultTimeout(this.config.timeout);

      results = await this.run(page);
    } catch (error) {
      console.error("Switch test execution error:", error.message);
    } finally {
      if (browser) await browser.close();
    }
    return results;
  }

  /**
   * Run test logic - must be implemented by subclasses
   * @param {Page} page - Puppeteer page instance
   * @returns {Object} Test results
   */
  async run(page) {
    throw new Error("run() must be implemented");
  }

  /**
   * Navigate to a sample URL
   * @param {Page} page - Puppeteer page instance
   * @param {string} sampleKey - The key to look up in samplesUrl config
   */
  async navigate(page, sampleKey) {
    const url = `${this.config.samplesBasicUrl}${this.config.samplesUrl[sampleKey]}`;
    await page.goto(url, { waitUntil: "networkidle0" });
  }
}

module.exports = BaseSwitchTest;
