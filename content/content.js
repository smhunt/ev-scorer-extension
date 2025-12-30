// EV Value Scorer - Content Script
// Runs on car listing sites to detect and save EV listings

(function() {
  'use strict';

  // Available parsers (loaded from separate files)
  const parsers = [
    typeof AutoTraderParser !== 'undefined' ? AutoTraderParser : null,
    typeof KijijiParser !== 'undefined' ? KijijiParser : null,
    typeof ClutchParser !== 'undefined' ? ClutchParser : null,
    typeof CarGurusParser !== 'undefined' ? CarGurusParser : null,
    typeof CanadaDrivesParser !== 'undefined' ? CanadaDrivesParser : null
  ].filter(Boolean);

  // State
  let currentParser = null;
  let extractedData = null;
  let overlayElement = null;
  let isAlreadySaved = false;
  let isEVListing = false;
  let currentMode = 'all'; // 'ev' or 'all'

  // Find the right parser for current site
  function detectParser() {
    const hostname = location.hostname.replace('www.', '');
    return parsers.find(p => hostname.includes(p.hostname));
  }

  // Get current mode setting
  async function getMode() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      return response?.settings?.mode || 'all';
    } catch (e) {
      return 'all';
    }
  }

  // Initialize on page load
  async function init() {
    currentParser = detectParser();
    if (!currentParser) return;

    // Check if this is a listing page
    if (!currentParser.isListingPage()) return;

    // Small delay for dynamic content to load
    await new Promise(r => setTimeout(r, 1000));

    // Get mode setting
    currentMode = await getMode();

    // Check if it's an EV
    isEVListing = currentParser.isEVListing();

    // In EV-only mode, skip non-EV listings
    if (currentMode === 'ev' && !isEVListing) return;

    // Extract data
    extractedData = currentParser.extractData();
    if (!extractedData) return;

    // Add isEV flag to extracted data
    extractedData.isEV = isEVListing;

    console.log('[Car Scorer] Detected listing:', extractedData, 'isEV:', isEVListing);

    // Check if already saved
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_URL',
        url: location.href
      });
      isAlreadySaved = response?.saved || false;
    } catch (e) {
      isAlreadySaved = false;
    }

    // Show overlay button
    showOverlay();
  }

  // Create and show the floating save button
  function showOverlay() {
    if (overlayElement) return;

    overlayElement = document.createElement('div');
    overlayElement.id = 'ev-scorer-overlay';
    overlayElement.innerHTML = `
      <div class="ev-scorer-button ${isAlreadySaved ? 'saved' : ''}" id="ev-scorer-main-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${isAlreadySaved ? 'Saved' : 'Save to EV Scorer'}</span>
      </div>
      <div class="ev-scorer-preview" id="ev-scorer-preview">
        <div class="ev-scorer-preview-header">
          <span class="ev-scorer-preview-title">${extractedData.year} ${extractedData.make} ${extractedData.model}</span>
          <span class="ev-scorer-preview-trim">${extractedData.trim}</span>
        </div>
        <div class="ev-scorer-preview-details">
          <div class="ev-scorer-preview-row">
            <span>Price:</span>
            <strong>$${extractedData.price?.toLocaleString() || 'N/A'}</strong>
          </div>
          <div class="ev-scorer-preview-row">
            <span>Odometer:</span>
            <strong>${extractedData.odo?.toLocaleString() || 'N/A'} km</strong>
          </div>
          <div class="ev-scorer-preview-row">
            <span>Dealer:</span>
            <strong>${extractedData.dealer || 'Unknown'}</strong>
          </div>
          ${extractedData.photos?.length ? `
            <div class="ev-scorer-preview-photos">
              ${extractedData.photos.slice(0, 3).map(src => `<img src="${src}" alt="Photo" referrerpolicy="no-referrer">`).join('')}
              ${extractedData.photos.length > 3 ? `<span>+${extractedData.photos.length - 3} more</span>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="ev-scorer-preview-actions">
          <button class="ev-scorer-btn-primary" id="ev-scorer-save-btn" ${isAlreadySaved ? 'disabled' : ''}>
            ${isAlreadySaved ? '✓ Already Saved' : 'Save Listing'}
          </button>
          <button class="ev-scorer-btn-secondary" id="ev-scorer-edit-btn">
            Edit & Save
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayElement);

    // Event listeners
    const mainBtn = document.getElementById('ev-scorer-main-btn');
    const preview = document.getElementById('ev-scorer-preview');
    const saveBtn = document.getElementById('ev-scorer-save-btn');
    const editBtn = document.getElementById('ev-scorer-edit-btn');

    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      preview.classList.toggle('visible');
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isAlreadySaved) return;
      await saveListing();
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSidebarWithData();
    });

    // Close preview when clicking outside
    document.addEventListener('click', (e) => {
      if (!overlayElement.contains(e.target)) {
        preview.classList.remove('visible');
      }
    });
  }

  // Convert image URL to base64 thumbnail
  async function imageToThumbnail(url, maxSize = 200) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down to maxSize while maintaining aspect ratio
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to base64 JPEG (smaller than PNG)
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          console.warn('[EV Scorer] Canvas error for', url, e);
          resolve(null);
        }
      };

      img.onerror = () => {
        console.warn('[EV Scorer] Failed to load image:', url);
        resolve(null);
      };

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);

      img.src = url;
    });
  }

  // Convert all photos to thumbnails
  async function convertPhotosToThumbnails(photos) {
    if (!photos || photos.length === 0) return [];

    // Only process first 3 photos to save storage space
    const photosToConvert = photos.slice(0, 3);

    const thumbnails = await Promise.all(
      photosToConvert.map(url => imageToThumbnail(url))
    );

    return thumbnails.filter(t => t !== null);
  }

  // Save listing to storage
  async function saveListing() {
    try {
      // Convert photos to thumbnails before saving
      const thumbnails = await convertPhotosToThumbnails(extractedData.photos);

      const dataToSave = {
        ...extractedData,
        photos: thumbnails, // Replace URLs with base64 thumbnails
        originalPhotoUrls: extractedData.photos // Keep original URLs as backup
      };

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CAR',
        car: dataToSave
      });

      if (response?.success) {
        isAlreadySaved = true;
        updateOverlayState();
        showNotification('Listing saved to EV Value Scorer!');
      } else {
        showNotification('Error saving listing', 'error');
      }
    } catch (e) {
      console.error('[EV Scorer] Save error:', e);
      showNotification('Error saving listing', 'error');
    }
  }

  // Open sidebar with pre-filled data
  function openSidebarWithData() {
    chrome.runtime.sendMessage({
      type: 'OPEN_SIDEBAR',
      data: extractedData
    });
  }

  // Update overlay to show saved state
  function updateOverlayState() {
    const mainBtn = document.getElementById('ev-scorer-main-btn');
    const saveBtn = document.getElementById('ev-scorer-save-btn');

    if (mainBtn) {
      mainBtn.classList.add('saved');
      mainBtn.querySelector('span').textContent = 'Saved';
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '✓ Already Saved';
    }
  }

  // Show notification toast
  function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `ev-scorer-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_DATA') {
      sendResponse({
        hasParser: !!currentParser,
        isListingPage: currentParser?.isListingPage() || false,
        isEV: currentParser?.isEVListing() || false,
        data: extractedData
      });
    }
    return true;
  });

  // Handle SPA navigation
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Reset state
      if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
      }
      extractedData = null;
      isAlreadySaved = false;
      // Re-initialize
      setTimeout(init, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
