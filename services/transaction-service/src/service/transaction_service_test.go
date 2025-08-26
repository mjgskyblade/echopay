package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/models"
)

func setupTestDB(t *testing.T) *database.PostgresDB {
	config := database.DefaultConfig()
	config.Database = "echopay_test"
	
	db, err := database.NewPostgresDB(config)
	require.NoError(t, err)
	
	return db
}

func setupTestService(t *testing.T) (*TransactionService, *database.PostgresDB) {
	db := setupTestDB(t)
	service := NewTransactionService(db)
	
	// Run migrations
	err := service.Migrate()
	require.NoError(t, err)
	
	return service, db
}

func createTestWallets(t *testing.T, service *TransactionService) (uuid.UUID, uuid.UUID) {
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	// Create wallets with initial balances
	err := service.balanceRepo.CreateWallet(fromWallet)
	require.NoError(t, err)
	
	err = service.balanceRepo.CreateWallet(toWallet)
	require.NoError(t, err)
	
	// Add funds to sender wallet
	err = service.balanceRepo.AddFunds(fromWallet, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	return fromWallet, toWallet
}

func TestTransactionService_ProcessTransaction_Success(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Metadata: models.TransactionMetadata{
			Description: "Test payment",
			Category:    "test",
		},
	}
	
	ctx := context.Background()
	transaction, err := service.ProcessTransaction(ctx, req)
	
	assert.NoError(t, err)
	assert.NotNil(t, transaction)
	assert.Equal(t, models.StatusCompleted, transaction.Status)
	assert.Equal(t, req.Amount, transaction.Amount)
	assert.Equal(t, req.Currency, transaction.Currency)
	assert.NotNil(t, transaction.SettledAt)
	
	// Verify balances were updated
	fromBalance, err := service.GetWalletBalance(ctx, fromWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 900.0, fromBalance.Balance)
	
	toBalance, err := service.GetWalletBalance(ctx, toWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 100.0, toBalance.Balance)
}

func TestTransactionService_ProcessTransaction_InsufficientFunds(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     2000.0, // More than available balance
		Currency:   models.USDCBDC,
	}
	
	ctx := context.Background()
	transaction, err := service.ProcessTransaction(ctx, req)
	
	assert.Error(t, err)
	assert.Nil(t, transaction)
	
	// Check if it's the correct error type
	echoPayErr, ok := err.(*errors.EchoPayError)
	assert.True(t, ok)
	assert.Equal(t, errors.ErrInsufficientFunds, echoPayErr.Code)
	
	// Verify balances were not changed
	fromBalance, err := service.GetWalletBalance(ctx, fromWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 1000.0, fromBalance.Balance)
}

func TestTransactionService_ProcessTransaction_InvalidRequest(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	testCases := []struct {
		name string
		req  *TransactionRequest
	}{
		{
			name: "Same wallet transfer",
			req: &TransactionRequest{
				FromWallet: uuid.New(),
				ToWallet:   uuid.New(),
				Amount:     100.0,
				Currency:   models.USDCBDC,
			},
		},
		{
			name: "Zero amount",
			req: &TransactionRequest{
				FromWallet: uuid.New(),
				ToWallet:   uuid.New(),
				Amount:     0.0,
				Currency:   models.USDCBDC,
			},
		},
		{
			name: "Negative amount",
			req: &TransactionRequest{
				FromWallet: uuid.New(),
				ToWallet:   uuid.New(),
				Amount:     -100.0,
				Currency:   models.USDCBDC,
			},
		},
		{
			name: "Nil wallet IDs",
			req: &TransactionRequest{
				FromWallet: uuid.Nil,
				ToWallet:   uuid.New(),
				Amount:     100.0,
				Currency:   models.USDCBDC,
			},
		},
	}
	
	// Fix the same wallet test case
	testCases[0].req.ToWallet = testCases[0].req.FromWallet
	
	ctx := context.Background()
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			transaction, err := service.ProcessTransaction(ctx, tc.req)
			
			assert.Error(t, err)
			assert.Nil(t, transaction)
			
			echoPayErr, ok := err.(*errors.EchoPayError)
			assert.True(t, ok)
			assert.Equal(t, errors.ErrInvalidTransaction, echoPayErr.Code)
		})
	}
}

