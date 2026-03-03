/**
 * Test in sample: image_classification
 * Switch different backend or models within the same browser session
 */
const _ = require("lodash");
const BaseSwitchTest = require("./base-switch-test.js");
const { ImageClassificationTest } = require("./image-classification.js");

class SwitchBackendTest extends BaseSwitchTest {
  constructor(config) {
    super(config, "samples", "switch-backend");
    // Get the first subsample to test
    const sampleConfig = this.sampleConfig;
    this.subSample = Object.keys(sampleConfig.samples)[0];
    this.testRounds = sampleConfig.rounds;
    // Create test instance for reuse
    this.imageClassificationTest = new ImageClassificationTest(config);
  }

  async run(page) {
    const results = {};
    const subSampleConfig = this.sampleConfig.samples[this.subSample];

    for (let round = 0; round < this.testRounds; round++) {
      for (const backend in subSampleConfig) {
        if (!["cpu", "gpu", "npu"].includes(backend)) continue;

        for (const dataType in subSampleConfig[backend]) {
          for (const model of subSampleConfig[backend][dataType]) {
            console.log(
              `${this.source} ${this.sample} ${this.subSample} ${backend} ${dataType} ${model} ` +
                `totalTestRounds: ${this.testRounds}, currentTestRound: ${round + 1} testing...`
            );

            const resultPath = [this.subSample, backend, dataType, model];
            try {
              await this.navigate(page, this.subSample);
              const result = await this.imageClassificationTest.run(page, backend, dataType, model);
              _.set(results, resultPath, { ...result, error: "" });
            } catch (error) {
              console.warn(error.message);
              _.set(results, [...resultPath, "error"], error.message.substring(0, this.config.errorMsgMaxLength));
            }
          }
        }
      }
    }
    return results;
  }
}

async function switchBackendTest({ config }) {
  const test = new SwitchBackendTest(config);
  const results = await test.execute();
  return { [test.sample]: results };
}

module.exports = switchBackendTest;
