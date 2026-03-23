const fs = require('fs'); //fs means file system, this lets us read/write files
const path = require('path'); //helps build file paths correctly across different OS's

const dataPath = path.join(__dirname, 'data.jason'); //__dirname is the folder for this file, this builds the full path to data.json in the same folder

// Loads the data from data.json
function loadData() {
  // Check if data.json exists, if not, create it with empty {}
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({}));
  }
  // Read and convert file from JSON text into a JavaScript object
  return JSON.parse(fs.readFileSync(dataPath));
}

// Saves data back to data.json
function saveData(data) {
  // Convert JavaScript object back into JSON text and write it
  // The "null, 2" part makes the JSON file readable if it's opened
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

//Make both functions available to other files
module.exports = { loadData, saveData };