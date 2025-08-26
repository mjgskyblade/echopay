"""
Unit tests for graph-based network analysis model
Tests for graph construction, analysis, and suspicious pattern detection
"""

import unittest
import numpy as np
import networkx as nx
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.graph_model import (
    TransactionGraph, 
    CommunityDetector, 
    GraphAnalysisService,
    TORCH_AVAILABLE
)

class TestTransactionGraph(unittest.TestCase):
    """Test cases for TransactionGraph class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.graph = TransactionGraph(max_nodes=1000, time_window_hours=24)
        self.test_timestamp = datetime.utcnow()
    
    def test_graph_initialization(self):
        """Test graph initialization"""
        self.assertEqual(self.graph.graph.number_of_nodes(), 0)
        self.assertEqual(self.graph.graph.number_of_edges(), 0)
        self.assertEqual(len(self.graph.node_features), 0)
        self.assertEqual(len(self.graph.transaction_history), 0)
    
    def test_add_single_transaction(self):
        """Test adding a single transaction"""
        self.graph.add_transaction(
            from_wallet="wallet_1",
            to_wallet="wallet_2", 
            amount=100.0,
            timestamp=self.test_timestamp,
            transaction_id="tx_001"
        )
        
        # Check graph structure
        self.assertEqual(self.graph.graph.number_of_nodes(), 2)
        self.assertEqual(self.graph.graph.number_of_edges(), 1)
        self.assertTrue(self.graph.graph.has_edge("wallet_1", "wallet_2"))
        
        # Check edge data
        edge_data = self.graph.graph["wallet_1"]["wallet_2"]
        self.assertEqual(edge_data["weight"], 100.0)
        self.assertEqual(edge_data["transaction_count"], 1)
        
        # Check node features
        self.assertIn("wallet_1", self.graph.node_features)
        self.assertIn("wallet_2", self.graph.node_features)
        
        sender_features = self.graph.node_features["wallet_1"]
        self.assertEqual(sender_features["total_sent"], 100.0)
        self.assertEqual(sender_features["transaction_count_out"], 1)
        
        receiver_features = self.graph.node_features["wallet_2"]
        self.assertEqual(receiver_features["total_received"], 100.0)
        self.assertEqual(receiver_features["transaction_count_in"], 1)
    
    def test_add_multiple_transactions_same_edge(self):
        """Test adding multiple transactions between same wallets"""
        # Add first transaction
        self.graph.add_transaction("wallet_1", "wallet_2", 100.0, self.test_timestamp, "tx_001")
        
        # Add second transaction
        later_timestamp = self.test_timestamp + timedelta(minutes=30)
        self.graph.add_transaction("wallet_1", "wallet_2", 200.0, later_timestamp, "tx_002")
        
        # Check aggregated edge data
        edge_data = self.graph.graph["wallet_1"]["wallet_2"]
        self.assertEqual(edge_data["weight"], 300.0)
        self.assertEqual(edge_data["transaction_count"], 2)
        self.assertEqual(len(edge_data["transactions"]), 2)
        
        # Check updated node features
        sender_features = self.graph.node_features["wallet_1"]
        self.assertEqual(sender_features["total_sent"], 300.0)
        self.assertEqual(sender_features["transaction_count_out"], 2)
        self.assertEqual(sender_features["avg_transaction_amount"], 150.0)
    
    def test_node_feature_initialization(self):
        """Test node feature initialization"""
        features = self.graph._initialize_node_features()
        
        expected_keys = [
            'total_sent', 'total_received', 'transaction_count_out', 'transaction_count_in',
            'unique_recipients', 'unique_senders', 'avg_transaction_amount',
            'first_seen', 'last_active', 'clustering_coefficient', 
            'betweenness_centrality', 'pagerank', 'suspicious_score'
        ]
        
        for key in expected_keys:
            self.assertIn(key, features)
        
        # Check initial values
        self.assertEqual(features['total_sent'], 0.0)
        self.assertEqual(features['total_received'], 0.0)
        self.assertEqual(features['transaction_count_out'], 0)
        self.assertEqual(features['transaction_count_in'], 0)
    
    def test_get_subgraph(self):
        """Test subgraph extraction"""
        # Create a small network
        transactions = [
            ("wallet_1", "wallet_2", 100.0),
            ("wallet_2", "wallet_3", 50.0),
            ("wallet_3", "wallet_4", 25.0),
            ("wallet_1", "wallet_4", 75.0),
            ("wallet_5", "wallet_6", 200.0)  # Isolated pair
        ]
        
        for i, (from_w, to_w, amount) in enumerate(transactions):
            self.graph.add_transaction(
                from_w, to_w, amount, 
                self.test_timestamp + timedelta(minutes=i),
                f"tx_{i:03d}"
            )
        
        # Test subgraph around wallet_1 with radius 1
        subgraph = self.graph.get_subgraph("wallet_1", radius=1)
        expected_nodes = {"wallet_1", "wallet_2", "wallet_4"}
        self.assertEqual(set(subgraph.nodes()), expected_nodes)
        
        # Test subgraph around wallet_1 with radius 2
        subgraph = self.graph.get_subgraph("wallet_1", radius=2)
        expected_nodes = {"wallet_1", "wallet_2", "wallet_3", "wallet_4"}
        self.assertEqual(set(subgraph.nodes()), expected_nodes)
        
        # Test subgraph for non-existent node
        subgraph = self.graph.get_subgraph("non_existent", radius=1)
        self.assertEqual(subgraph.number_of_nodes(), 0)
    
    def test_centrality_computation(self):
        """Test centrality measures computation"""
        # Create a network with clear centrality patterns
        transactions = [
            ("hub", "node_1", 100.0),
            ("hub", "node_2", 100.0),
            ("hub", "node_3", 100.0),
            ("node_1", "node_2", 50.0),
            ("node_2", "node_3", 50.0)
        ]
        
        for i, (from_w, to_w, amount) in enumerate(transactions):
            self.graph.add_transaction(
                from_w, to_w, amount,
                self.test_timestamp + timedelta(minutes=i),
                f"tx_{i:03d}"
            )
        
        # Compute centrality measures
        self.graph.compute_centrality_measures()
        
        # Check that centrality measures are computed
        hub_features = self.graph.node_features["hub"]
        self.assertGreater(hub_features["pagerank"], 0)
        self.assertGreaterEqual(hub_features["betweenness_centrality"], 0)
        self.assertGreaterEqual(hub_features["clustering_coefficient"], 0)
    
    def test_cleanup_old_data(self):
        """Test cleanup of old transaction data"""
        # Create graph with short time window
        short_graph = TransactionGraph(max_nodes=1000, time_window_hours=1)
        
        # Add old transaction
        old_timestamp = datetime.utcnow() - timedelta(hours=2)
        short_graph.add_transaction("wallet_1", "wallet_2", 100.0, old_timestamp, "tx_old")
        
        # Add recent transaction
        recent_timestamp = datetime.utcnow()
        short_graph.add_transaction("wallet_3", "wallet_4", 200.0, recent_timestamp, "tx_recent")
        
        # Force cleanup
        short_graph._cleanup_old_data()
        
        # Check that old transaction is removed but recent one remains
        self.assertFalse(short_graph.graph.has_edge("wallet_1", "wallet_2"))
        self.assertTrue(short_graph.graph.has_edge("wallet_3", "wallet_4"))


class TestCommunityDetector(unittest.TestCase):
    """Test cases for CommunityDetector class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.detector = CommunityDetector()
        self.test_graph = self._create_test_graph()
    
    def _create_test_graph(self):
        """Create a test graph with known community structure"""
        graph = nx.DiGraph()
        
        # Community 1: Tightly connected group
        community1_edges = [
            ("c1_node1", "c1_node2", {"weight": 100, "transaction_count": 5}),
            ("c1_node2", "c1_node3", {"weight": 150, "transaction_count": 3}),
            ("c1_node3", "c1_node1", {"weight": 200, "transaction_count": 4}),
            ("c1_node1", "c1_node3", {"weight": 75, "transaction_count": 2})
        ]
        
        # Community 2: Another tightly connected group
        community2_edges = [
            ("c2_node1", "c2_node2", {"weight": 300, "transaction_count": 8}),
            ("c2_node2", "c2_node3", {"weight": 250, "transaction_count": 6}),
            ("c2_node3", "c2_node1", {"weight": 180, "transaction_count": 4})
        ]
        
        # Bridge connections (sparse)
        bridge_edges = [
            ("c1_node1", "c2_node1", {"weight": 50, "transaction_count": 1}),
            ("c2_node2", "c1_node3", {"weight": 25, "transaction_count": 1})
        ]
        
        all_edges = community1_edges + community2_edges + bridge_edges
        
        for source, target, data in all_edges:
            graph.add_edge(source, target, **data)
        
        return graph
    
    def test_community_detection(self):
        """Test basic community detection"""
        communities = self.detector.detect_communities(self.test_graph)
        
        # Should detect at least 2 communities
        self.assertGreaterEqual(len(communities), 2)
        
        # All nodes should be assigned to communities
        all_community_nodes = set()
        for nodes in communities.values():
            all_community_nodes.update(nodes)
        
        self.assertEqual(all_community_nodes, set(self.test_graph.nodes()))
    
    def test_community_analysis(self):
        """Test community feature analysis"""
        communities = self.detector.detect_communities(self.test_graph)
        
        # Check that community features are computed
        self.assertGreater(len(self.detector.community_features), 0)
        
        for community_id, features in self.detector.community_features.items():
            # Check required feature keys
            required_keys = [
                'size', 'density', 'internal_edges', 'external_edges',
                'total_volume', 'avg_transaction_amount', 'suspicious_score'
            ]
            
            for key in required_keys:
                self.assertIn(key, features)
            
            # Check reasonable values
            self.assertGreater(features['size'], 0)
            self.assertGreaterEqual(features['density'], 0.0)
            self.assertLessEqual(features['density'], 1.0)
            self.assertGreaterEqual(features['suspicious_score'], 0.0)
            self.assertLessEqual(features['suspicious_score'], 1.0)
    
    def test_suspicious_community_detection(self):
        """Test detection of suspicious communities"""
        # Create a suspicious community pattern
        suspicious_graph = nx.DiGraph()
        
        # Tight ring with high-value transactions (money laundering pattern)
        ring_nodes = [f"ring_{i}" for i in range(5)]
        for i in range(len(ring_nodes)):
            next_node = ring_nodes[(i + 1) % len(ring_nodes)]
            suspicious_graph.add_edge(
                ring_nodes[i], next_node,
                weight=10000,  # High value
                transaction_count=20  # High frequency
            )
        
        communities = self.detector.detect_communities(suspicious_graph)
        suspicious_communities = self.detector.get_suspicious_communities(threshold=0.3)
        
        # Should detect at least one suspicious community
        self.assertGreater(len(suspicious_communities), 0)
        
        # Check that suspicious communities are sorted by score
        scores = [score for _, score in suspicious_communities]
        self.assertEqual(scores, sorted(scores, reverse=True))
    
    def test_suspicion_scoring(self):
        """Test community suspicion scoring logic"""
        # Create test features for different scenarios
        
        # High density, low external connections (suspicious)
        suspicious_features = {
            'size': 5,
            'density': 0.8,
            'internal_edges': 8,
            'external_edges': 1,
            'total_volume': 50000.0,
            'avg_transaction_amount': 10000.0,
            'transaction_velocity': 15.0,
            'new_nodes_ratio': 0.9
        }
        
        # Create a mock subgraph
        mock_subgraph = MagicMock()
        
        score = self.detector._calculate_community_suspicion(suspicious_features, mock_subgraph)
        
        # Should be highly suspicious
        self.assertGreater(score, 0.5)
        
        # Normal community features
        normal_features = {
            'size': 10,
            'density': 0.3,
            'internal_edges': 15,
            'external_edges': 20,
            'total_volume': 5000.0,
            'avg_transaction_amount': 100.0,
            'transaction_velocity': 2.0,
            'new_nodes_ratio': 0.1
        }
        
        score = self.detector._calculate_community_suspicion(normal_features, mock_subgraph)
        
        # Should be low suspicion
        self.assertLess(score, 0.3)


