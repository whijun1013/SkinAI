const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function walkFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, result);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) result.push(fullPath);
  }
  return result;
}

function hasInvalidPermissionText(value) {
  return typeof value !== "string" || !value.trim() || value.includes("\uFFFD") || value.includes("?");
}

function collectPermissionStrings(value, key = "") {
  if (typeof value === "string") return /(UsageDescription|Permission)$/.test(key) ? [value] : [];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([childKey, childValue]) => collectPermissionStrings(childValue, childKey));
}

function main() {
  const app = readJson("app.json").expo;
  const eas = readJson("eas.json");
  const failures = [];
  const warnings = [];
  const isProduction = process.env.RELEASE_MODE === "production";

  if (!app.version) failures.push("app.version is required");
  if (!app.ios?.bundleIdentifier) failures.push("ios.bundleIdentifier is required");
  if (!app.ios?.buildNumber) failures.push("ios.buildNumber is required");
  if (!app.android?.package) failures.push("android.package is required");
  if (!Number.isInteger(app.android?.versionCode)) failures.push("android.versionCode must be an integer");

  const buildProperties = (app.plugins || []).find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties");
  if (!buildProperties?.[1]?.android?.targetSdkVersion || buildProperties[1].android.targetSdkVersion < 35) {
    failures.push("android targetSdkVersion must be 35 or higher");
  }
  if (eas.build?.production?.android?.buildType !== "app-bundle") failures.push("EAS production android.buildType must be app-bundle");
  if (!eas.build?.production?.ios) failures.push("EAS production ios profile is required");
  for (const profile of ["development", "preview", "production"]) {
    if (eas.build?.[profile]?.environment !== profile) failures.push(`EAS ${profile} profile must use the ${profile} environment`);
  }

  const iosSubmit = eas.submit?.production?.ios || {};
  if (iosSubmit.ascAppId && iosSubmit.ascAppId !== "USER_MUST_SET") failures.push("ascAppId should not be hardcoded in eas.json. Use EAS secrets/ENV vars.");
  if (iosSubmit.appleId && iosSubmit.appleId !== "USER_MUST_SET") failures.push("appleId should not be hardcoded in eas.json. Use EAS secrets/ENV vars.");
  if (iosSubmit.ascAppId === "USER_MUST_SET" || iosSubmit.appleId === "USER_MUST_SET") warnings.push("Configure App Store Connect before running eas submit.");

  for (const value of [...collectPermissionStrings(app.ios?.infoPlist), ...((app.plugins || []).flatMap((plugin) => Array.isArray(plugin) ? collectPermissionStrings(plugin[1]) : []))]) {
    if (hasInvalidPermissionText(value)) failures.push("Invalid permission string detected");
  }

  const privacy = app.ios?.privacyManifests;
  if (!privacy) failures.push("ios.privacyManifests is required");
  else {
    if (privacy.NSPrivacyTracking !== false) failures.push("NSPrivacyTracking must be false");
    if (!Array.isArray(privacy.NSPrivacyAccessedAPITypes) || !privacy.NSPrivacyAccessedAPITypes.some((item) => item.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults")) failures.push("NSPrivacyAccessedAPICategoryUserDefaults must be declared in privacy manifest");
  }

  if (isProduction) {
    if (!process.env.API_BASE_URL?.startsWith("https://")) failures.push("API_BASE_URL must be set and use https in production");
    if (!process.env.OAUTH_BASE_URL?.startsWith("https://")) failures.push("OAUTH_BASE_URL must be set and use https in production");
    if (process.env.AI_PROVIDER_CONFIRMED !== "true") failures.push("AI_PROVIDER_CONFIRMED must be 'true' in production to ensure AI legal compliance is met");
  }

  const consoleLogFiles = walkFiles(path.join(ROOT, "src")).filter((file) => !file.endsWith(path.join("src", "utils", "devLogger.js")) && fs.readFileSync(file, "utf8").includes("console.log"));
  if (consoleLogFiles.length) warnings.push(`console.log remains in ${consoleLogFiles.length} source files`);

  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main();
