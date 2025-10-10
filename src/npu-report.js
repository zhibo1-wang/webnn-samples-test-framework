const fs = require("fs");
const path = require("path");

const TEST_DIR = path.resolve("out/npu-compatibility/2025-10-17 16-08-57");
const metadata = require(path.join(TEST_DIR, "metadata.json"));
const { Liquid } = require("liquidjs");

const tests = {
  "samples-image-classification-fp16-mobilenetv2": "samples.image-classification.npu.fp16.mobileNetV2",
  "samples-image-classification-fp16-resnet50v1": "samples.image-classification.npu.fp16.resNet50V1",
  "samples-image-classification-fp16-efficientNet": "samples.image-classification.npu.fp16.efficientNet",
  "samples-object-detection-fp16-ssdMobileNetV1": "samples.object-detection.npu.fp16.ssdMobileNetV1",
  "samples-selfie-segmentation-fp16-general": "samples.selfie-segmentation.npu.fp16.general",
  "samples-selfie-segmentation-fp32-general": "samples.selfie-segmentation.npu.fp32.general",
  "samples-notepad": "samples.notepad.npu._._",
  "developer-preview-stable-diffusion-1-5-fp16": "developer-preview.stable-diffusion-1-5.npu.fp16.textEncoder-run-1",
  "developer-preview-stable-diffusion-turbo-fp16": "developer-preview.stable-diffusion-turbo.npu.fp16.textEncoder",
  "developer-preview-segment-anything-fp16": "developer-preview.segment-anything.npu.fp16.encoder",
  "developer-preview-whisper-base-fp16": "developer-preview.whisper-base.npu.fp16.encoder",
  "developer-preview-image-classification-fp16": "developer-preview.image-classification.npu.fp16.mobileNetV2",
};

let result = {};
for (const driver of metadata.drivers) {
  result[driver] = require(path.join(TEST_DIR, `${driver}.json`));
}

let data = {};
for (const [testKey, testKeys] of Object.entries(tests)) {
  data[testKey] = {};
  for (const driver of metadata.drivers) {
    let testResult = result[driver];
    for (const key of testKeys.split(".")) {
      testResult = testResult[key];
    }
    data[testKey][driver] = testResult;
  }
}

new Liquid({
  root: path.resolve(__dirname, "views")
})
  .renderFile("npu-report.liquid", { drivers: metadata.drivers, data })
  .then((html) => {
    fs.writeFileSync(path.join(TEST_DIR, "npu-report.html"), html);
  });
