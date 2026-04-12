// Content script - injects a floating button on PDF pages
(function() {
  console.log("ChromePDF content script loaded on:", window.location.href);

  // Skip file:// URLs — injecting into Chrome's native PDF renderer for local files
  // interferes with its frame setup. Local PDFs can be opened via the toolbar button.
  if (window.location.href.startsWith('file://')) {
    console.log("ChromePDF: Skipping file:// URL");
    return;
  }

  // Check if this looks like a PDF
  const isPdf = window.location.href.endsWith('.pdf') ||
                document.contentType === 'application/pdf' ||
                document.querySelector('embed[type="application/pdf"]') ||
                document.querySelector('object[data*=".pdf"]');

  if (!isPdf && !window.location.href.includes('.pdf')) {
    console.log("ChromePDF: Not a PDF page, skipping");
    return;
  }

  // Create floating button
  const button = document.createElement('button');
  button.textContent = '📝 Annotate';
  button.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    z-index: 999999 !important;
    padding: 12px 20px !important;
    background: #2196F3 !important;
    color: white !important;
    border: none !important;
    border-radius: 8px !important;
    font-size: 14px !important;
    font-weight: bold !important;
    cursor: pointer !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
  `;

  button.addEventListener('click', async () => {
    console.log("ChromePDF: Annotate clicked");

    if (window.location.href.startsWith('file://')) {
      // For file:// URLs, we can't fetch directly in MV3 content script
      // So we open viewer and have user re-select the file
      console.log("ChromePDF: file:// URL detected, opening viewer");
      window.open(chrome.runtime.getURL('viewer.html') + '?mode=local', '_blank');
    } else {
      // For web URLs, pass via URL parameter
      const viewerUrl = chrome.runtime.getURL('viewer.html') + '?url=' + encodeURIComponent(window.location.href);
      console.log("ChromePDF: Opening viewer at", viewerUrl);
      window.open(viewerUrl, '_blank');
    }
  });

  document.body.appendChild(button);
  console.log("ChromePDF button injected");
})();
