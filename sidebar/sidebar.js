// EV Value Scorer - Sidebar Panel JavaScript
// Displays saved cars with MCDA scores, allows adding/editing

(function() {
  'use strict';

  // Default scoring weights
  const DEFAULT_WEIGHTS = {
    price: 35, odo: 16, range: 12, year: 10, trimLevel: 10,
    distance: 10, remoteStart: 10, length: 10, damage: 5, heatPump: 5
  };

  // State
  let cars = [];
  let weights = DEFAULT_WEIGHTS;
  let editingCarId = null;
  let currentMode = 'all'; // 'ev' or 'all'

  // DOM Elements
  const carList = document.getElementById('car-list');
  const emptyState = document.getElementById('empty-state');
  const totalCars = document.getElementById('total-cars');
  const starredCars = document.getElementById('starred-cars');
  const avgScore = document.getElementById('avg-score');
  const addBtn = document.getElementById('add-btn');
  const addFormContainer = document.getElementById('add-form-container');
  const carForm = document.getElementById('car-form');
  const closeFormBtn = document.getElementById('close-form-btn');
  const cancelFormBtn = document.getElementById('cancel-form-btn');
  const formTitle = document.getElementById('form-title');
  const submitFormBtn = document.getElementById('submit-form-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const helpBtn = document.getElementById('help-btn');
  const helpPanel = document.getElementById('help-panel');
  const helpOverlay = document.getElementById('help-overlay');
  const closeHelpBtn = document.getElementById('close-help-btn');
  const modeToggle = document.getElementById('mode-toggle');
  const modeLabel = document.getElementById('mode-label');

  // Initialize
  async function init() {
    await loadData();
    await loadSettings();
    setupEventListeners();
    checkPendingData();
    render();
    updateModeUI();
  }

  // Load cars and weights from storage
  async function loadData() {
    try {
      const carsResult = await chrome.runtime.sendMessage({ type: 'GET_CARS' });
      cars = carsResult?.cars || [];

      const weightsResult = await chrome.runtime.sendMessage({ type: 'GET_WEIGHTS' });
      weights = weightsResult?.weights || DEFAULT_WEIGHTS;
    } catch (e) {
      console.error('Load data error:', e);
      cars = [];
      weights = DEFAULT_WEIGHTS;
    }
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      currentMode = result?.settings?.mode || 'all';
    } catch (e) {
      console.error('Load settings error:', e);
      currentMode = 'all';
    }
  }

  // Update mode toggle UI
  function updateModeUI() {
    if (currentMode === 'ev') {
      modeToggle.classList.add('ev-mode');
      modeLabel.textContent = 'EV';
    } else {
      modeToggle.classList.remove('ev-mode');
      modeLabel.textContent = 'All';
    }
  }

  // Toggle between EV and All modes
  async function toggleMode() {
    currentMode = currentMode === 'ev' ? 'all' : 'ev';
    updateModeUI();

    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        settings: { mode: currentMode }
      });
    } catch (e) {
      console.error('Save mode error:', e);
    }
  }

  // Check for pending car data from content script
  async function checkPendingData() {
    try {
      const result = await chrome.storage.session.get('pendingCarData');
      if (result.pendingCarData) {
        // Clear pending data
        await chrome.storage.session.remove('pendingCarData');
        // Open form with data
        openFormWithData(result.pendingCarData);
      }
    } catch (e) {
      console.error('Check pending data error:', e);
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    addBtn.addEventListener('click', () => openForm());
    closeFormBtn.addEventListener('click', closeForm);
    cancelFormBtn.addEventListener('click', closeForm);
    carForm.addEventListener('submit', handleFormSubmit);
    refreshBtn.addEventListener('click', async () => {
      await loadData();
      render();
    });

    // Toggle buttons
    document.getElementById('form-heatPump').addEventListener('click', (e) => {
      const btn = e.target;
      const current = btn.dataset.value === 'true';
      btn.dataset.value = !current;
      btn.textContent = !current ? 'Yes' : 'No';
    });

    // Help panel
    helpBtn.addEventListener('click', openHelp);
    closeHelpBtn.addEventListener('click', closeHelp);
    helpOverlay.addEventListener('click', closeHelp);

    // Mode toggle
    modeToggle.addEventListener('click', toggleMode);

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message) => {
      if (['CAR_ADDED', 'CAR_UPDATED', 'CAR_DELETED', 'DATA_IMPORTED', 'WEIGHTS_UPDATED'].includes(message.type)) {
        loadData().then(render);
      }
    });

    // Also listen for storage changes directly (more reliable for side panels)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && (changes.evscorer_cars || changes.evscorer_weights)) {
        loadData().then(render);
      }
    });
  }

  // MCDA Scoring Algorithm
  function calculateScore(car) {
    if (cars.length === 0) return 0;

    // Get min/max for normalization
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

    const mins = {};
    const maxs = {};
    Object.keys(values).forEach(key => {
      mins[key] = Math.min(...values[key]);
      maxs[key] = Math.max(...values[key]);
    });

    // Normalize function
    const normalize = (value, min, max, invert = false) => {
      if (max === min) return invert ? 1 : 0.5;
      const norm = (value - min) / (max - min);
      return invert ? 1 - norm : norm;
    };

    // Calculate normalized scores
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

    // Calculate total weight
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    // Calculate weighted score
    let totalScore = 0;
    Object.keys(weights).forEach(key => {
      totalScore += (scores[key] || 0) * (weights[key] / totalWeight);
    });

    return Math.round(totalScore * 100);
  }

  // Calculate scores for all cars and sort
  function getCarsWithScores() {
    return cars
      .map(car => ({ ...car, score: calculateScore(car) }))
      .sort((a, b) => b.score - a.score);
  }

  // Render the car list
  function render() {
    const scoredCars = getCarsWithScores();

    // Update stats
    totalCars.textContent = cars.length;
    starredCars.textContent = cars.filter(c => c.starred).length;
    avgScore.textContent = cars.length > 0
      ? Math.round(scoredCars.reduce((a, c) => a + c.score, 0) / scoredCars.length)
      : '-';

    // Show/hide empty state
    if (cars.length === 0) {
      carList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Render cards
    carList.innerHTML = scoredCars.map((car, index) => {
      const rank = index + 1;
      const scoreClass = car.score >= 70 ? 'high' : (car.score >= 40 ? 'medium' : 'low');
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';

      return `
        <div class="car-card ${car.starred ? 'starred' : ''}" data-id="${car.id}">
          <div class="car-card-header">
            <div class="car-rank ${rankClass}">${rank}</div>
            <div class="car-info">
              <div class="car-title">
                ${car.year} ${car.make} ${car.model}
                ${car.isEV ? '<span class="ev-badge">EV</span>' : ''}
              </div>
              ${car.trim ? `<span class="car-trim">${car.trim}</span>` : ''}
            </div>
            <div class="car-score">
              <div class="score-value ${scoreClass}">${car.score}</div>
              <div class="score-label">Score</div>
            </div>
          </div>
          ${car.photos?.length ? `
            <div class="car-photos" data-url="${car.url || ''}" title="Click to view listing">
              ${car.photos.slice(0, 3).map(src => `<img src="${src}" alt="Photo" loading="lazy" onerror="this.style.display='none'">`).join('')}
              ${car.photos.length > 3 ? `<span class="photos-more">+${car.photos.length - 3}</span>` : ''}
            </div>
          ` : ''}
          <div class="car-details">
            <div class="car-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              $${car.price?.toLocaleString() || 'N/A'}
            </div>
            <div class="car-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${car.odo?.toLocaleString() || 'N/A'} km
            </div>
            ${car.dealer ? `
              <div class="car-detail">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                ${car.dealer}
              </div>
            ` : ''}
          </div>
          <div class="car-actions">
            <button class="btn-star ${car.starred ? 'active' : ''}" data-action="star">
              ${car.starred ? '★ Starred' : '☆ Star'}
            </button>
            ${car.url ? `
              <button class="btn-view" data-action="view">View</button>
            ` : ''}
            <button class="btn-delete" data-action="delete">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners to cards
    carList.querySelectorAll('.car-card').forEach(card => {
      const carId = parseInt(card.dataset.id);

      card.querySelector('[data-action="star"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStar(carId);
      });

      card.querySelector('[data-action="view"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const car = cars.find(c => c.id === carId);
        if (car?.url) {
          chrome.tabs.create({ url: car.url });
        }
      });

      card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCar(carId);
      });

      // Photos click - open listing URL
      card.querySelector('.car-photos')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });

      card.addEventListener('click', () => {
        const car = cars.find(c => c.id === carId);
        if (car) {
          openFormWithData(car);
          editingCarId = carId;
        }
      });
    });
  }

  // Toggle star status
  async function toggleStar(carId) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;

    await chrome.runtime.sendMessage({
      type: 'UPDATE_CAR',
      carId,
      updates: { starred: !car.starred }
    });

    await loadData();
    render();
  }

  // Delete car
  async function deleteCar(carId) {
    if (!confirm('Remove this listing?')) return;

    await chrome.runtime.sendMessage({
      type: 'DELETE_CAR',
      carId
    });

    await loadData();
    render();
  }

  // Open form for new entry
  function openForm() {
    editingCarId = null;
    formTitle.textContent = 'Add Listing';
    submitFormBtn.textContent = 'Save Listing';
    carForm.reset();

    // Reset toggles
    document.getElementById('form-heatPump').dataset.value = 'true';
    document.getElementById('form-heatPump').textContent = 'Yes';

    addFormContainer.classList.add('visible');
  }

  // Open form with pre-filled data
  function openFormWithData(data) {
    editingCarId = data.id || null;
    formTitle.textContent = editingCarId ? 'Edit Listing' : 'Add Listing';
    submitFormBtn.textContent = editingCarId ? 'Update Listing' : 'Save Listing';

    // Fill form fields
    document.getElementById('form-year').value = data.year || new Date().getFullYear();
    document.getElementById('form-make').value = data.make || '';
    document.getElementById('form-model').value = data.model || '';
    document.getElementById('form-trim').value = data.trim || '';
    document.getElementById('form-trimLevel').value = data.trimLevel || 2;
    document.getElementById('form-price').value = data.price || '';
    document.getElementById('form-odo').value = data.odo || '';
    document.getElementById('form-range').value = data.range || '';
    document.getElementById('form-length').value = data.length || '';
    document.getElementById('form-dealer').value = data.dealer || '';
    document.getElementById('form-url').value = data.url || '';
    document.getElementById('form-location').value = data.location || '';
    document.getElementById('form-distance').value = data.distance || 5;
    document.getElementById('form-remoteStart').value = data.remoteStart || 'Fob, App';

    const heatPumpBtn = document.getElementById('form-heatPump');
    heatPumpBtn.dataset.value = data.heatPump !== false ? 'true' : 'false';
    heatPumpBtn.textContent = data.heatPump !== false ? 'Yes' : 'No';

    addFormContainer.classList.add('visible');
  }

  // Close form
  function closeForm() {
    addFormContainer.classList.remove('visible');
    editingCarId = null;
    carForm.reset();
  }

  // Open help panel
  function openHelp() {
    helpPanel.classList.add('visible');
    helpOverlay.classList.add('visible');
  }

  // Close help panel
  function closeHelp() {
    helpPanel.classList.remove('visible');
    helpOverlay.classList.remove('visible');
  }

  // Handle form submission
  async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
      year: parseInt(document.getElementById('form-year').value),
      make: document.getElementById('form-make').value.trim(),
      model: document.getElementById('form-model').value.trim(),
      trim: document.getElementById('form-trim').value.trim(),
      trimLevel: parseInt(document.getElementById('form-trimLevel').value) || 2,
      price: parseInt(document.getElementById('form-price').value) || 0,
      odo: parseInt(document.getElementById('form-odo').value) || 0,
      range: parseInt(document.getElementById('form-range').value) || 400,
      length: parseInt(document.getElementById('form-length').value) || 170,
      dealer: document.getElementById('form-dealer').value.trim(),
      url: document.getElementById('form-url').value.trim(),
      location: document.getElementById('form-location').value.trim(),
      distance: parseInt(document.getElementById('form-distance').value) || 5,
      remoteStart: document.getElementById('form-remoteStart').value,
      heatPump: document.getElementById('form-heatPump').dataset.value === 'true'
    };

    try {
      if (editingCarId) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_CAR',
          carId: editingCarId,
          updates: formData
        });
      } else {
        await chrome.runtime.sendMessage({
          type: 'SAVE_CAR',
          car: formData
        });
      }

      closeForm();
      await loadData();
      render();
    } catch (e) {
      console.error('Form submit error:', e);
      alert('Error saving listing');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
