// Kijiji.ca / Kijiji Autos Parser
// Extracts vehicle data from Kijiji listings

const KijijiParser = {
  name: 'Kijiji',
  hostname: 'kijiji.ca',

  // Check if current page is a vehicle listing
  isListingPage() {
    // Kijiji Autos: /cars-trucks/... or /v-autos-camions/...
    // Regular Kijiji: /v-cars-trucks/.../1234567
    return /\/(v-)?((cars|autos)-?(trucks|camions)?|vehicles?)\//.test(location.pathname) &&
           /\/\d{8,}/.test(location.pathname);
  },

  // Check if this is an EV listing
  isEVListing() {
    const title = document.querySelector('h1')?.textContent || '';
    const description = document.querySelector('[class*="description"]')?.textContent || '';

    // Check for electric fuel type attribute
    const fuelAttr = document.querySelector('[class*="fuel"], [data-testid*="fuel"]');
    if (fuelAttr?.textContent?.toLowerCase().includes('electric')) return true;

    return isLikelyEV(title + ' ' + description);
  },

  // Extract all vehicle data
  extractData() {
    try {
      // Try JSON-LD first
      const jsonLd = this.extractJsonLd();
      if (jsonLd) {
        return this.normalizeJsonLd(jsonLd);
      }

      return this.extractFromDOM();
    } catch (e) {
      console.error('Kijiji parser error:', e);
      return null;
    }
  },

  extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Car' || data['@type'] === 'Vehicle' || data['@type'] === 'Product') {
          return data;
        }
      } catch (e) {}
    }
    return null;
  },

  extractFromDOM() {
    // Title - usually "2023 Chevrolet Bolt EV"
    const titleEl = document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || '';
    const { year, make, model, trim } = this.parseTitle(title);

    // Price
    const priceEl = document.querySelector('[class*="price"], [data-testid="price"]') ||
                    document.querySelector('[itemprop="price"]');
    const priceText = priceEl?.textContent || priceEl?.getAttribute('content') || '';
    const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;

    // Attributes table
    const attributes = this.extractAttributes();

    // Odometer
    const odo = attributes.kilometres || attributes.mileage || attributes.odometer || 0;

    // Dealer/Seller
    const sellerEl = document.querySelector('[class*="seller-name"], [class*="dealerName"]') ||
                     document.querySelector('[data-testid="seller-info"]');
    const dealer = sellerEl?.textContent?.trim() || 'Private Seller';

    // Location
    const locationEl = document.querySelector('[class*="location"], [data-testid="location"]') ||
                       document.querySelector('address');
    const location = locationEl?.textContent?.trim() || '';

    // Photos
    const photos = Array.from(document.querySelectorAll('[class*="gallery"] img, [class*="image"] img'))
      .map(img => {
        const src = img.src || img.dataset.src || img.getAttribute('data-lazy');
        // Get full size version
        return src?.replace(/\$_\d+\.JPG/i, '$_57.JPG') || src;
      })
      .filter(src => src && !src.includes('placeholder') && !src.includes('avatar'));

    return {
      year,
      make,
      model,
      trim,
      price,
      odo: parseInt(String(odo).replace(/[^0-9]/g, '')) || 0,
      dealer,
      location,
      color: attributes.colour || attributes.color || '',
      photos: photos.slice(0, 10),
      url: location.href,
      source: 'kijiji.ca'
    };
  },

  // Extract from attribute list/table
  extractAttributes() {
    const attrs = {};
    const attrElements = document.querySelectorAll('[class*="attribute"], [class*="spec"], dl dt, dl dd');

    // Try key-value pairs
    const items = document.querySelectorAll('[class*="attributeList"] li, [class*="specs"] li');
    items.forEach(item => {
      const text = item.textContent?.trim() || '';
      const [key, value] = text.split(':').map(s => s.trim());
      if (key && value) {
        attrs[key.toLowerCase().replace(/\s+/g, '')] = value;
      }
    });

    // Try dt/dd pairs
    const dts = document.querySelectorAll('dt');
    dts.forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') {
        const key = dt.textContent?.trim().toLowerCase().replace(/\s+/g, '');
        const value = dd.textContent?.trim();
        if (key && value) attrs[key] = value;
      }
    });

    return attrs;
  },

  parseTitle(title) {
    // Handle "2023 Chevrolet Bolt EV LT" format
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
    return {
      year,
      make,
      model: words.slice(0, 2).join(' '),
      trim: words.slice(2).join(' ')
    };
  },

  normalizeJsonLd(data) {
    const name = data.name || '';
    const { year, make, model, trim } = this.parseTitle(name);

    return {
      year: year || parseInt(data.vehicleModelDate) || 0,
      make: make || data.brand?.name || '',
      model: model || data.model || '',
      trim,
      price: parseInt(data.offers?.price || data.price) || 0,
      odo: parseInt(data.mileageFromOdometer?.value) || 0,
      dealer: data.seller?.name || 'Private Seller',
      location: data.seller?.address?.addressLocality || '',
      photos: data.image ? (Array.isArray(data.image) ? data.image : [data.image]) : [],
      url: location.href,
      source: 'kijiji.ca'
    };
  }
};

if (typeof window !== 'undefined') {
  window.KijijiParser = KijijiParser;
}
