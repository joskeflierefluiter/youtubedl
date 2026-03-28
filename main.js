const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static');

function getYtDlpBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', binaryName);
  }
  return path.join(__dirname, 'bin', binaryName);
}

function getYtDlpClient() {
  return new YTDlpWrap(getYtDlpBinaryPath());
}

function sanitizeFileName(name) {
  return String(name || 'video')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

async function fetchVideoInfo(url) {
  const ytDlp = getYtDlpClient();
  const info = await ytDlp.getVideoInfo(url);

  const title = sanitizeFileName(info && info.title ? info.title : 'video');
  return { title };
}

function buildDownloadOptions(mode, outputTemplate) {
  const commonOptions = [
    '--no-playlist',
    '--restrict-filenames',
    '-o',
    outputTemplate,
    '--ffmpeg-location',
    ffmpegPath
  ];

  if (mode === 'audio') {
    return [...commonOptions, '-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  }

  return [...commonOptions, '-f', 'mp4/best', '--merge-output-format', 'mp4'];
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 680,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

ipcMain.handle('get-video-info', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') {
      throw new Error('Voer een geldige URL in.');
    }

    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      throw new Error('URL moet beginnen met http:// of https://');
    }

    const info = await fetchVideoInfo(trimmedUrl);
    return {
      success: true,
      fileNameBase: info.title
    };
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : 'Kon video-info niet ophalen.'
    };
  }
});

ipcMain.handle('download-video', async (event, payload) => {
  try {
    const url = payload && payload.url ? payload.url : '';
    const mode = payload && payload.mode === 'audio' ? 'audio' : 'video';
    if (!url || typeof url !== 'string') {
      throw new Error('Voer een geldige URL in.');
    }

    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      throw new Error('URL moet beginnen met http:// of https://');
    }

    const downloadsPath = app.getPath('downloads');
    const info = await fetchVideoInfo(trimmedUrl);
    const fileExtension = mode === 'audio' ? 'mp3' : 'mp4';
    const outputTemplate = path.join(downloadsPath, '%(title)s.%(ext)s');
    const suggestedFileName = `${info.title}.${fileExtension}`;

    event.sender.send('download-progress', {
      percent: 0,
      fileName: suggestedFileName,
      status: `Start met downloaden: ${suggestedFileName}`
    });

    const ytDlp = getYtDlpClient();
    const args = [trimmedUrl, ...buildDownloadOptions(mode, outputTemplate)];
    const emitter = ytDlp.exec(args);

    emitter.on('progress', (progress) => {
      event.sender.send('download-progress', {
        percent: progress && Number.isFinite(progress.percent) ? progress.percent : 0,
        fileName: suggestedFileName,
        status:
          progress && Number.isFinite(progress.percent)
            ? `Voortgang: ${progress.percent.toFixed(1)}%`
            : 'Download bezig...'
      });
    });

    await new Promise((resolve, reject) => {
      emitter.once('error', reject);
      emitter.once('close', () => resolve());
    });

    event.sender.send('download-progress', {
      percent: 100,
      fileName: suggestedFileName,
      status: 'Download voltooid.'
    });


    return {
      success: true,
      fileName: suggestedFileName,
      message: `Download voltooid. Bestand opgeslagen in: ${downloadsPath}`
    };
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : 'Onbekende fout tijdens downloaden.'
    };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
