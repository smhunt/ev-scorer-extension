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

    // Location - try multiple selectors for Kijiji
    const locationSelectors = [
      '[data-testid="location"]',
      '[class*="location"]',
      '[class*="adLocation"]',
      '[class*="ad-location"]',
      '[itemprop="address"]',
      'address',
      '[class*="seller-location"]',
      '[class*="address"]'
    ];

    let listingLocation = '';
    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        listingLocation = el.textContent.trim()
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .replace(/^Location:?\s*/i, ''); // Remove "Location:" prefix
        break;
      }
    }

    // Also check breadcrumbs for location (Kijiji often has city in breadcrumbs)
    if (!listingLocation) {
      const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav[aria-label*="breadcrumb"] a');
      if (breadcrumbs.length > 1) {
        // Second-to-last breadcrumb is often the city
        const cityBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
        if (cityBreadcrumb?.textContent) {
          listingLocation = cityBreadcrumb.textContent.trim();
        }
      }
    }

    // Photos - try multiple selectors for Kijiji's various layouts
    const photoSelectors = [
      '[data-testid="gallery"] img',
      '[class*="gallery"] img',
      '[class*="image-gallery"] img',
      '[class*="heroImage"] img',
      '[class*="thumbnails"] img',
      'picture img',
      '[class*="slider"] img'
    ];

    let photos = [];
    for (const selector of photoSelectors) {
      const imgs = document.querySelectorAll(selector);
      if (imgs.length > 0) {
        photos = Array.from(imgs)
          .map(img => {
            // Try various src attributes
            let src = img.src || img.dataset.src || img.getAttribute('data-lazy') ||
                      img.getAttribute('data-srcset')?.split(' ')[0] ||
                      img.currentSrc;
            if (!src) return null;

            // Convert to absolute URL
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('/')) src = window.location.origin + src;

            // Get larger version for Kijiji images
            src = src.replace(/\$_\d+\.JPG/i, '$_57.JPG')
                     .replace(/\/\$_\d+\./i, '/$_57.')
                     .replace(/s-l\d+\./i, 's-l640.');

            return src;
          })
          .filter(src => src &&
                         !src.includes('placeholder') &&
                         !src.includes('avatar') &&
                         !src.includes('data:image') &&
                         (src.includes('http') || src.includes('//')));

        if (photos.length > 0) break;
      }
    }

    // VIN
    const vinMatch = document.body.textContent.match(/VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
    const vin = vinMatch ? vinMatch[1].toUpperCase() : '';

    // Description
    const descEl = document.querySelector('[class*="description"]') ||
                   document.querySelector('[data-testid="description"]');
    const rawDesc = descEl?.textContent?.trim() || '';
    const description = this.cleanDescription(rawDesc);

    // Features
    const features = this.extractFeatures();

    // Carfax URL
    const carfaxLink = document.querySelector('a[href*="carfax"], a[href*="CARFAX"]');
    const carfaxUrl = carfaxLink?.href || '';

    return {
      year,
      make,
      model,
      trim,
      price,
      odo: parseInt(String(odo).replace(/[^0-9]/g, '')) || 0,
      dealer,
      location: listingLocation,
      color: attributes.colour || attributes.color || '',
      photos: [...new Set(photos)].slice(0, 10),
      vin,
      description,
      features,
      carfaxUrl,
      url: window.location.href,
      source: 'kijiji.ca'
    };
  },

  cleanDescription(raw) {
    if (!raw) return '';
    const marketingPhrases = [
      /call (us )?(today|now)/gi, /don'?t miss/gi, /won'?t last/gi,
      /best (deal|price)/gi, /act (fast|now)/gi, /financing available/gi,
      /contact us/gi, /\b(amazing|incredible|fantastic)\b/gi, /!\s*!+/g
    ];
    let cleaned = raw;
    marketingPhrases.forEach(p => cleaned = cleaned.replace(p, ''));
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned.length > 500 ? cleaned.substring(0, 497) + '...' : cleaned;
  },

  extractFeatures() {
    const features = [];
    const selectors = ['[class*="feature"] li', '[class*="highlight"] li', '[class*="specs"] li'];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length < 100) features.push(t);
      });
      if (features.length) break;
    }
    return [...new Set(features)].slice(0, 20);
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
      url: window.location.href,
      source: 'kijiji.ca'
    };
  }
};

if (typeof window !== 'undefined') {
  window.KijijiParser = KijijiParser;
}
