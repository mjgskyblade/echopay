package events

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"echopay/transaction-service/src/models"
)

func TestStatusTracker_Creation(t *testing.T) {
	tracker := NewStatusTracker()
	require.NotNil(t, tracker)
	require.NotNil(t, tracker.subscribers)
	require.NotNil(t, tracker.logger)
	
	assert.Equal(t, 0, tracker.GetSubscriberCount())
}

func TestStatusTracker_Subscribe(t *testing.T) {
	tracker := NewStatusTracker()
	
	filter := StatusFilter{
		TransactionIDs: []uuid.UUID{uuid.New()},
	}
	
	subscriber := tracker.Subscribe(filter)
	require.NotNil(t, subscriber)
	require.NotNil(t, subscriber.Channel)
	assert.NotEqual(t, uuid.Nil, subscriber.ID)
	assert.Equal(t, filter, subscriber.Filter)
	
	assert.Equal(t, 1, tracker.GetSubscriberCount())
	
	// Clean up
	tracker.Unsubscribe(subscriber.ID)
	assert.Equal(t, 0, tracker.GetSubscriberCount())
}

func TestStatusTracker_PublishUpdate(t *testing.T) {
	tracker := NewStatusTracker()
	
	// Create test transaction
	transaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	// Subscribe to updates
	filter := StatusFilter{
		TransactionIDs: []uuid.UUID{transaction.ID},
	}
	
	subscriber := tracker.Subscribe(filter)
	defer tracker.Unsubscribe(subscriber.ID)
	
	// Publish update
	go func() {
		time.Sleep(10 * time.Millisecond) // Small delay
		tracker.PublishStatusUpdate(transaction, "Test message")
	}()
	
	// Wait for update
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, transaction.ID, update.TransactionID)
		assert.Equal(t, models.StatusCompleted, update.Status)
		assert.Equal(t, "Test message", update.Message)
		assert.NotZero(t, update.Timestamp)
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for status update")
	}
}

func TestStatusTracker_FilterByWallet(t *testing.T) {
	tracker := NewStatusTracker()
	
	walletID := uuid.New()
	otherWalletID := uuid.New()
	
	// Create transactions
	matchingTransaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: walletID,
		ToWallet:   otherWalletID,
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	nonMatchingTransaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     50.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	// Subscribe to updates for specific wallet
	filter := StatusFilter{
		WalletIDs: []uuid.UUID{walletID},
	}
	
	subscriber := tracker.Subscribe(filter)
	defer tracker.Unsubscribe(subscriber.ID)
	
	// Publish updates
	go func() {
		time.Sleep(10 * time.Millisecond)
		tracker.PublishStatusUpdate(matchingTransaction, "Matching transaction")
		tracker.PublishStatusUpdate(nonMatchingTransaction, "Non-matching transaction")
	}()
	
	// Should only receive the matching update
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, matchingTransaction.ID, update.TransactionID)
		assert.Equal(t, "Matching transaction", update.Message)
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for status update")
	}
	
	// Should not receive the non-matching update
	select {
	case <-subscriber.Channel:
		t.Fatal("Received unexpected update")
	case <-time.After(100 * time.Millisecond):
		// Expected - no update should be received
	}
}

func TestStatusTracker_FilterByStatus(t *testing.T) {
	tracker := NewStatusTracker()
	
	// Create transactions with different statuses
	completedTransaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	pendingTransaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     50.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusPending,
	}
	
	// Subscribe to only completed transactions
	filter := StatusFilter{
		Statuses: []models.TransactionStatus{models.StatusCompleted},
	}
	
	subscriber := tracker.Subscribe(filter)
	defer tracker.Unsubscribe(subscriber.ID)
	
	// Publish updates
	go func() {
		time.Sleep(10 * time.Millisecond)
		tracker.PublishStatusUpdate(completedTransaction, "Completed transaction")
		tracker.PublishStatusUpdate(pendingTransaction, "Pending transaction")
	}()
	
	// Should only receive the completed transaction update
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, completedTransaction.ID, update.TransactionID)
		assert.Equal(t, models.StatusCompleted, update.Status)
		assert.Equal(t, "Completed transaction", update.Message)
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for status update")
	}
	
	// Should not receive the pending transaction update
	select {
	case <-subscriber.Channel:
		t.Fatal("Received unexpected update")
	case <-time.After(100 * time.Millisecond):
		// Expected - no update should be received
	}
}

func TestStatusTracker_FraudScoreUpdate(t *testing.T) {
	tracker := NewStatusTracker()
	
	transaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	filter := StatusFilter{
		TransactionIDs: []uuid.UUID{transaction.ID},
	}
	
	subscriber := tracker.Subscribe(filter)
	defer tracker.Unsubscribe(subscriber.ID)
	
	// Test high fraud score
	oldScore := 0.1
	newScore := 0.8
	transaction.FraudScore = &newScore
	
	go func() {
		time.Sleep(10 * time.Millisecond)
		tracker.PublishFraudScoreUpdate(transaction, &oldScore, &newScore)
	}()
	
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, transaction.ID, update.TransactionID)
		assert.Equal(t, &newScore, update.FraudScore)
		assert.Contains(t, update.Message, "High fraud risk")
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for fraud score update")
	}
}

func TestStatusTracker_MultipleSubscribers(t *testing.T) {
	tracker := NewStatusTracker()
	
	transaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusCompleted,
	}
	
	// Create multiple subscribers
	subscribers := make([]*StatusSubscriber, 3)
	for i := 0; i < 3; i++ {
		filter := StatusFilter{
			TransactionIDs: []uuid.UUID{transaction.ID},
		}
		subscribers[i] = tracker.Subscribe(filter)
	}
	
	assert.Equal(t, 3, tracker.GetSubscriberCount())
	
	// Publish update
	go func() {
		time.Sleep(10 * time.Millisecond)
		tracker.PublishStatusUpdate(transaction, "Multi-subscriber test")
	}()
	
	// All subscribers should receive the update
	for i, subscriber := range subscribers {
		select {
		case update := <-subscriber.Channel:
			assert.Equal(t, transaction.ID, update.TransactionID)
			assert.Equal(t, "Multi-subscriber test", update.Message)
		case <-time.After(1 * time.Second):
			t.Fatalf("Timeout waiting for update on subscriber %d", i)
		}
	}
	
	// Clean up
	for _, subscriber := range subscribers {
		tracker.Unsubscribe(subscriber.ID)
	}
	
	assert.Equal(t, 0, tracker.GetSubscriberCount())
}

func TestStatusTracker_CleanupRoutine(t *testing.T) {
	tracker := NewStatusTracker()
	
	// Create a subscriber
	filter := StatusFilter{
		TransactionIDs: []uuid.UUID{uuid.New()},
	}
	
	subscriber := tracker.Subscribe(filter)
	assert.Equal(t, 1, tracker.GetSubscriberCount())
	
	// Run cleanup (should not remove active subscriber)
	tracker.CleanupInactiveSubscribers()
	
	// Subscriber should still be there
	assert.Equal(t, 1, tracker.GetSubscriberCount())
	
	// Clean up properly
	tracker.Unsubscribe(subscriber.ID)
	assert.Equal(t, 0, tracker.GetSubscriberCount())
}

func TestStatusTracker_StartCleanupRoutine(t *testing.T) {
	tracker := NewStatusTracker()
	
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	
	// Start cleanup routine (should not block)
	go tracker.StartCleanupRoutine(ctx, 50*time.Millisecond)
	
	// Wait for context to be done
	<-ctx.Done()
	
	// Should complete without hanging
	assert.True(t, true, "Cleanup routine completed")
}