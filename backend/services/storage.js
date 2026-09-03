const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SELFIES_DIR = path.join(DATA_DIR, 'selfies');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbnails');

for (const dir of [DATA_DIR, SELFIES_DIR, VIDEOS_DIR, THUMBS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`[storage] failed to delete ${filePath}:`, err.message);
    }
  });
}

module.exports = {
  DATA_DIR,
  SELFIES_DIR,
  VIDEOS_DIR,
  THUMBS_DIR,
  safeUnlink
};
