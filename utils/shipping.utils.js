/**
 * Shipping and Tax Calculation Utilities
 * Provides shipping rates and tax calculations based on location
 */

// Shipping rates by region (in USD)
const SHIPPING_RATES = {
  // Domestic (Uganda)
  UG: {
    standard: { price: 5.00, days: '3-5' },
    express: { price: 12.00, days: '1-2' },
    free_threshold: 50.00, // Free shipping above this amount
  },
  // East Africa
  KE: { standard: { price: 15.00, days: '5-7' }, express: { price: 30.00, days: '2-3' } },
  TZ: { standard: { price: 15.00, days: '5-7' }, express: { price: 30.00, days: '2-3' } },
  RW: { standard: { price: 12.00, days: '4-6' }, express: { price: 25.00, days: '2-3' } },
  SS: { standard: { price: 18.00, days: '7-10' }, express: { price: 35.00, days: '3-4' } },
  // Rest of Africa
  AFRICA: { standard: { price: 25.00, days: '10-14' }, express: { price: 50.00, days: '5-7' } },
  // International
  EU: { standard: { price: 35.00, days: '14-21' }, express: { price: 70.00, days: '7-10' } },
  US: { standard: { price: 40.00, days: '14-21' }, express: { price: 80.00, days: '7-10' } },
  DEFAULT: { standard: { price: 45.00, days: '21-30' }, express: { price: 90.00, days: '10-14' } },
};

// African countries
const AFRICAN_COUNTRIES = [
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD',
  'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'CI', 'LS',
  'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RE',
  'SC', 'SL', 'SO', 'ZA', 'SD', 'TG', 'TN', 'UG', 'ZM', 'ZW', 'KE', 'TZ', 'RW', 'SS'
];

// EU countries
const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

// Tax rates by country (VAT/Sales Tax)
const TAX_RATES = {
  UG: 0.18,  // Uganda VAT 18%
  KE: 0.16,  // Kenya VAT 16%
  TZ: 0.18,  // Tanzania VAT 18%
  RW: 0.18,  // Rwanda VAT 18%
  // For international orders, typically no tax collected (handled by customs)
  DEFAULT: 0,
};

/**
 * Get shipping region for a country
 */
function getShippingRegion(countryCode) {
  const code = (countryCode || '').toUpperCase();
  
  if (SHIPPING_RATES[code]) return code;
  if (EU_COUNTRIES.includes(code)) return 'EU';
  if (code === 'US' || code === 'CA') return 'US';
  if (AFRICAN_COUNTRIES.includes(code)) return 'AFRICA';
  return 'DEFAULT';
}

/**
 * Calculate shipping cost
 * @param {Object} params
 * @param {string} params.countryCode - ISO country code
 * @param {number} params.orderTotal - Order subtotal
 * @param {string} params.method - 'standard' or 'express'
 * @param {number} params.itemCount - Number of items (for weight calculation)
 * @param {number} params.totalWeight - Total weight in kg (optional)
 */
function calculateShipping({ countryCode, orderTotal, method = 'standard', itemCount = 1, totalWeight = 0 }) {
  const region = getShippingRegion(countryCode);
  const rates = SHIPPING_RATES[region] || SHIPPING_RATES.DEFAULT;
  const shippingMethod = rates[method] || rates.standard;
  
  // Check for free shipping threshold (domestic only)
  if (region === 'UG' && rates.free_threshold && orderTotal >= rates.free_threshold && method === 'standard') {
    return {
      cost: 0,
      method: 'standard',
      estimatedDays: shippingMethod.days,
      isFree: true,
      message: 'Free shipping on orders over $50'
    };
  }
  
  let cost = shippingMethod.price;
  
  // Add weight surcharge for heavy orders (> 5kg)
  if (totalWeight > 5) {
    const extraWeight = totalWeight - 5;
    cost += extraWeight * 2; // $2 per extra kg
  }
  
  // Add surcharge for large orders (> 10 items)
  if (itemCount > 10) {
    cost += (itemCount - 10) * 0.50; // $0.50 per extra item
  }
  
  return {
    cost: Number(cost.toFixed(2)),
    method,
    estimatedDays: shippingMethod.days,
    isFree: false,
    region
  };
}

/**
 * Get available shipping methods for a country
 */
function getShippingMethods(countryCode, orderTotal) {
  const region = getShippingRegion(countryCode);
  const rates = SHIPPING_RATES[region] || SHIPPING_RATES.DEFAULT;
  
  const methods = [];
  
  // Standard shipping
  const standardCost = calculateShipping({ countryCode, orderTotal, method: 'standard' });
  methods.push({
    id: 'standard',
    name: 'Standard Shipping',
    ...standardCost
  });
  
  // Express shipping
  if (rates.express) {
    const expressCost = calculateShipping({ countryCode, orderTotal, method: 'express' });
    methods.push({
      id: 'express',
      name: 'Express Shipping',
      ...expressCost
    });
  }
  
  return methods;
}

/**
 * Calculate tax amount
 * @param {Object} params
 * @param {string} params.countryCode - ISO country code
 * @param {number} params.subtotal - Order subtotal before tax
 * @param {string} params.state - State/region (for future use)
 */
function calculateTax({ countryCode, subtotal, state = '' }) {
  const code = (countryCode || '').toUpperCase();
  const rate = TAX_RATES[code] !== undefined ? TAX_RATES[code] : TAX_RATES.DEFAULT;
  
  const taxAmount = subtotal * rate;
  
  return {
    rate,
    ratePercent: (rate * 100).toFixed(0) + '%',
    amount: Number(taxAmount.toFixed(2)),
    taxIncluded: false, // Prices shown exclude tax
    countryCode: code
  };
}

/**
 * Calculate complete order totals
 */
function calculateOrderTotals({ items, countryCode, shippingMethod = 'standard', couponDiscount = 0 }) {
  // Calculate items subtotal
  const itemsPrice = items.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.qty) || 1;
    return sum + (price * qty);
  }, 0);
  
  const itemCount = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
  
  // Calculate shipping
  const shipping = calculateShipping({
    countryCode,
    orderTotal: itemsPrice,
    method: shippingMethod,
    itemCount
  });
  
  // Calculate tax (on items only, not shipping)
  const tax = calculateTax({
    countryCode,
    subtotal: itemsPrice
  });
  
  // Apply discount
  const discount = Math.min(couponDiscount, itemsPrice);
  
  // Calculate total
  const totalPrice = itemsPrice + shipping.cost + tax.amount - discount;
  
  return {
    itemsPrice: Number(itemsPrice.toFixed(2)),
    shippingPrice: shipping.cost,
    shippingMethod: shipping.method,
    shippingDays: shipping.estimatedDays,
    isFreeShipping: shipping.isFree,
    taxPrice: tax.amount,
    taxRate: tax.ratePercent,
    discount: Number(discount.toFixed(2)),
    totalPrice: Number(totalPrice.toFixed(2)),
    itemCount,
    currency: 'USD'
  };
}

module.exports = {
  calculateShipping,
  calculateTax,
  calculateOrderTotals,
  getShippingMethods,
  getShippingRegion,
  SHIPPING_RATES,
  TAX_RATES
};
