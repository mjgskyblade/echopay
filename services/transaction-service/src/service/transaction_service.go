package service

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/events"
	"echopay/transaction-service/src/models"
	"echopay/transaction-service/src/repository"
)

// TransactionRequest represents a transaction creation request
type TransactionRequest struct {
	FromWallet uuid.UUID `json:"from_wallet" binding:"required"`
	ToWallet   uuid.UUID `json:"to_wallet" binding:"required"`
	Amount     float64   `json:"amount" binding:"required,gt=0"`
	Currency   models.Currency `json:"currency" binding:"required"`
	Metadata   models.TransactionMetadata `json:"metadata"`
}

// TransactionService handles core transaction processing
type TransactionService struct {
	repo           *repository.TransactionRepository
	balanceRepo    *repository.WalletBalanceRepository
	db             *database.PostgresDB
	eventPublisher *events.EventPublisher
	statusTracker  *events.StatusTracker
	balanceMutex   sync.RWMutex // Protects balance operations
	metrics        *TransactionMetrics
}

// TransactionMetrics tracks service performance metrics
type TransactionMetrics struct {
	ProcessingTimes []time.Duration
	SuccessCount    int64
	FailureCount    int64
	mutex           sync.RWMutex
}

// NewTransactionService creates a new transaction service
func NewTransactionService(db *database.PostgresDB) *TransactionService {
	// Initialize event publisher with default config
	eventConfig := events.DefaultEventPublisherConfig()
	eventPublisher := events.NewEventPublisher(eventConfig)
	
	// Initialize status tracker
	statusTracker := events.NewStatusTracker()
	
	return &TransactionService{
		repo:           repository.NewTransactionRepository(db),
		balanceRepo:    repository.NewWalletBalanceRepository(db),
		db:             db,
		eventPublisher: eventPublisher,
		statusTracker:  statusTracker,
		metrics:        &TransactionMetrics{},
	}
}

// NewTransactionServiceWithEvents creates a new transaction service with custom event configuration
func NewTransactionServiceWithEvents(db *database.PostgresDB, eventPublisher *events.EventPublisher, statusTracker *events.StatusTracker) *TransactionService {
	return &TransactionService{
		repo:           repository.NewTransactionRepository(db),
		balanceRepo:    repository.NewWalletBalanceRepository(db),
		db:             db,
		eventPublisher: eventPublisher,
		statusTracker:  statusTracker,
		metrics:        &TransactionMetrics{},
	}
}

// ProcessTransaction processes a transaction with sub-second performance
func (s *TransactionService) ProcessTransaction(ctx context.Context, req *TransactionRequest) (*models.Transaction, error) {
	startTime := time.Now()
	defer func() {
		s.recordProcessingTime(time.Since(startTime))
	}()

	// Validate transaction request
	if err := s.validateTransactionRequest(req); err != nil {
		s.recordFailure()
		return nil, err
	}

	// Create transaction model
	transaction, err := models.NewTransaction(
		req.FromWallet,
		req.ToWallet,
		req.Amount,
		req.Currency,
		req.Metadata,
	)
	if err != nil {
		s.recordFailure()
		return nil, errors.WrapError(err, errors.ErrInvalidTransaction, "failed to create transaction", "transaction-service")
	}

	// Publish transaction created event
	s.publishTransactionEvent(ctx, transaction, events.EventTransactionCreated)
	s.statusTracker.PublishStatusUpdate(transaction, "Transaction created and processing")

	// Process transaction with atomic balance updates
	err = s.processTransactionAtomic(ctx, transaction)
	if err != nil {
		s.recordFailure()
		// Publish failure event
		s.publishTransactionEvent(ctx, transaction, events.EventTransactionFailed)
		return nil, err
	}

	// Publish success events
	s.publishTransactionEvent(ctx, transaction, events.EventTransactionCompleted)
	s.statusTracker.PublishStatusUpdate(transaction, "Transaction completed successfully")

	s.recordSuccess()
	return transaction, nil
}

