// EV Vehicle Database for autocomplete and specs
const VEHICLE_DATABASE = {
  'Chevrolet': {
    models: {
      'Bolt EV': { range: 417, length: 163, heatPump: false, trims: ['1LT', '2LT', 'Premier'] },
      'Bolt EUV': { range: 397, length: 169, heatPump: false, trims: ['LT', 'Premier'] },
      'Equinox EV': { range: 513, length: 184, heatPump: true, trims: ['1LT', '2LT', '2RS', '3RS'] },
    }
  },
  'Hyundai': {
    models: {
      'Kona Electric': { range: 415, length: 164, heatPump: true, trims: ['Essential', 'Preferred', 'Ultimate'] },
      'Ioniq 5': { range: 488, length: 182, heatPump: true, trims: ['Essential', 'Preferred', 'Ultimate'] },
      'Ioniq 6': { range: 581, length: 191, heatPump: true, trims: ['Essential', 'Preferred', 'Ultimate'] },
    }
  },
  'Kia': {
    models: {
      'Niro EV': { range: 407, length: 171, heatPump: true, trims: ['EX', 'EX+', 'SX Touring', 'Wind', 'Wave'] },
      'Soul EV': { range: 391, length: 165, heatPump: true, trims: ['Premium', 'Limited'] },
      'EV6': { range: 499, length: 184, heatPump: true, trims: ['Standard', 'Long Range', 'GT-Line', 'GT'] },
    }
  },
  'Nissan': {
    models: {
      'Leaf': { range: 342, length: 176, heatPump: true, trims: ['S', 'SV', 'SV Plus', 'SL Plus'] },
      'Ariya': { range: 482, length: 182, heatPump: true, trims: ['Engage', 'Venture+', 'Evolve+', 'Platinum+'] },
    }
  },
  'Tesla': {
    models: {
      'Model 3': { range: 438, length: 185, heatPump: true, trims: ['Standard Range', 'Long Range', 'Performance'] },
      'Model Y': { range: 455, length: 187, heatPump: true, trims: ['Standard Range', 'Long Range', 'Performance'] },
      'Model S': { range: 560, length: 196, heatPump: true, trims: ['Long Range', 'Plaid'] },
      'Model X': { range: 543, length: 199, heatPump: true, trims: ['Long Range', 'Plaid'] },
    }
  },
  'Ford': {
    models: {
      'Mustang Mach-E': { range: 490, length: 186, heatPump: true, trims: ['Select', 'Premium', 'California Route 1', 'GT'] },
      'F-150 Lightning': { range: 483, length: 233, heatPump: true, trims: ['Pro', 'XLT', 'Lariat', 'Platinum'] },
    }
  },
  'Volkswagen': {
    models: {
      'ID.4': { range: 443, length: 181, heatPump: true, trims: ['Standard', 'Pro', 'Pro S', 'Pro S Plus'] },
      'ID.Buzz': { range: 411, length: 185, heatPump: true, trims: ['Pro S', 'Pro S Plus'] },
    }
  },
  'BMW': {
    models: {
      'iX': { range: 520, length: 195, heatPump: true, trims: ['xDrive40', 'xDrive50', 'M60'] },
      'i4': { range: 484, length: 188, heatPump: true, trims: ['eDrive35', 'eDrive40', 'M50'] },
      'i5': { range: 475, length: 195, heatPump: true, trims: ['eDrive40', 'M60'] },
    }
  },
  'Mercedes-Benz': {
    models: {
      'EQE': { range: 495, length: 195, heatPump: true, trims: ['350+', '500 4MATIC'] },
      'EQS': { range: 547, length: 207, heatPump: true, trims: ['450+', '580 4MATIC'] },
    }
  },
  'Polestar': {
    models: {
      'Polestar 2': { range: 435, length: 181, heatPump: true, trims: ['Single Motor', 'Long Range', 'Dual Motor'] },
    }
  },
  'Rivian': {
    models: {
      'R1T': { range: 505, length: 217, heatPump: true, trims: ['Adventure', 'Launch Edition'] },
      'R1S': { range: 505, length: 200, heatPump: true, trims: ['Adventure', 'Launch Edition'] },
    }
  },
};

// EV keywords for detection
const EV_KEYWORDS = [
  'electric', 'ev', 'bev', 'battery', 'zero emission',
  'bolt', 'leaf', 'model 3', 'model y', 'model s', 'model x',
  'ioniq', 'kona electric', 'niro ev', 'ev6', 'id.4', 'id.buzz',
  'mach-e', 'mustang mach-e', 'f-150 lightning', 'lightning',
  'polestar', 'rivian', 'r1t', 'r1s', 'ariya', 'eqe', 'eqs',
  'i4', 'ix', 'i5', 'equinox ev'
];

// Check if a listing is likely an EV
function isLikelyEV(text) {
  const lowerText = (text || '').toLowerCase();
  return EV_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Get vehicle specs from database
function getVehicleSpecs(make, model) {
  const makeData = VEHICLE_DATABASE[make];
  if (!makeData) return null;
  return makeData.models[model] || null;
}

// Find best match for make/model
function findVehicleMatch(makeStr, modelStr) {
  const make = Object.keys(VEHICLE_DATABASE).find(m =>
    makeStr.toLowerCase().includes(m.toLowerCase()) ||
    m.toLowerCase().includes(makeStr.toLowerCase())
  );

  if (!make) return null;

  const models = Object.keys(VEHICLE_DATABASE[make].models);
  const model = models.find(m =>
    modelStr.toLowerCase().includes(m.toLowerCase()) ||
    m.toLowerCase().includes(modelStr.toLowerCase())
  );

  if (!model) return { make, model: null, specs: null };

  return {
    make,
    model,
    specs: VEHICLE_DATABASE[make].models[model]
  };
}
