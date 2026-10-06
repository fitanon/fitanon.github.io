/**
 * Staff QR overlay for portal.fitclinic.io/#/admin
 *
 * Loads on the live staff portal (via bookmarklet) and adds Show / Print QR
 * actions for every client row. Uses POST /api/qr/generate so a QR can be
 * created without logging in as that client. Does not check the client in.
 */
(function () {
  var TOOL_ID = "tfc-staff-qr-root";
  var QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
  var GENERATE_PATH = "/api/qr/generate";

  if (window.__tfcStaffQr && typeof window.__tfcStaffQr.open === "function") {
    window.__tfcStaffQr.open();
    return;
  }

  var cache = {};
  var qrLibPromise = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function loadQrLib() {
    if (typeof window.qrcode === "function") return Promise.resolve();
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = QR_LIB;
      s.async = true;
      s.onload = function () {
        if (typeof window.qrcode === "function") resolve();
        else reject(new Error("QR library loaded without qrcode()"));
      };
      s.onerror = function () {
        reject(new Error("Could not load QR library"));
      };
      document.head.appendChild(s);
    });
    return qrLibPromise;
  }

  function makeQrDataUrl(text, cellSize) {
    var qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(cellSize || 6, 8);
  }

  function scrapeClients() {
    var tables = document.querySelectorAll("table");
    var clients = [];
    var seen = {};

    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var headers = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
        return (th.textContent || "").trim().toLowerCase();
      });
      var nameIdx = headers.indexOf("name");
      var codeIdx = headers.indexOf("login code");
      if (nameIdx < 0 || codeIdx < 0) continue;

      var rows = table.querySelectorAll("tbody tr");
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].querySelectorAll("td");
        if (cells.length <= Math.max(nameIdx, codeIdx)) continue;
        var name = (cells[nameIdx].textContent || "").replace(/\s+/g, " ").trim();
        var code = (cells[codeIdx].textContent || "").replace(/\s+/g, "").trim().toUpperCase();
        if (!code || code === "—" || seen[code]) continue;
        seen[code] = true;
        clients.push({ name: name || code, loginCode: code });
      }
    }
    return clients;
  }

  function generateQr(loginCode) {
    var code = String(loginCode || "").trim().toUpperCase();
    if (!code) return Promise.reject(new Error("Missing login code"));
    if (cache[code] && cache[code].checkinUrl) return Promise.resolve(cache[code]);

    return fetch(GENERATE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginCode: code }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || "Could not generate QR code");
        cache[code] = body;
        return body;
      });
    });
  }

  function displayName(payload, fallback) {
    var fromApi = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();
    return fromApi || fallback || "Client";
  }

  function printCards(cards) {
    var win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      alert("Allow pop-ups to print QR codes.");
      return;
    }
    var items = cards.map(function (card) {
      return (
        '<article class="card">' +
          '<img alt="Check-in QR for ' + escapeHtml(card.name) + '" src="' + card.dataUrl + '" />' +
          "<h1>" + escapeHtml(card.name) + "</h1>" +
          '<p class="code">' + escapeHtml(card.loginCode) + "</p>" +
          '<p class="hint">Show this QR at the front desk. Scanning it checks the client in.</p>' +
        "</article>"
      );
    }).join("");

    win.document.write(
      "<!DOCTYPE html><html><head><title>Client check-in QR codes</title>" +
      "<style>" +
      "html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Inter,system-ui,sans-serif;}" +
      ".wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;padding:24px;}" +
      ".card{border:1px solid #ddd;border-radius:16px;padding:20px;text-align:center;break-inside:avoid;page-break-inside:avoid;}" +
      ".card img{width:220px;height:220px;background:#fff;}" +
      "h1{font-size:16px;margin:12px 0 4px;font-weight:600;}" +
      ".code{font-family:ui-monospace,Menlo,monospace;letter-spacing:.12em;font-size:13px;margin:0;}" +
      ".hint{font-size:11px;color:#555;margin:8px 0 0;}" +
      "@media print{.wrap{padding:0;gap:16px;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}" +
      "</style></head><body><div class='wrap'>" + items + "</div>" +
      "<script>window.addEventListener('load',function(){window.focus();window.print();});</scr" + "ipt>" +
      "</body></html>"
    );
    win.document.close();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureUi() {
    var existing = document.getElementById(TOOL_ID);
    if (existing) return existing;

    var style = document.createElement("style");
    style.textContent =
      "#" + TOOL_ID + "{all:initial;position:fixed;z-index:2147483000;right:16px;bottom:16px;font-family:Inter,system-ui,sans-serif;}" +
      "#" + TOOL_ID + " *{box-sizing:border-box;font-family:inherit;}" +
      "#" + TOOL_ID + " .tfc-panel{width:min(360px,calc(100vw - 24px));max-height:min(72vh,640px);display:flex;flex-direction:column;background:#141414;color:#f0ebe3;border:1px solid #333;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.45);overflow:hidden;}" +
      "#" + TOOL_ID + " .tfc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid #2a2a2a;}" +
      "#" + TOOL_ID + " .tfc-head h2{margin:0;font-size:14px;font-weight:600;}" +
      "#" + TOOL_ID + " .tfc-actions{display:flex;gap:6px;}" +
      "#" + TOOL_ID + " button{appearance:none;border:0;cursor:pointer;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;}" +
      "#" + TOOL_ID + " .btn-gold{background:linear-gradient(135deg,#c9a96e,#a3832a);color:#0a0a0a;}" +
      "#" + TOOL_ID + " .btn-ghost{background:#1f1f1f;color:#f0ebe3;border:1px solid #333;}" +
      "#" + TOOL_ID + " .tfc-body{overflow:auto;padding:8px;}" +
      "#" + TOOL_ID + " .tfc-note{margin:0 8px 8px;font-size:11px;color:#a39e93;line-height:1.4;}" +
      "#" + TOOL_ID + " .tfc-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border-radius:10px;}" +
      "#" + TOOL_ID + " .tfc-row:hover{background:#1a1a1a;}" +
      "#" + TOOL_ID + " .tfc-name{font-size:13px;font-weight:500;}" +
      "#" + TOOL_ID + " .tfc-code{font-size:11px;color:#c9a96e;font-family:ui-monospace,Menlo,monospace;letter-spacing:.08em;}" +
      "#" + TOOL_ID + " .tfc-empty{padding:18px 12px;text-align:center;font-size:12px;color:#a39e93;}" +
      "#" + TOOL_ID + " .tfc-fab{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#c9a96e,#a3832a);color:#0a0a0a;font-weight:700;font-size:14px;box-shadow:0 10px 24px rgba(0,0,0,.35);}" +
      "#" + TOOL_ID + " .tfc-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;}" +
      "#" + TOOL_ID + " .tfc-dialog{width:min(360px,100%);background:#141414;border:1px solid #333;border-radius:16px;padding:20px;text-align:center;}" +
      "#" + TOOL_ID + " .tfc-dialog img{width:220px;height:220px;background:#fff;border-radius:12px;padding:10px;}" +
      "#" + TOOL_ID + " .tfc-dialog h3{margin:12px 0 4px;font-size:16px;}" +
      "#" + TOOL_ID + " .tfc-status{font-size:12px;color:#a39e93;min-height:1.2em;}" +
      "#" + TOOL_ID + ".is-collapsed .tfc-panel{display:none;}";

    var root = document.createElement("div");
    root.id = TOOL_ID;
    root.innerHTML =
      '<button type="button" class="tfc-fab" hidden title="Client QR codes">QR</button>' +
      '<div class="tfc-panel">' +
        '<div class="tfc-head">' +
          "<h2>Client QR codes</h2>" +
          '<div class="tfc-actions">' +
            '<button type="button" class="btn-gold" data-act="print-all">Print all</button>' +
            '<button type="button" class="btn-ghost" data-act="collapse">Hide</button>' +
          "</div>" +
        "</div>" +
        '<p class="tfc-note">Open the Clients tab. Showing a QR does not check the client in. Print and scan at the front desk to check in.</p>' +
        '<div class="tfc-body" data-list></div>' +
      "</div>" +
      '<div class="tfc-modal" hidden data-modal>' +
        '<div class="tfc-dialog">' +
          '<div class="tfc-status" data-status>Loading…</div>' +
          '<img alt="Client check-in QR code" hidden data-qr />' +
          "<h3 data-name></h3>" +
          '<p class="tfc-code" data-code></p>' +
          '<div class="tfc-actions" style="justify-content:center;margin-top:14px">' +
            '<button type="button" class="btn-gold" data-act="print-one">Print</button>' +
            '<button type="button" class="btn-ghost" data-act="close-modal">Close</button>' +
          "</div>" +
        "</div>" +
      "</div>";

    document.head.appendChild(style);
    document.body.appendChild(root);
    return root;
  }

  var root = ensureUi();
  var listEl = $("[data-list]", root);
  var modal = $("[data-modal]", root);
  var statusEl = $("[data-status]", root);
  var qrImg = $("[data-qr]", root);
  var nameEl = $("[data-name]", root);
  var codeEl = $("[data-code]", root);
  var fab = $(".tfc-fab", root);
  var currentCard = null;

  function setCollapsed(collapsed) {
    root.classList.toggle("is-collapsed", collapsed);
    fab.hidden = !collapsed;
  }

  var lastListKey = null;

  function renderList() {
    var clients = scrapeClients();
    var listKey = clients.map(function (client) { return client.loginCode + ":" + client.name; }).join("|");
    if (lastListKey === listKey) return clients;
    lastListKey = listKey;
    if (!clients.length) {
      listEl.innerHTML = '<div class="tfc-empty">No clients found. Go to Admin → Clients, then this list will fill in.</div>';
      return clients;
    }
    listEl.innerHTML = clients.map(function (client) {
      return (
        '<div class="tfc-row">' +
          "<div><div class='tfc-name'>" + escapeHtml(client.name) + "</div>" +
          "<div class='tfc-code'>" + escapeHtml(client.loginCode) + "</div></div>" +
          '<div class="tfc-actions">' +
            '<button type="button" class="btn-gold" data-act="show" data-code="' + escapeHtml(client.loginCode) + '" data-name="' + escapeHtml(client.name) + '">Show</button>' +
            '<button type="button" class="btn-ghost" data-act="print" data-code="' + escapeHtml(client.loginCode) + '" data-name="' + escapeHtml(client.name) + '">Print</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
    return clients;
  }

  function showStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.style.color = isError ? "#f87171" : "#a39e93";
  }

  function buildCard(client) {
    return loadQrLib().then(function () {
      return generateQr(client.loginCode);
    }).then(function (payload) {
      var url = payload.checkinUrl;
      if (!url && payload.qrToken) {
        url = location.origin + "/#/checkin?qr=" + payload.qrToken;
      }
      if (!url) throw new Error("QR response was missing a check-in URL");
      return {
        name: displayName(payload, client.name),
        loginCode: client.loginCode,
        checkinUrl: url,
        dataUrl: makeQrDataUrl(url, 6),
      };
    });
  }

  function openModal(client) {
    currentCard = null;
    modal.hidden = false;
    qrImg.hidden = true;
    nameEl.textContent = client.name;
    codeEl.textContent = client.loginCode;
    showStatus("Generating QR…", false);
    buildCard(client).then(function (card) {
      currentCard = card;
      qrImg.src = card.dataUrl;
      qrImg.hidden = false;
      nameEl.textContent = card.name;
      codeEl.textContent = card.loginCode;
      showStatus("Show this to the scanner. It is not checked in yet.", false);
    }).catch(function (err) {
      showStatus(err.message || "Could not generate QR code", true);
    });
  }

  function closeModal() {
    modal.hidden = true;
  }

  function printOne(client) {
    return buildCard(client).then(function (card) {
      printCards([card]);
    }).catch(function (err) {
      alert(err.message || "Could not generate QR code");
    });
  }

  function printAll() {
    var clients = scrapeClients();
    if (!clients.length) {
      alert("No clients found on this page. Open Admin → Clients first.");
      return;
    }
    var chain = Promise.resolve();
    var cards = [];
    clients.forEach(function (client) {
      chain = chain.then(function () {
        return buildCard(client).then(function (card) {
          cards.push(card);
        });
      });
    });
    chain.then(function () {
      printCards(cards);
    }).catch(function (err) {
      alert(err.message || "Could not generate QR codes");
    });
  }

  root.addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var client = {
      loginCode: btn.getAttribute("data-code") || "",
      name: btn.getAttribute("data-name") || "",
    };
    if (act === "collapse") setCollapsed(true);
    if (btn.classList.contains("tfc-fab")) setCollapsed(false);
    if (act === "close-modal") closeModal();
    if (act === "show") openModal(client);
    if (act === "print") printOne(client);
    if (act === "print-one" && currentCard) printCards([currentCard]);
    if (act === "print-all") printAll();
  });

  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });

  renderList();
  var renderTimer = null;
  var observer = new MutationObserver(function () {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderList, 200);
  });
  var mount = document.getElementById("root") || document.body;
  observer.observe(mount, { childList: true, subtree: true });

  window.__tfcStaffQr = {
    open: function () {
      setCollapsed(false);
      renderList();
    },
    scrapeClients: scrapeClients,
    generateQr: generateQr,
  };

  setCollapsed(false);
})();