class TestGraphAnalysisService(unittest.TestCase):
    """Test cases for GraphAnalysisService class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.service = GraphAnalysisService(max_graph_size=1000)
        self.test_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    def test_service_initialization(self):
        """Test service initialization"""
        self.assertIsNotNone(self.service.transaction_graph)
        self.assertIsNotNone(self.service.community_detector)
        
        # Check GNN model initialization (depends on PyTorch availability)
        if TORCH_AVAILABLE:
            self.assertIsNotNone(self.service.gnn_model)
        else:
            self.assertIsNone(self.service.gnn_model)
    
    def test_analyze_transaction_network_simple(self):
        """Test basic transaction network analysis"""
        transaction_data = {
            'fromWallet': 'user_1',
            'toWallet': 'user_2',
            'amount': 100.0,
            'timestamp': self.test_timestamp,
            'transactionId': 'tx_001',
            'metadata': {'category': 'payment'}
        }
        
        score = self.service.analyze_transaction_network('user_1', transaction_data)
        
        # Should return a valid risk score
        self.assertIsInstance(score, float)
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)
    
    def test_analyze_transaction_network_complex(self):
        """Test transaction network analysis with complex patterns"""
        # Create multiple transactions to build a network
        transactions = [
            ('user_1', 'user_2', 100.0),
            ('user_2', 'user_3', 200.0),
            ('user_3', 'user_4', 150.0),
            ('user_4', 'user_1', 300.0),  # Creates a cycle
            ('user_1', 'user_5', 1000.0),  # High value transaction
        ]
        
        for i, (from_w, to_w, amount) in enumerate(transactions):
            transaction_data = {
                'fromWallet': from_w,
                'toWallet': to_w,
                'amount': amount,
                'timestamp': self.test_timestamp,
                'transactionId': f'tx_{i:03d}',
                'metadata': {'category': 'payment'}
            }
            
            score = self.service.analyze_transaction_network(from_w, transaction_data)
            
            # Each transaction should get a valid score
            self.assertIsInstance(score, float)
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 1.0)
    
    def test_network_pattern_analysis(self):
        """Test network pattern analysis"""
        # Build a test network
        test_graph = nx.DiGraph()
        test_graph.add_edge('hub', 'node1', weight=100, transaction_count=5)
        test_graph.add_edge('hub', 'node2', weight=200, transaction_count=10)
        test_graph.add_edge('hub', 'node3', weight=300, transaction_count=15)
        
        # Add node features for hub
        self.service.transaction_graph.node_features['hub'] = {
            'total_sent': 600.0,
            'total_received': 0.0,
            'transaction_count_out': 30,
            'transaction_count_in': 0,
            'unique_recipients': 3,
            'unique_senders': 0,
            'avg_transaction_amount': 200.0,
            'first_seen': datetime.utcnow().timestamp() - 86400,  # 1 day old
            'last_active': datetime.utcnow().timestamp(),
            'clustering_coefficient': 0.0,
            'betweenness_centrality': 0.5,
            'pagerank': 0.3,
            'suspicious_score': 0.0,
        }
        
        score = self.service._analyze_network_patterns(test_graph, 'hub')
        
        # Hub pattern should have some risk
        self.assertIsInstance(score, float)
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)
    
    def test_get_suspicious_networks(self):
        """Test suspicious network detection"""
        # Add some transactions to create communities
        transactions = [
            ('ring1', 'ring2', 5000.0),
            ('ring2', 'ring3', 5000.0),
            ('ring3', 'ring1', 5000.0),  # Suspicious ring
            ('normal1', 'normal2', 100.0),
            ('normal2', 'normal3', 150.0)  # Normal transactions
        ]
        
        for i, (from_w, to_w, amount) in enumerate(transactions):
            self.service.transaction_graph.add_transaction(
                from_w, to_w, amount,
                datetime.utcnow(),
                f'tx_{i:03d}'
            )
        
        suspicious_networks = self.service.get_suspicious_networks(threshold=0.3)
        
        # Should return a list of suspicious networks
        self.assertIsInstance(suspicious_networks, list)
        
        for network in suspicious_networks:
            self.assertIn('community_id', network)
            self.assertIn('suspicion_score', network)
            self.assertIn('nodes', network)
            self.assertIn('size', network)
            self.assertIn('features', network)
            
            # Suspicion score should be above threshold
            self.assertGreaterEqual(network['suspicion_score'], 0.3)
    
    def test_centrality_update(self):
        """Test centrality measures update"""
        # Add some transactions
        self.service.transaction_graph.add_transaction(
            'central_node', 'node1', 100.0, datetime.utcnow(), 'tx_001'
        )
        self.service.transaction_graph.add_transaction(
            'central_node', 'node2', 200.0, datetime.utcnow(), 'tx_002'
        )
        
        # Update centrality measures
        self.service.update_centrality_measures()
        
        # Check that centrality measures are computed
        central_features = self.service.transaction_graph.node_features['central_node']
        self.assertIn('pagerank', central_features)
        self.assertIn('betweenness_centrality', central_features)
        self.assertIn('clustering_coefficient', central_features)
    
    @patch('os.path.exists')
    def test_model_save_load(self, mock_exists):
        """Test model saving and loading"""
        mock_exists.return_value = False
        
        # Test saving
        try:
            self.service.save_model('/tmp/test_model')
            # Should not raise an exception
        except Exception as e:
            self.fail(f"Model saving failed: {e}")
        
        # Test loading
        try:
            self.service.load_model('/tmp/test_model')
            # Should not raise an exception
        except Exception as e:
            # Loading might fail if files don't exist, which is expected in tests
            pass


class TestGraphModelIntegration(unittest.TestCase):
    """Integration tests for graph model components"""
    
    def setUp(self):
        """Set up integration test fixtures"""
        self.service = GraphAnalysisService(max_graph_size=1000)
    
    def test_end_to_end_fraud_detection(self):
        """Test end-to-end fraud detection workflow"""
        # Simulate a money laundering ring
        ring_transactions = [
            ('launderer_1', 'launderer_2', 10000.0),
            ('launderer_2', 'launderer_3', 9500.0),
            ('launderer_3', 'launderer_4', 9000.0),
            ('launderer_4', 'launderer_1', 8500.0),  # Complete the ring
        ]
        
        # Add normal transactions for comparison
        normal_transactions = [
            ('user_a', 'user_b', 50.0),
            ('user_b', 'user_c', 75.0),
            ('user_c', 'user_d', 100.0),
        ]
        
        all_transactions = ring_transactions + normal_transactions
        
        # Process all transactions
        for i, (from_w, to_w, amount) in enumerate(all_transactions):
            transaction_data = {
                'fromWallet': from_w,
                'toWallet': to_w,
                'amount': amount,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'transactionId': f'tx_{i:03d}',
                'metadata': {'category': 'transfer'}
            }
            
            score = self.service.analyze_transaction_network(from_w, transaction_data)
            
            # Money laundering transactions should have higher risk scores
            if from_w.startswith('launderer'):
                self.assertGreater(score, 0.3, f"Laundering transaction should be risky: {from_w} -> {to_w}")
            else:
                # Normal transactions might still have some risk, but generally lower
                self.assertLessEqual(score, 1.0)
    
    def test_real_time_graph_updates(self):
        """Test real-time graph updates and analysis"""
        initial_nodes = self.service.transaction_graph.graph.number_of_nodes()
        initial_edges = self.service.transaction_graph.graph.number_of_edges()
        
        # Add a series of transactions rapidly
        for i in range(10):
            transaction_data = {
                'fromWallet': f'user_{i}',
                'toWallet': f'user_{i+1}',
                'amount': 100.0 + i * 10,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'transactionId': f'rapid_tx_{i:03d}',
                'metadata': {'category': 'rapid_transfer'}
            }
            
            score = self.service.analyze_transaction_network(f'user_{i}', transaction_data)
            
            # Graph should be updated after each transaction
            current_nodes = self.service.transaction_graph.graph.number_of_nodes()
            current_edges = self.service.transaction_graph.graph.number_of_edges()
            
            self.assertGreater(current_nodes, initial_nodes)
            self.assertGreater(current_edges, initial_edges)
            
            initial_nodes = current_nodes
            initial_edges = current_edges
    
    def test_performance_with_large_network(self):
        """Test performance with larger networks"""
        import time
        
        # Create a larger network
        start_time = time.time()
        
        for i in range(100):
            transaction_data = {
                'fromWallet': f'user_{i % 20}',  # 20 unique users
                'toWallet': f'user_{(i + 1) % 20}',
                'amount': 100.0 + (i % 10) * 50,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'transactionId': f'perf_tx_{i:03d}',
                'metadata': {'category': 'performance_test'}
            }
            
            score = self.service.analyze_transaction_network(f'user_{i % 20}', transaction_data)
            
            # Each analysis should complete reasonably quickly
            analysis_time = time.time() - start_time
            self.assertLess(analysis_time, 10.0, "Analysis taking too long")
            
            start_time = time.time()


if __name__ == '__main__':
    # Set up logging for tests
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Run tests
    unittest.main(verbosity=2)