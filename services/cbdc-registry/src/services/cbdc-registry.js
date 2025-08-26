const CBDC = require('../models/cbdc');
const logger = require('../utils/logger');

/**
 * CBDC Registry Service
 * Manages registration and discovery of Central Bank Digital Currencies
 */
class CBDCRegistry {
  constructor() {
    this.cbdcs = new Map();
    this.supportedPairs = new Set();
    this.initialize();
  }

  /**
   * Initialize registry with default CBDCs
   */
  initialize() {
    // Add major CBDCs with comprehensive global coverage
    const defaultCBDCs = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'USD-CBDC',
        name: 'Digital Dollar',
        country: 'United States',
        centralBank: 'Federal Reserve',
        issuanceDate: new Date('2024-01-01'),
        status: 'active',
        decimals: 2,
        exchangeRateSource: 'https://api.federalreserve.gov/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 50000 },
          US: { patriotAct: true, ofacScreening: true, bsaCompliance: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'SWIFT-CBDC', 'FedNow-CBDC'],
        metadata: {
          region: 'North America',
          timezone: 'America/New_York',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 1000000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        code: 'EUR-CBDC',
        name: 'Digital Euro',
        country: 'European Union',
        centralBank: 'European Central Bank',
        issuanceDate: new Date('2024-06-01'),
        status: 'active',
        decimals: 2,
        exchangeRateSource: 'https://api.ecb.europa.eu/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 45000 },
          EU: { gdprCompliant: true, mifidII: true, psd2Compliance: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'TARGET-CBDC', 'SEPA-CBDC'],
        metadata: {
          region: 'Europe',
          timezone: 'Europe/Frankfurt',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 800000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        code: 'GBP-CBDC',
        name: 'Digital Pound',
        country: 'United Kingdom',
        centralBank: 'Bank of England',
        issuanceDate: new Date('2024-03-01'),
        status: 'active',
        decimals: 2,
        exchangeRateSource: 'https://api.bankofengland.co.uk/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 40000 },
          UK: { fca: true, psr: true, openBanking: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'FPS-CBDC'],
        metadata: {
          region: 'Europe',
          timezone: 'Europe/London',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 500000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        code: 'JPY-CBDC',
        name: 'Digital Yen',
        country: 'Japan',
        centralBank: 'Bank of Japan',
        issuanceDate: new Date('2024-09-01'),
        status: 'active',
        decimals: 0,
        exchangeRateSource: 'https://api.boj.or.jp/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 6000000 },
          JP: { jfsa: true, fatf: true, zenginCompliance: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'Zengin-CBDC'],
        metadata: {
          region: 'Asia Pacific',
          timezone: 'Asia/Tokyo',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 700000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440005',
        code: 'CNY-CBDC',
        name: 'Digital Yuan (e-CNY)',
        country: 'China',
        centralBank: 'People\'s Bank of China',
        issuanceDate: new Date('2023-01-01'),
        status: 'active',
        decimals: 2,
        exchangeRateSource: 'https://api.pboc.gov.cn/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 350000 },
          CN: { pbocCompliance: true, capitalControls: true },
          international: { limitedCrossBorder: true, approvalRequired: true }
        },
        interoperabilityProtocols: ['ISO20022', 'CIPS-CBDC'],
        metadata: {
          region: 'Asia Pacific',
          timezone: 'Asia/Shanghai',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 2000000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440006',
        code: 'CAD-CBDC',
        name: 'Digital Canadian Dollar',
        country: 'Canada',
        centralBank: 'Bank of Canada',
        issuanceDate: new Date('2024-11-01'),
        status: 'pilot',
        decimals: 2,
        exchangeRateSource: 'https://api.bankofcanada.ca/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 40000 },
          CA: { fintracCompliance: true, privacyAct: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'RTR-CBDC'],
        metadata: {
          region: 'North America',
          timezone: 'America/Toronto',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 300000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440007',
        code: 'AUD-CBDC',
        name: 'Digital Australian Dollar',
        country: 'Australia',
        centralBank: 'Reserve Bank of Australia',
        issuanceDate: new Date('2024-08-01'),
        status: 'pilot',
        decimals: 2,
        exchangeRateSource: 'https://api.rba.gov.au/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 35000 },
          AU: { apraCompliance: true, austracReporting: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'NPP-CBDC'],
        metadata: {
          region: 'Asia Pacific',
          timezone: 'Australia/Sydney',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 200000000
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440008',
        code: 'SGD-CBDC',
        name: 'Digital Singapore Dollar',
        country: 'Singapore',
        centralBank: 'Monetary Authority of Singapore',
        issuanceDate: new Date('2024-05-01'),
        status: 'active',
        decimals: 2,
        exchangeRateSource: 'https://api.mas.gov.sg/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true, maxTransactionAmount: 38000 },
          SG: { masCompliance: true, psaCompliance: true },
          international: { fatfCompliance: true, crossBorderReporting: true }
        },
        interoperabilityProtocols: ['ISO20022', 'PayNow-CBDC'],
        metadata: {
          region: 'Asia Pacific',
          timezone: 'Asia/Singapore',
          operatingHours: '24/7',
          settlementTime: 'instant',
          maxDailyVolume: 150000000
        }
      }
    ];

    defaultCBDCs.forEach(cbdcData => {
      const cbdc = new CBDC(cbdcData);
      this.registerCBDC(cbdc);
    });

    logger.info(`Initialized CBDC registry with ${this.cbdcs.size} currencies`);
  }

  /**
   * Register a new CBDC
   */
  registerCBDC(cbdc) {
    if (!(cbdc instanceof CBDC)) {
      throw new Error('Invalid CBDC object');
    }

    if (this.cbdcs.has(cbdc.code)) {
      throw new Error(`CBDC ${cbdc.code} already registered`);
    }

    this.cbdcs.set(cbdc.code, cbdc);
    this.updateSupportedPairs();
    
    logger.info(`Registered CBDC: ${cbdc.code} (${cbdc.name})`);
    return cbdc;
  }

  /**
   * Get CBDC by code
   */
  getCBDC(code) {
    return this.cbdcs.get(code);
  }

  /**
   * Get all registered CBDCs
   */
  getAllCBDCs() {
    return Array.from(this.cbdcs.values());
  }

  /**
   * Get active CBDCs only
   */
  getActiveCBDCs() {
    return this.getAllCBDCs().filter(cbdc => cbdc.isActive());
  }

  /**
   * Check if CBDC is supported
   */
  isSupported(code) {
    return this.cbdcs.has(code);
  }

  /**
   * Check if currency pair is supported for cross-currency transactions
   */
  isPairSupported(fromCurrency, toCurrency) {
    const pair = `${fromCurrency}/${toCurrency}`;
    const inversePair = `${toCurrency}/${fromCurrency}`;
    return this.supportedPairs.has(pair) || this.supportedPairs.has(inversePair);
  }

  /**
   * Get supported currency pairs
   */
  getSupportedPairs() {
    return Array.from(this.supportedPairs);
  }

  /**
   * Update CBDC information
   */
  updateCBDC(code, updates) {
    const cbdc = this.cbdcs.get(code);
    if (!cbdc) {
      throw new Error(`CBDC ${code} not found`);
    }

    Object.assign(cbdc, updates);
    cbdc.updatedAt = new Date();
    
    logger.info(`Updated CBDC: ${code}`);
    return cbdc;
  }

  /**
   * Remove CBDC from registry
   */
  removeCBDC(code) {
    const cbdc = this.cbdcs.get(code);
    if (!cbdc) {
      throw new Error(`CBDC ${code} not found`);
    }

    this.cbdcs.delete(code);
    this.updateSupportedPairs();
    
    logger.info(`Removed CBDC: ${code}`);
    return cbdc;
  }

  /**
   * Get CBDCs by country
   */
  getCBDCsByCountry(country) {
    return this.getAllCBDCs().filter(cbdc => 
      cbdc.country.toLowerCase() === country.toLowerCase()
    );
  }

  /**
   * Get CBDCs that support cross-border transactions
   */
  getCrossBorderCBDCs() {
    return this.getAllCBDCs().filter(cbdc => cbdc.supportsCrossBorder());
  }

  /**
   * Get compliance rules for CBDC in specific jurisdiction
   */
  getComplianceRules(cbdcCode, jurisdiction) {
    const cbdc = this.getCBDC(cbdcCode);
    if (!cbdc) {
      throw new Error(`CBDC ${cbdcCode} not found`);
    }
    return cbdc.getComplianceRules(jurisdiction);
  }

  /**
   * Update supported currency pairs based on active CBDCs
   */
  updateSupportedPairs() {
    this.supportedPairs.clear();
    const activeCBDCs = this.getActiveCBDCs();
    
    for (let i = 0; i < activeCBDCs.length; i++) {
      for (let j = i + 1; j < activeCBDCs.length; j++) {
        const from = activeCBDCs[i].code;
        const to = activeCBDCs[j].code;
        
        // Add both directions
        this.supportedPairs.add(`${from}/${to}`);
        this.supportedPairs.add(`${to}/${from}`);
      }
    }
  }

  /**
   * Get CBDCs by region
   */
  getCBDCsByRegion(region) {
    return this.getAllCBDCs().filter(cbdc => 
      cbdc.metadata && cbdc.metadata.region && 
      cbdc.metadata.region.toLowerCase() === region.toLowerCase()
    );
  }

  /**
   * Get CBDCs by interoperability protocol
   */
  getCBDCsByProtocol(protocol) {
    return this.getAllCBDCs().filter(cbdc => 
      cbdc.interoperabilityProtocols.includes(protocol)
    );
  }

  /**
   * Check if cross-currency transaction is allowed between two CBDCs
   */
  isCrossCurrencyAllowed(fromCurrency, toCurrency) {
    const fromCBDC = this.getCBDC(fromCurrency);
    const toCBDC = this.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) {
      return false;
    }

    // Check if both CBDCs are active
    if (!fromCBDC.isActive() || !toCBDC.isActive()) {
      return false;
    }

    // Check if both support cross-border transactions
    if (!fromCBDC.supportsCrossBorder() || !toCBDC.supportsCrossBorder()) {
      return false;
    }

    // Check for specific restrictions (e.g., CNY-CBDC has limited cross-border support)
    if (fromCurrency === 'CNY-CBDC' || toCurrency === 'CNY-CBDC') {
      const cnyRules = fromCurrency === 'CNY-CBDC' ? 
        fromCBDC.getComplianceRules('international') : 
        toCBDC.getComplianceRules('international');
      
      return !cnyRules.limitedCrossBorder || cnyRules.approvalRequired;
    }

    return true;
  }

  /**
   * Get maximum transaction amount for currency pair
   */
  getMaxTransactionAmount(fromCurrency, toCurrency) {
    const fromCBDC = this.getCBDC(fromCurrency);
    const toCBDC = this.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) {
      throw new Error('Invalid currency pair');
    }

    const fromRules = fromCBDC.getComplianceRules('default');
    const toRules = toCBDC.getComplianceRules('default');

    // Return the more restrictive limit
    return Math.min(
      fromRules.maxTransactionAmount || Infinity,
      toRules.maxTransactionAmount || Infinity
    );
  }

  /**
   * Get operating hours overlap for currency pair
   */
  getOperatingHoursOverlap(fromCurrency, toCurrency) {
    const fromCBDC = this.getCBDC(fromCurrency);
    const toCBDC = this.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) {
      throw new Error('Invalid currency pair');
    }

    // For now, all CBDCs operate 24/7, but this could be enhanced
    // to handle actual timezone-based operating hours
    return {
      available24x7: true,
      fromTimezone: fromCBDC.metadata?.timezone,
      toTimezone: toCBDC.metadata?.timezone,
      settlementTime: 'instant'
    };
  }

