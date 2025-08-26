package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	
	"echopay/shared/libraries/database"
	"echopay/transaction-service/src/models"
)

func setupTestBalanceRepo(t *testing.T) (*WalletBalanceRepository, *database.PostgresDB) {
	config := database.DefaultConfig()
	config.Database = "echopay_test"
	
	db, err := database.NewPostgresDB(config)
	require.NoError(t, err)
	
	repo := NewWalletBalanceRepository(db)
	
	// Run migrations
	err = repo.Migrate()
	require.NoError(t, err)
	
	return repo, db
}

func TestWalletBalanceRepository_CreateWallet(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	err := repo.CreateWallet(walletID)
	assert.NoError(t, err)
	
	// Verify all currency balances were created
	balances, err := repo.GetWalletBalances(walletID)
	assert.NoError(t, err)
	assert.Len(t, balances, 3) // USD, EUR, GBP CBDCs
	
	for _, balance := range balances {
		assert.Equal(t, walletID, balance.WalletID)
		assert.Equal(t, 0.0, balance.Balance)
	}
}

func TestWalletBalanceRepository_GetBalance(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Get balance for non-existent wallet (should create zero balance)
	balance, err := repo.GetBalance(walletID, models.USDCBDC)
	assert.NoError(t, err)
	assert.NotNil(t, balance)
	assert.Equal(t, walletID, balance.WalletID)
	assert.Equal(t, models.USDCBDC, balance.Currency)
	assert.Equal(t, 0.0, balance.Balance)
}

func TestWalletBalanceRepository_AddFunds(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Add funds to new wallet
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	assert.NoError(t, err)
	
	// Verify balance
	balance, err := repo.GetBalance(walletID, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 1000.0, balance.Balance)
	
	// Add more funds
	err = repo.AddFunds(walletID, models.USDCBDC, 500.0)
	assert.NoError(t, err)
	
	// Verify updated balance
	balance, err = repo.GetBalance(walletID, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 1500.0, balance.Balance)
}

func TestWalletBalanceRepository_AddFunds_InvalidAmount(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Try to add zero funds
	err := repo.AddFunds(walletID, models.USDCBDC, 0.0)
	assert.Error(t, err)
	
	// Try to add negative funds
	err = repo.AddFunds(walletID, models.USDCBDC, -100.0)
	assert.Error(t, err)
}

func TestWalletBalanceRepository_UpdateBalance(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Create wallet with initial funds
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	// Update balance using transaction
	err = db.Transaction(func(tx *sql.Tx) error {
		return repo.UpdateBalance(tx, walletID, models.USDCBDC, 750.0)
	})
	assert.NoError(t, err)
	
	// Verify updated balance
	balance, err := repo.GetBalance(walletID, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 750.0, balance.Balance)
}

func TestWalletBalanceRepository_GetBalanceForUpdate(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Create wallet with initial funds
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	// Get balance for update within transaction
	err = db.Transaction(func(tx *sql.Tx) error {
		balance, err := repo.GetBalanceForUpdate(tx, walletID, models.USDCBDC)
		if err != nil {
			return err
		}
		
		assert.Equal(t, walletID, balance.WalletID)
		assert.Equal(t, models.USDCBDC, balance.Currency)
		assert.Equal(t, 1000.0, balance.Balance)
		
		return nil
	})
	assert.NoError(t, err)
}

func TestWalletBalanceRepository_GetBalanceForUpdate_NonExistent(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Get balance for update for non-existent wallet (should create zero balance)
	err := db.Transaction(func(tx *sql.Tx) error {
		balance, err := repo.GetBalanceForUpdate(tx, walletID, models.USDCBDC)
		if err != nil {
			return err
		}
		
		assert.Equal(t, walletID, balance.WalletID)
		assert.Equal(t, models.USDCBDC, balance.Currency)
		assert.Equal(t, 0.0, balance.Balance)
		
		return nil
	})
	assert.NoError(t, err)
}

func TestWalletBalanceRepository_GetWalletBalances(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Add funds in different currencies
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	err = repo.AddFunds(walletID, models.EURCBDC, 500.0)
	require.NoError(t, err)
	
	// Get all balances
	balances, err := repo.GetWalletBalances(walletID)
	assert.NoError(t, err)
	assert.Len(t, balances, 3) // All three currencies should be present
	
	// Verify balances
	balanceMap := make(map[models.Currency]float64)
	for _, balance := range balances {
		balanceMap[balance.Currency] = balance.Balance
	}
	
	assert.Equal(t, 1000.0, balanceMap[models.USDCBDC])
	assert.Equal(t, 500.0, balanceMap[models.EURCBDC])
	assert.Equal(t, 0.0, balanceMap[models.GBPCBDC]) // Should be zero
}

