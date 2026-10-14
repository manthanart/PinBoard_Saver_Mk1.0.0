chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PBS_DOWNLOAD_URL") {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || "PinBoard-Saver/download",
      conflictAction: "uniquify",
      saveAs: false
    }).then(id => sendResponse({ ok: true, id }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});