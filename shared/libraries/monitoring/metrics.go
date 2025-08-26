package monitoring

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type Metrics struct {
	// Transaction metrics
	TransactionCounter    prometheus.Counter
	TransactionDuration   prometheus.Histogram
	TransactionErrors     prometheus.Counter
	
	// Fraud detection metrics
	FraudDetectionLatency prometheus.Histogram
	FraudScoreDistribution prometheus.Histogram
	FalsePositiveRate     prometheus.Gauge
	
	// Reversibility metrics
	ReversalCounter       prometheus.Counter
	ReversalDuration      prometheus.Histogram
	CaseResolutionTime    prometheus.Histogram
	
	// System metrics
	ActiveConnections     prometheus.Gauge
	DatabaseConnections   prometheus.Gauge
	QueueDepth           prometheus.Gauge
}

func NewMetrics(serviceName string) *Metrics {
	return &Metrics{
		TransactionCounter: promauto.NewCounter(prometheus.CounterOpts{
			Name: "echopay_transactions_total",
			Help: "Total number of transactions processed",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		TransactionDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "echopay_transaction_duration_seconds",
			Help: "Transaction processing duration",
			Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0},
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		TransactionErrors: promauto.NewCounter(prometheus.CounterOpts{
			Name: "echopay_transaction_errors_total",
			Help: "Total number of transaction errors",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		FraudDetectionLatency: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "echopay_fraud_detection_duration_seconds",
			Help: "Fraud detection processing duration",
			Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1},
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		FraudScoreDistribution: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "echopay_fraud_score_distribution",
			Help: "Distribution of fraud risk scores",
			Buckets: []float64{0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0},
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		FalsePositiveRate: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "echopay_fraud_false_positive_rate",
			Help: "Current false positive rate for fraud detection",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		ReversalCounter: promauto.NewCounter(prometheus.CounterOpts{
			Name: "echopay_reversals_total",
			Help: "Total number of transaction reversals",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		ReversalDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "echopay_reversal_duration_seconds",
			Help: "Transaction reversal processing duration",
			Buckets: []float64{1, 5, 10, 30, 60, 300, 600, 1800, 3600},
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		CaseResolutionTime: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: "echopay_case_resolution_duration_seconds",
			Help: "Fraud case resolution time",
			Buckets: []float64{3600, 7200, 14400, 28800, 43200, 86400, 172800, 259200},
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		ActiveConnections: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "echopay_active_connections",
			Help: "Number of active connections",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		DatabaseConnections: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "echopay_database_connections",
			Help: "Number of active database connections",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
		
		QueueDepth: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "echopay_queue_depth",
			Help: "Current message queue depth",
			ConstLabels: prometheus.Labels{"service": serviceName},
		}),
	}
}

// Helper methods for common metric operations
func (m *Metrics) RecordTransaction(duration time.Duration) {
	m.TransactionCounter.Inc()
	m.TransactionDuration.Observe(duration.Seconds())
}

func (m *Metrics) RecordTransactionError() {
	m.TransactionErrors.Inc()
}

func (m *Metrics) RecordFraudDetection(duration time.Duration, riskScore float64) {
	m.FraudDetectionLatency.Observe(duration.Seconds())
	m.FraudScoreDistribution.Observe(riskScore)
}

func (m *Metrics) RecordReversal(duration time.Duration) {
	m.ReversalCounter.Inc()
	m.ReversalDuration.Observe(duration.Seconds())
}

func (m *Metrics) RecordCaseResolution(duration time.Duration) {
	m.CaseResolutionTime.Observe(duration.Seconds())
}

func (m *Metrics) UpdateActiveConnections(count int) {
	m.ActiveConnections.Set(float64(count))
}

func (m *Metrics) UpdateDatabaseConnections(count int) {
	m.DatabaseConnections.Set(float64(count))
}

func (m *Metrics) UpdateQueueDepth(depth int) {
	m.QueueDepth.Set(float64(depth))
}