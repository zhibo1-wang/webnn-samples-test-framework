const assert = require("assert");
const child_process = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const readline = require("readline");

const cheerio = require("cheerio");
const { program } = require("commander");
const _ = require("lodash");

const util = require("./utils/util.js");

const USER_AGENT = "webnn-samples-test-framework/1.0";
const env = util.getEnv();
let httpAgent = null;
let httpsAgent = null;
if (env && env.proxy && env.proxy.host) {
  const proxyHostRaw = String(env.proxy.host).replace(/\/$/, "");
  const proxyWithProtocol = /^https?:\/\//i.test(proxyHostRaw) ? proxyHostRaw : `http://${proxyHostRaw}`;
  const proxyUrl = env.proxy.port ? `${proxyWithProtocol}:${env.proxy.port}` : proxyWithProtocol;
  const { HttpProxyAgent } = require("http-proxy-agent");
  const { HttpsProxyAgent } = require("https-proxy-agent");
  httpAgent = new HttpProxyAgent(proxyUrl);
  httpsAgent = new HttpsProxyAgent(proxyUrl);
  console.log("Using proxy from env:", proxyUrl);
}

const INTEL_NPU_DRIVER_URL = "https://www.intel.com/content/www/us/en/download/794734/intel-npu-driver-windows.html";
const OUT_BASE = path.join(__dirname, "..", "out", "npu-compatibility");

function makeTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function createJob(drivers, configPath) {
  const ts = makeTimestamp();
  const dir = path.join(OUT_BASE, ts);
  const metadata = {
    name: ts,
    drivers: drivers,
    configPath: path.resolve(configPath)
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
  console.log("Created task folder", dir);
  return { dir, ...metadata };
}

function findLatestJob() {
  if (!fs.existsSync(OUT_BASE)) return null;
  const items = fs.readdirSync(OUT_BASE).filter((n) => fs.statSync(path.join(OUT_BASE, n)).isDirectory());
  if (!items.length) return null;
  items.sort((a, b) => (a < b ? 1 : -1));
  const dir = path.join(OUT_BASE, items[0]);
  const metadataPath = path.join(dir, "metadata.json");
  if (!fs.existsSync(metadataPath)) return null;
  const metadata = require(metadataPath);
  return { dir, ...metadata };
}

function createWindowsScheduledTask(job) {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(__filename);
  const tr = `"${nodePath}" "${scriptPath}" --continue`;
  console.log("Creating scheduled task", job.name);
  const res = child_process.spawnSync(
    "schtasks",
    ["/Create", "/SC", "ONLOGON", "/TN", job.name, "/TR", tr, "/RL", "HIGHEST", "/F"],
    { encoding: "utf8", stdio: "pipe" }
  );
  if (res.error) {
    throw res.error;
  }
  console.log("Scheduled task created.");
}

function deleteWindowsScheduledTask(job) {
  console.log("Deleting scheduled task", job.name);
  const res = child_process.spawnSync("schtasks", ["/Delete", "/TN", job.name, "/F"], {
    encoding: "utf8",
    stdio: "pipe"
  });
  if (res.error) {
    throw res.error;
  }
  console.log("Scheduled task deleted.");
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      agent: url.startsWith("https:") ? httpsAgent : httpAgent,
      headers: {
        "User-Agent": USER_AGENT
      }
    };
    (url.startsWith("https:") ? https : http)
      .get(url, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchUrl(new URL(res.headers.location, url).toString()));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Request Failed. Status Code: ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject)
      .end();
  });
}

function parseOptionsFromSelect(html, baseUrl) {
  const $ = cheerio.load(html);
  const select = $("select#version-driver-select");
  return [
    ...select.find("option").map((_, el) => {
      const $el = $(el);
      return {
        text: $el.text().match(/[\d.]+/)[0],
        url: new URL($el.attr("value"), baseUrl).toString()
      };
    })
  ].reverse();
}

