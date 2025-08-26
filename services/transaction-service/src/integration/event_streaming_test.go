package integration

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"echopay/shared/libraries/database"
	"echopay/transaction-service/src/events"
	"echopay/transaction-service/src/handler"
	"echopay/transaction-service/src/models"
	"echopay/transaction-service/src/service"
)

func setupEventIntegrationTest(t *testing.T) (*service.TransactionService, *events.EventPublisher, *events.StatusTracker) {
	// Set up test database
	config := database.DefaultConfig()
	config.Database = "echopay_test_events"
	
	db, err := database.NewPostgresDB(config)
	require.NoError(t, err)
	
	// Create event publisher with test configuration
	eventConfig := events.EventPublisherConfig{
		KafkaBrokers: []string{"localhost:9092"}, // Will use mock in tests
		Topic:        "test.transactions",
		BatchSize:    10,
		BatchTimeout: 10 * time.Millisecond,
	}
	eventPublisher := events.NewEventPublisher(eventConfig)
	
	// Create status tracker
	statusTracker := events.NewStatusTracker()
	
	// Create service with event components
	transactionService := service.NewTransactionServiceWithEvents(db, eventPublisher, statusTracker)
	
	// Run migrations
	err = transactionService.Migrate()
	require.NoError(t, err)
	
	return transactionService, eventPublisher, statusTracker
}

func setupTestWalletsForEvents(t *testing.T, service *service.TransactionService) (uuid.UUID, uuid.UUID) {
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	// Create wallets with initial balances
	err := service.GetBalanceRepo().CreateWallet(fromWallet)
	require.NoError(t, err)
	
	err = service.GetBalanceRepo().CreateWallet(toWallet)
	require.NoError(t, err)
	
	// Add funds to sender wallet
	err = service.GetBalanceRepo().AddFunds(fromWallet, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	return fromWallet, toWallet
}

func TestEventPublisher_PublishTransactionEvent(t *testing.T) {
	transactionService, eventPublisher, _ := setupEventIntegrationTest(t)
	fromWallet, toWallet := setupTestWalletsForEvents(t, transactionService)
	
	// Create a test transaction
	transaction, err := models.NewTransaction(
		fromWallet,
		toWallet,
		100.0,
		models.USDCBDC,
		models.TransactionMetadata{
			Description: "Test transaction",
			Category:    "test",
		},
	)
	require.NoError(t, err)
	
	// Test publishing transaction created event
	ctx := context.Background()
	err = eventPublisher.PublishTransactionEvent(ctx, transaction, events.EventTransactionCreated)
	
	// In a real test, we would verify the message was sent to Kafka
	// For now, we just verify no error occurred
	assert.NoError(t, err)
	
	// Test publishing transaction completed event
	err = transaction.UpdateStatus(models.StatusCompleted, nil, "test", nil)
	require.NoError(t, err)
	
	err = eventPublisher.PublishTransactionEvent(ctx, transaction, events.EventTransactionCompleted)
	assert.NoError(t, err)
}

func TestStatusTracker_SubscribeAndPublish(t *testing.T) {
	_, _, statusTracker := setupEventIntegrationTest(t)
	
	// Create a test transaction
	transaction := &models.Transaction{
		ID:         uuid.New(),
		FromWallet: uuid.New(),
		ToWallet:   uuid.New(),
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Status:     models.StatusPending,
	}
	
	// Subscribe to updates for this transaction
	filter := events.StatusFilter{
		TransactionIDs: []uuid.UUID{transaction.ID},
	}
	
	subscriber := statusTracker.Subscribe(filter)
	defer statusTracker.Unsubscribe(subscriber.ID)
	
	// Publish a status update
	go func() {
		time.Sleep(10 * time.Millisecond) // Small delay to ensure subscription is ready
		statusTracker.PublishStatusUpdate(transaction, "Transaction processing")
	}()
	
	// Wait for the update
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, transaction.ID, update.TransactionID)
		assert.Equal(t, models.StatusPending, update.Status)
		assert.Equal(t, "Transaction processing", update.Message)
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for status update")
	}
}

