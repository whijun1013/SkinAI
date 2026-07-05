const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function walkFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, result);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

function hasMojibake(value) {
  return typeof value === "string" && (value.includes("�") || /[?][\u0080-\uFFFF]/.test(value));
}

function main() {
  const app = readJson("app.json").expo;
  const eas = readJson("eas.json");
  const failures = [];
  const warnings = [];

  if (!app.version) failures.push("app.version is required");
  if (!app.ios?.bundleIdentifier) failures.push("ios.bundleIdentifier is required");
  if (!app.ios?.buildNumber) failures.push("ios.buildNumber is required");
  if (!app.android?.package) failures.push("android.package is required");
  if (!Number.isInteger(app.android?.versionCode)) failures.push("android.versionCode must be an integer");

  const buildProperties = (app.plugins || []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
  );
  const targetSdk = buildProperties?.[1]?.android?.targetSdkVersion;
  if (!targetSdk || targetSdk < 35) failures.push("android targetSdkVersion must be 35 or higher");

  if (eas.build?.production?.android?.buildType !== "app-bundle") {
    failures.push("EAS production android.buildType must be app-bundle");
  }
  if (!eas.build?.production?.ios) failures.push("EAS production ios profile is required");
  if (!eas.submit?.production?.ios) warnings.push("EAS submit.production.ios is empty");

  const permissionStrings = [
    ...Object.values(app.ios?.infoPlist || {}),
    ...((app.plugins || []).flatMap((plugin) => (Array.isArray(plugin) ? Object.values(plugin[1] || {}) : []))),
  ];
  for (const value of permissionStrings) {
    if (!value || hasMojibake(value)) failures.push(`Invalid permission string: ${value}`);
  }

  const privacy = app.ios?.privacyManifests;
  if (!privacy) {
    failures.push("ios.privacyManifests is required");
  } else {
    if (privacy.NSPrivacyTracking !== false) failures.push("NSPrivacyTracking must be false");
    if (!Array.isArray(privacy.NSPrivacyTrackingDomains)) failures.push("NSPrivacyTrackingDomains must be an array");
    if (!Array.isArray(privacy.NSPrivacyCollectedDataTypes)) failures.push("NSPrivacyCollectedDataTypes must be an array");
    if (!Array.isArray(privacy.NSPrivacyAccessedAPITypes)) failures.push("NSPrivacyAccessedAPITypes must be an array");
  }

  const consoleLogFiles = walkFiles(path.join(ROOT, "src")).filter((file) => {
    if (file.endsWith(path.join("src", "utils", "devLogger.js"))) return false;
    return fs.readFileSync(file, "utf8").includes("console.log");
  });
  if (consoleLogFiles.length) {
    warnings.push(`console.log remains in ${consoleLogFiles.length} source files`);
  }

  const result = { ok: failures.length === 0, failures, warnings };
  console.log(JSON.stringify(result, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main();
