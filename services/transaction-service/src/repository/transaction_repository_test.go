package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/models"

	_ "github.com/lib/pq"
)

// setupTestDB creates a test database connection
func setupTestDB(t *testing.T) *database.PostgresDB {
	config := database.DatabaseConfig{
		Host:            "localhost",
		Port:            5432,
		Database:        "echopay_test",
		User:            "echopay",
		Password:        "echopay_dev",
		SSLMode:         "disable",
		MaxOpenConns:    5,
		MaxIdleConns:    2,
		ConnMaxLifetime: 5 * time.Minute,
	}
	
	db, err := database.NewPostgresDB(config)
	if err != nil {
		t.Skipf("Skipping database tests: %v", err)
	}
	
	return db
}

// cleanupTestDB cleans up test data
func cleanupTestDB(t *testing.T, db *database.PostgresDB) {
	_, err := db.Exec("DELETE FROM transaction_audit")
	if err != nil {
		t.Logf("Failed to clean audit table: %v", err)
	}
	
	_, err = db.Exec("DELETE FROM transactions")
	if err != nil {
		t.Logf("Failed to clean transactions table: %v", err)
	}
}

func TestTransactionRepository_Migrate(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	
	repo := NewTransactionRepository(db)
	
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Verify tables exist
	var tableExists bool
	err = db.QueryRow("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions')").Scan(&tableExists)
	if err != nil {
		t.Fatalf("Failed to check transactions table: %v", err)
	}
	if !tableExists {
		t.Error("Transactions table was not created")
	}
	
	err = db.QueryRow("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transaction_audit')").Scan(&tableExists)
	if err != nil {
		t.Fatalf("Failed to check audit table: %v", err)
	}
	if !tableExists {
		t.Error("Transaction audit table was not created")
	}
}

func TestTransactionRepository_Create(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Create test transaction
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.50,
		models.USDCBDC,
		models.TransactionMetadata{
			Description: "Test payment",
			Category:    "personal",
		},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Test create
	err = repo.Create(transaction)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Verify transaction was created
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM transactions WHERE id = $1", transaction.ID).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to count transactions: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 transaction, got %d", count)
	}
	
	// Verify audit entry was created
	err = db.QueryRow("SELECT COUNT(*) FROM transaction_audit WHERE transaction_id = $1", transaction.ID).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to count audit entries: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 audit entry, got %d", count)
	}
}

func TestTransactionRepository_GetByID(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Create and save test transaction
	originalTransaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.50,
		models.USDCBDC,
		models.TransactionMetadata{
			Description: "Test payment",
			Category:    "personal",
		},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	err = repo.Create(originalTransaction)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Test get by ID
	retrievedTransaction, err := repo.GetByID(originalTransaction.ID)
	if err != nil {
		t.Fatalf("Failed to get transaction: %v", err)
	}
	
	// Verify transaction data
	if retrievedTransaction.ID != originalTransaction.ID {
		t.Errorf("Expected ID %v, got %v", originalTransaction.ID, retrievedTransaction.ID)
	}
	
	if retrievedTransaction.FromWallet != originalTransaction.FromWallet {
		t.Errorf("Expected FromWallet %v, got %v", originalTransaction.FromWallet, retrievedTransaction.FromWallet)
	}
	
	if retrievedTransaction.Amount != originalTransaction.Amount {
		t.Errorf("Expected Amount %v, got %v", originalTransaction.Amount, retrievedTransaction.Amount)
	}
	
	if retrievedTransaction.Status != originalTransaction.Status {
		t.Errorf("Expected Status %v, got %v", originalTransaction.Status, retrievedTransaction.Status)
	}
	
	// Verify audit trail
	if len(retrievedTransaction.AuditTrail) != 1 {
		t.Errorf("Expected 1 audit entry, got %d", len(retrievedTransaction.AuditTrail))
	}
	
	if len(retrievedTransaction.AuditTrail) > 0 {
		auditEntry := retrievedTransaction.AuditTrail[0]
		if auditEntry.Action != "CREATED" {
			t.Errorf("Expected audit action 'CREATED', got %v", auditEntry.Action)
		}
	}
}

