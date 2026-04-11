console.log("ChromePDF: Loading...");

chrome.action.onClicked.addListener((tab) => {
  console.log("ChromePDF: Action clicked for tab", tab?.id);
  if (tab?.id) {
    chrome.tabs.update(tab.id, {
      url: chrome.runtime.getURL("viewer.html")
    });
  }
});

console.log("ChromePDF: Ready");
