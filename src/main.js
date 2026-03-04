const fs = require("fs");
const path = require("path");

const _ = require("lodash");

const util = require("./utils/util.js");
const env = util.getEnv();
const { renderResultsAsHTML, report, scpUpload } = require("./utils/report.js");
const { program } = require("commander");
const sessionCreate = require("./cases/session-create.js");
const ortLibraryPath = require("./cases/ort-library-path.js");

const parseFilter = (filter) => {
  // Full filter: source-sample-backend-dataType-model
  const fullPattern =
    /^(samples|developer-preview)-([a-zA-Z0-9-]+)-(cpu|gpu|npu)(?:-(fp16|fp32|_))?(?:-([a-zA-Z0-9_-]+|_))?$/;
  const fullMatch = filter.match(fullPattern);
  if (fullMatch) {
    const [, source, sampleName, backend, dataType, model] = fullMatch;
    return { sampleName, source, backend, dataType, model };
  }

  // Short filter for special samples (no backend/dataType/model): source-sample
  const shortPattern = /^(samples|developer-preview)-([a-zA-Z0-9-]+)$/;
  const shortMatch = filter.match(shortPattern);
  if (shortMatch) {
    const [, source, sampleName] = shortMatch;
    return { sampleName, source };
  }

  return null;
};

/**
 * Expand a filter pattern that may contain `*` wildcards into concrete filter objects.
 * e.g. "samples-object-detection-*" matches all filters starting with "samples-object-detection-".
 * @param {string} pattern - The filter pattern, where trailing parts can be `*`.
 * @param {string[]} allFilters - All available filter strings from config.
 * @returns {Object[]|null} Array of parsed filter objects, or null if pattern is invalid.
 */
const expandFilter = (pattern, allFilters) => {
  if (!pattern.includes("*")) {
    const parsed = parseFilter(pattern);
    return parsed ? [parsed] : null;
  }

  // Split on *, escape each literal segment, join with .+ (match one or more characters)
  const segments = pattern.split("*");
  const regexStr = "^" + segments.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+") + "$";
  const regex = new RegExp(regexStr);

  const matched = allFilters.filter((f) => regex.test(f));
  if (matched.length === 0) return null;
  console.log(`Filter "${pattern}" expanded to:\n${matched.map((f) => `  ${f}`).join("\n")}`);
  return matched.map(parseFilter).filter(Boolean);
};

const executeTestModule = async ({ config, sampleName, source, backend, dataType, model, results }) => {
  try {
    const testModule = require(`./cases/${source}/${sampleName}.js`);
    const resultsSamples = await testModule({ config, backend, dataType, model });
    _.merge(results[source], resultsSamples);
  } catch (error) {
    console.error(`Error occurred when testing '${sampleName}':`, error.message);
  } finally {
    // kill browser after each sample test execution to ensure the memory is freed
    util.killBrowserProcess(config);
  }
};

program
  .name("npm test --")
  .description("WebNN Sample Test")
  .option("-c --config <path>", "Specify the config file path", "config.json")
  .option("-e --env <name>", "Specify the env name")
  .option("-f, --filters [filter...]", "Specify the specific single sample test")
  .option("-b --browser-dir <path>", "Specify browser 'Application' folder path")
  .option("-d --user-data-dir <path>", "Specify browser 'User Data' folder path");

program.action(async ({ config: configPath, env: envName, filters, browserDir, userDataDir }) => {
  const config = require(path.resolve(process.cwd(), configPath));
  console.log(`Using config file: ${configPath}`);

  if (filters === true) {
    console.log("Available filters:");
    console.table(util.generateSupportedSamplesArray(config));
    return;
  } else if (Array.isArray(filters)) {
    const allFilters = util.generateSupportedSamplesArray(config);
    const expanded = [];
    for (const pattern of filters) {
      const parsed = expandFilter(pattern, allFilters);
      if (!parsed) {
        console.error(`Invalid filter or no match: ${pattern}`);
        console.log("Available filters:");
        console.table(allFilters);
        return;
      }
      expanded.push(...parsed);
    }
    filters = expanded;
  }

  util.killBrowserProcess(config);
  config.browserAppPath = browserDir ?? config.browserAppPath;
  config.browserUserDataPath = userDataDir ?? config.browserUserDataPath;
  // If the user data dir is not overridden by CLI, clean up the default temporary user data dir before the tests
  if (!(config.browserUserData && config.browserUserDataPath)) {
    const userDataDir = util.getBrowserPath(config).userDataDir;
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 5000 });
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const results = {
    deviceInfo: await util.getDeviceInfo(config),
    samples: {},
    "developer-preview": {}
  };

  let failed = false;
  for (const [name, test] of Object.entries({ ortLibraryPath, sessionCreate })) {
    results[name] = await test({ config });
    if (results[name].error) {
      failed = true;
    }
  }
  if (!failed) {
    if (filters) {
      for (const filter of filters) {
        await executeTestModule({ config, ...filter, results });
      }
    } else {
      for (const source of ["samples", "developer-preview"]) {
        const samples = config?.[source];
        if (samples) {
          for (const sampleName of Object.keys(samples)) {
            await executeTestModule({ config, sampleName, source, results });
          }
        }
      }
    }
  }

  const jsonPath = await util.saveJsonFile(results);
  // Copy the test results JSON file into `trends/data` in both `debug` and `production` modes.
  // In `debug` mode, the `jsonPath` includes `minute` information, which is unnecessary
  // for `trends` since it only compares and displays daily results.
  util.copyFile(jsonPath, path.join(__dirname, "..", "trends", "data", require("os").hostname()), {
    targetName: path.basename(jsonPath).substring(0, 8) + ".json"
  });

  const htmlPath = jsonPath.split(".")[0] + ".html";
  fs.writeFileSync(htmlPath, await renderResultsAsHTML(require(jsonPath)));
  console.log(`Test results have been saved to ${jsonPath} and ${htmlPath}`);

  if (env.env === "production") {
    await report(results);
    await scpUpload(jsonPath);
  }
});

program.parse();
