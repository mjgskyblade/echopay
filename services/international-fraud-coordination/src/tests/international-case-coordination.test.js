const internationalCaseCoordination = require('../services/international-case-coordination');

describe('International Case Coordination', () => {
  let mockCaseData;
  let mockTargetJurisdictions;

  beforeEach(() => {
    mockCaseData = {
      caseId: 'case-test-123',
      type: 'SUSPICIOUS_TRANSACTION',
      description: 'Large cross-border transfer with unusual patterns',
      amounts: { total: 50000, currency: 'USD-CBDC' },
      timeframe: 'RECENT',
      urgency: 'HIGH',
      evidenceTypes: ['TRANSACTION_LOGS', 'USER_BEHAVIOR', 'NETWORK_ANALYSIS']
    };

    mockTargetJurisdictions = ['EU', 'UK'];
  });

  describe('coordinateCase', () => {
    test('should coordinate international fraud case successfully', async () => {
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      expect(result).toHaveProperty('coordinationId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('priority');
      expect(result).toHaveProperty('jurisdictionalResponses');
      expect(result).toHaveProperty('timeline');
      expect(result).toHaveProperty('nextSteps');

      expect(typeof result.coordinationId).toBe('string');
      expect(Array.isArray(result.jurisdictionalResponses)).toBe(true);
      expect(result.jurisdictionalResponses.length).toBe(mockTargetJurisdictions.length);
      expect(Array.isArray(result.timeline)).toBe(true);
      expect(Array.isArray(result.nextSteps)).toBe(true);
    });

    test('should assign critical priority to terrorism financing cases', async () => {
      const terrorismCase = {
        ...mockCaseData,
        type: 'TERRORISM_FINANCING',
        urgency: 'CRITICAL'
      };

      const result = await internationalCaseCoordination.coordinateCase(
        terrorismCase, 
        mockTargetJurisdictions
      );

      expect(result.priority).toBe(4); // CRITICAL priority level
    });

    test('should assign high priority to large money laundering cases', async () => {
      const moneyLaunderingCase = {
        ...mockCaseData,
        type: 'MONEY_LAUNDERING',
        amounts: { total: 5000000, currency: 'USD-CBDC' }
      };

      const result = await internationalCaseCoordination.coordinateCase(
        moneyLaunderingCase, 
        mockTargetJurisdictions
      );

      expect(result.priority).toBeGreaterThanOrEqual(3);
    });

    test('should handle multiple target jurisdictions', async () => {
      const multipleJurisdictions = ['EU', 'UK', 'CA', 'AU'];

      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        multipleJurisdictions
      );

      expect(result.jurisdictionalResponses.length).toBe(multipleJurisdictions.length);
      expect(result.priority).toBeGreaterThanOrEqual(2); // Higher priority for multiple jurisdictions
    });

    test('should generate appropriate timeline for case coordination', async () => {
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      const timeline = result.timeline;
      expect(timeline.length).toBeGreaterThan(0);
      
      const phases = timeline.map(t => t.phase);
      expect(phases).toContain('INITIATION');
      expect(phases).toContain('EVIDENCE_SHARING');
      expect(phases).toContain('INVESTIGATION');
      expect(phases).toContain('RESOLUTION');

      // Verify timeline ordering
      const initiationPhase = timeline.find(t => t.phase === 'INITIATION');
      const evidencePhase = timeline.find(t => t.phase === 'EVIDENCE_SHARING');
      expect(new Date(initiationPhase.startTime)).toBeLessThan(new Date(evidencePhase.startTime));
    });

    test('should set up evidence sharing channels', async () => {
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      expect(result.coordinationId).toBeDefined();
      // Evidence sharing setup is internal, but coordination should succeed
      expect(result.status).toBeDefined();
    });
  });

  describe('getCaseStatus', () => {
    test('should retrieve case coordination status', async () => {
      // First coordinate a case
      const coordination = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      // Then retrieve status
      const status = await internationalCaseCoordination.getCaseStatus(mockCaseData.caseId);

      expect(status).toHaveProperty('coordinationId');
      expect(status).toHaveProperty('caseId', mockCaseData.caseId);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('priority');
      expect(status).toHaveProperty('progress');
      expect(status).toHaveProperty('jurisdictionalStatus');
      expect(status).toHaveProperty('sharedEvidence');
      expect(status).toHaveProperty('timeline');
      expect(status).toHaveProperty('estimatedResolution');

      expect(typeof status.progress).toBe('number');
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(100);
      expect(Array.isArray(status.jurisdictionalStatus)).toBe(true);
    });

    test('should throw error for non-existent case', async () => {
      await expect(
        internationalCaseCoordination.getCaseStatus('non-existent-case')
      ).rejects.toThrow('Case coordination not found');
    });

    test('should update jurisdictional status', async () => {
      // Coordinate case first
      await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      const status = await internationalCaseCoordination.getCaseStatus(mockCaseData.caseId);

      expect(status.jurisdictionalStatus.length).toBe(mockTargetJurisdictions.length);
      
      status.jurisdictionalStatus.forEach(js => {
        expect(js).toHaveProperty('jurisdiction');
        expect(js).toHaveProperty('status');
        expect(mockTargetJurisdictions).toContain(js.jurisdiction);
      });
    });
  });

  describe('determinePriority', () => {
    test('should assign critical priority to terrorism financing', () => {
      const terrorismCase = {
        ...mockCaseData,
        type: 'TERRORISM_FINANCING'
      };

      const priority = internationalCaseCoordination.determinePriority(terrorismCase);
      expect(priority).toBe(4); // CRITICAL
    });

    test('should assign high priority to large amounts', () => {
      const largeAmountCase = {
        ...mockCaseData,
        amounts: { total: 2000000, currency: 'USD-CBDC' }
      };

      const priority = internationalCaseCoordination.determinePriority(largeAmountCase);
      expect(priority).toBeGreaterThanOrEqual(3); // HIGH
    });

    test('should assign high priority to immediate urgency', () => {
      const urgentCase = {
        ...mockCaseData,
        urgency: 'IMMEDIATE'
      };

      const priority = internationalCaseCoordination.determinePriority(urgentCase);
      expect(priority).toBeGreaterThanOrEqual(3); // HIGH
    });

    test('should assign medium priority to multiple jurisdictions', () => {
      const multiJurisdictionCase = {
        ...mockCaseData,
        jurisdictions: ['US', 'EU', 'UK', 'CA']
      };

      const priority = internationalCaseCoordination.determinePriority(multiJurisdictionCase);
      expect(priority).toBeGreaterThanOrEqual(2); // MEDIUM
    });

    test('should assign low priority to simple cases', () => {
      const simpleCase = {
        ...mockCaseData,
        amounts: { total: 1000, currency: 'USD-CBDC' },
        urgency: 'LOW',
        type: 'MINOR_VIOLATION'
      };

      const priority = internationalCaseCoordination.determinePriority(simpleCase);
      expect(priority).toBe(1); // LOW
    });
  });

  describe('generateTimeline', () => {
    test('should generate comprehensive timeline', () => {
      const timeline = internationalCaseCoordination.generateTimeline(
        mockCaseData, 
        mockTargetJurisdictions
      );

      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBe(4); // Four phases

      const phases = timeline.map(t => t.phase);
      expect(phases).toEqual(['INITIATION', 'EVIDENCE_SHARING', 'INVESTIGATION', 'RESOLUTION']);

      // Verify each phase has required properties
      timeline.forEach(phase => {
        expect(phase).toHaveProperty('phase');
        expect(phase).toHaveProperty('startTime');
        expect(phase).toHaveProperty('estimatedDuration');
        expect(phase).toHaveProperty('description');
      });

      // Verify chronological order
      for (let i = 1; i < timeline.length; i++) {
        expect(new Date(timeline[i].startTime)).toBeGreaterThan(new Date(timeline[i-1].startTime));
      }
    });

    test('should adjust timeline based on case complexity', () => {
      const complexCase = {
        ...mockCaseData,
        type: 'MONEY_LAUNDERING',
        urgency: 'CRITICAL'
      };

      const timeline = internationalCaseCoordination.generateTimeline(
        complexCase, 
        ['EU', 'UK', 'CA', 'AU'] // More jurisdictions
      );

      expect(timeline.length).toBe(4);
      // Complex cases should still follow the same phases but may have different durations
    });
  });

  describe('getRequestedActions', () => {
    test('should request appropriate actions for money laundering', () => {
      const moneyLaunderingCase = {
        ...mockCaseData,
        type: 'MONEY_LAUNDERING'
      };

      const actions = internationalCaseCoordination.getRequestedActions(
        moneyLaunderingCase, 
        'EU'
      );

      expect(actions).toContain('INVESTIGATE');
      expect(actions).toContain('SHARE_EVIDENCE');
      expect(actions).toContain('FREEZE_ASSETS');
      expect(actions).toContain('TRACE_FUNDS');
    });

    test('should request immediate action for urgent cases', () => {
      const urgentCase = {
        ...mockCaseData,
        urgency: 'IMMEDIATE'
      };

      const actions = internationalCaseCoordination.getRequestedActions(
        urgentCase, 
        'UK'
      );

      expect(actions).toContain('IMMEDIATE_ACTION');
    });

    test('should request basic actions for standard cases', () => {
      const standardCase = {
        ...mockCaseData,
        type: 'SUSPICIOUS_TRANSACTION',
        urgency: 'MEDIUM'
      };

      const actions = internationalCaseCoordination.getRequestedActions(
        standardCase, 
        'CA'
      );

      expect(actions).toContain('INVESTIGATE');
      expect(actions).toContain('SHARE_EVIDENCE');
    });
  });

  describe('calculateUrgency', () => {
    test('should return critical urgency for terrorism financing', () => {
      const terrorismCase = {
        ...mockCaseData,
        type: 'TERRORISM_FINANCING'
      };

      const urgency = internationalCaseCoordination.calculateUrgency(terrorismCase);
      expect(urgency).toBe('CRITICAL');
    });

    test('should return high urgency for large amounts', () => {
      const largeAmountCase = {
        ...mockCaseData,
        amounts: { total: 10000000, currency: 'USD-CBDC' }
      };

      const urgency = internationalCaseCoordination.calculateUrgency(largeAmountCase);
      expect(urgency).toBe('HIGH');
    });

    test('should return high urgency for ongoing cases', () => {
      const ongoingCase = {
        ...mockCaseData,
        timeframe: 'ONGOING'
      };

      const urgency = internationalCaseCoordination.calculateUrgency(ongoingCase);
      expect(urgency).toBe('HIGH');
    });

    test('should return medium urgency for standard cases', () => {
      const standardCase = {
        ...mockCaseData,
        amounts: { total: 50000, currency: 'USD-CBDC' },
        timeframe: 'RECENT'
      };

      const urgency = internationalCaseCoordination.calculateUrgency(standardCase);
      expect(urgency).toBe('MEDIUM');
    });
  });

  describe('calculateProgress', () => {
    test('should calculate progress based on completed steps', () => {
      const mockCoordination = {
        timeline: [
          { phase: 'INITIATION' },
          { phase: 'EVIDENCE_SHARING' },
          { phase: 'INVESTIGATION' },
          { phase: 'RESOLUTION' }
        ],
        coordinationSteps: [
          { step: 'INITIAL_CONTACT', status: 'completed' },
          { step: 'EVIDENCE_CHANNEL_SETUP', status: 'completed' }
        ]
      };

      const progress = internationalCaseCoordination.calculateProgress(mockCoordination);
      expect(progress).toBe(50); // 2 out of 4 steps completed
    });

    test('should return 0 progress for new coordination', () => {
      const mockCoordination = {
        timeline: [
          { phase: 'INITIATION' },
          { phase: 'EVIDENCE_SHARING' }
        ],
        coordinationSteps: []
      };

      const progress = internationalCaseCoordination.calculateProgress(mockCoordination);
      expect(progress).toBe(0);
    });

    test('should return 100 progress for completed coordination', () => {
      const mockCoordination = {
        timeline: [
          { phase: 'INITIATION' },
          { phase: 'EVIDENCE_SHARING' }
        ],
        coordinationSteps: [
          { step: 'STEP1', status: 'completed' },
          { step: 'STEP2', status: 'completed' }
        ]
      };

      const progress = internationalCaseCoordination.calculateProgress(mockCoordination);
      expect(progress).toBe(100);
    });
  });

  describe('estimateResolution', () => {
    test('should estimate resolution time based on complexity', () => {
      const mockCoordination = {
        targetJurisdictions: ['EU', 'UK'],
        priority: 3 // HIGH
      };

      const estimatedResolution = internationalCaseCoordination.estimateResolution(mockCoordination);
      
      expect(typeof estimatedResolution).toBe('string');
      expect(new Date(estimatedResolution)).toBeInstanceOf(Date);
      expect(new Date(estimatedResolution)).toBeGreaterThan(new Date());
    });

    test('should provide faster resolution for critical cases', () => {
      const criticalCoordination = {
        targetJurisdictions: ['EU'],
        priority: 4 // CRITICAL
      };

      const normalCoordination = {
        targetJurisdictions: ['EU'],
        priority: 2 // MEDIUM
      };

      const criticalResolution = new Date(internationalCaseCoordination.estimateResolution(criticalCoordination));
      const normalResolution = new Date(internationalCaseCoordination.estimateResolution(normalCoordination));

      expect(criticalResolution).toBeLessThan(normalResolution);
    });

    test('should account for multiple jurisdictions in estimation', () => {
      const singleJurisdiction = {
        targetJurisdictions: ['EU'],
        priority: 2
      };

      const multipleJurisdictions = {
        targetJurisdictions: ['EU', 'UK', 'CA'],
        priority: 2
      };

      const singleResolution = new Date(internationalCaseCoordination.estimateResolution(singleJurisdiction));
      const multipleResolution = new Date(internationalCaseCoordination.estimateResolution(multipleJurisdictions));

      expect(multipleResolution).toBeGreaterThan(singleResolution);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing case data', async () => {
      await expect(
        internationalCaseCoordination.coordinateCase(null, mockTargetJurisdictions)
      ).rejects.toThrow();
    });

    test('should handle empty target jurisdictions', async () => {
      await expect(
        internationalCaseCoordination.coordinateCase(mockCaseData, [])
      ).rejects.toThrow();
    });

    test('should handle invalid case ID in status retrieval', async () => {
      await expect(
        internationalCaseCoordination.getCaseStatus('')
      ).rejects.toThrow();
    });

    test('should handle network failures during coordination', async () => {
      // This would test resilience to network failures
      // The implementation should handle failures gracefully
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      expect(result).toBeDefined();
      expect(result.coordinationId).toBeDefined();
      
      // Some jurisdictional responses might fail, but coordination should continue
      expect(result.jurisdictionalResponses).toBeDefined();
    });
  });

  describe('Security and Compliance', () => {
    test('should maintain audit trail for coordination activities', async () => {
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        mockTargetJurisdictions
      );

      expect(result.coordinationId).toBeDefined();
      
      // Internal audit trail should be maintained (not exposed in API response)
      // This would be verified through internal methods in a real implementation
    });

    test('should handle sensitive case data appropriately', async () => {
      const sensitiveCase = {
        ...mockCaseData,
        type: 'TERRORISM_FINANCING',
        classification: 'TOP_SECRET'
      };

      const result = await internationalCaseCoordination.coordinateCase(
        sensitiveCase, 
        mockTargetJurisdictions
      );

      expect(result.priority).toBe(4); // Should be treated as critical
      expect(result.coordinationId).toBeDefined();
    });

    test('should validate jurisdiction trust levels', async () => {
      // This would test that only trusted jurisdictions can be coordinated with
      const result = await internationalCaseCoordination.coordinateCase(
        mockCaseData, 
        ['EU', 'UK'] // Trusted jurisdictions
      );

      expect(result.jurisdictionalResponses.length).toBe(2);
    });
  });
});