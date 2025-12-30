// Clutch.ca Parser
// Extracts vehicle data from Clutch online car retailer

const ClutchParser = {
  name: 'Clutch',
  hostname: 'clutch.ca',

  isListingPage() {
    // Clutch URLs: /vehicles/76427 or /vehicles/2023-chevrolet-bolt-ev-123456
    return /\/vehicles\/[\w-]*\d+/.test(location.pathname);
  },

  isEVListing() {
    // Check fuel type badge or title
    const fuelBadge = document.querySelector('[class*="fuel"], [class*="electric"]');
    if (fuelBadge?.textContent?.toLowerCase().includes('electric')) return true;

    const title = document.querySelector('h1')?.textContent || '';
    return isLikelyEV(title);
  },

  extractData() {
    try {
      // Clutch often has React data in window.__NEXT_DATA__
      const nextData = this.extractNextData();
      if (nextData) {
        return this.normalizeNextData(nextData);
      }

      return this.extractFromDOM();
    } catch (e) {
      console.error('Clutch parser error:', e);
      return null;
    }
  },

  extractNextData() {
    try {
      const script = document.getElementById('__NEXT_DATA__');
      if (script) {
        const data = JSON.parse(script.textContent);
        return data?.props?.pageProps?.vehicle || data?.props?.pageProps?.car;
      }
    } catch (e) {}
    return null;
  },

  extractFromDOM() {
    // Title
    const titleEl = document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || '';
    const { year, make, model, trim } = this.parseTitle(title);

    // Price - Clutch shows "all-in" pricing
    const priceEl = document.querySelector('[class*="price"], [data-testid="price"]');
    const priceText = priceEl?.textContent || '';
    const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

    // Specs from attribute list
    const specs = this.extractSpecs();

    // Photos from gallery
    const photoSelectors = [
      '[class*="gallery"] img',
      '[class*="carousel"] img',
      '[class*="Gallery"] img',
      '[class*="slider"] img',
      'picture img'
    ];

    let photos = [];
    for (const selector of photoSelectors) {
      const imgs = document.querySelectorAll(selector);
      if (imgs.length > 0) {
        photos = Array.from(imgs)
          .map(img => {
            let src = img.src || img.dataset.src || img.currentSrc;
            if (!src) return null;
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('/')) src = window.location.origin + src;
            return src;
          })
          .filter(src => src && !src.includes('placeholder') && !src.includes('data:image'));
        if (photos.length > 0) break;
      }
    }

    return {
      year,
      make,
      model,
      trim,
      price,
      odo: specs.odometer || 0,
      color: specs.colour || specs.color || '',
      dealer: 'Clutch',
      location: specs.location || 'Online',
      photos: [...new Set(photos)].slice(0, 10),
      url: window.location.href,
      source: 'clutch.ca'
    };
  },

  extractSpecs() {
    const specs = {};

    // Look for spec items
    const specItems = document.querySelectorAll('[class*="spec"], [class*="detail"], [class*="attribute"]');
    specItems.forEach(item => {
      const label = item.querySelector('[class*="label"], dt, span:first-child')?.textContent?.trim().toLowerCase();
      const value = item.querySelector('[class*="value"], dd, span:last-child')?.textContent?.trim();
      if (label && value) {
        specs[label.replace(/\s+/g, '')] = value;
      }
    });

    // Extract odometer specifically
    const odoMatch = document.body.textContent.match(/(\d{1,3},?\d{3})\s*km/i);
    if (odoMatch) {
      specs.odometer = parseInt(odoMatch[1].replace(/,/g, ''));
    }

    // Extract location - Clutch shows delivery locations
    const locationSelectors = [
      '[class*="location"]',
      '[class*="delivery"]',
      '[class*="available-in"]',
      '[class*="city"]'
    ];

    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim() && !el.textContent.includes('Delivery')) {
        specs.location = el.textContent.trim();
        break;
      }
    }

    return specs;
  },

  parseTitle(title) {
    const match = title.match(/^(\d{4})\s+(\w+)\s+(.+)/);
    if (!match) return { year: 0, make: '', model: '', trim: '' };

    const year = parseInt(match[1]);
    const make = match[2];
    const rest = match[3];

    const modelMatch = findVehicleMatch(make, rest);
    if (modelMatch && modelMatch.model) {
      const trimStart = rest.toLowerCase().indexOf(modelMatch.model.toLowerCase()) + modelMatch.model.length;
      const trim = rest.substring(trimStart).trim();
      return { year, make: modelMatch.make, model: modelMatch.model, trim };
    }

    const words = rest.split(' ');
    return { year, make, model: words.slice(0, 2).join(' '), trim: words.slice(2).join(' ') };
  },

  normalizeNextData(vehicle) {
    return {
      year: vehicle.year || 0,
      make: vehicle.make || '',
      model: vehicle.model || '',
      trim: vehicle.trim || '',
      price: vehicle.price || vehicle.allInPrice || 0,
      odo: vehicle.odometer || vehicle.mileage || 0,
      color: vehicle.exteriorColour || vehicle.color || '',
      dealer: 'Clutch',
      location: vehicle.location?.city || 'Online',
      photos: vehicle.images || vehicle.photos || [],
      vin: vehicle.vin || '',
      url: window.location.href,
      source: 'clutch.ca'
    };
  }
};

if (typeof window !== 'undefined') {
  window.ClutchParser = ClutchParser;
}
