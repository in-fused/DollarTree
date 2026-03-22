/* ================= PHOTOS ================= */

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

function setPhotoMessage(message = "", isError = false) {
  const el = document.getElementById("photoUploadMessage");
  if (!el) return;

  el.textContent = message;
  el.style.color = isError ? "#ff6b6b" : "#d7f9e0";
}

function clearPhotoMessage() {
  setPhotoMessage("");
}

function clearPhotoUI() {
  const input = document.getElementById("photoInput");
  const gallery = document.getElementById("photoGallery");

  if (input) input.value = "";
  if (gallery) gallery.innerHTML = "";
  clearPhotoMessage();
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

async function uploadPhoto(storeId) {
  if (!isSignedIn() || !canUploadPhotos()) {
    alert("Editor or admin sign-in required to upload photos.");
    return;
  }

  const input = document.getElementById("photoInput");
  const originalFile = input?.files?.[0];

  if (!originalFile) {
    setPhotoMessage("Choose a photo first.", true);
    return;
  }

  setPhotoMessage("Compressing and uploading photo...");

  let file = originalFile;
  try {
    file = await compressImageFile(originalFile);
  } catch (error) {
    console.warn("Compression failed, using original file.", error);
    file = originalFile;
  }

  const bucketName = await dataLayer.resolvePhotoBucketName();
  const path = buildPhotoPath(storeId, file);

  const { error: uploadError } = await dataLayer.uploadPhotoFile(bucketName, path, file);

  if (uploadError) {
    console.error(uploadError);
    setPhotoMessage(uploadError.message || "Photo upload failed.", true);
    return;
  }

  const imageUrl = dataLayer.getPublicPhotoUrl(bucketName, path);

  const { error: rowError } = await dataLayer.insertPhotoRow(currentProjectId, storeId, imageUrl, path);

  if (rowError) {
    console.error(rowError);
    setPhotoMessage(rowError.message || "Photo metadata save failed.", true);
    return;
  }

  photoRowsCache.unshift({
    id: cryptoRandomKey(),
    project_id: currentProjectId,
    store_id: String(storeId),
    image_url: imageUrl,
    storage_path: path,
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

  if (input) input.value = "";

  updateHeaderDashboard();
  updateScopeSummary();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(storeId);
  renderPhotoLibrary();
  setPhotoMessage(`Photo uploaded successfully (${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}).`);
  await loadPhotos(storeId);
}

async function loadPhotos(storeId) {
  const gallery = document.getElementById("photoGallery");
  if (!gallery) return;

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

  const bucketName = await dataLayer.resolvePhotoBucketName();
  gallery.innerHTML = "";

  data.forEach(row => {
    let imageUrl = row.image_url || "";

    if (!imageUrl && row.storage_path) {
      imageUrl = dataLayer.getPublicPhotoUrl(bucketName, row.storage_path);
    }

    const card = document.createElement("div");
    card.className = "photoCard";

    const img = document.createElement("img");
    img.className = "photoThumb";
    img.alt = `Store ${storeId} photo`;
    img.src = imageUrl;
    img.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "photoMeta";
    meta.textContent = formatPhotoDate(row.created_at);

    card.appendChild(img);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      if (imageUrl) openPhotoLightbox(imageUrl);
    });

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