func TestTransactionRepository_GetByIDNotFound(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Test get non-existent transaction
	_, err = repo.GetByID(uuid.New())
	
	if err == nil {
		t.Error("Expected error for non-existent transaction")
	}
	
	echoPayErr, ok := err.(*errors.EchoPayError)
	if !ok {
		t.Errorf("Expected EchoPayError, got %T", err)
	}
	
	if echoPayErr.Code != errors.ErrTransactionNotFound {
		t.Errorf("Expected error code %v, got %v", errors.ErrTransactionNotFound, echoPayErr.Code)
	}
}

func TestTransactionRepository_Update(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Create and save test transaction
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.50,
		models.USDCBDC,
		models.TransactionMetadata{
			Description: "Test payment",
			Category:    "personal",
		},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	err = repo.Create(transaction)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Update transaction status
	err = transaction.UpdateStatus(models.StatusCompleted, nil, "transaction-service", map[string]interface{}{"reason": "processed"})
	if err != nil {
		t.Fatalf("Failed to update transaction status: %v", err)
	}
	
	// Update in database
	err = repo.Update(transaction)
	if err != nil {
		t.Fatalf("Failed to update transaction: %v", err)
	}
	
	// Retrieve and verify
	updatedTransaction, err := repo.GetByID(transaction.ID)
	if err != nil {
		t.Fatalf("Failed to get updated transaction: %v", err)
	}
	
	if updatedTransaction.Status != models.StatusCompleted {
		t.Errorf("Expected status %v, got %v", models.StatusCompleted, updatedTransaction.Status)
	}
	
	if updatedTransaction.SettledAt == nil {
		t.Error("Expected SettledAt to be set for completed transaction")
	}
	
	// Verify audit trail has 2 entries
	if len(updatedTransaction.AuditTrail) != 2 {
		t.Errorf("Expected 2 audit entries, got %d", len(updatedTransaction.AuditTrail))
	}
}

func TestTransactionRepository_GetByWallet(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	walletID := uuid.New()
	otherWalletID := uuid.New()
	
	// Create multiple transactions
	for i := 0; i < 3; i++ {
		var fromWallet, toWallet uuid.UUID
		if i%2 == 0 {
			fromWallet = walletID
			toWallet = otherWalletID
		} else {
			fromWallet = otherWalletID
			toWallet = walletID
		}
		
		transaction, err := models.NewTransaction(
			fromWallet,
			toWallet,
			float64(100+i*10),
			models.USDCBDC,
			models.TransactionMetadata{},
		)
		if err != nil {
			t.Fatalf("Failed to create transaction %d: %v", i, err)
		}
		
		err = repo.Create(transaction)
		if err != nil {
			t.Fatalf("Failed to save transaction %d: %v", i, err)
		}
		
		// Add small delay to ensure different timestamps
		time.Sleep(1 * time.Millisecond)
	}
	
	// Get transactions for wallet
	transactions, err := repo.GetByWallet(walletID, 10, 0)
	if err != nil {
		t.Fatalf("Failed to get transactions by wallet: %v", err)
	}
	
	if len(transactions) != 3 {
		t.Errorf("Expected 3 transactions, got %d", len(transactions))
	}
	
	// Verify transactions are ordered by created_at DESC
	for i := 1; i < len(transactions); i++ {
		if transactions[i-1].CreatedAt.Before(transactions[i].CreatedAt) {
			t.Error("Transactions are not ordered by created_at DESC")
		}
	}
	
	// Test pagination
	firstPage, err := repo.GetByWallet(walletID, 2, 0)
	if err != nil {
		t.Fatalf("Failed to get first page: %v", err)
	}
	
	if len(firstPage) != 2 {
		t.Errorf("Expected 2 transactions in first page, got %d", len(firstPage))
	}
	
	secondPage, err := repo.GetByWallet(walletID, 2, 2)
	if err != nil {
		t.Fatalf("Failed to get second page: %v", err)
	}
	
	if len(secondPage) != 1 {
		t.Errorf("Expected 1 transaction in second page, got %d", len(secondPage))
	}
}

