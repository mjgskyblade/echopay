package events

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
	"echopay/shared/libraries/errors"
	"echopay/shared/libraries/logging"
	"echopay/transaction-service/src/models"
)

// EventType represents different types of transaction events
type EventType string

const (
	EventTransactionCreated   EventType = "transaction.created"
	EventTransactionCompleted EventType = "transaction.completed"
	EventTransactionFailed    EventType = "transaction.failed"
	EventTransactionReversed  EventType = "transaction.reversed"
	EventFraudScoreUpdated    EventType = "fraud.score.updated"
	EventBalanceUpdated       EventType = "balance.updated"
)

// TransactionEvent represents a transaction event for streaming
type TransactionEvent struct {
	ID            uuid.UUID              `json:"id"`
	Type          EventType              `json:"type"`
	Timestamp     time.Time              `json:"timestamp"`
	TransactionID uuid.UUID              `json:"transaction_id"`
	FromWallet    uuid.UUID              `json:"from_wallet"`
	ToWallet      uuid.UUID              `json:"to_wallet"`
	Amount        float64                `json:"amount"`
	Currency      models.Currency        `json:"currency"`
	Status        models.TransactionStatus `json:"status"`
	FraudScore    *float64               `json:"fraud_score,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	Version       int                    `json:"version"`
}

// BalanceUpdateEvent represents a balance update event
type BalanceUpdateEvent struct {
	ID        uuid.UUID       `json:"id"`
	Type      EventType       `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	WalletID  uuid.UUID       `json:"wallet_id"`
	Currency  models.Currency `json:"currency"`
	OldBalance float64        `json:"old_balance"`
	NewBalance float64        `json:"new_balance"`
	TransactionID *uuid.UUID  `json:"transaction_id,omitempty"`
	Version   int             `json:"version"`
}

// EventPublisher handles publishing events to Kafka
type EventPublisher struct {
	writer *kafka.Writer
	logger *logging.Logger
}

// EventPublisherConfig holds configuration for the event publisher
type EventPublisherConfig struct {
	KafkaBrokers []string
	Topic        string
	BatchSize    int
	BatchTimeout time.Duration
}

// NewEventPublisher creates a new event publisher
func NewEventPublisher(config EventPublisherConfig) *EventPublisher {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(config.KafkaBrokers...),
		Topic:        config.Topic,
		BatchSize:    config.BatchSize,
		BatchTimeout: config.BatchTimeout,
		RequiredAcks: kafka.RequireOne,
		Async:        true, // Enable async publishing for better performance
	}

	return &EventPublisher{
		writer: writer,
		logger: logging.NewLogger("event-publisher"),
	}
}

// PublishTransactionEvent publishes a transaction event
func (p *EventPublisher) PublishTransactionEvent(ctx context.Context, transaction *models.Transaction, eventType EventType) error {
	event := TransactionEvent{
		ID:            uuid.New(),
		Type:          eventType,
		Timestamp:     time.Now().UTC(),
		TransactionID: transaction.ID,
		FromWallet:    transaction.FromWallet,
		ToWallet:      transaction.ToWallet,
		Amount:        transaction.Amount,
		Currency:      transaction.Currency,
		Status:        transaction.Status,
		FraudScore:    transaction.FraudScore,
		Metadata: map[string]interface{}{
			"description": transaction.Metadata.Description,
			"category":    transaction.Metadata.Category,
		},
		Version: 1,
	}

	return p.publishEvent(ctx, event.ID.String(), event)
}

// PublishBalanceUpdateEvent publishes a balance update event
func (p *EventPublisher) PublishBalanceUpdateEvent(ctx context.Context, walletID uuid.UUID, currency models.Currency, oldBalance, newBalance float64, transactionID *uuid.UUID) error {
	event := BalanceUpdateEvent{
		ID:            uuid.New(),
		Type:          EventBalanceUpdated,
		Timestamp:     time.Now().UTC(),
		WalletID:      walletID,
		Currency:      currency,
		OldBalance:    oldBalance,
		NewBalance:    newBalance,
		TransactionID: transactionID,
		Version:       1,
	}

	return p.publishEvent(ctx, event.ID.String(), event)
}

// PublishFraudScoreEvent publishes a fraud score update event
func (p *EventPublisher) PublishFraudScoreEvent(ctx context.Context, transaction *models.Transaction, oldScore, newScore *float64) error {
	event := TransactionEvent{
		ID:            uuid.New(),
		Type:          EventFraudScoreUpdated,
		Timestamp:     time.Now().UTC(),
		TransactionID: transaction.ID,
		FromWallet:    transaction.FromWallet,
		ToWallet:      transaction.ToWallet,
		Amount:        transaction.Amount,
		Currency:      transaction.Currency,
		Status:        transaction.Status,
		FraudScore:    newScore,
		Metadata: map[string]interface{}{
			"old_fraud_score": oldScore,
			"new_fraud_score": newScore,
		},
		Version: 1,
	}

	return p.publishEvent(ctx, event.ID.String(), event)
}

// publishEvent publishes an event to Kafka
func (p *EventPublisher) publishEvent(ctx context.Context, key string, event interface{}) error {
	eventData, err := json.Marshal(event)
	if err != nil {
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to marshal event", "event-publisher")
	}

	message := kafka.Message{
		Key:   []byte(key),
		Value: eventData,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "content-type", Value: []byte("application/json")},
			{Key: "producer", Value: []byte("transaction-service")},
		},
	}

	err = p.writer.WriteMessages(ctx, message)
	if err != nil {
		p.logger.Error("Failed to publish event", "error", err, "key", key)
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to publish event", "event-publisher")
	}

	p.logger.Debug("Event published successfully", "key", key, "type", fmt.Sprintf("%T", event))
	return nil
}

// Close closes the event publisher
func (p *EventPublisher) Close() error {
	return p.writer.Close()
}

// GetStats returns publisher statistics
func (p *EventPublisher) GetStats() kafka.WriterStats {
	return p.writer.Stats()
}

// DefaultEventPublisherConfig returns a default configuration
func DefaultEventPublisherConfig() EventPublisherConfig {
	return EventPublisherConfig{
		KafkaBrokers: []string{"localhost:9092"},
		Topic:        "echopay.transactions",
		BatchSize:    100,
		BatchTimeout: 10 * time.Millisecond,
	}
}