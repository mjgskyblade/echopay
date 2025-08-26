package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	
	"echopay/shared/libraries/config"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/http"
	"echopay/shared/libraries/logging"
	"echopay/shared/libraries/monitoring"
	"echopay/transaction-service/src/handler"
	"echopay/transaction-service/src/service"
)

func main() {
	// Initialize configuration
	cfg := config.GetServiceConfig(8001)
	
	// Initialize logger
	logger := logging.NewLogger("transaction-service")
	
	// Initialize metrics
	metrics := monitoring.NewMetrics("transaction-service")
	_ = metrics // TODO: Use metrics in handlers
	
	// Initialize database
	dbConfig := database.DefaultConfig()
	dbConfig.Database = "echopay_transactions"
	db, err := database.NewPostgresDB(dbConfig)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()
	
	// Initialize service with event streaming
	transactionService := service.NewTransactionService(db)
	
	// Run database migrations
	if err := transactionService.Migrate(); err != nil {
		log.Fatal("Failed to run database migrations:", err)
	}
	
	// Initialize handlers
	transactionHandler := handler.NewTransactionHandler(transactionService)
	websocketHandler := handler.NewWebSocketHandler(transactionService.GetStatusTracker())
	
	// Set Gin mode based on environment
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	
	// Create Gin router
	r := gin.New()
	
	// Add middleware
	r.Use(http.RequestIDMiddleware())
	r.Use(http.CORSMiddleware())
	r.Use(http.MetricsMiddleware("transaction-service"))
	r.Use(http.ErrorHandler())
	r.Use(http.RateLimitMiddleware(1000)) // 1000 requests per minute
	
	// Health check endpoint
	r.GET("/health", http.HealthCheckHandler("transaction-service"))
	
	// Metrics endpoint
	r.GET("/metrics", http.MetricsHandler())
	
	// WebSocket endpoint for real-time updates
	r.GET("/ws/transactions", websocketHandler.HandleWebSocket)
	
	// API routes
	v1 := r.Group("/api/v1")
	{
		// Transaction endpoints
		v1.POST("/transactions", transactionHandler.CreateTransaction)
		v1.GET("/transactions/:id", transactionHandler.GetTransaction)
		v1.PATCH("/transactions/:id/status", transactionHandler.UpdateTransactionStatus)
		v1.PATCH("/transactions/:id/fraud-score", transactionHandler.SetFraudScore)
		v1.GET("/transactions/pending", transactionHandler.GetPendingTransactions)
		
		// Wallet endpoints
		v1.GET("/wallets/:wallet_id/transactions", transactionHandler.GetTransactionsByWallet)
		v1.GET("/wallets/:wallet_id/balance", transactionHandler.GetWalletBalance)
		v1.GET("/wallets/:wallet_id/stats", transactionHandler.GetTransactionStats)
		
		// Service metrics
		v1.GET("/metrics/service", transactionHandler.GetServiceMetrics)
		
		// WebSocket connection info
		v1.GET("/ws/info", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"active_connections": websocketHandler.GetActiveConnections(),
				"websocket_url": "/ws/transactions",
			})
		})
	}
	
	logger.Info("Transaction Service starting", "port", cfg.Port, "environment", cfg.Environment)
	
	// Start server
	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := r.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}