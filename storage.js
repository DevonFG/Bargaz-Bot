import fs from "fs";
import path from "path";
import fileURLToPath from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "botconfig.json");

// Loads the data from data.json
export function loadData() {
  // Check if data.json exists, if not, create it with empty {}
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({}));
  }
  // Read and convert file from JSON text into a JavaScript object
  return JSON.parse(fs.readFileSync(dataPath));
}

// Saves data back to data.json
export function saveData(data) {
  // Convert JavaScript object back into JSON text and write it
  // The "null, 2" part makes the JSON file readable if it's opened
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}