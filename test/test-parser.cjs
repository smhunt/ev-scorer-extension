// Test AutoTrader parser with mock data
// Run: node test/test-parser.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock window
const mockWindow = {};

// Mock location
const mockLocation = {
  hostname: 'www.autotrader.ca',
  href: 'https://www.autotrader.ca/a/chevrolet/bolt%20ev/london/ontario/5_12345678/',
  pathname: '/a/chevrolet/bolt-ev/london/ontario/5_12345678/'
};

// Sample JSON-LD that AutoTrader uses
const sampleJsonLd = {
  "@type": "Car",
  "name": "2023 Chevrolet Bolt EV LT",
  "offers": { "price": "32995" },
  "mileageFromOdometer": { "value": "15000" },
  "brand": { "name": "Chevrolet" },
  "model": "Bolt EV",
  "vehicleModelDate": "2023",
  "seller": {
    "name": "London EV Motors",
    "address": { "addressLocality": "London" }
  },
  "vehicleIdentificationNumber": "1G1FY6S00P4123456",
  "image": [
    "https://example.com/photo1.jpg",
    "https://example.com/photo2.jpg"
  ]
};

// Mock document
const mockDocument = {
  querySelector: (sel) => {
    if (sel === 'script[type="application/ld+json"]') {
      return { textContent: JSON.stringify(sampleJsonLd) };
    }
    if (sel === 'h1') {
      return { textContent: '2023 Chevrolet Bolt EV LT' };
    }
    if (sel === '[data-testid="fuelType"]') {
      return { textContent: 'Electric' };
    }
    return null;
  },
  querySelectorAll: (sel) => {
    if (sel === 'script[type="application/ld+json"]') {
      return [{ textContent: JSON.stringify(sampleJsonLd) }];
    }
    return [];
  },
  body: { textContent: 'Electric Vehicle EV 2023 Chevrolet Bolt' }
};

// Create sandbox context
const moduleExports = {};
const sandbox = {
  window: mockWindow,
  location: mockLocation,
  document: mockDocument,
  console,
  moduleExports
};
vm.createContext(sandbox);

// Load vehicle DB first
const vehicleDbCode = fs.readFileSync(
  path.join(__dirname, '..', 'shared', 'vehicle-db.js'),
  'utf8'
);

// Wrap to export functions
const wrappedVehicleDb = vehicleDbCode + `
moduleExports.isLikelyEV = isLikelyEV;
moduleExports.findVehicleMatch = findVehicleMatch;
moduleExports.getVehicleSpecs = getVehicleSpecs;
`;
vm.runInContext(wrappedVehicleDb, sandbox);

// Make functions available globally in sandbox
vm.runInContext(`
var isLikelyEV = moduleExports.isLikelyEV;
var findVehicleMatch = moduleExports.findVehicleMatch;
var getVehicleSpecs = moduleExports.getVehicleSpecs;
`, sandbox);

// Load the parser
const parserCode = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'parsers', 'autotrader.js'),
  'utf8'
);
const wrappedParser = parserCode + `
moduleExports.AutoTraderParser = AutoTraderParser;
`;
vm.runInContext(wrappedParser, sandbox);

console.log('Testing AutoTrader Parser');
console.log('=========================\n');

// Get parser from sandbox
const AutoTraderParser = sandbox.moduleExports.AutoTraderParser;

// Test isListingPage
const isListing = AutoTraderParser.isListingPage();
console.log('isListingPage():', isListing);
console.log('  Expected: true');
console.log('  Result:', isListing === true ? '✓ PASS' : '✗ FAIL');

// Test isEVListing
const isEV = AutoTraderParser.isEVListing();
console.log('\nisEVListing():', isEV);
console.log('  Expected: true');
console.log('  Result:', isEV === true ? '✓ PASS' : '✗ FAIL');

// Test extractData
console.log('\nextractData():');
const data = AutoTraderParser.extractData();
console.log(JSON.stringify(data, null, 2));

// Validate extracted data
console.log('\nValidation:');
const checks = [
  ['year', data.year === 2023],
  ['make', data.make === 'Chevrolet'],
  ['model', data.model.includes('Bolt')],
  ['price', data.price === 32995],
  ['odo', data.odo === 15000],
  ['dealer', data.dealer === 'London EV Motors'],
  ['vin', data.vin === '1G1FY6S00P4123456'],
  ['photos', data.photos.length === 2]
];

let passed = 0;
checks.forEach(([name, result]) => {
  console.log(`  ${name}: ${result ? '✓ PASS' : '✗ FAIL'}`);
  if (result) passed++;
});

console.log(`\n${passed}/${checks.length} tests passed`);
console.log('\n✓ Parser test complete!');
