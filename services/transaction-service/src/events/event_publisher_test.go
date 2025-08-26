package events

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"echopay/transaction-service/src/models"
)

func TestEventPublisherConfig(t *testing.T) {
	config := DefaultEventPublisherConfig()
	
	assert.Equal(t, []string{"localhost:9092"}, config.KafkaBrokers)
	assert.Equal(t, "echopay.transactions", config.Topic)
	assert.Equal(t, 100, config.BatchSize)
	assert.Equal(t, 10*time.Millisecond, config.BatchTimeout)
}

func TestTransactionEvent(t *testing.T) {
	// Create a test transaction
	transaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
		FraudScore: nil,
	}

	// Create event
	event := TransactionEvent{
		ID:            uuid.New(),
		Type:          EventTransactionCompleted,
		Timestamp:     time.Now().UTC(),
		TransactionID: transaction.ID,
		FromWallet:    transaction.FromWallet,
		ToWallet:      transaction.ToWallet,
		Amount:        transaction.Amount,
		Currency:      transaction.Currency,
		Status:        transaction.Status,
		FraudScore:    transaction.FraudScore,
		Version:       1,
	}

	// Verify event structure
	assert.Equal(t, EventTransactionCompleted, event.Type)
	assert.Equal(t, transaction.ID, event.TransactionID)
	assert.Equal(t, transaction.Amount, event.Amount)
	assert.Equal(t, models.USDCBDC, event.Currency)
	assert.Equal(t, models.StatusCompleted, event.Status)
	assert.Equal(t, 1, event.Version)
}

func TestBalanceUpdateEvent(t *testing.T) {
	walletID := uuid.New()
	transactionID := uuid.New()

	event := BalanceUpdateEvent{
		ID:            uuid.New(),
		Type:          EventBalanceUpdated,
		Timestamp:     time.Now().UTC(),
		WalletID:      walletID,
		Currency:      models.USDCBDC,
		OldBalance:    1000.0,
		NewBalance:    900.0,
		TransactionID: &transactionID,
		Version:       1,
	}

	// Verify event structure
	assert.Equal(t, EventBalanceUpdated, event.Type)
	assert.Equal(t, walletID, event.WalletID)
	assert.Equal(t, models.USDCBDC, event.Currency)
	assert.Equal(t, 1000.0, event.OldBalance)
	assert.Equal(t, 900.0, event.NewBalance)
	assert.Equal(t, &transactionID, event.TransactionID)
	assert.Equal(t, 1, event.Version)
}

func TestEventTypes(t *testing.T) {
	// Test all event types are defined
	eventTypes := []EventType{
		EventTransactionCreated,
		EventTransactionCompleted,
		EventTransactionFailed,
		EventTransactionReversed,
		EventFraudScoreUpdated,
		EventBalanceUpdated,
	}

	expectedTypes := []string{
		"transaction.created",
		"transaction.completed",
		"transaction.failed",
		"transaction.reversed",
		"fraud.score.updated",
		"balance.updated",
	}

	for i, eventType := range eventTypes {
		assert.Equal(t, expectedTypes[i], string(eventType))
	}
}

// Mock test for event publisher (without actual Kafka)
func TestEventPublisher_Creation(t *testing.T) {
	config := EventPublisherConfig{
		KafkaBrokers: []string{"localhost:9092"},
		Topic:        "test.transactions",
		BatchSize:    10,
		BatchTimeout: 10 * time.Millisecond,
	}

	publisher := NewEventPublisher(config)
	require.NotNil(t, publisher)
	require.NotNil(t, publisher.writer)
	require.NotNil(t, publisher.logger)

	// Test stats (should not panic)
	stats := publisher.GetStats()
	assert.NotNil(t, stats)

	// Clean up
	err := publisher.Close()
	assert.NoError(t, err)
}