package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"echopay/shared/libraries/logging"
	"echopay/transaction-service/src/events"
	"echopay/transaction-service/src/models"
)

// WebSocketHandler handles WebSocket connections for real-time updates
type WebSocketHandler struct {
	statusTracker *events.StatusTracker
	upgrader      websocket.Upgrader
	logger        *logging.Logger
}

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type      string      `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// SubscriptionRequest represents a subscription request from client
type SubscriptionRequest struct {
	Type           string                       `json:"type"`
	TransactionIDs []uuid.UUID                  `json:"transaction_ids,omitempty"`
	WalletIDs      []uuid.UUID                  `json:"wallet_ids,omitempty"`
	Statuses       []models.TransactionStatus   `json:"statuses,omitempty"`
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(statusTracker *events.StatusTracker) *WebSocketHandler {
	return &WebSocketHandler{
		statusTracker: statusTracker,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// In production, implement proper origin checking
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		logger: logging.NewLogger("websocket-handler"),
	}
}

// HandleWebSocket handles WebSocket connections for real-time transaction updates
func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("Failed to upgrade WebSocket connection", "error", err)
		return
	}
	defer conn.Close()

	clientID := uuid.New()
	h.logger.Info("WebSocket client connected", "client_id", clientID)

	// Set up ping/pong handlers for connection health
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start ping routine
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go h.pingRoutine(ctx, conn)

	// Handle client messages and subscriptions
	for {
		var req SubscriptionRequest
		err := conn.ReadJSON(&req)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				h.logger.Error("WebSocket read error", "error", err, "client_id", clientID)
			}
			break
		}

		switch req.Type {
		case "subscribe":
			h.handleSubscription(ctx, conn, clientID, req)
		case "unsubscribe":
			// Handle unsubscription if needed
			h.sendMessage(conn, WebSocketMessage{
				Type:      "unsubscribed",
				Timestamp: time.Now(),
				Data:      map[string]string{"status": "success"},
			})
		default:
			h.sendMessage(conn, WebSocketMessage{
				Type:      "error",
				Timestamp: time.Now(),
				Data:      map[string]string{"message": "unknown message type"},
			})
		}
	}

	h.logger.Info("WebSocket client disconnected", "client_id", clientID)
}

// handleSubscription handles subscription requests
func (h *WebSocketHandler) handleSubscription(ctx context.Context, conn *websocket.Conn, clientID uuid.UUID, req SubscriptionRequest) {
	filter := events.StatusFilter{
		TransactionIDs: req.TransactionIDs,
		WalletIDs:      req.WalletIDs,
		Statuses:       req.Statuses,
	}

	subscriber := h.statusTracker.Subscribe(filter)
	defer h.statusTracker.Unsubscribe(subscriber.ID)

	// Send subscription confirmation
	h.sendMessage(conn, WebSocketMessage{
		Type:      "subscribed",
		Timestamp: time.Now(),
		Data: map[string]interface{}{
			"subscriber_id": subscriber.ID,
			"filter":        filter,
		},
	})

	// Listen for status updates
	for {
		select {
		case <-ctx.Done():
			return
		case update, ok := <-subscriber.Channel:
			if !ok {
				return // Channel closed
			}

			// Send status update to client
			h.sendMessage(conn, WebSocketMessage{
				Type:      "status_update",
				Timestamp: time.Now(),
				Data:      update,
			})
		}
	}
}

// sendMessage sends a message to the WebSocket client
func (h *WebSocketHandler) sendMessage(conn *websocket.Conn, message WebSocketMessage) {
	conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := conn.WriteJSON(message); err != nil {
		h.logger.Error("Failed to send WebSocket message", "error", err)
	}
}

// pingRoutine sends periodic ping messages to keep connection alive
func (h *WebSocketHandler) pingRoutine(ctx context.Context, conn *websocket.Conn) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				h.logger.Error("Failed to send ping", "error", err)
				return
			}
		}
	}
}

// GetActiveConnections returns the number of active WebSocket connections
func (h *WebSocketHandler) GetActiveConnections() int {
	return h.statusTracker.GetSubscriberCount()
}