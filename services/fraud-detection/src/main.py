#!/usr/bin/env python3
"""
EchoPay Fraud Detection Service
Real-time ML-powered fraud analysis service
"""

import os
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import redis
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response

# Import ML analysis components
from models.behavioral_model import BehavioralAnalysisService
from models.graph_model import GraphAnalysisService
from models.anomaly_model import AnomalyAnalysisService
from models.risk_engine import RealTimeRiskEngine, RiskAssessment

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "fraud-detection", "message": "%(message)s"}'
)
logger = logging.getLogger(__name__)

# Prometheus metrics
fraud_analysis_counter = Counter('fraud_analysis_total', 'Total fraud analyses performed')
fraud_analysis_duration = Histogram('fraud_analysis_duration_seconds', 'Time spent on fraud analysis')
fraud_score_histogram = Histogram('fraud_score_distribution', 'Distribution of fraud scores', buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])

# Initialize FastAPI app
app = FastAPI(
    title="EchoPay Fraud Detection Service",
    description="Real-time ML-powered fraud analysis service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis connection
redis_client = None

# ML analysis services
behavioral_service = None
graph_service = None
anomaly_service = None
risk_engine = None

# Pydantic models
class TransactionAnalysisRequest(BaseModel):
    transactionId: str
    fromWallet: str
    toWallet: str
    amount: float
    currency: str
    timestamp: str
    userContext: Dict[str, Any] = {}

class RiskScore(BaseModel):
    transactionId: str
    overallScore: float
    behavioralScore: float
    graphScore: float
    anomalyScore: float
    riskFactors: list[str]
    timestamp: str

class ModelFeedback(BaseModel):
    transactionId: str
    actualFraud: bool
    feedbackType: str

@app.on_event("startup")
async def startup_event():
    """Initialize connections and ML models on startup"""
    global redis_client, behavioral_service, graph_service, anomaly_service, risk_engine
    
    # Initialize Redis connection
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    
    try:
        redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        redis_client.ping()
        logger.info(f"Connected to Redis at {redis_host}:{redis_port}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        redis_client = None
    
    # Initialize ML analysis services
    behavioral_service = BehavioralAnalysisService(redis_client=redis_client)
    logger.info("Behavioral analysis service initialized")
    
    graph_service = GraphAnalysisService(max_graph_size=100000)
    logger.info("Graph analysis service initialized")
    
    anomaly_service = AnomalyAnalysisService()
    logger.info("Anomaly analysis service initialized")
    
    risk_engine = RealTimeRiskEngine(redis_client=redis_client)
    logger.info("Real-time risk engine initialized")
    
    logger.info("Fraud Detection Service started successfully")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "service": "fraud-detection",
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/api/v1/analyze", response_model=RiskScore)
async def analyze_transaction(request: TransactionAnalysisRequest):
    """Analyze transaction for fraud using ensemble risk engine"""
    fraud_analysis_counter.inc()
    
    with fraud_analysis_duration.time():
        try:
            # Extract user ID from wallet address (simplified)
            user_id = request.fromWallet
            
            # Prepare transaction data
            transaction_data = {
                'transactionId': request.transactionId,
                'amount': request.amount,
                'timestamp': request.timestamp,
                'toWallet': request.toWallet,
                'fromWallet': request.fromWallet,
                'currency': request.currency,
                'metadata': request.userContext
            }
            
            # Prepare transaction context for risk engine
            transaction_context = {
                'amount': request.amount,
                'user_id': user_id,
                'user_age_days': request.userContext.get('user_age_days', 365),
                'recent_transactions_1h': request.userContext.get('recent_transactions_1h', 0),
                'is_new_location': request.userContext.get('is_new_location', False),
                'currency': request.currency
            }
            
            # Collect component scores from all ML models
            component_scores = {}
            
            # Behavioral analysis
            if behavioral_service:
                try:
                    behavioral_score = await behavioral_service.analyze_user_behavior(
                        user_id, transaction_data
                    )
                    component_scores['behavioral'] = behavioral_score
                except Exception as e:
                    logger.warning(f"Behavioral analysis failed for {request.transactionId}: {e}")
                    component_scores['behavioral'] = 0.5
            else:
                component_scores['behavioral'] = 0.5
            
            # Graph analysis
            if graph_service:
                try:
                    graph_score = graph_service.analyze_transaction_network(user_id, transaction_data)
                    component_scores['graph'] = graph_score
                except Exception as e:
                    logger.warning(f"Graph analysis failed for {request.transactionId}: {e}")
                    component_scores['graph'] = 0.1
            else:
                component_scores['graph'] = 0.1
            
            # Anomaly detection
            if anomaly_service:
                try:
                    # Get user transaction history for context
                    user_history = await _get_user_transaction_history(user_id)
                    anomaly_score, _ = anomaly_service.ensemble_detector.predict_anomaly_score(
                        transaction_data, user_history
                    )
                    component_scores['anomaly'] = anomaly_score
                except Exception as e:
                    logger.warning(f"Anomaly analysis failed for {request.transactionId}: {e}")
                    component_scores['anomaly'] = 0.15
            else:
                component_scores['anomaly'] = 0.15
            
            # Rule-based scoring (simple implementation)
            rule_score = _calculate_rule_based_score(transaction_data, transaction_context)
            component_scores['rule_based'] = rule_score
            
            # Use risk engine for ensemble scoring and decision making
            if risk_engine:
                risk_assessment = await risk_engine.assess_transaction_risk(
                    request.transactionId,
                    component_scores,
                    transaction_context
                )
                
                overall_score = risk_assessment.overall_risk_score
                risk_factors = risk_assessment.risk_factors
                
                # Log decision for monitoring
                logger.info(f"Risk assessment for {request.transactionId}: "
                           f"score={overall_score:.3f}, action={risk_assessment.recommended_action.value}, "
                           f"confidence={risk_assessment.confidence:.3f}, "
                           f"time={risk_assessment.processing_time_ms:.1f}ms")
                
            else:
                # Fallback to simple weighted average
                overall_score = (
                    component_scores.get('behavioral', 0.5) * 0.35 +
                    component_scores.get('graph', 0.1) * 0.30 +
                    component_scores.get('anomaly', 0.15) * 0.25 +
                    component_scores.get('rule_based', 0.1) * 0.10
                )
                
                risk_factors = _extract_simple_risk_factors(component_scores, transaction_context)
            
            fraud_score_histogram.observe(overall_score)
            
            result = RiskScore(
                transactionId=request.transactionId,
                overallScore=round(overall_score, 3),
                behavioralScore=round(component_scores.get('behavioral', 0.5), 3),
                graphScore=round(component_scores.get('graph', 0.1), 3),
                anomalyScore=round(component_scores.get('anomaly', 0.15), 3),
                riskFactors=risk_factors,
                timestamp=datetime.utcnow().isoformat()
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing transaction {request.transactionId}: {e}")
            raise HTTPException(status_code=500, detail="Analysis service error")

async def _get_user_transaction_history(user_id: str) -> list:
    """Get user transaction history for context"""
    if redis_client:
        try:
            # Try to get cached history
            cached_history = redis_client.get(f"user_history:{user_id}")
            if cached_history:
                import json
                return json.loads(cached_history)
        except Exception as e:
            logger.warning(f"Error getting cached history for user {user_id}: {e}")
    
    # Return empty list if no history available
    return []

def _calculate_rule_based_score(transaction_data: Dict[str, Any], 
                               transaction_context: Dict[str, Any]) -> float:
    """Calculate rule-based risk score"""
    score = 0.0
    amount = transaction_data.get('amount', 0.0)
    
    # High amount transactions
    if amount > 10000:
        score += 0.3
    elif amount > 1000:
        score += 0.1
    
    # Very small amounts (potential testing)
    if 0 < amount < 1:
        score += 0.2
    
    # High velocity
    recent_tx = transaction_context.get('recent_transactions_1h', 0)
    if recent_tx > 10:
        score += 0.4
    elif recent_tx > 5:
        score += 0.2
    
    # New location
    if transaction_context.get('is_new_location', False):
        score += 0.2
    
    # New user with high activity
    user_age = transaction_context.get('user_age_days', 365)
    if user_age < 7 and amount > 1000:
        score += 0.3
    
    return min(1.0, score)

def _extract_simple_risk_factors(component_scores: Dict[str, float], 
                                transaction_context: Dict[str, Any]) -> list:
    """Extract risk factors when risk engine is not available"""
    factors = []
    
    if component_scores.get('behavioral', 0) > 0.7:
        factors.append('unusual_behavior')
    if component_scores.get('graph', 0) > 0.6:
        factors.append('suspicious_network')
    if component_scores.get('anomaly', 0) > 0.8:
        factors.append('transaction_anomaly')
    if component_scores.get('rule_based', 0) > 0.5:
        factors.append('rule_violation')
    
    amount = transaction_context.get('amount', 0.0)
    if amount > 10000:
        factors.append('high_amount')
    elif amount < 1:
        factors.append('micro_amount')
    
    if transaction_context.get('recent_transactions_1h', 0) > 10:
        factors.append('high_velocity')
    
    if transaction_context.get('is_new_location', False):
        factors.append('new_location')
    
    return factors

@app.get("/api/v1/performance")
async def get_performance_metrics():
    """Get fraud detection performance metrics"""
    try:
        if risk_engine:
            metrics = risk_engine.get_performance_metrics()
            return {
                "service": "fraud-detection",
                "timestamp": datetime.utcnow().isoformat(),
                "metrics": metrics
            }
        else:
            return {
                "service": "fraud-detection",
                "timestamp": datetime.utcnow().isoformat(),
                "error": "Risk engine not available"
            }
    except Exception as e:
        logger.error(f"Error getting performance metrics: {e}")
        raise HTTPException(status_code=500, detail="Could not retrieve metrics")

@app.post("/api/v1/configuration")
async def update_configuration(config: Dict[str, Any]):
    """Update risk engine configuration"""
    try:
        if risk_engine:
            risk_engine.update_configuration(config)
            return {"message": "Configuration updated successfully"}
        else:
            raise HTTPException(status_code=503, detail="Risk engine not available")
    except Exception as e:
        logger.error(f"Error updating configuration: {e}")
        raise HTTPException(status_code=400, detail="Invalid configuration")

@app.post("/api/v1/decision-rules")
async def add_decision_rule(rule_config: Dict[str, Any]):
    """Add a custom decision rule"""
    try:
        if risk_engine:
            risk_engine.add_decision_rule(rule_config)
            return {"message": f"Decision rule '{rule_config['name']}' added successfully"}
        else:
            raise HTTPException(status_code=503, detail="Risk engine not available")
    except Exception as e:
        logger.error(f"Error adding decision rule: {e}")
        raise HTTPException(status_code=400, detail="Invalid rule configuration")

@app.delete("/api/v1/decision-rules/{rule_name}")
async def remove_decision_rule(rule_name: str):
    """Remove a decision rule"""
    try:
        if risk_engine:
            risk_engine.remove_decision_rule(rule_name)
            return {"message": f"Decision rule '{rule_name}' removed successfully"}
        else:
            raise HTTPException(status_code=503, detail="Risk engine not available")
    except Exception as e:
        logger.error(f"Error removing decision rule: {e}")
        raise HTTPException(status_code=400, detail="Could not remove rule")

@app.post("/api/v1/models/update")
async def update_models(feedback: ModelFeedback):
    """Update ML models with feedback"""
    try:
        # Update behavioral model
        if behavioral_service:
            feedback_data = [{
                'transaction_id': feedback.transactionId,
                'is_fraud': feedback.actualFraud,
                'feedback_type': feedback.feedbackType
            }]
            behavioral_service.update_model_with_feedback(feedback_data)
        
        # Update risk engine performance metrics
        if risk_engine and feedback.feedbackType == 'fraud_confirmation':
            # This would be used to update model performance in a real system
            pass
        
        logger.info(f"Received feedback for transaction {feedback.transactionId}: {feedback.feedbackType}")
        
        return {"message": "Model feedback processed successfully"}
        
    except Exception as e:
        logger.error(f"Error processing model feedback: {e}")
        raise HTTPException(status_code=400, detail="Invalid feedback data")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )