const fileInput = document.getElementById('file');
const selectButton = document.getElementById('select');

selectButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  await chrome.storage.local.set({
    pendingPdfData: base64,
    pendingPdfName: file.name,
  });

  window.open(chrome.runtime.getURL('viewer.html'), '_blank');
  window.close();
});

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