func TestTransactionRepository_GetPendingTransactions(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Create transactions with different statuses
	statuses := []models.TransactionStatus{
		models.StatusPending,
		models.StatusCompleted,
		models.StatusPending,
		models.StatusFailed,
		models.StatusPending,
	}
	
	for i, status := range statuses {
		transaction, err := models.NewTransaction(
			uuid.New(),
			uuid.New(),
			float64(100+i*10),
			models.USDCBDC,
			models.TransactionMetadata{},
		)
		if err != nil {
			t.Fatalf("Failed to create transaction %d: %v", i, err)
		}
		
		if status != models.StatusPending {
			err = transaction.UpdateStatus(status, nil, "test-service", nil)
			if err != nil {
				t.Fatalf("Failed to update transaction status: %v", err)
			}
		}
		
		err = repo.Create(transaction)
		if err != nil {
			t.Fatalf("Failed to save transaction %d: %v", i, err)
		}
		
		if status != models.StatusPending {
			err = repo.Update(transaction)
			if err != nil {
				t.Fatalf("Failed to update transaction %d: %v", i, err)
			}
		}
		
		// Add small delay to ensure different timestamps
		time.Sleep(1 * time.Millisecond)
	}
	
	// Get pending transactions
	pendingTransactions, err := repo.GetPendingTransactions(10)
	if err != nil {
		t.Fatalf("Failed to get pending transactions: %v", err)
	}
	
	if len(pendingTransactions) != 3 {
		t.Errorf("Expected 3 pending transactions, got %d", len(pendingTransactions))
	}
	
	// Verify all returned transactions are pending
	for _, transaction := range pendingTransactions {
		if transaction.Status != models.StatusPending {
			t.Errorf("Expected pending status, got %v", transaction.Status)
		}
	}
	
	// Verify transactions are ordered by created_at ASC
	for i := 1; i < len(pendingTransactions); i++ {
		if pendingTransactions[i-1].CreatedAt.After(pendingTransactions[i].CreatedAt) {
			t.Error("Pending transactions are not ordered by created_at ASC")
		}
	}
}

func TestTransactionRepository_GetTransactionStats(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	walletID := uuid.New()
	otherWalletID := uuid.New()
	since := time.Now().Add(-1 * time.Hour)
	
	// Create test transactions
	testData := []struct {
		amount      float64
		status      models.TransactionStatus
		fraudScore  *float64
	}{
		{100.0, models.StatusCompleted, floatPtr(0.1)},
		{200.0, models.StatusCompleted, floatPtr(0.2)},
		{50.0, models.StatusFailed, floatPtr(0.8)},
		{75.0, models.StatusReversed, floatPtr(0.9)},
		{150.0, models.StatusPending, nil},
	}
	
	for i, data := range testData {
		transaction, err := models.NewTransaction(
			walletID,
			otherWalletID,
			data.amount,
			models.USDCBDC,
			models.TransactionMetadata{},
		)
		if err != nil {
			t.Fatalf("Failed to create transaction %d: %v", i, err)
		}
		
		if data.fraudScore != nil {
			err = transaction.SetFraudScore(*data.fraudScore, "fraud-detection", nil)
			if err != nil {
				t.Fatalf("Failed to set fraud score: %v", err)
			}
		}
		
		if data.status != models.StatusPending {
			err = transaction.UpdateStatus(data.status, nil, "test-service", nil)
			if err != nil {
				t.Fatalf("Failed to update transaction status: %v", err)
			}
		}
		
		err = repo.Create(transaction)
		if err != nil {
			t.Fatalf("Failed to save transaction %d: %v", i, err)
		}
		
		if data.status != models.StatusPending || data.fraudScore != nil {
			err = repo.Update(transaction)
			if err != nil {
				t.Fatalf("Failed to update transaction %d: %v", i, err)
			}
		}
	}
	
	// Get transaction stats
	stats, err := repo.GetTransactionStats(walletID, since)
	if err != nil {
		t.Fatalf("Failed to get transaction stats: %v", err)
	}
	
	if stats.TotalCount != 5 {
		t.Errorf("Expected total count 5, got %d", stats.TotalCount)
	}
	
	if stats.CompletedCount != 2 {
		t.Errorf("Expected completed count 2, got %d", stats.CompletedCount)
	}
	
	if stats.FailedCount != 1 {
		t.Errorf("Expected failed count 1, got %d", stats.FailedCount)
	}
	
	if stats.ReversedCount != 1 {
		t.Errorf("Expected reversed count 1, got %d", stats.ReversedCount)
	}
	
	if stats.TotalAmount != 300.0 { // Only completed transactions
		t.Errorf("Expected total amount 300.0, got %f", stats.TotalAmount)
	}
	
	// Average fraud score should be (0.1 + 0.2 + 0.8 + 0.9) / 4 = 0.5
	expectedAvgFraudScore := 0.5
	if abs(stats.AvgFraudScore-expectedAvgFraudScore) > 0.01 {
		t.Errorf("Expected avg fraud score %f, got %f", expectedAvgFraudScore, stats.AvgFraudScore)
	}
}

