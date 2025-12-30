// CarGurus.ca Parser
// Extracts vehicle data from CarGurus listings

const CarGurusParser = {
  name: 'CarGurus',
  hostname: 'cargurus.ca',

  isListingPage() {
    // CarGurus: /Cars/inventorylisting/... or /inventory/...
    return /\/(Cars\/inventorylisting|inventory)\//.test(location.pathname) ||
           /\/vdp\/\d+/.test(location.pathname);
  },

  isEVListing() {
    const fuelType = document.querySelector('[data-cg-ft="fuel_type"]')?.textContent?.toLowerCase() || '';
    if (fuelType.includes('electric')) return true;

    const title = document.querySelector('h1')?.textContent || '';
    return isLikelyEV(title);
  },

  extractData() {
    try {
      // Try JSON-LD
      const jsonLd = this.extractJsonLd();
      if (jsonLd) {
        return this.normalizeJsonLd(jsonLd);
      }

      // Try embedded data
      const cgData = this.extractCGData();
      if (cgData) {
        return this.normalizeCGData(cgData);
      }

      return this.extractFromDOM();
    } catch (e) {
      console.error('CarGurus parser error:', e);
      return null;
    }
  },

  extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Car' || data['@type'] === 'Vehicle') {
          return data;
        }
      } catch (e) {}
    }
    return null;
  },

  extractCGData() {
    // CarGurus often embeds data in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent;
      if (text.includes('listingData') || text.includes('vehicleData')) {
        try {
          const match = text.match(/(?:listingData|vehicleData)\s*[=:]\s*({[^;]+})/);
          if (match) {
            return JSON.parse(match[1]);
          }
        } catch (e) {}
      }
    }
    return null;
  },

  extractFromDOM() {
    // Title
    const titleEl = document.querySelector('h1[class*="listing"]') || document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || '';
    const { year, make, model, trim } = this.parseTitle(title);

    // Price
    const priceEl = document.querySelector('[class*="price"], [data-cg-ft="price"]');
    const priceText = priceEl?.textContent || '';
    const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

    // Odometer
    const odoEl = document.querySelector('[data-cg-ft="mileage"], [class*="mileage"]');
    const odoText = odoEl?.textContent || '';
    const odo = parseInt(odoText.replace(/[^0-9]/g, '')) || 0;

    // Dealer
    const dealerEl = document.querySelector('[class*="dealer-name"], [data-cg-ft="dealer"]');
    const dealer = dealerEl?.textContent?.trim() || '';

    // Location - try multiple selectors for CarGurus
    const locationSelectors = [
      '[class*="dealer-location"]',
      '[class*="dealerLocation"]',
      '[class*="dealer-address"]',
      '[class*="address"]',
      '[data-cg-ft="dealer-address"]',
      '[itemprop="address"]'
    ];

    let listingLocation = '';
    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        listingLocation = el.textContent.trim()
          .replace(/\s+/g, ' ')
          .replace(/^Address:?\s*/i, '');
        break;
      }
    }

    // Photos
    const photos = Array.from(document.querySelectorAll('[class*="gallery"] img, [class*="media"] img'))
      .map(img => img.src || img.dataset.src)
      .filter(src => src && !src.includes('placeholder'));

    // Deal rating
    const dealRating = document.querySelector('[class*="deal-rating"]')?.textContent?.trim() || '';

    return {
      year,
      make,
      model,
      trim,
      price,
      odo,
      dealer,
      location: listingLocation,
      photos: photos.slice(0, 10),
      dealRating,
      url: window.location.href,
      source: 'cargurus.ca'
    };
  },

  parseTitle(title) {
    // Handle various formats
    const cleanTitle = title.replace(/used|new|certified/gi, '').trim();
    const match = cleanTitle.match(/^(\d{4})\s+(\w+)\s+(.+)/);
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

  normalizeJsonLd(data) {
    const name = data.name || '';
    const { year, make, model, trim } = this.parseTitle(name);

    return {
      year: year || parseInt(data.vehicleModelDate),
      make: make || data.brand?.name || '',
      model: model || data.model || '',
      trim,
      price: parseInt(data.offers?.price) || 0,
      odo: parseInt(data.mileageFromOdometer?.value) || 0,
      dealer: data.seller?.name || '',
      location: data.seller?.address?.addressLocality || '',
      photos: data.image ? (Array.isArray(data.image) ? data.image : [data.image]) : [],
      url: window.location.href,
      source: 'cargurus.ca'
    };
  },

  normalizeCGData(data) {
    return {
      year: data.year || 0,
      make: data.make || '',
      model: data.model || '',
      trim: data.trim || '',
      price: data.price || data.listPrice || 0,
      odo: data.mileage || data.odometer || 0,
      dealer: data.dealerName || '',
      location: data.dealerCity || data.dealerLocation || '',
      photos: data.images || [],
      dealRating: data.dealRating || '',
      url: window.location.href,
      source: 'cargurus.ca'
    };
  }
};

if (typeof window !== 'undefined') {
  window.CarGurusParser = CarGurusParser;
}
