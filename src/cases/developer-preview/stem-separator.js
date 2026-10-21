const util = require("../../utils/util.js");
const DeveloperPreviewSample = require("./developer-preview-sample.js");
const pageElementTotal = require("../../page-elements/developer-preview.js");
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
// Example `name` -> audio `<name>-30s.mp3`, reference `stem-separator-reference/<name>.json`
const AUDIO_SUFFIX = "-30s.mp3";
const ASSETS_DIR = path.join(__dirname, "../../../assets/audio");
const REFERENCE_DIR = path.join(ASSETS_DIR, "stem-separator-reference");
const ACTUAL_DIR = path.join(__dirname, "../../../out/stem-separator");

// Runs before the page scripts: the stem downloads are captured as blobs instead of being saved to disk.
function captureDownloads() {
  const blobs = new Map();
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    const url = createObjectURL(object);
    blobs.set(url, object);
    return url;
  };
  window.__downloads = {};
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download?.endsWith(".wav")) {
      window.__downloads[this.download] = blobs.get(this.href);
      return;
    }
    return click.call(this);
  };
}

// RMS of every `windowSeconds` window (both channels) of the captured 32-bit float stereo WAV of each stem.
async function computeEnvelopes({ windowSeconds, sampleRate }) {
  const envelopes = {};
  for (const [fileName, blob] of Object.entries(window.__downloads)) {
    const stem = fileName.split(".").slice(-2, -1)[0];
    const samples = new Float32Array(await blob.arrayBuffer(), 44); // skip the 44-byte header
    const frames = samples.length / 2;
    const windowFrames = windowSeconds * sampleRate;
    const envelope = [];
    for (let start = 0; start < frames; start += windowFrames) {
      const end = Math.min(frames, start + windowFrames);
      let sumOfSquares = 0;
      for (let i = start * 2; i < end * 2; i++) sumOfSquares += samples[i] * samples[i];
      envelope.push(+Math.sqrt(sumOfSquares / ((end - start) * 2)).toFixed(4));
    }
    envelopes[stem] = envelope;
  }
  return envelopes;
}

class StemSeparator extends DeveloperPreviewSample {
  constructor(config) {
    super(config, "stem-separator");
    this.timeoutMultiplier = 3;
  }

  async navigate(page, backend, model) {
    await page.evaluateOnNewDocument(captureDownloads);
    await super.navigate(page, backend, model);
  }

  // Compare the level envelope of every stem with the reference one window by window, return the mismatches.
  compareEnvelopes(name, actual, expected) {
    const { relative, absolute } = this.sampleConfig.tolerance;
    const { windowSeconds } = this.sampleConfig;
    const mismatches = [];
    for (const [stem, expectedEnvelope] of Object.entries(expected)) {
      const actualEnvelope = actual[stem] ?? [];
      if (actualEnvelope.length !== expectedEnvelope.length) {
        mismatches.push(`${name} ${stem}: got ${actualEnvelope.length} windows, expected ${expectedEnvelope.length}`);
        continue;
      }
      const bad = expectedEnvelope
        .map((expectedLevel, i) => ({ i, expectedLevel, actualLevel: actualEnvelope[i] }))
        .filter(({ expectedLevel, actualLevel }) => {
          return !(Math.abs(actualLevel - expectedLevel) <= Math.max(absolute, relative * expectedLevel));
        });
      if (bad.length) {
        const { i, expectedLevel, actualLevel } = bad[0];
        mismatches.push(
          `${name} ${stem}: ${bad.length}/${expectedEnvelope.length} windows out of tolerance, ` +
            `first at ${i * windowSeconds}s (got ${actualLevel}, expected ${expectedLevel})`
        );
      }
    }
    return mismatches;
  }

  async run(page, backend, dataType, model) {
    const pageElement = pageElementTotal[this.sample];
    const { windowSeconds } = this.sampleConfig;
    const exampleResults = {};
    const errors = [];

    await Promise.race([
      (async () => {
        // load the model
        await util.waitForElementEnabled(page, pageElement["loadButton"]);
        await page.click(pageElement["loadButton"]);
        await page.waitForFunction(
          (selector) => document.querySelector(selector).textContent.includes("Session loaded"),
          {},
          pageElement["status"]
        );

        for (const name of this.sampleConfig.examples) {
          // upload an audio, the start button is enabled once it is decoded
          const inputElement = await page.$(pageElement["audioInput"]);
          await inputElement.uploadFile(path.join(ASSETS_DIR, name + AUDIO_SUFFIX));
          await util.waitForElementEnabled(page, pageElement["inferButton"]);

          // separate the stems, the previous result stays until the separation starts
          await page.click(pageElement["inferButton"]);
          await page.waitForFunction(
            (selector) => !document.querySelector(`${selector} .result-ok`),
            {},
            pageElement["inferResult"]
          );
          await page.waitForSelector(`${pageElement["inferResult"]} .result-ok`);

          // "✓ Separated in 4.2s · 1.85× realtime · WebNN GPU"
          const resultText = await page.$eval(pageElement["inferResult"], (el) => el.textContent);
          exampleResults[name] = {
            separationTime: parseFloat(resultText.match(/Separated in ([\d.]+)s/)[1]),
            realtime: parseFloat(resultText.match(/([\d.]+)×\s*realtime/)[1])
          };
          console.log(`Test results ${name}: `, exampleResults[name]);

          // download the stems (captured, not saved) and measure their level over time
          await page.evaluate(() => {
            document.querySelectorAll("#stem-grid .stem-download-btn").forEach((button) => button.click());
          });
          const envelope = await page.evaluate(computeEnvelopes, { windowSeconds, sampleRate: SAMPLE_RATE });
          await page.evaluate(() => (window.__downloads = {}));

          // keep what is measured, so it can be used as the reference
          fs.mkdirSync(ACTUAL_DIR, { recursive: true });
          const actualPath = path.join(ACTUAL_DIR, `${name}.json`);
          fs.writeFileSync(actualPath, JSON.stringify({ windowSeconds, envelope }));

          const referencePath = path.join(REFERENCE_DIR, `${name}.json`);
          if (!fs.existsSync(referencePath)) {
            errors.push(`${name}: no reference ${referencePath}, the measured one is saved to ${actualPath}`);
            continue;
          }
          const reference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
          errors.push(...this.compareEnvelopes(name, envelope, reference.envelope));
        }
      })(),
      util.throwOnFailedLog(page),
      util.throwOnUncaughtException(page)
    ]);

    if (errors.length) {
      throw new Error(errors.join("\n"));
    }
    return exampleResults;
  }
}

module.exports = async function ({ config, backend, dataType, model }) {
  const instance = new StemSeparator(config);
  return await instance.execute(backend, dataType, model);
};