function findDownloadLink(html, baseUrl) {
  const $ = cheerio.load(html);
  const href = $('[data-wap_ref="download-button"]').attr("data-href");
  return new URL(href, baseUrl).toString();
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function multiSelectPrompt(options) {
  console.log("Found the following versions:");
  options.forEach((o, i) => console.log(`${i + 1}) ${o.text}`));
  console.log("\nSelect versions by index (e.g. 1,3-5) or press Enter to select all.");
  const ans = (await prompt("Your selection: ")).trim();
  if (!ans) return options.map((_, i) => i);
  const parts = ans
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const selected = new Set();
  parts.forEach((p) => {
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => parseInt(x, 10));
      if (!isNaN(a) && !isNaN(b)) {
        for (let k = Math.max(1, a); k <= Math.min(options.length, b); k++) selected.add(k - 1);
      }
    } else {
      const n = parseInt(p, 10);
      if (!isNaN(n) && n >= 1 && n <= options.length) selected.add(n - 1);
    }
  });
  return Array.from(selected).sort((a, b) => a - b);
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const opts = {
      agent: url.startsWith("https:") ? httpsAgent : httpAgent,
      headers: { "User-Agent": USER_AGENT }
    };
    (url.startsWith("https:") ? https : http)
      .get(url, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadToFile(new URL(res.headers.location, url).toString(), dest));
        }
        if (res.statusCode !== 200) return reject(new Error(`Download failed ${url} status ${res.statusCode}`));
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) process.stdout.write(`\rDownloading ${dest} ${((received / total) * 100).toFixed(1)}%`);
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            if (total) process.stdout.write("\n");
            resolve(dest);
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

function removeAllDrivers() {
  let command = "pnputil /enum-devices /class ComputeAccelerator /drivers";
  console.log(command);
  let res = child_process.spawnSync(command, { shell: "powershell" });
  if (res.error) {
    throw res.error;
  }
  const drivers = [
    ...new Set(
      res.output
        .toString()
        .split("\r\n")
        .map((x) => x.split(":"))
        .filter(([k, v]) => k.trim() === "Driver Name")
        .map(([k, v]) => v.trim())
    )
  ];
  for (const driver of drivers) {
    command = `pnputil /delete-driver ${driver} /uninstall`;
    console.log(command);
    res = child_process.spawnSync(command, { shell: "powershell" });
    if (res.error) {
      throw res.error;
    }
    console.log(res.output.toString());
  }
}

