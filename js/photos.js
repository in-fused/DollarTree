/* ================= PHOTOS ================= */

const PHOTO_UPLOAD_TIMEOUT_MS = 45000;
let activePhotoUploadToken = 0;
let activePhotoUploadState = {
  status: "idle",
  storeId: null,
  fileName: "",
  startedAt: 0,
  timeoutId: null,
  token: 0
};

function bindPhotoUI() {
  const uploadBtn = document.getElementById("uploadPhotoBtn");
  if (!uploadBtn || uploadBtn.dataset.bound) return;

  uploadBtn.addEventListener("click", () => {
    if (currentModalStoreId) uploadPhoto(currentModalStoreId);
  });

  uploadBtn.dataset.bound = "true";
}

function bindLightboxUI() {
  const lightbox = document.getElementById("photoLightbox");
  const closeBtn = document.getElementById("closeLightboxBtn");

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", closePhotoLightbox);
    closeBtn.dataset.bound = "true";
  }

  if (lightbox && !lightbox.dataset.bound) {
    lightbox.addEventListener("click", (e) => {
      if (e.target.id === "photoLightbox") closePhotoLightbox();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePhotoLightbox();
    });

    lightbox.dataset.bound = "true";
  }
}

function getPhotoUploadUiElements() {
  return {
    input: document.getElementById("photoInput"),
    uploadBtn: document.getElementById("uploadPhotoBtn"),
    message: document.getElementById("photoUploadMessage"),
    row: document.querySelector(".photoUploadRow")
  };
}

function setPhotoMessage(message = "", isError = false, state = "idle") {
  const { message: el } = getPhotoUploadUiElements();
  if (!el) return;

  el.textContent = message;
  el.dataset.state = state || "idle";
  el.classList.toggle("is-error", Boolean(isError));
  el.classList.toggle("is-success", state === "success" && !isError);
  el.classList.toggle("is-busy", state === "preparing" || state === "uploading");
  el.style.color = isError ? "#ff6b6b" : state === "success" ? "#d7f9e0" : "#d7e6ff";
}

function clearPhotoMessage() {
  setPhotoMessage("", false, "idle");
}

function setPhotoUploadLifecycleState(status, options = {}) {
  const {
    message = "",
    isError = false,
    keepInputValue = true,
    lockUi = status === "preparing" || status === "uploading",
    fileName = activePhotoUploadState.fileName,
    storeId = activePhotoUploadState.storeId,
    token = activePhotoUploadState.token
  } = options;

  const { input, uploadBtn, row } = getPhotoUploadUiElements();
  activePhotoUploadState = {
    ...activePhotoUploadState,
    status,
    fileName,
    storeId,
    token
  };

  if (row) row.dataset.uploadState = status;
  if (input) {
    input.disabled = lockUi;
    if (!keepInputValue) input.value = "";
  }

  if (uploadBtn) {
    uploadBtn.disabled = lockUi;
    uploadBtn.dataset.uploadState = status;
    uploadBtn.textContent = status === "preparing"
      ? "Preparing…"
      : status === "uploading"
        ? "Uploading…"
        : status === "success"
          ? "Uploaded"
          : status === "failure"
            ? "Retry Upload"
            : "Upload Photo";
  }

  setPhotoMessage(message, isError, status);
}

function clearPhotoUploadTimeout() {
  if (activePhotoUploadState.timeoutId) {
    clearTimeout(activePhotoUploadState.timeoutId);
  }

  activePhotoUploadState.timeoutId = null;
}

function startPhotoUploadTimeout(token, storeId, fileName) {
  clearPhotoUploadTimeout();
  activePhotoUploadState.timeoutId = setTimeout(() => {
    if (activePhotoUploadState.token !== token) return;

    console.warn("Photo upload timed out", { storeId, fileName, timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS });
    failPhotoUploadState("Photo upload timed out. Please try again.", { keepInputValue: true });
  }, PHOTO_UPLOAD_TIMEOUT_MS);
}

function resetPhotoUploadState(options = {}) {
  const {
    clearMessage = false,
    clearInputValue = false,
    preserveFailureMessage = false,
    nextButtonLabel = "Upload Photo"
  } = options;

  clearPhotoUploadTimeout();

  const { input, uploadBtn, row, message } = getPhotoUploadUiElements();
  activePhotoUploadState = {
    status: "idle",
    storeId: null,
    fileName: "",
    startedAt: 0,
    timeoutId: null,
    token: 0
  };

  if (row) row.dataset.uploadState = "idle";
  if (input) {
    input.disabled = false;
    if (clearInputValue) input.value = "";
  }
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.dataset.uploadState = "idle";
    uploadBtn.textContent = nextButtonLabel;
  }
  if (message) {
    if (clearMessage) {
      clearPhotoMessage();
    } else if (!preserveFailureMessage && !message.textContent) {
      clearPhotoMessage();
    }
  }
}

