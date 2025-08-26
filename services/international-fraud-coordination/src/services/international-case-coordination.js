const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class InternationalCaseCoordination {
  constructor() {
    this.activeCases = new Map();
    this.jurisdictionContacts = new Map([
      ['US', {
        endpoint: process.env.US_CASE_ENDPOINT || 'https://api.us-cbdc.gov/cases',
        contact: 'fraud-coordination@us-cbdc.gov',
        timezone: 'America/New_York'
      }],
      ['EU', {
        endpoint: process.env.EU_CASE_ENDPOINT || 'https://api.eu-cbdc.europa.eu/cases',
        contact: 'fraud-coordination@eu-cbdc.europa.eu',
        timezone: 'Europe/Brussels'
      }],
      ['UK', {
        endpoint: process.env.UK_CASE_ENDPOINT || 'https://api.uk-cbdc.gov.uk/cases',
        contact: 'fraud-coordination@uk-cbdc.gov.uk',
        timezone: 'Europe/London'
      }],
      ['CA', {
        endpoint: process.env.CA_CASE_ENDPOINT || 'https://api.ca-cbdc.gc.ca/cases',
        contact: 'fraud-coordination@ca-cbdc.gc.ca',
        timezone: 'America/Toronto'
      }],
      ['JP', {
        endpoint: process.env.JP_CASE_ENDPOINT || 'https://api.jp-cbdc.boj.or.jp/cases',
        contact: 'fraud-coordination@jp-cbdc.boj.or.jp',
        timezone: 'Asia/Tokyo'
      }],
      ['AU', {
        endpoint: process.env.AU_CASE_ENDPOINT || 'https://api.au-cbdc.rba.gov.au/cases',
        contact: 'fraud-coordination@au-cbdc.rba.gov.au',
        timezone: 'Australia/Sydney'
      }]
    ]);

    this.caseStatuses = {
      INITIATED: 'initiated',
      COORDINATING: 'coordinating',
      INVESTIGATING: 'investigating',
      EVIDENCE_SHARING: 'evidence_sharing',
      RESOLVING: 'resolving',
      RESOLVED: 'resolved',
      CLOSED: 'closed'
    };

    this.priorityLevels = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4
    };
  }

  /**
   * Coordinate international fraud case
   */
  async coordinateCase(caseData, targetJurisdictions) {
    try {
      const coordinationId = uuidv4();
      logger.info('Initiating international case coordination', {
        coordinationId,
        caseId: caseData.caseId,
        jurisdictions: targetJurisdictions
      });

      const coordination = {
        coordinationId,
        caseId: caseData.caseId,
        status: this.caseStatuses.INITIATED,
        priority: this.determinePriority(caseData),
        targetJurisdictions,
        initiatedAt: new Date().toISOString(),
        coordinationSteps: [],
        jurisdictionalResponses: [],
        sharedEvidence: [],
        timeline: this.generateTimeline(caseData, targetJurisdictions)
      };

      // Store active case
      this.activeCases.set(coordinationId, coordination);

      // Initiate coordination with each jurisdiction
      const coordinationResults = await this.initiateJurisdictionalCoordination(
        coordination, 
        caseData, 
        targetJurisdictions
      );

      coordination.jurisdictionalResponses = coordinationResults;
      coordination.status = this.caseStatuses.COORDINATING;

      // Set up evidence sharing channels
      await this.setupEvidenceSharing(coordination);

      // Schedule follow-up actions
      this.scheduleFollowUps(coordination);

      logger.info('International case coordination initiated', {
        coordinationId,
        successfulContacts: coordinationResults.filter(r => r.status === 'success').length,
        totalJurisdictions: targetJurisdictions.length
      });

      return {
        coordinationId,
        status: coordination.status,
        priority: coordination.priority,
        jurisdictionalResponses: coordination.jurisdictionalResponses,
        timeline: coordination.timeline,
        nextSteps: this.getNextSteps(coordination)
      };
    } catch (error) {
      logger.error('Case coordination failed', error);
      throw error;
    }
  }

  /**
   * Get case coordination status
   */
  async getCaseStatus(caseId) {
    try {
      // Find coordination by case ID
      const coordination = Array.from(this.activeCases.values())
        .find(c => c.caseId === caseId);

      if (!coordination) {
        throw new Error('Case coordination not found');
      }

      // Update status from jurisdictions
      await this.updateJurisdictionalStatus(coordination);

      return {
        coordinationId: coordination.coordinationId,
        caseId: coordination.caseId,
        status: coordination.status,
        priority: coordination.priority,
        progress: this.calculateProgress(coordination),
        jurisdictionalStatus: coordination.jurisdictionalResponses.map(jr => ({
          jurisdiction: jr.jurisdiction,
          status: jr.status,
          lastUpdate: jr.lastUpdate,
          actions: jr.actions
        })),
        sharedEvidence: coordination.sharedEvidence.length,
        timeline: coordination.timeline,
        estimatedResolution: this.estimateResolution(coordination)
      };
    } catch (error) {
      logger.error('Failed to get case status', error);
      throw error;
    }
  }

  /**
   * Initiate coordination with target jurisdictions
   */
  async initiateJurisdictionalCoordination(coordination, caseData, targetJurisdictions) {
    const results = [];

    for (const jurisdiction of targetJurisdictions) {
      const contact = this.jurisdictionContacts.get(jurisdiction);
      if (!contact) {
        results.push({
          jurisdiction,
          status: 'failed',
          error: 'No contact information available'
        });
        continue;
      }

      try {
        const coordinationRequest = {
          coordinationId: coordination.coordinationId,
          caseId: caseData.caseId,
          priority: coordination.priority,
          caseType: caseData.type,
          description: caseData.description,
          involvedAmounts: caseData.amounts,
          timeframe: caseData.timeframe,
          requestedActions: this.getRequestedActions(caseData, jurisdiction),
          evidenceAvailable: caseData.evidenceTypes,
          urgency: this.calculateUrgency(caseData),
          contactInfo: {
            primaryContact: process.env.PRIMARY_CONTACT_EMAIL,
            phone: process.env.EMERGENCY_CONTACT_PHONE,
            secureChannel: `secure-${coordination.coordinationId}`
          }
        };

        const response = await axios.post(`${contact.endpoint}/coordinate`, coordinationRequest, {
          timeout: 30000,
          headers: {
            'Authorization': `Bearer ${process.env[`${jurisdiction}_API_KEY`]}`,
            'Content-Type': 'application/json',
            'X-Case-Priority': coordination.priority,
            'X-Coordination-ID': coordination.coordinationId
          }
        });

        results.push({
          jurisdiction,
          status: 'success',
          response: response.data,
          contactedAt: new Date().toISOString(),
          expectedResponse: response.data.expectedResponseTime,
          assignedOfficer: response.data.assignedOfficer,
          actions: response.data.plannedActions || []
        });

        // Log coordination step
        coordination.coordinationSteps.push({
          step: 'INITIAL_CONTACT',
          jurisdiction,
          timestamp: new Date().toISOString(),
          status: 'completed',
          details: 'Initial coordination request sent and acknowledged'
        });

      } catch (error) {
        logger.error(`Failed to coordinate with ${jurisdiction}`, error);
        results.push({
          jurisdiction,
          status: 'failed',
          error: error.message,
          retryScheduled: this.scheduleRetry(coordination.coordinationId, jurisdiction)
        });
      }
    }

    return results;
  }

  /**
   * Setup evidence sharing channels
   */
  async setupEvidenceSharing(coordination) {
    try {
      const evidenceChannel = {
        channelId: `evidence-${coordination.coordinationId}`,
        participants: coordination.targetJurisdictions,
        securityLevel: 'HIGH',
        encryptionKey: crypto.randomBytes(32).toString('hex'),
        accessControls: {
          readAccess: coordination.targetJurisdictions,
          writeAccess: ['US'], // Assuming US is the initiating jurisdiction
          adminAccess: ['US']
        },
        auditLog: []
      };

      // Notify jurisdictions about evidence sharing setup
      for (const jurisdiction of coordination.targetJurisdictions) {
        const contact = this.jurisdictionContacts.get(jurisdiction);
        if (contact) {
          try {
            await axios.post(`${contact.endpoint}/evidence-channel`, {
              coordinationId: coordination.coordinationId,
              channelId: evidenceChannel.channelId,
              accessKey: evidenceChannel.encryptionKey,
              permissions: evidenceChannel.accessControls
            }, {
              headers: {
                'Authorization': `Bearer ${process.env[`${jurisdiction}_API_KEY`]}`,
                'Content-Type': 'application/json'
              }
            });

            coordination.coordinationSteps.push({
              step: 'EVIDENCE_CHANNEL_SETUP',
              jurisdiction,
              timestamp: new Date().toISOString(),
              status: 'completed'
            });
          } catch (error) {
            logger.error(`Failed to setup evidence channel for ${jurisdiction}`, error);
          }
        }
      }

      coordination.evidenceChannel = evidenceChannel;
    } catch (error) {
      logger.error('Evidence sharing setup failed', error);
      throw error;
    }
  }

  /**
   * Update jurisdictional status
   */
  async updateJurisdictionalStatus(coordination) {
    for (const response of coordination.jurisdictionalResponses) {
      if (response.status === 'success') {
        const contact = this.jurisdictionContacts.get(response.jurisdiction);
        if (contact) {
          try {
            const statusResponse = await axios.get(
              `${contact.endpoint}/coordination/${coordination.coordinationId}/status`,
              {
                headers: {
                  'Authorization': `Bearer ${process.env[`${response.jurisdiction}_API_KEY`]}`
                }
              }
            );

            response.currentStatus = statusResponse.data.status;
            response.lastUpdate = new Date().toISOString();
            response.progress = statusResponse.data.progress;
            response.actions = statusResponse.data.actions || [];
          } catch (error) {
            logger.warn(`Failed to update status from ${response.jurisdiction}`, error.message);
          }
        }
      }
    }

    // Update overall coordination status
    coordination.status = this.determineOverallStatus(coordination);
  }

  /**
   * Determine case priority
   */
  determinePriority(caseData) {
    let priority = this.priorityLevels.LOW;

    if (caseData.amounts && caseData.amounts.total > 1000000) {
      priority = Math.max(priority, this.priorityLevels.HIGH);
    }

    if (caseData.type === 'TERRORISM_FINANCING' || caseData.type === 'MONEY_LAUNDERING') {
      priority = this.priorityLevels.CRITICAL;
    }

    if (caseData.urgency === 'IMMEDIATE') {
      priority = Math.max(priority, this.priorityLevels.HIGH);
    }

    if (caseData.jurisdictions && caseData.jurisdictions.length > 3) {
      priority = Math.max(priority, this.priorityLevels.MEDIUM);
    }

    return priority;
  }

  /**
   * Generate coordination timeline
   */
  generateTimeline(caseData, targetJurisdictions) {
    const now = new Date();
    const timeline = [];

    // Initial coordination
    timeline.push({
      phase: 'INITIATION',
      startTime: now.toISOString(),
      estimatedDuration: '2 hours',
      description: 'Initial coordination with target jurisdictions'
    });

    // Evidence sharing
    const evidenceStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    timeline.push({
      phase: 'EVIDENCE_SHARING',
      startTime: evidenceStart.toISOString(),
      estimatedDuration: '24 hours',
      description: 'Share evidence and coordinate investigation approach'
    });

    // Investigation
    const investigationStart = new Date(evidenceStart.getTime() + 24 * 60 * 60 * 1000);
    timeline.push({
      phase: 'INVESTIGATION',
      startTime: investigationStart.toISOString(),
      estimatedDuration: '72 hours',
      description: 'Coordinated investigation across jurisdictions'
    });

    // Resolution
    const resolutionStart = new Date(investigationStart.getTime() + 72 * 60 * 60 * 1000);
    timeline.push({
      phase: 'RESOLUTION',
      startTime: resolutionStart.toISOString(),
      estimatedDuration: '24 hours',
      description: 'Coordinate resolution and enforcement actions'
    });

    return timeline;
  }

  /**
   * Get requested actions for jurisdiction
   */
  getRequestedActions(caseData, jurisdiction) {
    const actions = ['INVESTIGATE', 'SHARE_EVIDENCE'];

    if (caseData.type === 'MONEY_LAUNDERING') {
      actions.push('FREEZE_ASSETS', 'TRACE_FUNDS');
    }

    if (caseData.urgency === 'IMMEDIATE') {
      actions.push('IMMEDIATE_ACTION');
    }

    return actions;
  }

  /**
   * Calculate case urgency
   */
  calculateUrgency(caseData) {
    if (caseData.type === 'TERRORISM_FINANCING') return 'CRITICAL';
    if (caseData.amounts && caseData.amounts.total > 5000000) return 'HIGH';
    if (caseData.timeframe === 'ONGOING') return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * Calculate coordination progress
   */
  calculateProgress(coordination) {
    const totalSteps = coordination.timeline.length;
    const completedSteps = coordination.coordinationSteps.filter(s => s.status === 'completed').length;
    return Math.round((completedSteps / totalSteps) * 100);
  }

  /**
   * Determine overall coordination status
   */
  determineOverallStatus(coordination) {
    const responses = coordination.jurisdictionalResponses;
    const successfulResponses = responses.filter(r => r.status === 'success');

    if (successfulResponses.length === 0) {
      return this.caseStatuses.INITIATED;
    }

    if (successfulResponses.length < responses.length) {
      return this.caseStatuses.COORDINATING;
    }

    // Check if all jurisdictions are actively investigating
    const investigating = successfulResponses.filter(r => 
      r.currentStatus === 'investigating' || r.currentStatus === 'evidence_sharing'
    );

    if (investigating.length === successfulResponses.length) {
      return this.caseStatuses.INVESTIGATING;
    }

    return this.caseStatuses.COORDINATING;
  }

  /**
   * Estimate resolution time
   */
  estimateResolution(coordination) {
    const baseTime = 72; // hours
    const jurisdictionMultiplier = coordination.targetJurisdictions.length * 0.5;
    const priorityMultiplier = coordination.priority === this.priorityLevels.CRITICAL ? 0.5 : 1;

    const estimatedHours = baseTime * (1 + jurisdictionMultiplier) * priorityMultiplier;
    const resolutionDate = new Date(Date.now() + estimatedHours * 60 * 60 * 1000);

    return resolutionDate.toISOString();
  }

  /**
   * Get next steps for coordination
   */
  getNextSteps(coordination) {
    const steps = [];

    if (coordination.status === this.caseStatuses.INITIATED) {
      steps.push('Await jurisdictional responses');
      steps.push('Setup secure communication channels');
    }

    if (coordination.status === this.caseStatuses.COORDINATING) {
      steps.push('Begin evidence sharing');
      steps.push('Coordinate investigation approach');
    }

    return steps;
  }

  /**
   * Schedule retry for failed coordination
   */
  scheduleRetry(coordinationId, jurisdiction) {
    const retryTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    setTimeout(() => {
      this.retryJurisdictionalContact(coordinationId, jurisdiction);
    }, 30 * 60 * 1000);

    return retryTime.toISOString();
  }

  /**
   * Schedule follow-up actions
   */
  scheduleFollowUps(coordination) {
    // Schedule status updates every 4 hours
    const updateInterval = setInterval(() => {
      this.updateJurisdictionalStatus(coordination);
    }, 4 * 60 * 60 * 1000);

    // Schedule cleanup after 30 days
    setTimeout(() => {
      clearInterval(updateInterval);
      this.activeCases.delete(coordination.coordinationId);
    }, 30 * 24 * 60 * 60 * 1000);
  }

  /**
   * Retry jurisdictional contact
   */
  async retryJurisdictionalContact(coordinationId, jurisdiction) {
    const coordination = this.activeCases.get(coordinationId);
    if (coordination) {
      logger.info(`Retrying contact with ${jurisdiction}`, { coordinationId });
      // Implementation would retry the coordination request
    }
  }
}

module.exports = new InternationalCaseCoordination();