function ensureDriver(driver, job) {
  return new Promise(async (resolve, reject) => {
    const sysInfo = await util.getNPUInfo();
    const installedDriverVersion = String(sysInfo?.npuDriverVersion).trim();
    if (String(driver).includes(installedDriverVersion)) {
      console.log(`Driver version ${installedDriverVersion} is already installed.`);
      return resolve();
    }

    removeAllDrivers();

    const html = await fetchUrl(INTEL_NPU_DRIVER_URL);
    const options = parseOptionsFromSelect(html, INTEL_NPU_DRIVER_URL);
    const driverUrl = options.find((o) => o.text.includes(driver)).url;
    const driverHtml = await fetchUrl(driverUrl);
    const downloadLink = findDownloadLink(driverHtml, driverUrl);
    const filename = path.basename(new URL(downloadLink).pathname);
    const driversDir = path.join(__dirname, "..", "out", "drivers");
    fs.mkdirSync(driversDir, { recursive: true });
    const driverPath = path.join(driversDir, filename);
    if (fs.existsSync(driverPath)) {
      console.log("Using cache at", driverPath);
    } else {
      await downloadToFile(downloadLink, driverPath);
      console.log("Downloaded to", driverPath);
    }

    if (path.extname(driverPath) === ".exe") {
      const args = ["-s", "--overwrite"];
      console.log(`Running installer: ${driverPath} ${args.join(" ")}`);
      const child = child_process.spawn(driverPath, args, { stdio: "inherit", shell: true });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 1000) {
          // Success
          resolve();
        } else if (code === 1014) {
          // Success, but to completely apply all required settings/changes the system needs to be restarted
          createWindowsScheduledTask(job);
          console.log("Rebooting...");
          child_process.spawnSync("shutdown", ["/r", "/t", "60", "/f"], { stdio: "inherit", shell: true });
        } else {
          reject(new Error(`Installer exited with code ${code}`));
        }
      });
    } else {
      assert(path.extname(driverPath) === ".zip");
      const destDir = path.join(path.dirname(driverPath), path.basename(driverPath, ".zip"));
      console.log(`Extracting ${driverPath} to ${destDir}`);
      const extract = child_process.spawnSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Path "${driverPath}" -DestinationPath "${destDir}" -Force`],
        { stdio: "inherit", shell: true }
      );
      if (extract.error) {
        return reject(extract.error);
      }

      // 4023 has a nested folder
      const nestedDir = path.join(destDir, path.basename(destDir), "drivers", "x64", "npu.inf");
      if (fs.existsSync(nestedDir)) {
        const srcDrivers = path.join(destDir, path.basename(destDir), "drivers");
        const destDrivers = path.join(destDir, "drivers");
        fs.renameSync(srcDrivers, destDrivers);
      }

      const npuInf = path.join(destDir, "drivers", "x64", "npu.inf");
      console.log("Installing driver:", npuInf);
      const install = child_process.spawnSync("pnputil", ["/add-driver", npuInf, "/install"], {
        stdio: "inherit",
        shell: true
      });
      if (install.error) {
        return reject(install.error);
      }
      createWindowsScheduledTask(job);
      console.log("Rebooting...");
      child_process.spawnSync("shutdown", ["/r", "/t", "60", "/f"], { stdio: "inherit", shell: true });
    }
  });
}

async function runTest(job) {
  console.log(`Using config file: ${job.configPath}`);

  const doneTasks = new Set(
    fs
      .readdirSync(job.dir)
      .filter((n) => n.endsWith(".json") && n !== "metadata.json")
      .map((n) => n.replace(/\.json$/, ""))
  );
  const driver = job.drivers.find((driver) => !doneTasks.has(driver));
  if (!driver) {
    console.log("All tasks completed.");
    return;
  }

  console.log(`Running task on driver version ${driver}...`);
  await ensureDriver(driver, job);

  const config = require(job.configPath);
  config.browserUserData = true;
  config.browserUserDataPath = path.join(os.tmpdir(), "webnn-sample-test", "npu-compatibility");

  let results = { deviceInfo: await util.getDeviceInfo(config), samples: {}, "developer-preview": {} };
  for (const source of ["samples", "developer-preview"]) {
    const samples = config?.[source];
    if (samples) {
      for (const sampleName of Object.keys(samples)) {
        const testModule = require(`./cases/${source}/${sampleName}.js`);
        const resultsSamples = await testModule({ config });
        _.merge(results[source], resultsSamples);
      }
    }
  }

  const outDir = path.join(OUT_BASE, job.name);
  fs.writeFileSync(path.join(outDir, driver + ".json"), JSON.stringify(results, null, 2));

  await runTest(job);
}

program
  .name("npu-driver-compatibility-test")
  .description("Test Intel NPU driver compatibility by installing different versions.")
  .option("-c, --config [path]", "Specify the config file path", "config.json")
  .option("--continue", "Continue the latest job")
  .action(async ({ config: configPath, continue: continue_ }) => {
    fs.mkdirSync(OUT_BASE, { recursive: true });

    let job;
    if (continue_) {
      job = findLatestJob();
      if (!job) throw new Error("No task folder found to continue.");
      deleteWindowsScheduledTask(job);
      console.log("Resuming latest scheduled task", job.name);
    } else {
      console.log("Fetching Intel NPU driver listing...");
      const html = await fetchUrl(INTEL_NPU_DRIVER_URL);
      const availableDrivers = parseOptionsFromSelect(html, INTEL_NPU_DRIVER_URL);
      let selectedIdx;
      while (!selectedIdx || !selectedIdx.length) {
        selectedIdx = await multiSelectPrompt(availableDrivers);
      }
      const drivers = selectedIdx.map((i) => availableDrivers[i].text);
      job = createJob(drivers, configPath);
    }

    await runTest(job);
  })
  .parse();
