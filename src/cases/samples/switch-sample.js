/**
 * Test different samples in the same browser tab
 * Supported Sample list: image_classification, fast_style_transfer, object_detection
 */
const _ = require("lodash");
const util = require("../../utils/util.js");
const BaseSwitchTest = require("./base-switch-test.js");
const { ImageClassificationTest } = require("./image-classification.js");
const { FastStyleTransferSample } = require("./fast-style-transfer.js");
const { ObjectDetectionTest } = require("./object-detection.js");

class SwitchSampleTest extends BaseSwitchTest {
  constructor(config) {
    super(config, "samples", "switch-sample");
    this.tests = {
      "image-classification": new ImageClassificationTest(config),
      "fast-style-transfer": new FastStyleTransferSample(config),
      "object-detection": new ObjectDetectionTest(config)
    };
  }

  async run(page) {
    const results = {};
    const sampleConfig = this.sampleConfig;

    for (const sampleKey of sampleConfig.order) {
      const test = this.tests[sampleKey];
      if (!test) {
        console.log("Not support this sample:", sampleKey);
        continue;
      }
      const sampleResults = await this.runSampleTest(page, sampleKey, test);
      _.merge(results, sampleResults);
    }
    return results;
  }

  async runSampleTest(page, sampleKey, test) {
    const results = {};
    const sampleConfig = this.sampleConfig.samples[sampleKey];

    for (const backend in sampleConfig) {
      if (!["cpu", "gpu", "npu"].includes(backend)) continue;

      for (const dataType in sampleConfig[backend]) {
        for (const model of sampleConfig[backend][dataType]) {
          const screenshotSuffix = `${sampleKey}_${backend}_${dataType}_${model}`;
          console.log(`${this.source} ${this.sample} ${sampleKey} ${backend} ${dataType} ${model} testing...`);

          const resultPath = [sampleKey, backend, dataType, model];
          try {
            await this.navigate(page, sampleKey);
            const result = await test.run(page, backend, dataType, model);
            await util.saveScreenshot(page, screenshotSuffix);
            _.set(results, resultPath, { ...result, error: "" });
          } catch (error) {
            await util.saveScreenshot(page, screenshotSuffix);
            console.warn(error.message);
            _.set(results, [...resultPath, "error"], error.message.substring(0, this.config.errorMsgMaxLength));
          }
        }
      }
    }
    return results;
  }
}

async function switchSampleTest({ config }) {
  const test = new SwitchSampleTest(config);
  const results = await test.execute();
  return { [test.sample]: results };
}

module.exports = switchSampleTest;
