package com.echopay.reversibility.model;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("FraudCase Model Tests")
class FraudCaseTest {
    
    private UUID transactionId;
    private UUID reporterId;
    private FraudCase fraudCase;
    
    @BeforeEach
    void setUp() {
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();
        fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.HIGH);
    }
    
    @Nested
    @DisplayName("Constructor Tests")
    class ConstructorTests {
        
        @Test
        @DisplayName("Should create fraud case with default constructor")
        void shouldCreateFraudCaseWithDefaultConstructor() {
            FraudCase defaultCase = new FraudCase();
            
            assertNotNull(defaultCase.getCaseId());
            assertEquals(FraudCase.Status.OPEN, defaultCase.getStatus());
            assertNotNull(defaultCase.getCreatedAt());
            assertTrue(defaultCase.getCreatedAt().isBefore(LocalDateTime.now().plusSeconds(1)));
        }
        
        @Test
        @DisplayName("Should create fraud case with parameterized constructor")
        void shouldCreateFraudCaseWithParameterizedConstructor() {
            assertNotNull(fraudCase.getCaseId());
            assertEquals(transactionId, fraudCase.getTransactionId());
            assertEquals(reporterId, fraudCase.getReporterId());
            assertEquals(FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, fraudCase.getCaseType());
            assertEquals(FraudCase.Priority.HIGH, fraudCase.getPriority());
            assertEquals(FraudCase.Status.OPEN, fraudCase.getStatus());
            assertNotNull(fraudCase.getCreatedAt());
            assertNull(fraudCase.getResolvedAt());
            assertNull(fraudCase.getResolution());
        }
    }
    
    @Nested
    @DisplayName("State Machine Tests")
    class StateMachineTests {
        
        @Test
        @DisplayName("Should allow valid state transitions from OPEN")
        void shouldAllowValidTransitionsFromOpen() {
            assertTrue(fraudCase.canTransitionTo(FraudCase.Status.INVESTIGATING));
            assertTrue(fraudCase.canTransitionTo(FraudCase.Status.CLOSED));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.RESOLVED));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.OPEN)); // Same state
        }
        
        @Test
        @DisplayName("Should allow valid state transitions from INVESTIGATING")
        void shouldAllowValidTransitionsFromInvestigating() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            assertTrue(fraudCase.canTransitionTo(FraudCase.Status.RESOLVED));
            assertTrue(fraudCase.canTransitionTo(FraudCase.Status.CLOSED));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.OPEN));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.INVESTIGATING)); // Same state
        }
        
        @Test
        @DisplayName("Should allow valid state transitions from RESOLVED")
        void shouldAllowValidTransitionsFromResolved() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            fraudCase.transitionTo(FraudCase.Status.RESOLVED);
            
            assertTrue(fraudCase.canTransitionTo(FraudCase.Status.CLOSED));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.OPEN));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.INVESTIGATING));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.RESOLVED)); // Same state
        }
        
        @Test
        @DisplayName("Should not allow any transitions from CLOSED")
        void shouldNotAllowTransitionsFromClosed() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.OPEN));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.INVESTIGATING));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.RESOLVED));
            assertFalse(fraudCase.canTransitionTo(FraudCase.Status.CLOSED)); // Same state
        }
        
        @Test
        @DisplayName("Should successfully transition to valid states")
        void shouldSuccessfullyTransitionToValidStates() {
            // OPEN -> INVESTIGATING
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            assertEquals(FraudCase.Status.INVESTIGATING, fraudCase.getStatus());
            
            // INVESTIGATING -> RESOLVED
            fraudCase.transitionTo(FraudCase.Status.RESOLVED);
            assertEquals(FraudCase.Status.RESOLVED, fraudCase.getStatus());
            assertNotNull(fraudCase.getResolvedAt());
            
            // RESOLVED -> CLOSED
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            assertEquals(FraudCase.Status.CLOSED, fraudCase.getStatus());
        }
        
        @Test
        @DisplayName("Should throw exception for invalid state transitions")
        void shouldThrowExceptionForInvalidTransitions() {
            // Try to go directly from OPEN to RESOLVED
            assertThrows(IllegalStateException.class, () -> {
                fraudCase.transitionTo(FraudCase.Status.RESOLVED);
            });
            
            // Transition to INVESTIGATING first
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            // Try to go back to OPEN
            assertThrows(IllegalStateException.class, () -> {
                fraudCase.transitionTo(FraudCase.Status.OPEN);
            });
        }
        
        @Test
        @DisplayName("Should set resolved timestamp when transitioning to RESOLVED")
        void shouldSetResolvedTimestampWhenResolved() {
            LocalDateTime beforeResolve = LocalDateTime.now();
            
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            fraudCase.transitionTo(FraudCase.Status.RESOLVED);
            
            assertNotNull(fraudCase.getResolvedAt());
            assertTrue(fraudCase.getResolvedAt().isAfter(beforeResolve));
            assertTrue(fraudCase.getResolvedAt().isBefore(LocalDateTime.now().plusSeconds(1)));
        }
    }
    
    @Nested
    @DisplayName("Resolution Tests")
    class ResolutionTests {
        
        @Test
        @DisplayName("Should resolve case with fraud confirmed")
        void shouldResolveCaseWithFraudConfirmed() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            fraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
            
            assertEquals(FraudCase.Resolution.FRAUD_CONFIRMED, fraudCase.getResolution());
            assertEquals(FraudCase.Status.RESOLVED, fraudCase.getStatus());
            assertNotNull(fraudCase.getResolvedAt());
        }
        
        @Test
        @DisplayName("Should resolve case with fraud denied")
        void shouldResolveCaseWithFraudDenied() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            fraudCase.resolve(FraudCase.Resolution.FRAUD_DENIED);
            
            assertEquals(FraudCase.Resolution.FRAUD_DENIED, fraudCase.getResolution());
            assertEquals(FraudCase.Status.RESOLVED, fraudCase.getStatus());
        }
        
        @Test
        @DisplayName("Should resolve case with insufficient evidence")
        void shouldResolveCaseWithInsufficientEvidence() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            fraudCase.resolve(FraudCase.Resolution.INSUFFICIENT_EVIDENCE);
            
            assertEquals(FraudCase.Resolution.INSUFFICIENT_EVIDENCE, fraudCase.getResolution());
            assertEquals(FraudCase.Status.RESOLVED, fraudCase.getStatus());
        }
        
        @Test
        @DisplayName("Should throw exception when resolving case not under investigation")
        void shouldThrowExceptionWhenResolvingCaseNotUnderInvestigation() {
            // Try to resolve case that's still OPEN
            assertThrows(IllegalStateException.class, () -> {
                fraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
            });
            
            // Try to resolve case that's already RESOLVED
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            fraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
            
            assertThrows(IllegalStateException.class, () -> {
                fraudCase.resolve(FraudCase.Resolution.FRAUD_DENIED);
            });
        }
    }
    
    @Nested
    @DisplayName("Status Check Tests")
    class StatusCheckTests {
        
        @Test
        @DisplayName("Should correctly identify active cases")
        void shouldCorrectlyIdentifyActiveCases() {
            // OPEN case should be active
            assertTrue(fraudCase.isActive());
            assertFalse(fraudCase.isResolved());
            
            // INVESTIGATING case should be active
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            assertTrue(fraudCase.isActive());
            assertFalse(fraudCase.isResolved());
        }
        
        @Test
        @DisplayName("Should correctly identify resolved cases")
        void shouldCorrectlyIdentifyResolvedCases() {
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            // RESOLVED case should not be active
            fraudCase.transitionTo(FraudCase.Status.RESOLVED);
            assertFalse(fraudCase.isActive());
            assertTrue(fraudCase.isResolved());
            
            // CLOSED case should not be active
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            assertFalse(fraudCase.isActive());
            assertTrue(fraudCase.isResolved());
        }
    }
    
    @Nested
    @DisplayName("Evidence Handling Tests")
    class EvidenceHandlingTests {
        
        @Test
        @DisplayName("Should handle evidence data correctly")
        void shouldHandleEvidenceDataCorrectly() {
            Map<String, Object> evidence = new HashMap<>();
            evidence.put("userReport", "Unauthorized transaction on my account");
            evidence.put("screenshots", new String[]{"screenshot1.png", "screenshot2.png"});
            evidence.put("ipAddress", "192.168.1.100");
            evidence.put("deviceFingerprint", "mobile-ios-12345");
            
            fraudCase.setEvidence(evidence);
            
            assertEquals(evidence, fraudCase.getEvidence());
            assertEquals("Unauthorized transaction on my account", 
                fraudCase.getEvidence().get("userReport"));
            assertNotNull(fraudCase.getEvidence().get("screenshots"));
        }
        
        @Test
        @DisplayName("Should handle null evidence gracefully")
        void shouldHandleNullEvidenceGracefully() {
            fraudCase.setEvidence(null);
            assertNull(fraudCase.getEvidence());
        }
        
        @Test
        @DisplayName("Should handle empty evidence map")
        void shouldHandleEmptyEvidenceMap() {
            Map<String, Object> emptyEvidence = new HashMap<>();
            fraudCase.setEvidence(emptyEvidence);
            
            assertNotNull(fraudCase.getEvidence());
            assertTrue(fraudCase.getEvidence().isEmpty());
        }
    }
    
    @Nested
    @DisplayName("Enum Tests")
    class EnumTests {
        
        @Test
        @DisplayName("Should convert Status enum to string correctly")
        void shouldConvertStatusEnumToStringCorrectly() {
            assertEquals("open", FraudCase.Status.OPEN.getValue());
            assertEquals("investigating", FraudCase.Status.INVESTIGATING.getValue());
            assertEquals("resolved", FraudCase.Status.RESOLVED.getValue());
            assertEquals("closed", FraudCase.Status.CLOSED.getValue());
        }
        
        @Test
        @DisplayName("Should convert string to Status enum correctly")
        void shouldConvertStringToStatusEnumCorrectly() {
            assertEquals(FraudCase.Status.OPEN, FraudCase.Status.fromString("open"));
            assertEquals(FraudCase.Status.INVESTIGATING, FraudCase.Status.fromString("investigating"));
            assertEquals(FraudCase.Status.RESOLVED, FraudCase.Status.fromString("resolved"));
            assertEquals(FraudCase.Status.CLOSED, FraudCase.Status.fromString("closed"));
        }
        
        @Test
        @DisplayName("Should throw exception for invalid status string")
        void shouldThrowExceptionForInvalidStatusString() {
            assertThrows(IllegalArgumentException.class, () -> {
                FraudCase.Status.fromString("invalid_status");
            });
        }
        
        @Test
        @DisplayName("Should convert CaseType enum to string correctly")
        void shouldConvertCaseTypeEnumToStringCorrectly() {
            assertEquals("unauthorized_transaction", 
                FraudCase.CaseType.UNAUTHORIZED_TRANSACTION.getValue());
            assertEquals("account_takeover", 
                FraudCase.CaseType.ACCOUNT_TAKEOVER.getValue());
            assertEquals("phishing", FraudCase.CaseType.PHISHING.getValue());
            assertEquals("social_engineering", 
                FraudCase.CaseType.SOCIAL_ENGINEERING.getValue());
            assertEquals("technical_fraud", 
                FraudCase.CaseType.TECHNICAL_FRAUD.getValue());
        }
        
        @Test
        @DisplayName("Should convert Priority enum to string correctly")
        void shouldConvertPriorityEnumToStringCorrectly() {
            assertEquals("low", FraudCase.Priority.LOW.getValue());
            assertEquals("medium", FraudCase.Priority.MEDIUM.getValue());
            assertEquals("high", FraudCase.Priority.HIGH.getValue());
            assertEquals("critical", FraudCase.Priority.CRITICAL.getValue());
        }
        
        @Test
        @DisplayName("Should convert Resolution enum to string correctly")
        void shouldConvertResolutionEnumToStringCorrectly() {
            assertEquals("fraud_confirmed", 
                FraudCase.Resolution.FRAUD_CONFIRMED.getValue());
            assertEquals("fraud_denied", 
                FraudCase.Resolution.FRAUD_DENIED.getValue());
            assertEquals("insufficient_evidence", 
                FraudCase.Resolution.INSUFFICIENT_EVIDENCE.getValue());
        }
    }
    
    @Nested
    @DisplayName("Lifecycle Integration Tests")
    class LifecycleIntegrationTests {
        
        @Test
        @DisplayName("Should handle complete fraud case lifecycle - fraud confirmed")
        void shouldHandleCompleteFraudCaseLifecycleFraudConfirmed() {
            // Initial state
            assertEquals(FraudCase.Status.OPEN, fraudCase.getStatus());
            assertTrue(fraudCase.isActive());
            
            // Add evidence
            Map<String, Object> evidence = new HashMap<>();
            evidence.put("userReport", "Someone used my account without permission");
            evidence.put("suspiciousIP", "10.0.0.1");
            fraudCase.setEvidence(evidence);
            
            // Start investigation
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            assertEquals(FraudCase.Status.INVESTIGATING, fraudCase.getStatus());
            assertTrue(fraudCase.isActive());
            
            // Resolve as fraud confirmed
            fraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
            assertEquals(FraudCase.Status.RESOLVED, fraudCase.getStatus());
            assertEquals(FraudCase.Resolution.FRAUD_CONFIRMED, fraudCase.getResolution());
            assertFalse(fraudCase.isActive());
            assertTrue(fraudCase.isResolved());
            assertNotNull(fraudCase.getResolvedAt());
            
            // Close case
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            assertEquals(FraudCase.Status.CLOSED, fraudCase.getStatus());
            assertFalse(fraudCase.isActive());
            assertTrue(fraudCase.isResolved());
        }
        
        @Test
        @DisplayName("Should handle complete fraud case lifecycle - fraud denied")
        void shouldHandleCompleteFraudCaseLifecycleFraudDenied() {
            // Start investigation
            fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
            
            // Resolve as fraud denied
            fraudCase.resolve(FraudCase.Resolution.FRAUD_DENIED);
            assertEquals(FraudCase.Resolution.FRAUD_DENIED, fraudCase.getResolution());
            
            // Close case
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            assertEquals(FraudCase.Status.CLOSED, fraudCase.getStatus());
        }
        
        @Test
        @DisplayName("Should handle case closed without resolution")
        void shouldHandleCaseClosedWithoutResolution() {
            // Close case directly from OPEN (e.g., user withdrew complaint)
            fraudCase.transitionTo(FraudCase.Status.CLOSED);
            
            assertEquals(FraudCase.Status.CLOSED, fraudCase.getStatus());
            assertNull(fraudCase.getResolution());
            assertNull(fraudCase.getResolvedAt());
            assertFalse(fraudCase.isActive());
            assertTrue(fraudCase.isResolved());
        }
    }
    
    @Nested
    @DisplayName("Equals and HashCode Tests")
    class EqualsAndHashCodeTests {
        
        @Test
        @DisplayName("Should be equal when case IDs are the same")
        void shouldBeEqualWhenCaseIdsAreTheSame() {
            FraudCase case1 = new FraudCase();
            FraudCase case2 = new FraudCase();
            case2.setCaseId(case1.getCaseId());
            
            assertEquals(case1, case2);
            assertEquals(case1.hashCode(), case2.hashCode());
        }
        
        @Test
        @DisplayName("Should not be equal when case IDs are different")
        void shouldNotBeEqualWhenCaseIdsAreDifferent() {
            FraudCase case1 = new FraudCase();
            FraudCase case2 = new FraudCase();
            
            assertNotEquals(case1, case2);
        }
        
        @Test
        @DisplayName("Should handle null case ID in equals")
        void shouldHandleNullCaseIdInEquals() {
            FraudCase case1 = new FraudCase();
            case1.setCaseId(null);
            FraudCase case2 = new FraudCase();
            case2.setCaseId(null);
            
            assertEquals(case1, case2);
        }
    }
    
    @Test
    @DisplayName("Should generate meaningful toString representation")
    void shouldGenerateMeaningfulToStringRepresentation() {
        String toString = fraudCase.toString();
        
        assertTrue(toString.contains("FraudCase"));
        assertTrue(toString.contains(fraudCase.getCaseId().toString()));
        assertTrue(toString.contains(transactionId.toString()));
        assertTrue(toString.contains("OPEN"));
        assertTrue(toString.contains("UNAUTHORIZED_TRANSACTION"));
        assertTrue(toString.contains("HIGH"));
    }
}