func TestWebSocketIntegration(t *testing.T) {
	transactionService, _, statusTracker := setupEventIntegrationTest(t)
	fromWallet, toWallet := setupTestWalletsForEvents(t, transactionService)
	
	// Set up WebSocket handler
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	websocketHandler := handler.NewWebSocketHandler(statusTracker)
	router.GET("/ws/transactions", websocketHandler.HandleWebSocket)
	
	// Start test server
	server := httptest.NewServer(router)
	defer server.Close()
	
	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/transactions"
	
	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()
	
	// Subscribe to wallet updates
	subscriptionReq := map[string]interface{}{
		"type":       "subscribe",
		"wallet_ids": []uuid.UUID{fromWallet, toWallet},
	}
	
	err = conn.WriteJSON(subscriptionReq)
	require.NoError(t, err)
	
	// Read subscription confirmation
	var confirmationMsg map[string]interface{}
	err = conn.ReadJSON(&confirmationMsg)
	require.NoError(t, err)
	assert.Equal(t, "subscribed", confirmationMsg["type"])
	
	// Create a transaction to trigger events
	go func() {
		time.Sleep(100 * time.Millisecond) // Allow WebSocket to be ready
		
		req := &service.TransactionRequest{
			FromWallet: fromWallet,
			ToWallet:   toWallet,
			Amount:     100.0,
			Currency:   models.USDCBDC,
			Metadata: models.TransactionMetadata{
				Description: "WebSocket test transaction",
				Category:    "test",
			},
		}
		
		_, err := transactionService.ProcessTransaction(context.Background(), req)
		if err != nil {
			t.Logf("Transaction processing error: %v", err)
		}
	}()
	
	// Read status updates
	updateCount := 0
	timeout := time.After(5 * time.Second)
	
	for updateCount < 2 { // Expect at least 2 updates (created and completed)
		select {
		case <-timeout:
			t.Fatalf("Timeout waiting for WebSocket updates, received %d updates", updateCount)
		default:
			conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			var msg map[string]interface{}
			err := conn.ReadJSON(&msg)
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					return
				}
				continue
			}
			
			if msg["type"] == "status_update" {
				updateCount++
				data := msg["data"].(map[string]interface{})
				t.Logf("Received status update: %v", data)
				
				// Verify update structure
				assert.Contains(t, data, "transaction_id")
				assert.Contains(t, data, "status")
				assert.Contains(t, data, "timestamp")
			}
		}
	}
	
	assert.GreaterOrEqual(t, updateCount, 2, "Should receive at least 2 status updates")
}

func TestTransactionServiceEventIntegration(t *testing.T) {
	transactionService, _, statusTracker := setupEventIntegrationTest(t)
	fromWallet, toWallet := setupTestWalletsForEvents(t, transactionService)
	
	// Subscribe to transaction events
	filter := events.StatusFilter{
		WalletIDs: []uuid.UUID{fromWallet, toWallet},
	}
	
	subscriber := statusTracker.Subscribe(filter)
	defer statusTracker.Unsubscribe(subscriber.ID)
	
	// Process a transaction
	req := &service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Metadata: models.TransactionMetadata{
			Description: "Integration test transaction",
			Category:    "test",
		},
	}
	
	transaction, err := transactionService.ProcessTransaction(context.Background(), req)
	require.NoError(t, err)
	
	// Should receive status updates
	updateCount := 0
	timeout := time.After(2 * time.Second)
	
	for updateCount < 2 {
		select {
		case update := <-subscriber.Channel:
			updateCount++
			assert.Equal(t, transaction.ID, update.TransactionID)
			t.Logf("Received update %d: %s - %s", updateCount, update.Status, update.Message)
		case <-timeout:
			t.Fatalf("Timeout waiting for status updates, received %d", updateCount)
		}
	}
	
	// Test fraud score update
	err = transactionService.SetFraudScore(context.Background(), transaction.ID, 0.8, map[string]interface{}{
		"model": "test_model",
	})
	require.NoError(t, err)
	
	// Should receive fraud score update
	select {
	case update := <-subscriber.Channel:
		assert.Equal(t, transaction.ID, update.TransactionID)
		assert.NotNil(t, update.FraudScore)
		assert.Equal(t, 0.8, *update.FraudScore)
		assert.Contains(t, update.Message, "fraud")
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for fraud score update")
	}
}