// processTransactionAtomic handles the atomic transaction processing
func (s *TransactionService) processTransactionAtomic(ctx context.Context, transaction *models.Transaction) error {
	return s.db.Transaction(func(tx *sql.Tx) error {
		// Lock wallet balances to prevent race conditions
		s.balanceMutex.Lock()
		defer s.balanceMutex.Unlock()

		// Verify sufficient funds
		fromBalance, err := s.balanceRepo.GetBalanceForUpdate(tx, transaction.FromWallet, transaction.Currency)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to get sender balance", "transaction-service")
		}

		if fromBalance.Balance < transaction.Amount {
			return errors.NewTransactionError(
				errors.ErrInsufficientFunds,
				fmt.Sprintf("insufficient funds: available %.2f, required %.2f", fromBalance.Balance, transaction.Amount),
			)
		}

		// Verify recipient wallet exists
		toBalance, err := s.balanceRepo.GetBalanceForUpdate(tx, transaction.ToWallet, transaction.Currency)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to get recipient balance", "transaction-service")
		}

		// Update balances atomically
		newFromBalance := fromBalance.Balance - transaction.Amount
		newToBalance := toBalance.Balance + transaction.Amount

		err = s.balanceRepo.UpdateBalance(tx, transaction.FromWallet, transaction.Currency, newFromBalance)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to update sender balance", "transaction-service")
		}

		err = s.balanceRepo.UpdateBalance(tx, transaction.ToWallet, transaction.Currency, newToBalance)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to update recipient balance", "transaction-service")
		}

		// Publish balance update events (will be sent after transaction commits)
		go func() {
			s.publishBalanceUpdateEvent(ctx, transaction.FromWallet, transaction.Currency, fromBalance.Balance, newFromBalance, &transaction.ID)
			s.publishBalanceUpdateEvent(ctx, transaction.ToWallet, transaction.Currency, toBalance.Balance, newToBalance, &transaction.ID)
		}()

		// Mark transaction as completed
		err = transaction.UpdateStatus(models.StatusCompleted, nil, "transaction-service", map[string]interface{}{
			"from_balance": newFromBalance,
			"to_balance":   newToBalance,
		})
		if err != nil {
			return err
		}

		// Save transaction to database
		err = s.repo.CreateInTx(tx, transaction)
		if err != nil {
			return err
		}

		return nil
	})
}

// GetTransaction retrieves a transaction by ID
func (s *TransactionService) GetTransaction(ctx context.Context, id uuid.UUID) (*models.Transaction, error) {
	transaction, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Verify audit trail integrity
	if err := transaction.VerifyIntegrity(); err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "transaction integrity verification failed", "transaction-service")
	}

	return transaction, nil
}

// GetTransactionsByWallet retrieves transactions for a wallet with pagination
func (s *TransactionService) GetTransactionsByWallet(ctx context.Context, walletID uuid.UUID, limit, offset int) ([]*models.Transaction, error) {
	if limit <= 0 || limit > 100 {
		limit = 50 // Default limit
	}
	if offset < 0 {
		offset = 0
	}

	transactions, err := s.repo.GetByWallet(walletID, limit, offset)
	if err != nil {
		return nil, err
	}

	// Verify integrity of all transactions
	for _, transaction := range transactions {
		if err := transaction.VerifyIntegrity(); err != nil {
			return nil, errors.WrapError(err, errors.ErrTransactionFailed, 
				fmt.Sprintf("transaction %s integrity verification failed", transaction.ID), "transaction-service")
		}
	}

	return transactions, nil
}

// UpdateTransactionStatus updates a transaction status (for external services)
func (s *TransactionService) UpdateTransactionStatus(ctx context.Context, id uuid.UUID, status models.TransactionStatus, userID *uuid.UUID, details map[string]interface{}) error {
	transaction, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}

	err = transaction.UpdateStatus(status, userID, "transaction-service", details)
	if err != nil {
		return err
	}

	err = s.repo.Update(transaction)
	if err != nil {
		return err
	}

	// Publish status update events
	var eventType events.EventType
	var message string
	
	switch status {
	case models.StatusCompleted:
		eventType = events.EventTransactionCompleted
		message = "Transaction completed"
	case models.StatusFailed:
		eventType = events.EventTransactionFailed
		message = "Transaction failed"
	case models.StatusReversed:
		eventType = events.EventTransactionReversed
		message = "Transaction reversed"
	default:
		eventType = events.EventTransactionCreated
		message = fmt.Sprintf("Transaction status updated to %s", status)
	}

	s.publishTransactionEvent(ctx, transaction, eventType)
	s.statusTracker.PublishStatusUpdate(transaction, message)

	return nil
}

// SetFraudScore sets the fraud score for a transaction
func (s *TransactionService) SetFraudScore(ctx context.Context, id uuid.UUID, score float64, details map[string]interface{}) error {
	transaction, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}

	oldScore := transaction.FraudScore
	err = transaction.SetFraudScore(score, "fraud-detection", details)
	if err != nil {
		return err
	}

	err = s.repo.Update(transaction)
	if err != nil {
		return err
	}

	// Publish fraud score update events
	s.publishTransactionEvent(ctx, transaction, events.EventFraudScoreUpdated)
	s.statusTracker.PublishFraudScoreUpdate(transaction, oldScore, &score)

	return nil
}

// GetWalletBalance retrieves the current balance for a wallet
func (s *TransactionService) GetWalletBalance(ctx context.Context, walletID uuid.UUID, currency models.Currency) (*repository.WalletBalance, error) {
	s.balanceMutex.RLock()
	defer s.balanceMutex.RUnlock()

	balance, err := s.balanceRepo.GetBalance(walletID, currency)
	if err != nil {
		return nil, err
	}

	return balance, nil
}

