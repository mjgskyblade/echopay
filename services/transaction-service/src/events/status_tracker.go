package events

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"echopay/shared/libraries/logging"
	"echopay/transaction-service/src/models"
)

// StatusUpdate represents a real-time status update
type StatusUpdate struct {
	TransactionID uuid.UUID                `json:"transaction_id"`
	Status        models.TransactionStatus `json:"status"`
	Timestamp     time.Time                `json:"timestamp"`
	FraudScore    *float64                 `json:"fraud_score,omitempty"`
	Message       string                   `json:"message,omitempty"`
}

// StatusSubscriber represents a client subscribed to status updates
type StatusSubscriber struct {
	ID      uuid.UUID
	Channel chan StatusUpdate
	Filter  StatusFilter
}

// StatusFilter defines criteria for filtering status updates
type StatusFilter struct {
	TransactionIDs []uuid.UUID             `json:"transaction_ids,omitempty"`
	WalletIDs      []uuid.UUID             `json:"wallet_ids,omitempty"`
	Statuses       []models.TransactionStatus `json:"statuses,omitempty"`
}

// StatusTracker manages real-time transaction status updates
type StatusTracker struct {
	subscribers map[uuid.UUID]*StatusSubscriber
	mutex       sync.RWMutex
	logger      *logging.Logger
}

// NewStatusTracker creates a new status tracker
func NewStatusTracker() *StatusTracker {
	return &StatusTracker{
		subscribers: make(map[uuid.UUID]*StatusSubscriber),
		logger:      logging.NewLogger("status-tracker"),
	}
}

// Subscribe subscribes to transaction status updates
func (st *StatusTracker) Subscribe(filter StatusFilter) *StatusSubscriber {
	st.mutex.Lock()
	defer st.mutex.Unlock()

	subscriber := &StatusSubscriber{
		ID:      uuid.New(),
		Channel: make(chan StatusUpdate, 100), // Buffered channel
		Filter:  filter,
	}

	st.subscribers[subscriber.ID] = subscriber
	st.logger.Debug("New subscriber added", "subscriber_id", subscriber.ID)

	return subscriber
}

// Unsubscribe removes a subscriber
func (st *StatusTracker) Unsubscribe(subscriberID uuid.UUID) {
	st.mutex.Lock()
	defer st.mutex.Unlock()

	if subscriber, exists := st.subscribers[subscriberID]; exists {
		close(subscriber.Channel)
		delete(st.subscribers, subscriberID)
		st.logger.Debug("Subscriber removed", "subscriber_id", subscriberID)
	}
}

// PublishStatusUpdate publishes a status update to all matching subscribers
func (st *StatusTracker) PublishStatusUpdate(transaction *models.Transaction, message string) {
	update := StatusUpdate{
		TransactionID: transaction.ID,
		Status:        transaction.Status,
		Timestamp:     time.Now().UTC(),
		FraudScore:    transaction.FraudScore,
		Message:       message,
	}

	st.mutex.RLock()
	defer st.mutex.RUnlock()

	for _, subscriber := range st.subscribers {
		if st.matchesFilter(transaction, subscriber.Filter) {
			select {
			case subscriber.Channel <- update:
				// Successfully sent
			default:
				// Channel is full, skip this subscriber
				st.logger.Warn("Subscriber channel full, dropping update", "subscriber_id", subscriber.ID)
			}
		}
	}

	st.logger.Debug("Status update published", "transaction_id", transaction.ID, "status", transaction.Status)
}

// PublishFraudScoreUpdate publishes a fraud score update
func (st *StatusTracker) PublishFraudScoreUpdate(transaction *models.Transaction, oldScore, newScore *float64) {
	message := "Fraud score updated"
	if newScore != nil {
		if *newScore > 0.7 {
			message = "High fraud risk detected"
		} else if *newScore > 0.3 {
			message = "Medium fraud risk detected"
		} else {
			message = "Low fraud risk"
		}
	}

	st.PublishStatusUpdate(transaction, message)
}

// matchesFilter checks if a transaction matches the subscriber's filter
func (st *StatusTracker) matchesFilter(transaction *models.Transaction, filter StatusFilter) bool {
	// Check transaction IDs
	if len(filter.TransactionIDs) > 0 {
		found := false
		for _, id := range filter.TransactionIDs {
			if id == transaction.ID {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check wallet IDs
	if len(filter.WalletIDs) > 0 {
		found := false
		for _, id := range filter.WalletIDs {
			if id == transaction.FromWallet || id == transaction.ToWallet {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check statuses
	if len(filter.Statuses) > 0 {
		found := false
		for _, status := range filter.Statuses {
			if status == transaction.Status {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	return true
}

// GetSubscriberCount returns the number of active subscribers
func (st *StatusTracker) GetSubscriberCount() int {
	st.mutex.RLock()
	defer st.mutex.RUnlock()
	return len(st.subscribers)
}

// CleanupInactiveSubscribers removes subscribers with closed channels
func (st *StatusTracker) CleanupInactiveSubscribers() {
	st.mutex.Lock()
	defer st.mutex.Unlock()

	toRemove := make([]uuid.UUID, 0)
	
	for id, subscriber := range st.subscribers {
		// Check if channel is closed by trying to send with immediate timeout
		select {
		case subscriber.Channel <- StatusUpdate{
			TransactionID: uuid.Nil, // Use nil UUID as test message
			Status:        "",
			Timestamp:     time.Now(),
			Message:       "__test__",
		}:
			// Channel accepted the message, it's active
			// Try to read it back immediately
			select {
			case msg := <-subscriber.Channel:
				if msg.Message == "__test__" {
					// Successfully read back test message, channel is active
					continue
				}
				// Put the message back if it wasn't our test message
				select {
				case subscriber.Channel <- msg:
				default:
					// Channel is full, mark for removal
					toRemove = append(toRemove, id)
				}
			default:
				// Couldn't read back immediately, but channel accepted write
				// This means channel is active but has other messages
			}
		default:
			// Channel is full or closed, mark for removal
			toRemove = append(toRemove, id)
		}
	}
	
	// Remove inactive subscribers
	for _, id := range toRemove {
		delete(st.subscribers, id)
		st.logger.Debug("Removed inactive subscriber", "subscriber_id", id)
	}
}

// StartCleanupRoutine starts a background routine to clean up inactive subscribers
func (st *StatusTracker) StartCleanupRoutine(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			st.CleanupInactiveSubscribers()
		}
	}
}