  /**
   * Validate transaction against CBDC compliance rules
   */
  validateTransaction(fromCurrency, toCurrency, amount, jurisdiction = 'international') {
    const fromCBDC = this.getCBDC(fromCurrency);
    const toCBDC = this.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) {
      throw new Error('Invalid currency pair');
    }

    const validationResult = {
      valid: true,
      warnings: [],
      requirements: []
    };

    // Check if cross-currency is allowed
    if (!this.isCrossCurrencyAllowed(fromCurrency, toCurrency)) {
      validationResult.valid = false;
      validationResult.warnings.push('Cross-currency transaction not allowed for this pair');
    }

    // Check amount limits
    const maxAmount = this.getMaxTransactionAmount(fromCurrency, toCurrency);
    if (amount > maxAmount) {
      validationResult.valid = false;
      validationResult.warnings.push(`Transaction amount exceeds maximum limit of ${maxAmount}`);
    }

    // Check compliance requirements
    const fromRules = fromCBDC.getComplianceRules(jurisdiction);
    const toRules = toCBDC.getComplianceRules(jurisdiction);

    if (fromRules.kycRequired || toRules.kycRequired) {
      validationResult.requirements.push('KYC verification required');
    }

    if (fromRules.amlScreening || toRules.amlScreening) {
      validationResult.requirements.push('AML screening required');
    }