// Helper function to create float pointer
func floatPtr(f float64) *float64 {
	return &f
}

// Helper function for absolute value
func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func TestVerifyIntegrity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	// Create transaction with multiple operations
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Add fraud score and status change
	err = transaction.SetFraudScore(0.3, "fraud-detection", nil)
	if err != nil {
		t.Fatalf("Failed to set fraud score: %v", err)
	}
	
	err = transaction.UpdateStatus(models.StatusCompleted, nil, "transaction-service", nil)
	if err != nil {
		t.Fatalf("Failed to update status: %v", err)
	}
	
	// Save to database
	err = repo.Create(transaction)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	// Retrieve from database
	retrievedTransaction, err := repo.GetByID(transaction.ID)
	if err != nil {
		t.Fatalf("Failed to retrieve transaction: %v", err)
	}
	
	// Verify integrity
	err = retrievedTransaction.VerifyIntegrity()
	if err != nil {
		t.Errorf("Integrity verification failed: %v", err)
	}
	
	// Verify audit trail completeness
	if len(retrievedTransaction.AuditTrail) != 3 {
		t.Errorf("Expected 3 audit entries, got %d", len(retrievedTransaction.AuditTrail))
	}
	
	expectedActions := []string{"CREATED", "FRAUD_SCORE_UPDATE", "STATUS_CHANGE"}
	for i, expectedAction := range expectedActions {
		if i < len(retrievedTransaction.AuditTrail) {
			if retrievedTransaction.AuditTrail[i].Action != expectedAction {
				t.Errorf("Expected audit action %s at index %d, got %s", expectedAction, i, retrievedTransaction.AuditTrail[i].Action)
			}
		}
	}
}

func TestNewTransaction(t *testing.T) {
	// Test transaction creation through repository
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{Description: "Test"},
	)
	if err != nil {
		t.Fatalf("Failed to create new transaction: %v", err)
	}
	
	if transaction.ID == uuid.Nil {
		t.Error("Expected transaction ID to be set")
	}
	
	if transaction.Status != models.StatusPending {
		t.Errorf("Expected status pending, got %v", transaction.Status)
	}
}

func TestUpdateStatus(t *testing.T) {
	// Test status update through repository
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	err = repo.Create(transaction)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	err = transaction.UpdateStatus(models.StatusCompleted, nil, "test-service", nil)
	if err != nil {
		t.Fatalf("Failed to update status: %v", err)
	}
	
	if transaction.Status != models.StatusCompleted {
		t.Errorf("Expected status completed, got %v", transaction.Status)
	}
}

func TestSetFraudScore(t *testing.T) {
	// Test fraud score setting through repository
	db := setupTestDB(t)
	defer db.Close()
	defer cleanupTestDB(t, db)
	
	repo := NewTransactionRepository(db)
	err := repo.Migrate()
	if err != nil {
		t.Fatalf("Migration failed: %v", err)
	}
	
	transaction, err := models.NewTransaction(
		uuid.New(),
		uuid.New(),
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{},
	)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}
	
	err = transaction.SetFraudScore(0.75, "fraud-detection", nil)
	if err != nil {
		t.Fatalf("Failed to set fraud score: %v", err)
	}
	
	if transaction.FraudScore == nil || *transaction.FraudScore != 0.75 {
		t.Errorf("Expected fraud score 0.75, got %v", transaction.FraudScore)
	}
}