func TestTransactionService_GetTransaction(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	// Create a transaction
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	ctx := context.Background()
	createdTransaction, err := service.ProcessTransaction(ctx, req)
	require.NoError(t, err)
	
	// Retrieve the transaction
	retrievedTransaction, err := service.GetTransaction(ctx, createdTransaction.ID)
	
	assert.NoError(t, err)
	assert.NotNil(t, retrievedTransaction)
	assert.Equal(t, createdTransaction.ID, retrievedTransaction.ID)
	assert.Equal(t, createdTransaction.Amount, retrievedTransaction.Amount)
	assert.Equal(t, models.StatusCompleted, retrievedTransaction.Status)
	
	// Verify audit trail integrity
	assert.NoError(t, retrievedTransaction.VerifyIntegrity())
	assert.True(t, len(retrievedTransaction.AuditTrail) >= 2) // At least creation and completion
}

func TestTransactionService_GetTransaction_NotFound(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	ctx := context.Background()
	nonExistentID := uuid.New()
	
	transaction, err := service.GetTransaction(ctx, nonExistentID)
	
	assert.Error(t, err)
	assert.Nil(t, transaction)
	
	echoPayErr, ok := err.(*errors.EchoPayError)
	assert.True(t, ok)
	assert.Equal(t, errors.ErrTransactionNotFound, echoPayErr.Code)
}

func TestTransactionService_UpdateTransactionStatus(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	// Create a transaction
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	ctx := context.Background()
	transaction, err := service.ProcessTransaction(ctx, req)
	require.NoError(t, err)
	
	// Update status to reversed
	userID := uuid.New()
	details := map[string]interface{}{
		"reason": "fraud detected",
	}
	
	err = service.UpdateTransactionStatus(ctx, transaction.ID, models.StatusReversed, &userID, details)
	assert.NoError(t, err)
	
	// Verify the update
	updatedTransaction, err := service.GetTransaction(ctx, transaction.ID)
	assert.NoError(t, err)
	assert.Equal(t, models.StatusReversed, updatedTransaction.Status)
	
	// Check audit trail
	auditTrail := updatedTransaction.GetAuditTrail()
	assert.True(t, len(auditTrail) >= 3) // Creation, completion, reversal
	
	lastEntry := auditTrail[len(auditTrail)-1]
	assert.Equal(t, "STATUS_CHANGE", lastEntry.Action)
	assert.Equal(t, string(models.StatusCompleted), lastEntry.PreviousState)
	assert.Equal(t, string(models.StatusReversed), lastEntry.NewState)
	assert.Equal(t, &userID, lastEntry.UserID)
}

func TestTransactionService_SetFraudScore(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	// Create a transaction
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	ctx := context.Background()
	transaction, err := service.ProcessTransaction(ctx, req)
	require.NoError(t, err)
	
	// Set fraud score
	fraudScore := 0.75
	details := map[string]interface{}{
		"model": "isolation_forest",
		"confidence": 0.9,
	}
	
	err = service.SetFraudScore(ctx, transaction.ID, fraudScore, details)
	assert.NoError(t, err)
	
	// Verify the update
	updatedTransaction, err := service.GetTransaction(ctx, transaction.ID)
	assert.NoError(t, err)
	assert.NotNil(t, updatedTransaction.FraudScore)
	assert.Equal(t, fraudScore, *updatedTransaction.FraudScore)
	
	// Check audit trail
	auditTrail := updatedTransaction.GetAuditTrail()
	fraudScoreEntry := auditTrail[len(auditTrail)-1]
	assert.Equal(t, "FRAUD_SCORE_UPDATE", fraudScoreEntry.Action)
	assert.Equal(t, "fraud-detection", fraudScoreEntry.ServiceID)
}

func TestTransactionService_GetTransactionsByWallet(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	ctx := context.Background()
	
	// Create multiple transactions
	for i := 0; i < 5; i++ {
		req := &TransactionRequest{
			FromWallet: fromWallet,
			ToWallet:   toWallet,
			Amount:     float64(10 * (i + 1)),
			Currency:   models.USDCBDC,
		}
		
		_, err := service.ProcessTransaction(ctx, req)
		require.NoError(t, err)
	}
	
	// Get transactions for sender wallet
	transactions, err := service.GetTransactionsByWallet(ctx, fromWallet, 10, 0)
	
	assert.NoError(t, err)
	assert.Len(t, transactions, 5)
	
	// Verify all transactions are for the correct wallet
	for _, tx := range transactions {
		assert.True(t, tx.FromWallet == fromWallet || tx.ToWallet == fromWallet)
		assert.NoError(t, tx.VerifyIntegrity())
	}
}

