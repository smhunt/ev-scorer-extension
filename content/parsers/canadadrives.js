// CanadaDrives.ca Parser
// Extracts vehicle data from Canada Drives listings

const CanadaDrivesParser = {
  name: 'CanadaDrives',
  hostname: 'canadadrives.ca',

  isListingPage() {
    // Canada Drives: /used-cars/... or /vehicles/...
    return /\/(used-cars|vehicles)\/[\w-]+-\d+/.test(location.pathname);
  },

  isEVListing() {
    const fuelType = document.querySelector('[class*="fuel"]')?.textContent?.toLowerCase() || '';
    if (fuelType.includes('electric')) return true;

    const title = document.querySelector('h1')?.textContent || '';
    return isLikelyEV(title);
  },

  extractData() {
    try {
      // Try Next.js data
      const nextData = this.extractNextData();
      if (nextData) {
        return this.normalizeNextData(nextData);
      }

      return this.extractFromDOM();
    } catch (e) {
      console.error('CanadaDrives parser error:', e);
      return null;
    }
  },

  extractNextData() {
    try {
      const script = document.getElementById('__NEXT_DATA__');
      if (script) {
        const data = JSON.parse(script.textContent);
        return data?.props?.pageProps?.vehicle || data?.props?.pageProps?.listing;
      }
    } catch (e) {}
    return null;
  },

  extractFromDOM() {
    // Title
    const titleEl = document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || '';
    const { year, make, model, trim } = this.parseTitle(title);

    // Price
    const priceEl = document.querySelector('[class*="price"], [data-testid="price"]');
    const priceText = priceEl?.textContent || '';
    const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

    // Specs
    const specs = this.extractSpecs();

    // Photos
    const photos = Array.from(document.querySelectorAll('[class*="gallery"] img, [class*="image"] img'))
      .map(img => img.src || img.dataset.src)
      .filter(src => src && !src.includes('placeholder'));

    return {
      year,
      make,
      model,
      trim,
      price,
      odo: specs.odometer || specs.kilometres || 0,
      color: specs.colour || specs.color || '',
      dealer: 'Canada Drives',
      location: 'Online',
      photos: photos.slice(0, 10),
      url: location.href,
      source: 'canadadrives.ca'
    };
  },

  extractSpecs() {
    const specs = {};
    const specItems = document.querySelectorAll('[class*="spec"], [class*="detail"]');

    specItems.forEach(item => {
      const text = item.textContent || '';
      const parts = text.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim().toLowerCase().replace(/\s+/g, '');
        const value = parts[1].trim();
        specs[key] = value;
      }
    });

    // Extract odometer
    const odoMatch = document.body.textContent.match(/(\d{1,3},?\d{3})\s*km/i);
    if (odoMatch) {
      specs.odometer = parseInt(odoMatch[1].replace(/,/g, ''));
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
      price: vehicle.price || vehicle.salePrice || 0,
      odo: vehicle.odometer || vehicle.kilometres || 0,
      color: vehicle.exteriorColour || vehicle.color || '',
      dealer: 'Canada Drives',
      location: vehicle.location || 'Online',
      photos: vehicle.images || vehicle.photos || [],
      vin: vehicle.vin || '',
      url: location.href,
      source: 'canadadrives.ca'
    };
  }
};

if (typeof window !== 'undefined') {
  window.CanadaDrivesParser = CanadaDrivesParser;
}
