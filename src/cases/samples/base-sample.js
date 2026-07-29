const util = require("../../utils/util.js");
const _ = require("lodash");

class BaseSample {
  constructor(config, source, sample) {
    this.config = config;
    this.source = source;
    this.sample = sample;
    this.results = {};
  }

  async execute(backend, dataType, model) {
    if (backend && dataType && model) {
      await this.testExecution(backend, dataType, model);
    } else {
      for (let _backend in this.config[this.source][this.sample]) {
        if (!["cpu", "gpu", "npu"].includes(_backend)) continue;
        for (let _dataType in this.config[this.source][this.sample][_backend]) {
          for (let _model of this.config[this.source][this.sample][_backend][_dataType]) {
            await this.testExecution(_backend, _dataType, _model);
          }
        }
      }
    }
    return this.results;
  }

  async testExecution(backend, dataType, model) {
    if (!["cpu", "gpu", "npu"].includes(backend)) {
      console.warn(`Invalid backend: ${backend}`);
      return;
    }

    console.log(`${this.source} ${this.sample} ${backend} ${dataType} ${model} testing...`);
    const screenshotFilename = `${this.source}_${this.sample}_${backend}_${dataType}_${model}`;
    let errorMsg = "";
    let data = null;
    let browser;
    let page;

    try {
      browser = await util.launchBrowser(this.config);
      page = (await browser.pages())[0];
      page.setDefaultTimeout(this.config.timeout);

      await this.navigate(page);
      const result = await this.run(page, backend, dataType, model);
      if (typeof result === "string") {
        errorMsg = result;
      } else if (result && typeof result === "object") {
        data = result;
      }
      await util.saveScreenshot(page, screenshotFilename);
    } catch (error) {
      errorMsg = error.message;
      if (page) {
        await util.saveScreenshot(page, screenshotFilename);
        errorMsg += await this.getAdditionalErrorMsg(page);
      }
      console.warn(errorMsg);
    } finally {
      this.setResults(backend, dataType, model, data, errorMsg);
      if (browser) await browser.close();
    }
  }

  async navigate(page) {
    const url = `${this.config.samplesBasicUrl}${this.config.samplesUrl[this.sample]}`;
    await page.goto(url, { waitUntil: "networkidle0" });
  }

  async run(page, backend, dataType, model) {
    throw new Error("run() must be implemented");
  }

  async getAdditionalErrorMsg(page) {
    return "";
  }

  setResults(backend, dataType, model, data, errorMsg) {
    const path = [this.sample, backend, dataType, model];
    if (errorMsg) {
      _.set(this.results, [...path, "error"], errorMsg.substring(0, this.config.errorMsgMaxLength));
    } else {
      _.set(this.results, [...path, "error"], "");
      if (data) {
        const current = _.get(this.results, path, {});
        _.set(this.results, path, _.merge(current, data));
      }
    }
  }
}

module.exports = BaseSample;
