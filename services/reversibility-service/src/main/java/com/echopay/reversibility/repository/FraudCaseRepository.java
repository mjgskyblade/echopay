package com.echopay.reversibility.repository;

import com.echopay.reversibility.model.FraudCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository interface for FraudCase entity operations.
 * Provides data access methods for fraud case management.
 */
@Repository
public interface FraudCaseRepository extends JpaRepository<FraudCase, UUID> {

    /**
     * Find active fraud case by transaction ID.
     * Active cases are those with status OPEN or INVESTIGATING.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.transactionId = :transactionId " +
           "AND fc.status IN ('OPEN', 'INVESTIGATING')")
    Optional<FraudCase> findActiveByTransactionId(@Param("transactionId") UUID transactionId);

    /**
     * Find all fraud cases reported by a specific user.
     */
    List<FraudCase> findByReporterId(UUID reporterId);

    /**
     * Find fraud cases by status list.
     */
    List<FraudCase> findByStatusIn(List<FraudCase.Status> statuses);

    /**
     * Find fraud cases by priority.
     */
    List<FraudCase> findByPriority(FraudCase.Priority priority);

    /**
     * Find fraud cases created within a date range.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.createdAt BETWEEN :startDate AND :endDate")
    List<FraudCase> findByCreatedAtBetween(
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate
    );

    /**
     * Find overdue cases that need escalation.
     * Cases are overdue if they've been investigating for more than 72 hours.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'INVESTIGATING' " +
           "AND fc.createdAt < :cutoffTime")
    List<FraudCase> findOverdueCases(@Param("cutoffTime") LocalDateTime cutoffTime);

    /**
     * Find high-priority active cases for dashboard.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status IN ('OPEN', 'INVESTIGATING') " +
           "AND fc.priority IN ('HIGH', 'CRITICAL') ORDER BY fc.createdAt ASC")
    List<FraudCase> findHighPriorityActiveCases();

    /**
     * Count active cases by priority.
     */
    @Query("SELECT fc.priority, COUNT(fc) FROM FraudCase fc " +
           "WHERE fc.status IN ('OPEN', 'INVESTIGATING') GROUP BY fc.priority")
    List<Object[]> countActiveCasesByPriority();

    /**
     * Find cases by transaction ID (including resolved cases).
     */
    List<FraudCase> findByTransactionId(UUID transactionId);

    /**
     * Find cases that need automated resolution check.
     * These are investigating cases older than 1 hour for potential auto-resolution.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'INVESTIGATING' " +
           "AND fc.createdAt < :oneHourAgo AND fc.priority IN ('HIGH', 'CRITICAL')")
    List<FraudCase> findCasesForAutomatedResolution(@Param("oneHourAgo") LocalDateTime oneHourAgo);

    /**
     * Find cases by case type.
     */
    List<FraudCase> findByCaseType(FraudCase.CaseType caseType);

    /**
     * Find resolved cases with specific resolution.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'RESOLVED' AND fc.resolution = :resolution")
    List<FraudCase> findByResolution(@Param("resolution") FraudCase.Resolution resolution);

    /**
     * Find cases assigned to a specific arbitrator.
     */
    List<FraudCase> findByAssignedArbitratorId(UUID arbitratorId);

    /**
     * Find unassigned investigating cases for arbitration assignment.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'INVESTIGATING' " +
           "AND fc.assignedArbitratorId IS NULL ORDER BY fc.priority DESC, fc.createdAt ASC")
    List<FraudCase> findUnassignedInvestigatingCases();

    /**
     * Find cases that need escalation (investigating for more than 72 hours).
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'INVESTIGATING' " +
           "AND fc.createdAt < :seventyTwoHoursAgo AND fc.escalatedAt IS NULL")
    List<FraudCase> findCasesNeedingEscalation(@Param("seventyTwoHoursAgo") LocalDateTime seventyTwoHoursAgo);

    /**
     * Find cases assigned to arbitrator that are approaching deadline.
     */
    @Query("SELECT fc FROM FraudCase fc WHERE fc.status = 'INVESTIGATING' " +
           "AND fc.assignedArbitratorId = :arbitratorId " +
           "AND fc.createdAt < :approachingDeadline")
    List<FraudCase> findCasesApproachingDeadline(
        @Param("arbitratorId") UUID arbitratorId,
        @Param("approachingDeadline") LocalDateTime approachingDeadline
    );

    /**
     * Count active cases by arbitrator.
     */
    @Query("SELECT fc.assignedArbitratorId, COUNT(fc) FROM FraudCase fc " +
           "WHERE fc.status = 'INVESTIGATING' AND fc.assignedArbitratorId IS NOT NULL " +
           "GROUP BY fc.assignedArbitratorId")
    List<Object[]> countActiveCasesByArbitrator();
}