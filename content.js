(() => {
  if (window.__pinBoardSaverLoaded) return;
  window.__pinBoardSaverLoaded = true;

  const selected = new Set();
  const idFor = (el) => {
    if (!el.dataset.pbsId) el.dataset.pbsId = "pbs-" + Math.random().toString(36).slice(2, 11);
    return el.dataset.pbsId;
  };
  const bestImageUrl = (img) => {
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map(s => s.trim().split(/\s+/)).filter(p => p[0]);
      if (candidates.length) return candidates[candidates.length - 1][0];
    }
    return img.currentSrc || img.src || "";
  };
  const cardFor = (node) => node.closest('[data-test-id="pin"], [data-test-id="pinWrapper"], article, div[data-grid-item="true"]') || node.parentElement;
  const getMedia = (card) => {
    const video = card.querySelector("video");
    if (video) {
      const src = video.currentSrc || video.src || video.querySelector("source")?.src || "";
      if (src) return { url: src, type: "video", title: card.querySelector("h1,h2,[title]")?.textContent?.trim() || "Pinterest-video" };
    }
    const imgs = [...card.querySelectorAll("img")].filter(i => i.naturalWidth > 100 && i.naturalHeight > 100);
    if (!imgs.length) return null;
    imgs.sort((a,b) => (b.naturalWidth*b.naturalHeight) - (a.naturalWidth*a.naturalHeight));
    const img = imgs[0];
    const url = bestImageUrl(img);
    if (!url || url.startsWith("data:")) return null;
    return {
      url,
      type: "image",
      title: img.alt || card.querySelector("h1,h2,[title]")?.textContent?.trim() || "Pinterest-pin",
      pinUrl: card.querySelector('a[href*="/pin/"]')?.href || location.href,
      cardId: idFor(card)
    };
  };

  function decorate() {
    const imgs = document.querySelectorAll('img[src*="pinimg.com"], img[srcset*="pinimg.com"]');
    imgs.forEach(img => {
      const card = cardFor(img);
      if (!card || card.querySelector(":scope > .pbs-hover-download")) return;
      const media = getMedia(card);
      if (!media) return;
      if (getComputedStyle(card).position === "static") card.classList.add("pbs-positioned");
      const btn = document.createElement("button");
      btn.className = "pbs-hover-download";
      btn.type = "button";
      btn.textContent = "↓ Save";
      btn.title = "Download this pin";
      btn.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const latest = getMedia(card);
        if (latest) downloadOne(latest);
      });
      card.appendChild(btn);
      const selectBtn = document.createElement("button");
      selectBtn.className = "pbs-hover-select";
      selectBtn.type = "button";
      selectBtn.textContent = selected.has(media.cardId) ? "✓" : "+";
      selectBtn.title = "Select pin for export";
      selectBtn.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const id = media.cardId;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        selectBtn.textContent = selected.has(id) ? "✓" : "+";
        selectBtn.classList.toggle("pbs-selected", selected.has(id));
        chrome.storage.local.set({ pbsSelected: [...selected] });
      });
      card.appendChild(selectBtn);
    });
  }

  function safeName(s) {
    return (s || "Pinterest-pin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").slice(0, 90).trim() || "Pinterest-pin";
  }
  function downloadOne(media) {
    chrome.runtime.sendMessage({
      type: "PBS_DOWNLOAD_URL",
      url: media.url,
      filename: "PinBoard-Saver/" + safeName(media.title) + (media.type === "video" ? ".mp4" : ".jpg")
    }, result => {
      if (!result?.ok) alert("Could not start download. The media may require a Pinterest session or may not expose a direct URL.");
    });
  }

  function collect() {
    const result = [];
    const seen = new Set();
    document.querySelectorAll('img[src*="pinimg.com"], img[srcset*="pinimg.com"], video').forEach(node => {
      const card = cardFor(node);
      if (!card) return;
      const media = getMedia(card);
      if (!media || seen.has(media.url)) return;
      seen.add(media.url);
      media.selected = selected.has(media.cardId);
      result.push(media);
    });
    return result;
  }

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let autoCollectRunning = false;

  async function autoCollectAll() {
    if (autoCollectRunning) return { items: collect(), stopped: true, reason: "already-running" };
    autoCollectRunning = true;
    const all = new Map();
    const addVisible = () => {
      decorate();
      for (const item of collect()) {
        const key = item.url;
        if (key && !all.has(key)) all.set(key, item);
      }
      return all.size;
    };

    let stagnantRounds = 0;
    let previousCount = 0;
    let rounds = 0;
    const maxRounds = 160;
    const maxStagnantRounds = 8;
    try {
      addVisible();
      while (rounds < maxRounds && stagnantRounds < maxStagnantRounds) {
        rounds++;
        const beforeHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
        const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
        window.scrollBy({ top: step, left: 0, behavior: "instant" });
        await wait(850);
        addVisible();

        const afterHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
        const count = all.size;
        if (count > previousCount) {
          previousCount = count;
          stagnantRounds = 0;
        } else {
          stagnantRounds++;
        }

        // A few extra checks at the bottom allow late-loading pins to appear.
        if (window.scrollY + window.innerHeight >= afterHeight - 20 && afterHeight <= beforeHeight && count === previousCount) {
          stagnantRounds++;
        }
      }
      // Collect once more after reaching the apparent end.
      await wait(500);
      addVisible();
      return {
        items: [...all.values()],
        rounds,
        stopped: true,
        reason: rounds >= maxRounds ? "safety-limit" : "end-or-no-new-pins"
      };
    } finally {
      autoCollectRunning = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "PBS_COLLECT") {
      decorate();
      sendResponse({ items: collect(), pageTitle: document.title, pageUrl: location.href });
    }
    if (msg?.type === "PBS_SELECT_ALL") {
      collect().forEach(item => { if (item.cardId) selected.add(item.cardId); });
      decorate();
      chrome.storage.local.set({ pbsSelected: [...selected] });
      sendResponse({ ok: true });
    }
    if (msg?.type === "PBS_AUTO_COLLECT") {
      autoCollectAll().then(result => sendResponse({ ...result, pageTitle: document.title, pageUrl: location.href }))
        .catch(error => sendResponse({ error: String(error), items: collect() }));
      return true;
    }
    if (msg?.type === "PBS_DOWNLOAD_ONE" && msg.item) {
      downloadOne(msg.item); sendResponse({ ok: true });
    }
  });

  chrome.storage.local.get(["pbsSelected"], data => (data.pbsSelected || []).forEach(id => selected.add(id)));
  decorate();
  const observer = new MutationObserver(() => decorate());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();