# WebNN Samples Test Framework

An automation test framework for testing [W3C WebNN Samples](https://github.com/webmachinelearning/webnn-samples) and [Microsoft WebNN Demos](https://microsoft.github.io/webnn-developer-preview/).

## Install

```sh
$ npm install
$ cp env.example.json env.json
```

### Set env.json

- `env`: `'debug'` for local development. `'production'` for production model and the test result will be sent via email.
- `hostname`: Identify yourself.
- `proxy`: Set the proxy server, which is usually needed.
- `emailService`: Edit the email config according to your server.

### Set config.json
#### Generate config
The config.json file can be automatically generated using the command:

```shell
npm run generate-config
```

Run with `-h` to see the help message.
```shell
$ npm run generate-config -- -h
Usage: npm run generate-config -- [options]

Generate config for webnn sample tests

Options:
  -b, --browser <browser>     The browser to use (choices: "chrome_canary", "chrome_dev", "chrome_beta", "chrome_stable", "edge_canary", "edge_dev", "edge_beta", "edge_stable", default: "chrome_canary")
  -d, --devices <devices...>  The devices to use (choices: "cpu", "gpu", "npu", default: ["cpu","gpu","npu"])
  -e, --backend <backend>     The backend to use (choices: "ort", "tflite", default: "ort")
  -o, --output <path>         The output config file path (default: "config.json")
  -h, --help                  display help for command
```

#### Change config
You can also manually adjust the parameters in config.json to fit your specific needs.

- `browser`: Choose the browser to run the test. Options include `chrome_canary`, `chrome_dev`, `chrome_beta`, `chrome_stable`, `edge_canary` (except on Linux), `edge_dev`, `edge_beta`, `edge_stable`.
- `browserUserData`: Browser user data includes browser cache. When webnn flag is enabled and browserUserData is used, script won't test wasm or webgl backends.
- `browserUserDataPath`: The browser `User Data` folder path supports manual setting by users and is empty by default.
- `browserAppPath`: The browser `Application` folder path supports manual setting by users and is empty by default.
- `headless`: Display chrome UI.
- `timeout`: Browser page waiting time (ms), if the test device performance is poor, please set a larger value.
- `imageCompareThreshold`: Images matching threshold, ranges from 0 to 1. Smaller values make the comparison more sensitive. 0.1 by default.
- `samplesBasicUrl`: URL of WebNN samples.
- `samplesUrl`: Each sample URL: `samplesBasicUrl + samplesUrl`.
- `samples`: WebNN samples config.
- `developerPreview`: WebNN developer preview demo config.

## Start

### Test all samples

```sh
$ npm test
```

### Test a specific single sample

Get all supported samples from help message

```shell
$ npm test -- -f
Using config file: config.json
Available filters:
┌─────────┬──────────────────────────────────────────────────────────────────────────┐
│ (index) │ Values                                                                   │
├─────────┼──────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'samples-image-classification-cpu-fp32-mobileNetV2'                      │
| ...     | ...                                                                      │
└─────────┴──────────────────────────────────────────────────────────────────────────┘
```

Specify the sample with `-f` or `--filter` option. Multiple samples can be specified by separating them with spaces.

```shell
$ npm test -- -f samples-image-classification-cpu-fp32-mobileNetV2
```

### Test with wildcard filters

Use `*` in the filter to match multiple samples at once. Quote the pattern to prevent shell glob expansion.

```shell
# Test all object-detection samples
$ npm test -- -f "samples-object-detection-*"

# Test all gpu samples
$ npm test -- -f "samples-*-gpu-*"

# Test all developer-preview image-classification samples
$ npm test -- -f "developer-preview-image-classification-*"

# Combine multiple wildcard filters
$ npm test -- -f "samples-object-detection-*" "developer-preview-image-classification-gpu-*"
```

When a wildcard filter is expanded, the matched filters will be printed:
```
Filter "samples-object-detection-*" expanded to:
  samples-object-detection-cpu-fp32-tinyYoloV2
  samples-object-detection-cpu-fp32-ssdMobileNetV1
  samples-object-detection-gpu-fp16-tinyYoloV2
  ...
```

## Support

#### Dependency

Node.js (known working version: 22.11.0)

#### Platform

Windows / Linux / MacOS

#### Browser

chrome_canary / chrome_dev / chrome_beta / chrome_stable / edge_canary / edge_dev / edge_beta / edge_stable

- edge_canary is not available on Linux.
