(function () {
  "use strict";

  var API_KEY_STORAGE = "stash-giphy-api-key";
  var FAV_STORAGE = "stash-favorites";
  var INSTALL_DISMISS_STORAGE = "stash-install-dismissed";
  var GIPHY_BASE = "https://api.giphy.com/v1/gifs";
  var RATING = "pg-13";
  var LIMIT = 24;

  var els = {
    settingsBtn: document.getElementById("settingsBtn"),
    searchInput: document.getElementById("searchInput"),
    randomBtn: document.getElementById("randomBtn"),
    viewTabs: document.getElementById("viewTabs"),
    discoverView: document.getElementById("discoverView"),
    favoritesView: document.getElementById("favoritesView"),
    discoverLabel: document.getElementById("discoverLabel"),
    discoverGrid: document.getElementById("discoverGrid"),
    discoverEmpty: document.getElementById("discoverEmpty"),
    discoverLoading: document.getElementById("discoverLoading"),
    discoverError: document.getElementById("discoverError"),
    favoritesGrid: document.getElementById("favoritesGrid"),
    favoritesEmpty: document.getElementById("favoritesEmpty"),
    favCount: document.getElementById("favCount"),
    emptyOpenSettings: document.getElementById("emptyOpenSettings"),
    previewModal: document.getElementById("previewModal"),
    previewImg: document.getElementById("previewImg"),
    previewTitle: document.getElementById("previewTitle"),
    previewFavBtn: document.getElementById("previewFavBtn"),
    previewCopyBtn: document.getElementById("previewCopyBtn"),
    previewCopiedMsg: document.getElementById("previewCopiedMsg"),
    settingsModal: document.getElementById("settingsModal"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    saveKeyBtn: document.getElementById("saveKeyBtn"),
    keySavedMsg: document.getElementById("keySavedMsg"),
    installToast: document.getElementById("installToast"),
    installBtn: document.getElementById("installBtn"),
    dismissInstallBtn: document.getElementById("dismissInstallBtn")
  };

  var state = {
    activeView: "discover",
    favorites: loadFavorites(),
    currentPreview: null,
    requestToken: 0
  };

  // ---------- storage ----------

  function getApiKey() {
    try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch (e) { return ""; }
  }

  function setApiKey(key) {
    try { localStorage.setItem(API_KEY_STORAGE, key); return true; } catch (e) { return false; }
  }

  function loadFavorites() {
    try {
      var raw = localStorage.getItem(FAV_STORAGE);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_STORAGE, JSON.stringify(state.favorites));
      return true;
    } catch (e) { return false; }
  }

  function isFavorited(id) {
    return state.favorites.some(function (f) { return f.id === id; });
  }

  function toggleFavorite(gif) {
    if (isFavorited(gif.id)) {
      state.favorites = state.favorites.filter(function (f) { return f.id !== gif.id; });
    } else {
      state.favorites.unshift({
        id: gif.id,
        previewUrl: gif.previewUrl,
        originalUrl: gif.originalUrl,
        title: gif.title,
        savedAt: Date.now()
      });
    }
    saveFavorites();
    renderFavCount();
    if (state.activeView === "favorites") renderFavoritesGrid();
    else renderDiscoverGrid(state.lastDiscoverList || []);
  }

  // ---------- API ----------

  function normalizeGif(raw) {
    var images = raw.images || {};
    var preview = (images.fixed_width && images.fixed_width.url) ||
      (images.original && images.original.url) || "";
    var original = (images.original && images.original.url) || preview;
    return {
      id: raw.id,
      previewUrl: preview,
      originalUrl: original,
      title: raw.title || "GIF"
    };
  }

  function apiUrl(path, params) {
    var url = new URL(GIPHY_BASE + path);
    url.searchParams.set("api_key", getApiKey());
    url.searchParams.set("rating", RATING);
    Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
    return url.toString();
  }

  function fetchTrending() {
    return fetch(apiUrl("/trending", { limit: LIMIT })).then(handleGiphyResponse);
  }

  function fetchSearch(query) {
    return fetch(apiUrl("/search", { q: query, limit: LIMIT })).then(handleGiphyResponse);
  }

  function fetchRandom() {
    return fetch(apiUrl("/random", {})).then(function (res) {
      if (!res.ok) throw new Error("status:" + res.status);
      return res.json();
    }).then(function (json) {
      if (!json.data || Array.isArray(json.data) && json.data.length === 0) return null;
      return normalizeGif(json.data);
    });
  }

  function handleGiphyResponse(res) {
    if (!res.ok) throw new Error("status:" + res.status);
    return res.json().then(function (json) {
      return (json.data || []).map(normalizeGif);
    });
  }

  // ---------- rendering ----------

  function gifCard(gif) {
    var card = document.createElement("div");
    card.className = "gif-card";
    var img = document.createElement("img");
    img.src = gif.previewUrl;
    img.loading = "lazy";
    img.alt = gif.title;
    card.appendChild(img);
    if (isFavorited(gif.id)) {
      var badge = document.createElement("span");
      badge.className = "fav-badge";
      badge.textContent = "⭐";
      card.appendChild(badge);
    }
    card.addEventListener("click", function () { openPreview(gif); });
    return card;
  }

  function renderDiscoverGrid(list) {
    state.lastDiscoverList = list;
    els.discoverGrid.innerHTML = "";
    list.forEach(function (gif) { els.discoverGrid.appendChild(gifCard(gif)); });
  }

  function renderFavoritesGrid() {
    els.favoritesGrid.innerHTML = "";
    state.favorites.forEach(function (gif) { els.favoritesGrid.appendChild(gifCard(gif)); });
    els.favoritesEmpty.classList.toggle("hidden", state.favorites.length > 0);
  }

  function renderFavCount() {
    els.favCount.textContent = state.favorites.length;
  }

  function setDiscoverState(mode, message) {
    els.discoverGrid.classList.toggle("hidden", mode !== "ready");
    els.discoverEmpty.classList.toggle("hidden", mode !== "no-key");
    els.discoverLoading.classList.toggle("hidden", mode !== "loading");
    els.discoverError.classList.toggle("hidden", mode !== "error");
    if (mode === "error") els.discoverError.textContent = message || "Something went wrong.";
  }

  // ---------- discover loading ----------

  function loadDiscover(query) {
    if (!getApiKey()) {
      setDiscoverState("no-key");
      return;
    }
    var token = ++state.requestToken;
    setDiscoverState("loading");
    els.discoverLabel.textContent = query ? 'Results for "' + query + '"' : "Trending now";

    var request = query ? fetchSearch(query) : fetchTrending();
    request.then(function (list) {
      if (token !== state.requestToken) return;
      renderDiscoverGrid(list);
      setDiscoverState("ready");
      if (list.length === 0) {
        setDiscoverState("error", "No GIFs found for that search.");
      }
    }).catch(function (err) {
      if (token !== state.requestToken) return;
      var msg = "Couldn't load GIFs. Check your connection and try again.";
      if (String(err.message).indexOf("401") > -1 || String(err.message).indexOf("403") > -1) {
        msg = "That API key looks invalid — double check it in Settings.";
      }
      setDiscoverState("error", msg);
    });
  }

  var searchDebounceTimer = null;
  els.searchInput.addEventListener("input", function () {
    clearTimeout(searchDebounceTimer);
    var value = els.searchInput.value.trim();
    searchDebounceTimer = setTimeout(function () { loadDiscover(value); }, 400);
  });
  els.searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      clearTimeout(searchDebounceTimer);
      loadDiscover(els.searchInput.value.trim());
    }
  });

  els.randomBtn.addEventListener("click", function () {
    if (!getApiKey()) { openSettings(); return; }
    fetchRandom().then(function (gif) {
      if (gif) openPreview(gif);
    }).catch(function () {
      setDiscoverState("error", "Couldn't fetch a random GIF right now.");
      switchView("discover");
    });
  });

  // ---------- tabs ----------

  function switchView(view) {
    state.activeView = view;
    els.discoverView.classList.toggle("hidden", view !== "discover");
    els.favoritesView.classList.toggle("hidden", view !== "favorites");
    Array.prototype.forEach.call(els.viewTabs.querySelectorAll(".tab-btn"), function (btn) {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "favorites") renderFavoritesGrid();
  }

  els.viewTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  // ---------- preview modal ----------

  function openPreview(gif) {
    state.currentPreview = gif;
    els.previewImg.src = gif.originalUrl;
    els.previewImg.alt = gif.title;
    els.previewTitle.textContent = gif.title;
    els.previewCopiedMsg.classList.add("hidden");
    renderPreviewFavBtn();
    els.previewModal.classList.remove("hidden");
  }

  function closePreview() {
    els.previewModal.classList.add("hidden");
    state.currentPreview = null;
  }

  function renderPreviewFavBtn() {
    if (!state.currentPreview) return;
    var saved = isFavorited(state.currentPreview.id);
    els.previewFavBtn.textContent = saved ? "⭐ Saved" : "⭐ Save";
    els.previewFavBtn.classList.toggle("saved", saved);
  }

  els.previewFavBtn.addEventListener("click", function () {
    if (!state.currentPreview) return;
    toggleFavorite(state.currentPreview);
    renderPreviewFavBtn();
  });

  els.previewCopyBtn.addEventListener("click", function () {
    if (!state.currentPreview) return;
    var url = state.currentPreview.originalUrl;
    var done = function () {
      els.previewCopiedMsg.classList.remove("hidden");
      setTimeout(function () { els.previewCopiedMsg.classList.add("hidden"); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
    } else {
      fallbackCopy(url, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ---------- settings modal ----------

  function openSettings() {
    els.apiKeyInput.value = getApiKey();
    els.keySavedMsg.classList.add("hidden");
    els.settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    els.settingsModal.classList.add("hidden");
  }

  els.settingsBtn.addEventListener("click", openSettings);
  els.emptyOpenSettings.addEventListener("click", openSettings);

  els.saveKeyBtn.addEventListener("click", function () {
    var key = els.apiKeyInput.value.trim();
    setApiKey(key);
    els.keySavedMsg.classList.remove("hidden");
    setTimeout(function () {
      closeSettings();
      loadDiscover(els.searchInput.value.trim());
    }, 500);
  });

  // ---------- modal close wiring ----------

  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (el) {
    el.addEventListener("click", function () {
      closePreview();
      closeSettings();
    });
  });

  // ---------- install prompt ----------

  var deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_DISMISS_STORAGE) === "1"; } catch (err) {}
    if (!dismissed) els.installToast.classList.remove("hidden");
  });

  els.installBtn.addEventListener("click", function () {
    els.installToast.classList.add("hidden");
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt = null;
    }
  });

  els.dismissInstallBtn.addEventListener("click", function () {
    els.installToast.classList.add("hidden");
    try { localStorage.setItem(INSTALL_DISMISS_STORAGE, "1"); } catch (e) {}
  });

  // ---------- service worker ----------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () {});
    });
  }

  // ---------- init ----------

  renderFavCount();
  loadDiscover("");
})();