// GetPendingTransactions retrieves pending transactions for processing
func (s *TransactionService) GetPendingTransactions(ctx context.Context, limit int) ([]*models.Transaction, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100 // Default limit
	}

	return s.repo.GetPendingTransactions(limit)
}

// GetTransactionStats returns transaction statistics for a wallet
func (s *TransactionService) GetTransactionStats(ctx context.Context, walletID uuid.UUID, since time.Time) (*repository.TransactionStats, error) {
	return s.repo.GetTransactionStats(walletID, since)
}

// GetServiceMetrics returns service performance metrics
func (s *TransactionService) GetServiceMetrics() *TransactionMetrics {
	s.metrics.mutex.RLock()
	defer s.metrics.mutex.RUnlock()

	return &TransactionMetrics{
		ProcessingTimes: append([]time.Duration{}, s.metrics.ProcessingTimes...), // Copy slice
		SuccessCount:    s.metrics.SuccessCount,
		FailureCount:    s.metrics.FailureCount,
	}
}

// validateTransactionRequest validates the transaction request
func (s *TransactionService) validateTransactionRequest(req *TransactionRequest) error {
	if req.FromWallet == req.ToWallet {
		return errors.NewTransactionError(errors.ErrInvalidTransaction, "cannot transfer to the same wallet")
	}

	if req.FromWallet == uuid.Nil || req.ToWallet == uuid.Nil {
		return errors.NewTransactionError(errors.ErrInvalidTransaction, "wallet IDs cannot be nil")
	}

	if req.Amount <= 0 {
		return errors.NewTransactionError(errors.ErrInvalidTransaction, "transaction amount must be positive")
	}

	if req.Amount > 1000000000 { // 1 billion limit
		return errors.NewTransactionError(errors.ErrInvalidTransaction, "transaction amount exceeds maximum limit")
	}

	// Validate currency
	validCurrencies := map[models.Currency]bool{
		models.USDCBDC: true,
		models.EURCBDC: true,
		models.GBPCBDC: true,
	}

	if !validCurrencies[req.Currency] {
		return errors.NewTransactionError(errors.ErrInvalidTransaction, fmt.Sprintf("unsupported currency: %s", req.Currency))
	}

	return nil
}

// recordProcessingTime records the processing time for metrics
func (s *TransactionService) recordProcessingTime(duration time.Duration) {
	s.metrics.mutex.Lock()
	defer s.metrics.mutex.Unlock()

	s.metrics.ProcessingTimes = append(s.metrics.ProcessingTimes, duration)
	
	// Keep only the last 1000 measurements
	if len(s.metrics.ProcessingTimes) > 1000 {
		s.metrics.ProcessingTimes = s.metrics.ProcessingTimes[1:]
	}
}

// recordSuccess increments the success counter
func (s *TransactionService) recordSuccess() {
	s.metrics.mutex.Lock()
	defer s.metrics.mutex.Unlock()
	s.metrics.SuccessCount++
}

// recordFailure increments the failure counter
func (s *TransactionService) recordFailure() {
	s.metrics.mutex.Lock()
	defer s.metrics.mutex.Unlock()
	s.metrics.FailureCount++
}

// publishTransactionEvent publishes a transaction event
func (s *TransactionService) publishTransactionEvent(ctx context.Context, transaction *models.Transaction, eventType events.EventType) {
	if s.eventPublisher != nil {
		if err := s.eventPublisher.PublishTransactionEvent(ctx, transaction, eventType); err != nil {
			// Log error but don't fail the transaction
			// TODO: Add proper logging
		}
	}
}

// publishBalanceUpdateEvent publishes a balance update event
func (s *TransactionService) publishBalanceUpdateEvent(ctx context.Context, walletID uuid.UUID, currency models.Currency, oldBalance, newBalance float64, transactionID *uuid.UUID) {
	if s.eventPublisher != nil {
		if err := s.eventPublisher.PublishBalanceUpdateEvent(ctx, walletID, currency, oldBalance, newBalance, transactionID); err != nil {
			// Log error but don't fail the transaction
			// TODO: Add proper logging
		}
	}
}

// GetEventPublisher returns the event publisher (for testing)
func (s *TransactionService) GetEventPublisher() *events.EventPublisher {
	return s.eventPublisher
}

// GetStatusTracker returns the status tracker (for testing)
func (s *TransactionService) GetStatusTracker() *events.StatusTracker {
	return s.statusTracker
}

// GetBalanceRepo returns the balance repository (for testing)
func (s *TransactionService) GetBalanceRepo() *repository.WalletBalanceRepository {
	return s.balanceRepo
}

// Migrate runs database migrations for the transaction service
func (s *TransactionService) Migrate() error {
	if err := s.repo.Migrate(); err != nil {
		return err
	}
	return s.balanceRepo.Migrate()
}