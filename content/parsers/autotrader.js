// AutoTrader.ca Parser
// Extracts vehicle data from AutoTrader listing pages

const AutoTraderParser = {
  name: 'AutoTrader',
  hostname: 'autotrader.ca',

  // Check if current page is a vehicle listing
  isListingPage() {
    // AutoTrader listing URLs: /a/make/model/city/province/12345_67890
    return /\/a\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[\d_]+/.test(location.pathname);
  },

  // Check if this is an EV listing
  isEVListing() {
    // Check fuel type in page
    const fuelType = document.querySelector('[data-testid="fuelType"]')?.textContent?.toLowerCase() ||
                     document.querySelector('.fuel-type')?.textContent?.toLowerCase() || '';

    if (fuelType.includes('electric')) return true;

    // Check title/description for EV keywords
    const title = document.querySelector('h1')?.textContent || '';
    return isLikelyEV(title);
  },

  // Extract all vehicle data from the page
  extractData() {
    try {
      // Try JSON-LD structured data first
      const jsonLd = this.extractJsonLd();
      if (jsonLd) {
        return this.normalizeData(jsonLd);
      }

      // Fall back to DOM scraping
      return this.extractFromDOM();
    } catch (e) {
      console.error('AutoTrader parser error:', e);
      return null;
    }
  },

  // Extract from JSON-LD schema
  extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Car' || data['@type'] === 'Vehicle') {
          return data;
        }
        if (Array.isArray(data)) {
          const car = data.find(d => d['@type'] === 'Car' || d['@type'] === 'Vehicle');
          if (car) return car;
        }
      } catch (e) {}
    }
    return null;
  },

  // Extract from DOM elements
  extractFromDOM() {
    // Price
    const priceEl = document.querySelector('[data-testid="price"]') ||
                    document.querySelector('.price-amount') ||
                    document.querySelector('[class*="price"]');
    const priceText = priceEl?.textContent || '';
    const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

    // Year, Make, Model from title
    const titleEl = document.querySelector('h1') ||
                    document.querySelector('[data-testid="listing-title"]');
    const title = titleEl?.textContent?.trim() || '';
    const { year, make, model, trim } = this.parseTitle(title);

    // Odometer
    const odoEl = document.querySelector('[data-testid="mileage"]') ||
                  document.querySelector('[class*="mileage"]') ||
                  document.querySelector('[class*="odometer"]');
    const odoText = odoEl?.textContent || '';
    const odo = parseInt(odoText.replace(/[^0-9]/g, '')) || 0;

    // Dealer
    const dealerEl = document.querySelector('[data-testid="dealer-name"]') ||
                     document.querySelector('.dealer-name') ||
                     document.querySelector('[class*="dealer"]');
    const dealer = dealerEl?.textContent?.trim() || '';

    // Location - try multiple selectors for AutoTrader
    const locationSelectors = [
      '[data-testid="location"]',
      '[data-testid="dealer-location"]',
      '[class*="dealer-address"]',
      '[class*="dealerAddress"]',
      '[class*="location"]',
      'address',
      '[itemprop="address"]'
    ];

    let listingLocation = '';
    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        listingLocation = el.textContent.trim();
        break;
      }
    }

    // Also try to extract from URL (AutoTrader URLs contain city/province)
    // Format: /a/make/model/city/province/12345
    if (!listingLocation) {
      const urlMatch = window.location.pathname.match(/\/a\/[^\/]+\/[^\/]+\/([^\/]+)\/([^\/]+)\//);
      if (urlMatch) {
        const city = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const province = urlMatch[2].toUpperCase();
        listingLocation = `${city}, ${province}`;
      }
    }

    // Photos - try multiple selectors for AutoTrader's layout
    const photoSelectors = [
      '[data-testid="gallery"] img',
      '.gallery-image img',
      '[class*="gallery"] img',
      '[class*="mediaviewer"] img',
      '[class*="photo"] img',
      'picture source',
      'picture img'
    ];

    let photos = [];
    for (const selector of photoSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        photos = Array.from(elements)
          .map(el => {
            let src = el.src || el.srcset?.split(' ')[0] || el.dataset.src ||
                      el.dataset.lazy || el.getAttribute('data-srcset')?.split(' ')[0];
            if (!src) return null;

            // Convert to absolute URL
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('/')) src = window.location.origin + src;

            return src;
          })
          .filter(src => src &&
                         !src.includes('placeholder') &&
                         !src.includes('data:image') &&
                         src.includes('http'));

        if (photos.length > 0) break;
      }
    }

    // VIN (if available)
    const vinEl = document.querySelector('[data-testid="vin"]') ||
                  Array.from(document.querySelectorAll('*')).find(el => /VIN/i.test(el.textContent) && el.textContent.length < 50);
    const vinMatch = vinEl?.textContent?.match(/[A-HJ-NPR-Z0-9]{17}/i);
    const vin = vinMatch ? vinMatch[0].toUpperCase() : '';

    return {
      year,
      make,
      model,
      trim,
      price,
      odo,
      dealer,
      location: listingLocation,
      photos: [...new Set(photos)].slice(0, 10),
      vin,
      url: window.location.href,
      source: 'autotrader.ca'
    };
  },

  // Parse title like "2023 Chevrolet Bolt EUV LT"
  parseTitle(title) {
    const match = title.match(/^(\d{4})\s+(\w+)\s+(.+)/);
    if (!match) return { year: 0, make: '', model: '', trim: '' };

    const year = parseInt(match[1]);
    const make = match[2];
    const rest = match[3];

    // Try to separate model from trim
    const modelMatch = findVehicleMatch(make, rest);
    if (modelMatch && modelMatch.model) {
      const trimStart = rest.toLowerCase().indexOf(modelMatch.model.toLowerCase()) + modelMatch.model.length;
      const trim = rest.substring(trimStart).trim();
      return { year, make: modelMatch.make, model: modelMatch.model, trim };
    }

    // Fallback: first word(s) as model, rest as trim
    const words = rest.split(' ');
    const model = words.slice(0, 2).join(' ');
    const trim = words.slice(2).join(' ');
    return { year, make, model, trim };
  },

  // Normalize JSON-LD data to our format
  normalizeData(jsonLd) {
    const name = jsonLd.name || '';
    const { year, make, model, trim } = this.parseTitle(name);

    return {
      year: year || jsonLd.vehicleModelDate || jsonLd.modelDate,
      make: make || jsonLd.brand?.name || jsonLd.manufacturer?.name || '',
      model: model || jsonLd.model || '',
      trim,
      price: parseInt(jsonLd.offers?.price) || 0,
      odo: parseInt(jsonLd.mileageFromOdometer?.value) || 0,
      dealer: jsonLd.seller?.name || '',
      location: jsonLd.seller?.address?.addressLocality || '',
      photos: jsonLd.image ? (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]) : [],
      vin: jsonLd.vehicleIdentificationNumber || '',
      url: window.location.href,
      source: 'autotrader.ca'
    };
  }
};

// Register parser
if (typeof window !== 'undefined') {
  window.AutoTraderParser = AutoTraderParser;
}