func TestTransactionService_GetPendingTransactions(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	// For this test, we need to create transactions that remain pending
	// We'll create transactions directly in the repository without processing
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	transaction, err := models.NewTransaction(
		fromWallet,
		toWallet,
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{},
	)
	require.NoError(t, err)
	
	err = service.repo.Create(transaction)
	require.NoError(t, err)
	
	ctx := context.Background()
	pendingTransactions, err := service.GetPendingTransactions(ctx, 10)
	
	assert.NoError(t, err)
	assert.Len(t, pendingTransactions, 1)
	assert.Equal(t, models.StatusPending, pendingTransactions[0].Status)
}

func TestTransactionService_PerformanceMetrics(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	ctx := context.Background()
	
	// Process multiple transactions to generate metrics
	for i := 0; i < 10; i++ {
		req := &TransactionRequest{
			FromWallet: fromWallet,
			ToWallet:   toWallet,
			Amount:     10.0,
			Currency:   models.USDCBDC,
		}
		
		_, err := service.ProcessTransaction(ctx, req)
		if err != nil {
			// Expected after insufficient funds
			break
		}
	}
	
	metrics := service.GetServiceMetrics()
	
	assert.True(t, metrics.SuccessCount > 0)
	assert.True(t, len(metrics.ProcessingTimes) > 0)
	
	// Verify all processing times are reasonable (sub-second)
	for _, duration := range metrics.ProcessingTimes {
		assert.True(t, duration < time.Second, "Processing time should be sub-second")
	}
}

func TestTransactionService_ConcurrentTransactions(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	// Add more funds for concurrent testing
	err := service.balanceRepo.AddFunds(fromWallet, models.USDCBDC, 9000.0)
	require.NoError(t, err)
	
	ctx := context.Background()
	numGoroutines := 10
	results := make(chan error, numGoroutines)
	
	// Launch concurrent transactions
	for i := 0; i < numGoroutines; i++ {
		go func(amount float64) {
			req := &TransactionRequest{
				FromWallet: fromWallet,
				ToWallet:   toWallet,
				Amount:     amount,
				Currency:   models.USDCBDC,
			}
			
			_, err := service.ProcessTransaction(ctx, req)
			results <- err
		}(100.0)
	}
	
	// Collect results
	successCount := 0
	for i := 0; i < numGoroutines; i++ {
		err := <-results
		if err == nil {
			successCount++
		}
	}
	
	// All transactions should succeed due to sufficient funds
	assert.Equal(t, numGoroutines, successCount)
	
	// Verify final balance
	finalBalance, err := service.GetWalletBalance(ctx, fromWallet, models.USDCBDC)
	assert.NoError(t, err)
	expectedBalance := 10000.0 - (float64(numGoroutines) * 100.0)
	assert.Equal(t, expectedBalance, finalBalance.Balance)
}

func TestTransactionService_AuditTrailIntegrity(t *testing.T) {
	service, db := setupTestService(t)
	defer db.Close()
	
	fromWallet, toWallet := createTestWallets(t, service)
	
	req := &TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	ctx := context.Background()
	transaction, err := service.ProcessTransaction(ctx, req)
	require.NoError(t, err)
	
	// Verify audit trail integrity
	assert.NoError(t, transaction.VerifyIntegrity())
	
	// Retrieve from database and verify again
	retrievedTransaction, err := service.GetTransaction(ctx, transaction.ID)
	require.NoError(t, err)
	assert.NoError(t, retrievedTransaction.VerifyIntegrity())
	
	// Verify audit trail contains expected entries
	auditTrail := retrievedTransaction.GetAuditTrail()
	assert.True(t, len(auditTrail) >= 2)
	
	// First entry should be creation
	assert.Equal(t, "CREATED", auditTrail[0].Action)
	assert.Equal(t, "", auditTrail[0].PreviousState)
	assert.Equal(t, string(models.StatusPending), auditTrail[0].NewState)
	
	// Last entry should be completion
	lastEntry := auditTrail[len(auditTrail)-1]
	assert.Equal(t, "STATUS_CHANGE", lastEntry.Action)
	assert.Equal(t, string(models.StatusPending), lastEntry.PreviousState)
	assert.Equal(t, string(models.StatusCompleted), lastEntry.NewState)
}