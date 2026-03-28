const fs = require('fs');
const https = require('https');
const path = require('path');

function getBinaryName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function getDownloadUrl() {
  if (process.platform === 'darwin') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  }
  if (process.platform === 'win32') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  }
  if (process.platform === 'linux') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  }
  throw new Error(`Unsupported platform for auto-download: ${process.platform}`);
}

function looksLikePythonZipapp(binaryPath) {
  if (!fs.existsSync(binaryPath)) {
    return false;
  }
  const header = fs.readFileSync(binaryPath).subarray(0, 256).toString('utf8');
  return header.includes('#!/usr/bin/env python3');
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download yt-dlp. HTTP ${response.statusCode}`));
        return;
      }

      const tempPath = `${destination}.tmp`;
      const out = fs.createWriteStream(tempPath);
      response.pipe(out);

      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tempPath, destination);
          resolve();
        });
      });

      out.on('error', (error) => {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (_cleanupError) {}
        reject(error);
      });
    });

    request.on('error', reject);
  });
}

async function ensureBinary() {
  const projectRoot = process.cwd();
  const binDir = path.join(projectRoot, 'bin');
  const binaryPath = path.join(binDir, getBinaryName());

  fs.mkdirSync(binDir, { recursive: true });

  const needsDownload = !fs.existsSync(binaryPath) || looksLikePythonZipapp(binaryPath);
  if (needsDownload) {
    const url = getDownloadUrl();
    console.log(`Downloading standalone yt-dlp binary for ${process.platform}...`);
    await downloadFile(url, binaryPath);
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  if (looksLikePythonZipapp(binaryPath)) {
    throw new Error('Downloaded yt-dlp is still a Python zipapp. Standalone binary expected.');
  }

  console.log(`yt-dlp binary ready: ${binaryPath}`);
}

ensureBinary().catch((error) => {
  console.error(error);
  process.exit(1);
});
