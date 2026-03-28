const urlInput = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const audioBtn = document.getElementById('audioBtn');
const statusText = document.getElementById('status');
const filePreview = document.getElementById('filePreview');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let removeProgressListener = null;

function setStatus(message, type = '') {
  statusText.textContent = message;
  statusText.className = type;
}

function setButtonsDisabled(disabled) {
  downloadBtn.disabled = disabled;
  audioBtn.disabled = disabled;
}

function setProgress(percent, label = '') {
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  progressBar.value = safePercent;
  progressText.textContent = label || `Voortgang: ${safePercent.toFixed(1)}%`;
}

async function updatePreview(mode) {
  const url = urlInput.value.trim();
  if (!url) {
    filePreview.textContent = '';
    return null;
  }

  const info = await window.electronAPI.getVideoInfo(url);
  if (!info || !info.success) {
    throw new Error((info && info.message) || 'Kon bestandsnaam niet ophalen.');
  }

  const extension = mode === 'audio' ? 'mp3' : 'mp4';
  const previewName = `${info.fileNameBase}.${extension}`;
  filePreview.textContent = `Bestand: ${previewName}`;
  return previewName;
}

async function startDownload(mode) {
  const url = urlInput.value.trim();

  if (!url) {
    setStatus('Vul eerst een YouTube URL in.', 'error');
    return;
  }

  setButtonsDisabled(true);
  setProgress(0, 'Wacht op progress...');
  setStatus('Bezig met downloaden, even geduld...', '');

  try {
    await updatePreview(mode);

    if (removeProgressListener) {
      removeProgressListener();
    }

    removeProgressListener = window.electronAPI.onDownloadProgress((data) => {
      if (!data) {
        return;
      }

      if (data.fileName) {
        filePreview.textContent = `Bestand: ${data.fileName}`;
      }

      const progressLabel = data.status || (Number.isFinite(data.percent) ? `Voortgang: ${data.percent.toFixed(1)}%` : '');
      setProgress(typeof data.percent === 'number' ? data.percent : progressBar.value, progressLabel);
    });

    const result = await window.electronAPI.downloadVideo({ url, mode });

    if (result && result.success) {
      setStatus(result.message || 'Download voltooid.', 'success');
      setProgress(100, 'Voltooid: 100%');
    } else {
      setStatus((result && result.message) || 'Download mislukt.', 'error');
    }
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Er ging iets mis.', 'error');
  } finally {
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
    setButtonsDisabled(false);
  }
}

downloadBtn.addEventListener('click', () => startDownload('video'));
audioBtn.addEventListener('click', () => startDownload('audio'));

let previewDebounce = null;
urlInput.addEventListener('input', () => {
  if (previewDebounce) {
    clearTimeout(previewDebounce);
  }

  previewDebounce = setTimeout(async () => {
    try {
      await updatePreview('video');
      setStatus('', '');
    } catch (_error) {
      filePreview.textContent = '';
    }
  }, 450);
});

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    startDownload('video');
  }
});
