// EV Value Scorer - Popup JavaScript
// Quick actions and status display

(function() {
  'use strict';

  // Default weights for scoring
  const DEFAULT_WEIGHTS = {
    price: 35, odo: 16, range: 12, year: 10, trimLevel: 10,
    distance: 10, remoteStart: 10, length: 10, damage: 5, heatPump: 5
  };

  // State
  let cars = [];
  let currentPageData = null;

  // DOM Elements
  const totalCount = document.getElementById('total-count');
  const starredCount = document.getElementById('starred-count');
  const topScore = document.getElementById('top-score');
  const pageStatus = document.getElementById('page-status');
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const openSidebarBtn = document.getElementById('open-sidebar-btn');
  const saveBtn = document.getElementById('save-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const clearBtn = document.getElementById('clear-btn');
  const importFile = document.getElementById('import-file');

  // Initialize
  async function init() {
    await loadData();
    await checkCurrentPage();
    setupEventListeners();
    render();
  }

  // Load cars from storage
  async function loadData() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_CARS' });
      cars = result?.cars || [];
    } catch (e) {
      console.error('Load data error:', e);
      cars = [];
    }
  }

  // Check current page for EV listing
  async function checkCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' });

      if (response?.data) {
        currentPageData = response.data;

        // Check if already saved
        const urlCheck = await chrome.runtime.sendMessage({
          type: 'CHECK_URL',
          url: tab.url
        });

        if (urlCheck?.saved) {
          setPageStatus('saved', 'Already Saved', 'This listing is in your collection');
          saveBtn.disabled = true;
          saveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Already Saved
          `;
        } else {
          setPageStatus('detected', 'EV Detected', `${response.data.year} ${response.data.make} ${response.data.model}`);
          saveBtn.disabled = false;
        }
      } else if (response?.hasParser) {
        if (response.isListingPage) {
          setPageStatus('not-detected', 'Not an EV', 'This listing is not an electric vehicle');
        } else {
          setPageStatus('not-detected', 'Not a Listing', 'Navigate to a specific vehicle listing');
        }
      } else {
        setPageStatus('not-detected', 'Unsupported Site', 'Visit AutoTrader, Kijiji, Clutch, or CarGurus');
      }
    } catch (e) {
      // Content script not available
      setPageStatus('not-detected', 'Unsupported Site', 'Visit a supported car listing site');
    }
  }

  // Set page status display
  function setPageStatus(type, title, desc) {
    pageStatus.className = `page-status ${type}`;
    statusTitle.textContent = title;
    statusDesc.textContent = desc;

    const icons = {
      detected: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>`,
      saved: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>`,
      'not-detected': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`
    };

    statusIcon.innerHTML = icons[type] || icons['not-detected'];
  }

  // Calculate score for a car
  function calculateScore(car) {
    if (cars.length === 0) return 0;

    const values = {
      price: cars.map(c => c.price).filter(v => v > 0),
      odo: cars.map(c => c.odo).filter(v => v >= 0),
      range: cars.map(c => c.range || 400).filter(v => v > 0),
      year: cars.map(c => c.year).filter(v => v > 0),
      trimLevel: cars.map(c => c.trimLevel || 2),
      distance: cars.map(c => c.distance || 5),
      length: cars.map(c => c.length || 170).filter(v => v > 0),
      damage: cars.map(c => c.damage || 0)
    };

    const mins = {}, maxs = {};
    Object.keys(values).forEach(key => {
      mins[key] = Math.min(...values[key]);
      maxs[key] = Math.max(...values[key]);
    });

    const normalize = (value, min, max, invert = false) => {
      if (max === min) return invert ? 1 : 0.5;
      const norm = (value - min) / (max - min);
      return invert ? 1 - norm : norm;
    };

    const scores = {
      price: normalize(car.price, mins.price, maxs.price, true),
      odo: normalize(car.odo, mins.odo, maxs.odo, true),
      range: normalize(car.range || 400, mins.range, maxs.range),
      year: normalize(car.year, mins.year, maxs.year),
      trimLevel: normalize(car.trimLevel || 2, 1, 5),
      distance: normalize(car.distance || 5, 1, 10, true),
      length: normalize(car.length || 170, mins.length, maxs.length, true),
      damage: normalize(car.damage || 0, 0, 5, true),
      heatPump: car.heatPump ? 1 : 0,
      remoteStart: car.remoteStart === 'Fob, App' ? 1 : (car.remoteStart === 'App' ? 0.7 : (car.remoteStart === 'Fob' ? 0.5 : 0))
    };

    const weights = DEFAULT_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    let totalScore = 0;
    Object.keys(weights).forEach(key => {
      totalScore += (scores[key] || 0) * (weights[key] / totalWeight);
    });

    return Math.round(totalScore * 100);
  }

  // Setup event listeners
  function setupEventListeners() {
    openSidebarBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      }
    });

    saveBtn.addEventListener('click', async () => {
      if (!currentPageData || saveBtn.disabled) return;

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'SAVE_CAR',
          car: currentPageData
        });

        if (result?.success) {
          setPageStatus('saved', 'Saved!', 'Listing added to your collection');
          saveBtn.disabled = true;
          saveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Saved!
          `;
          await loadData();
          render();
        }
      } catch (e) {
        console.error('Save error:', e);
      }
    });

    exportBtn.addEventListener('click', async () => {
      try {
        const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ev-scorer-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Export error:', e);
      }
    });

    importBtn.addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const result = await chrome.runtime.sendMessage({
          type: 'IMPORT_DATA',
          data
        });

        if (result?.success) {
          await loadData();
          render();
          alert(`Imported ${data.cars?.length || 0} listings!`);
        }
      } catch (e) {
        console.error('Import error:', e);
        alert('Error importing file');
      }

      importFile.value = '';
    });

    clearBtn.addEventListener('click', async () => {
      if (!confirm('Delete all saved listings? This cannot be undone.')) return;

      try {
        await chrome.runtime.sendMessage({
          type: 'IMPORT_DATA',
          data: { cars: [], weights: DEFAULT_WEIGHTS }
        });
        await loadData();
        render();
      } catch (e) {
        console.error('Clear error:', e);
      }
    });
  }

  // Render stats
  function render() {
    totalCount.textContent = cars.length;
    starredCount.textContent = cars.filter(c => c.starred).length;

    if (cars.length > 0) {
      const scores = cars.map(c => calculateScore(c));
      topScore.textContent = Math.max(...scores);
    } else {
      topScore.textContent = '-';
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