    if (fromRules.approvalRequired || toRules.approvalRequired) {
      validationResult.requirements.push('Regulatory approval required');
    }

    return validationResult;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const cbdcs = this.getAllCBDCs();
    const statusCounts = cbdcs.reduce((acc, cbdc) => {
      acc[cbdc.status] = (acc[cbdc.status] || 0) + 1;
      return acc;
    }, {});

    const regionCounts = cbdcs.reduce((acc, cbdc) => {
      const region = cbdc.metadata?.region || 'Unknown';
      acc[region] = (acc[region] || 0) + 1;
      return acc;
    }, {});

    const protocolCounts = cbdcs.reduce((acc, cbdc) => {
      cbdc.interoperabilityProtocols.forEach(protocol => {
        acc[protocol] = (acc[protocol] || 0) + 1;
      });
      return acc;
    }, {});

    return {
      totalCBDCs: cbdcs.length,
      activeCBDCs: this.getActiveCBDCs().length,
      supportedPairs: this.supportedPairs.size,
      statusBreakdown: statusCounts,
      regionBreakdown: regionCounts,
      protocolBreakdown: protocolCounts,
      crossBorderEnabled: this.getCrossBorderCBDCs().length,
      totalDailyVolume: cbdcs.reduce((sum, cbdc) => 
        sum + (cbdc.metadata?.maxDailyVolume || 0), 0
      )
    };
  }
}

module.exports = CBDCRegistry;