func TestWalletBalanceRepository_GetTotalBalance(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Add funds in different currencies
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	err = repo.AddFunds(walletID, models.EURCBDC, 500.0)
	require.NoError(t, err)
	
	err = repo.AddFunds(walletID, models.GBPCBDC, 250.0)
	require.NoError(t, err)
	
	// Get total balance
	totalBalance, err := repo.GetTotalBalance(walletID)
	assert.NoError(t, err)
	assert.Equal(t, 1750.0, totalBalance) // Sum of all currencies
}

func TestWalletBalanceRepository_GetTotalBalance_EmptyWallet(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Get total balance for empty wallet
	totalBalance, err := repo.GetTotalBalance(walletID)
	assert.NoError(t, err)
	assert.Equal(t, 0.0, totalBalance)
}

func TestWalletBalanceRepository_ConcurrentUpdates(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	walletID := uuid.New()
	
	// Create wallet with initial funds
	err := repo.AddFunds(walletID, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	// Perform concurrent balance updates
	numGoroutines := 10
	results := make(chan error, numGoroutines)
	
	for i := 0; i < numGoroutines; i++ {
		go func(amount float64) {
			err := repo.AddFunds(walletID, models.USDCBDC, amount)
			results <- err
		}(10.0)
	}
	
	// Collect results
	for i := 0; i < numGoroutines; i++ {
		err := <-results
		assert.NoError(t, err)
	}
	
	// Verify final balance
	balance, err := repo.GetBalance(walletID, models.USDCBDC)
	assert.NoError(t, err)
	expectedBalance := 1000.0 + (float64(numGoroutines) * 10.0)
	assert.Equal(t, expectedBalance, balance.Balance)
}

func TestWalletBalanceRepository_AtomicTransfer(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	// Create wallets with initial balances
	err := repo.AddFunds(fromWallet, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	err = repo.CreateWallet(toWallet)
	require.NoError(t, err)
	
	transferAmount := 250.0
	
	// Perform atomic transfer
	err = db.Transaction(func(tx *sql.Tx) error {
		// Get balances with locks
		fromBalance, err := repo.GetBalanceForUpdate(tx, fromWallet, models.USDCBDC)
		if err != nil {
			return err
		}
		
		toBalance, err := repo.GetBalanceForUpdate(tx, toWallet, models.USDCBDC)
		if err != nil {
			return err
		}
		
		// Check sufficient funds
		if fromBalance.Balance < transferAmount {
			return assert.AnError // Simulate insufficient funds
		}
		
		// Update balances
		err = repo.UpdateBalance(tx, fromWallet, models.USDCBDC, fromBalance.Balance-transferAmount)
		if err != nil {
			return err
		}
		
		err = repo.UpdateBalance(tx, toWallet, models.USDCBDC, toBalance.Balance+transferAmount)
		if err != nil {
			return err
		}
		
		return nil
	})
	
	assert.NoError(t, err)
	
	// Verify final balances
	fromBalance, err := repo.GetBalance(fromWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 750.0, fromBalance.Balance)
	
	toBalance, err := repo.GetBalance(toWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 250.0, toBalance.Balance)
}

func TestWalletBalanceRepository_AtomicTransfer_InsufficientFunds(t *testing.T) {
	repo, db := setupTestBalanceRepo(t)
	defer db.Close()
	
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	// Create wallets with insufficient funds
	err := repo.AddFunds(fromWallet, models.USDCBDC, 100.0)
	require.NoError(t, err)
	
	err = repo.CreateWallet(toWallet)
	require.NoError(t, err)
	
	transferAmount := 250.0 // More than available
	
	// Attempt atomic transfer (should fail)
	err = db.Transaction(func(tx *sql.Tx) error {
		fromBalance, err := repo.GetBalanceForUpdate(tx, fromWallet, models.USDCBDC)
		if err != nil {
			return err
		}
		
		if fromBalance.Balance < transferAmount {
			return assert.AnError // Simulate insufficient funds error
		}
		
		return nil
	})
	
	assert.Error(t, err)
	
	// Verify balances remain unchanged
	fromBalance, err := repo.GetBalance(fromWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 100.0, fromBalance.Balance)
	
	toBalance, err := repo.GetBalance(toWallet, models.USDCBDC)
	assert.NoError(t, err)
	assert.Equal(t, 0.0, toBalance.Balance)
}