function failPhotoUploadState(message, options = {}) {
  setPhotoUploadLifecycleState("failure", {
    message,
    isError: true,
    keepInputValue: options.keepInputValue !== false,
    lockUi: false
  });
  clearPhotoUploadTimeout();
}

function succeedPhotoUploadState(message) {
  setPhotoUploadLifecycleState("success", {
    message,
    isError: false,
    keepInputValue: false,
    lockUi: false
  });
  clearPhotoUploadTimeout();

  setTimeout(() => {
    if (activePhotoUploadState.status === "success") {
      resetPhotoUploadState({ clearMessage: false, clearInputValue: false });
    }
  }, 1600);
}

function clearPhotoUI() {
  const input = document.getElementById("photoInput");
  const gallery = document.getElementById("photoGallery");

  if (input) input.value = "";
  if (gallery) gallery.innerHTML = "";
  resetPhotoUploadState({ clearMessage: true, clearInputValue: false });
}

async function compressImageFile(file, maxDimension = 1600, quality = 0.82) {
  if (!file || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetWidth = width;
  let targetHeight = height;

  if (width > height && width > maxDimension) {
    targetWidth = maxDimension;
    targetHeight = Math.round((height / width) * maxDimension);
  } else if (height >= width && height > maxDimension) {
    targetHeight = maxDimension;
    targetWidth = Math.round((width / height) * maxDimension);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) return file;

  const compressedName = sanitizeFileName(file.name).replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], compressedName, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function runPhotoUploadStepWithTimeout(stepLabel, operation, timeoutMs = PHOTO_UPLOAD_TIMEOUT_MS) {
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${stepLabel} timed out. Please try again.`));
      }, timeoutMs);
    })
  ]);
}

async function uploadPhoto(storeId) {
  if (activePhotoUploadState.status === "preparing" || activePhotoUploadState.status === "uploading") {
    setPhotoMessage("A photo upload is already in progress.", true, activePhotoUploadState.status);
    return;
  }

  if (!isSignedIn() || !canUploadPhotos()) {
    failPhotoUploadState("Editor or admin sign-in required to upload photos.", { keepInputValue: true });
    return;
  }

  const { input } = getPhotoUploadUiElements();
  const originalFile = input?.files?.[0];

  if (!originalFile) {
    failPhotoUploadState("Choose a photo first.", { keepInputValue: true });
    return;
  }

  const uploadToken = ++activePhotoUploadToken;
  activePhotoUploadState = {
    status: "idle",
    storeId: String(storeId),
    fileName: originalFile.name || "photo",
    startedAt: Date.now(),
    timeoutId: null,
    token: uploadToken
  };

  setPhotoUploadLifecycleState("preparing", {
    message: "Preparing photo for upload…",
    storeId: String(storeId),
    fileName: originalFile.name || "photo",
    token: uploadToken
  });
  startPhotoUploadTimeout(uploadToken, String(storeId), originalFile.name || "photo");

  let file = originalFile;

  try {
    file = await runPhotoUploadStepWithTimeout("Photo preparation", async () => {
      try {
        return await compressImageFile(originalFile);
      } catch (error) {
        console.warn("Compression failed, using original file.", error);
        return originalFile;
      }
    }, 20000);

    if (activePhotoUploadState.token !== uploadToken) return;

    setPhotoUploadLifecycleState("uploading", {
      message: `Uploading ${file.name || "photo"}…`,
      storeId: String(storeId),
      fileName: file.name || originalFile.name || "photo",
      token: uploadToken
    });

    const bucketName = await runPhotoUploadStepWithTimeout(
      "Photo bucket resolution",
      () => dataLayer.resolvePhotoBucketName(),
      15000
    );

    const path = buildPhotoPath(storeId, file);

    const uploadResult = await runPhotoUploadStepWithTimeout(
      "Photo file upload",
      () => dataLayer.uploadPhotoFile(bucketName, path, file),
      PHOTO_UPLOAD_TIMEOUT_MS
    );

    if (uploadResult?.error) {
      throw uploadResult.error;
    }

    const imageUrl = "";

    const rowResult = await runPhotoUploadStepWithTimeout(
      "Photo metadata save",
      () => dataLayer.insertPhotoRow(currentProjectId, storeId, imageUrl, path),
      20000
    );

    if (rowResult?.error) {
      throw rowResult.error;
    }

    const signedImageUrl = await runPhotoUploadStepWithTimeout(
      "Photo URL signing",
      () => dataLayer.createSignedPhotoUrl(bucketName, path),
      15000
    );

    if (activePhotoUploadState.token !== uploadToken) return;

    photoRowsCache.unshift({
      id: cryptoRandomKey(),
      project_id: currentProjectId,
      store_id: String(storeId),
      image_url: imageUrl,
      storage_path: path,
      resolved_image_url: signedImageUrl || "",
      created_at: new Date().toISOString(),
      photo_type: "other"
    });

    touchDataRefresh();

    prependActivity({
      type: "photo",
      store_id: String(storeId),
      timestamp: new Date().toISOString(),
      title: `📷 Photo uploaded for Store ${storeId}`,
      detail: `${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}`
    });

    updateHeaderDashboard();
    updateScopeSummary();
    updateActivityList();
    updateIntelRail();
    updateSelectedStorePanel(storeId);
    renderPhotoLibrary();
    await loadPhotos(storeId);

    console.info("Photo upload completed", {
      storeId: String(storeId),
      originalBytes: originalFile.size,
      uploadedBytes: file.size
    });

    succeedPhotoUploadState(`Photo uploaded successfully (${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}).`);
  } catch (error) {
    console.error("Photo upload failed", { storeId: String(storeId), error });
    failPhotoUploadState(error?.message || "Photo upload failed.", { keepInputValue: true });
  } finally {
    clearPhotoUploadTimeout();

    if (activePhotoUploadState.token === uploadToken && activePhotoUploadState.status !== "success") {
      const terminalStatus = activePhotoUploadState.status;
      resetPhotoUploadState({
        clearMessage: false,
        clearInputValue: false,
        preserveFailureMessage: terminalStatus === "failure",
        nextButtonLabel: terminalStatus === "failure" ? "Retry Upload" : "Upload Photo"
      });

      if (terminalStatus !== "failure") {
        clearPhotoMessage();
      }
    }
  }
}

async function loadPhotos(storeId) {
  const gallery = document.getElementById("photoGallery");
  if (!gallery) return;

  if (!isSignedIn()) {
    gallery.innerHTML = `<div class="photoEmptyState">Sign in to view photos.</div>`;
    return;
  }

  gallery.innerHTML = `<div class="photoEmptyState">Loading photos…</div>`;

  const { data, error } = await dataLayer.loadPhotosForStore(currentProjectId, storeId);

  if (error) {
    console.error(error);
    gallery.innerHTML = `<div class="photoEmptyState">Unable to load photos.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    gallery.innerHTML = `<div class="photoEmptyState">No photos uploaded yet.</div>`;
    return;
  }

  const resolvedRows = await dataLayer.resolvePhotoRenderRows(data);
  gallery.innerHTML = "";

  resolvedRows.forEach(row => {
    const src = dataLayer.resolvePhotoRowUrl(row) || null;

    const card = document.createElement("div");
    card.className = "photoCard";

    if (src) {
      const img = document.createElement("img");
      img.className = "photoThumb";
      img.alt = `Store ${storeId} photo`;
      img.src = src;
      img.loading = "lazy";
      card.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "photoEmptyState";
      placeholder.textContent = "Photo unavailable";
      card.appendChild(placeholder);
    }

    const meta = document.createElement("div");
    meta.className = "photoMeta";
    meta.textContent = formatPhotoDate(row.created_at);

    card.appendChild(meta);

    if (src) {
      card.addEventListener("click", () => {
        openPhotoLightbox(src);
      });
    }

    gallery.appendChild(card);
  });
}

function openPhotoLightbox(url) {
  const lightbox = document.getElementById("photoLightbox");
  const image = document.getElementById("lightboxImage");
  if (!lightbox || !image) return;

  image.src = url;
  lightbox.classList.remove("hidden");
}

function closePhotoLightbox() {
  const lightbox = document.getElementById("photoLightbox");
  const image = document.getElementById("lightboxImage");
  if (!lightbox || !image) return;

  lightbox.classList.add("hidden");
  image.src = "";
}
