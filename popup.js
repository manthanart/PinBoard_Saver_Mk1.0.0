const $ = id => document.getElementById(id);
let items = [];
let pageTitle = "Pinterest";
let pageUrl = "";
const chosen = new Set();

function safeName(s) {
  return (s || "Pinterest").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g," ").slice(0,80).trim() || "Pinterest";
}

function getBoardName(title, url) {
  // Pinterest board pages typically use "<Board Name> | Pinterest" as the tab title.
  let name = (title || "").replace(/\s*[|–—-]\s*Pinterest.*$/i, "").trim();
  if (!name || /^Pinterest$/i.test(name)) {
    try {
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      // /username/board-name/ is a board page; prefer the second path segment.
      if (parts.length >= 2 && !["pin", "ideas", "search", "today"].includes(parts[0].toLowerCase())) {
        name = decodeURIComponent(parts[1]).replace(/[-_]+/g, " ");
      }
    } catch (_) {}
  }
  return safeName(name || "Pinterest Board");
}
function selectedItems() { return items.filter((_, i) => chosen.has(i)); }
function updateCounts() {
  $("totalCount").textContent = items.length;
  $("selectedCount").textContent = chosen.size;
  $("selectionLabel").textContent = `${chosen.size} selected`;
  $("zipBtn").disabled = chosen.size === 0;
  $("pdfBtn").disabled = chosen.size === 0;
}
function render() {
  $("pageTitle").textContent = pageTitle || "Pinterest";
  let host = "";
  try { host = pageUrl ? new URL(pageUrl).hostname : "Pinterest"; } catch (_) { host = "Pinterest"; }
  $("pageMeta").textContent = items.length ? `${host} · Visible media on this page` : "No pins detected yet.";
  $("mediaGrid").innerHTML = "";
  if (!items.length) {
    $("mediaGrid").innerHTML = '<div class="empty">No media found. Open a Pinterest board, scroll to load pins, then refresh.</div>';
    updateCounts(); return;
  }
  items.forEach((item, i) => {
    const tile = document.createElement("button");
    tile.className = "tile" + (chosen.has(i) ? " selected" : "");
    tile.title = item.title || "Select media";
    if (item.type === "image") {
      const img = document.createElement("img"); img.src = item.url; img.alt = item.title || "Pin preview"; img.loading = "lazy"; tile.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style.cssText = "height:100%;display:grid;place-items:center;color:#555;font-size:25px";
      placeholder.textContent = "▶"; tile.appendChild(placeholder);
    }
    const check = document.createElement("span"); check.className = "check"; check.textContent = chosen.has(i) ? "✓" : "+"; tile.appendChild(check);
    const kind = document.createElement("span"); kind.className = "kind"; kind.textContent = item.type.toUpperCase(); tile.appendChild(kind);
    tile.addEventListener("click", () => { if (chosen.has(i)) chosen.delete(i); else chosen.add(i); render(); });
    $("mediaGrid").appendChild(tile);
  });
  updateCounts();
}
async function activeTab() {
  const tabs = await chrome.tabs.query({active:true,currentWindow:true});
  return tabs[0];
}
async function collectFromTab(tab) {
  try {
    return await chrome.tabs.sendMessage(tab.id, {type:"PBS_COLLECT"});
  } catch (firstError) {
    // A content script may not have been injected into a tab that was already open
    // when the extension was installed/reloaded. Inject it on demand and retry.
    await chrome.scripting.executeScript({target:{tabId:tab.id}, files:["content.js"]});
    await chrome.scripting.insertCSS({target:{tabId:tab.id}, files:["content.css"]});
    return await chrome.tabs.sendMessage(tab.id, {type:"PBS_COLLECT"});
  }
}
async function refresh() {
  $("hint").textContent = "Scanning current page…";
  try {
    const tab = await activeTab();
    if (!tab?.url || !/^https:\/\/([a-z0-9-]+\.)*pinterest\.com\//i.test(tab.url)) {
      items = []; chosen.clear(); pageTitle = "Open Pinterest"; pageUrl = "";
      $("hint").textContent = "Open a Pinterest.com board or pin page first.";
      render(); return;
    }
    const response = await collectFromTab(tab);
    items = Array.isArray(response?.items) ? response.items : [];
    pageTitle = response?.pageTitle || tab.title || "Pinterest";
    pageUrl = response?.pageUrl || tab.url;
    chosen.clear();
    items.forEach((item,i) => { if (item.selected) chosen.add(i); });
    $("hint").textContent = items.length
      ? "Select previews, then export. Scroll and refresh to collect more."
      : "Pinterest loaded, but no media was detected. Scroll until pin images appear, then refresh.";
    render();
  } catch (e) {
    console.error("PinBoard Saver collection error:", e);
    $("hint").textContent = "Could not read this tab. Reload the extension, refresh Pinterest, then try again. Open chrome://extensions → PinBoard Saver → Errors for details.";
  }
}
$("refreshBtn").addEventListener("click", refresh);
$("autoLoadBtn").addEventListener("click", async () => {
  const button = $("autoLoadBtn");
  button.disabled = true;
  button.textContent = "Loading…";
  $("hint").textContent = "Auto-scrolling the board and collecting pins. Keep this popup open.";
  try {
    const tab = await activeTab();
    if (!tab?.url || !/^https:\/\/([a-z0-9-]+\.)*pinterest\.com\//i.test(tab.url)) {
      $("hint").textContent = "Open a Pinterest board first.";
      return;
    }
    const response = await collectFromTabWithMessage(tab, {type:"PBS_AUTO_COLLECT"});
    items = Array.isArray(response?.items) ? response.items : [];
    pageTitle = response?.pageTitle || tab.title || "Pinterest";
    pageUrl = response?.pageUrl || tab.url;
    chosen.clear();
    items.forEach((_, i) => chosen.add(i));
    $("hint").textContent = response?.reason === "safety-limit"
      ? `Collected ${items.length} unique items; stopped at the safety limit. Scroll further and run again if needed.`
      : `Collected ${items.length} unique items. Review selection, then export.`;
    render();
  } catch (e) {
    console.error("PinBoard Saver auto-load error:", e);
    $("hint").textContent = "Auto-load failed. Refresh Pinterest and try again; check chrome://extensions → Errors if it repeats.";
  } finally {
    button.disabled = false;
    button.textContent = "Auto-load board";
  }
});
async function collectFromTabWithMessage(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    await chrome.scripting.executeScript({target:{tabId:tab.id}, files:["content.js"]});
    await chrome.scripting.insertCSS({target:{tabId:tab.id}, files:["content.css"]});
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}
$("selectAllBtn").addEventListener("click", async () => {
  if (chosen.size === items.length) chosen.clear(); else items.forEach((_,i)=>chosen.add(i));
  render();
});
function bytes(str) { return new TextEncoder().encode(str); }
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;
})();
function crc32(data) { let c=0xffffffff; for(const b of data)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function u16(n){return [n&255,(n>>>8)&255]} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function concat(parts){const size=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function zipStore(entries) {
  const local=[], central=[]; let offset=0;
  for(const entry of entries){
    const name=bytes(entry.name), data=entry.data, crc=crc32(data);
    const lh=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    local.push(lh,name,data);
    const ch=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);
    central.push(ch,name); offset += lh.length+name.length+data.length;
  }
  const cdir=concat(central), end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(cdir.length),...u32(offset),...u16(0)]);
  return concat([...local,cdir,end]);
}
async function fetchMedia(item) {
  const response = await fetch(item.url, {credentials:"include"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
$("zipBtn").addEventListener("click", async () => {
  const chosenItems = selectedItems(); if (!chosenItems.length) return;
  $("zipBtn").disabled = true; $("hint").textContent = `Preparing ZIP (0/${chosenItems.length})…`;
  const entries = []; let done=0, skipped=0;
  for (const item of chosenItems) {
    try {
      const data = await fetchMedia(item);
      const ext = item.type === "video" ? "mp4" : (item.url.match(/\.(png|webp|gif|jpeg|jpg)(?:[?#]|$)/i)?.[1] || "jpg");
      entries.push({name:`${String(entries.length+1).padStart(3,"0")}-${safeName(item.title)}.${ext}`,data});
    } catch(e) { skipped++; }
    done++; $("hint").textContent = `Preparing ZIP (${done}/${chosenItems.length})…`;
  }
  // Prefer the Pinterest board name from the page title/URL and use the requested
  // "Board Download" suffix for the exported archive.
  const boardName = getBoardName(pageTitle, pageUrl);
  if (entries.length) downloadBlob(new Blob([zipStore(entries)],{type:"application/zip"}), `${boardName}.zip`);
  $("hint").textContent = `ZIP ready: ${boardName}.zip · ${entries.length} saved${skipped ? `, ${skipped} unavailable` : ""}.`;
  $("zipBtn").disabled = false;
});
async function imageToJpeg(item) {
  const blob = new Blob([await fetchMedia(item)]);
  const bitmap = await createImageBitmap(blob);
  const maxW=1000, scale=Math.min(1,maxW/bitmap.width);
  const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.86));
  return {bytes:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height};
}
function pdfEscape(s){return String(s||"").replace(/[^\x20-\x7E]/g," ").replace(/([\\()])/g,"\\$1").slice(0,100);}
function makePdf(pages) {
  // Assemble PDF as byte arrays so JPEG bytes remain binary-safe.
  const enc = s => new TextEncoder().encode(s);
  const objects = [];
  const add = chunks => { objects.push(Array.isArray(chunks) ? chunks : [enc(chunks)]); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const kids = [];
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((p, i) => {
    const imageHeader = enc(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    const imageId = add([imageHeader, p.jpeg, enc("\nendstream")]);
    const imageH = Math.min(690, 510 * p.height / p.width);
    const y = 760 - imageH;
    const content = `BT /F1 13 Tf 42 800 Td (${pdfEscape(p.title)}) Tj ET\nq 510 0 0 ${imageH.toFixed(2)} 42 ${Math.max(55,y).toFixed(2)} cm /Im${i} Do Q`;
    const contentBytes = enc(content);
    const contentId = add([enc(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, enc("\nendstream")]);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << /Im${i} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${pageId} 0 R`);
  });

  objects[catalogId - 1] = [enc(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)];
  objects[pagesId - 1] = [enc(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`)];

  const chunks = [enc("%PDF-1.4\n")];
  let offset = chunks[0].length;
  const offsets = [0];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    const head = enc(`${i + 1} 0 obj\n`);
    const tail = enc("\nendobj\n");
    chunks.push(head, ...parts, tail);
    offset += head.length + parts.reduce((sum, p) => sum + p.length, 0) + tail.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  chunks.push(enc(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  const total = chunks.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of chunks) { out.set(part, pos); pos += part.length; }
  return new Blob([out], { type: "application/pdf" });
}
$("pdfBtn").addEventListener("click", async () => {
  const chosenItems=selectedItems().filter(i=>i.type==="image");
  if(!chosenItems.length){$("hint").textContent="PDF export needs at least one selected image. Videos can be exported in ZIP.";return;}
  $("pdfBtn").disabled=true;$("hint").textContent=`Building PDF (0/${chosenItems.length})…`;
  const pages=[];
  for(let i=0;i<chosenItems.length;i++){
    try { const img=await imageToJpeg(chosenItems[i]);pages.push({...img,jpeg:img.bytes,title:chosenItems[i].title||`Pin ${i+1}`}); }
    catch(e) {}
    $("hint").textContent=`Building PDF (${i+1}/${chosenItems.length})…`;
  }
  if(pages.length)downloadBlob(makePdf(pages),`${safeName(pageTitle)}-pins.pdf`);
  $("hint").textContent=`PDF ready: ${pages.length} image page(s). Videos are omitted from PDF.`;
  $("pdfBtn").disabled=false;
});
refresh();