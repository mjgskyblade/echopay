const crypto = require('crypto');
const logger = require('../utils/logger');

class MultiWalletManager {
  constructor() {
    // In-memory storage for demo - in production, use database
    this.wallets = new Map();
    this.userWallets = new Map();
    this.walletSyncStatus = new Map();
  }

  /**
   * Create a new wallet for a user
   */
  async createWallet(userId, walletInfo) {
    const walletId = crypto.randomUUID();
    
    const wallet = {
      walletId,
      userId,
      walletName: walletInfo.walletName || `Wallet ${Date.now()}`,
      walletType: walletInfo.walletType || 'personal', // personal, business, savings
      currency: walletInfo.currency || 'USD-CBDC',
      balance: 0,
      isActive: true,
      isPrimary: false,
      createdAt: new Date(),
      lastSyncAt: new Date(),
      syncDevices: new Set(),
      permissions: {
        canSend: true,
        canReceive: true,
        canView: true,
        requiresApproval: false
      },
      metadata: {
        description: walletInfo.description || '',
        tags: walletInfo.tags || [],
        color: walletInfo.color || '#007bff'
      }
    };

    // If this is the user's first wallet, make it primary
    if (!this.userWallets.has(userId) || this.userWallets.get(userId).size === 0) {
      wallet.isPrimary = true;
    }

    this.wallets.set(walletId, wallet);
    
    // Add to user's wallet list
    if (!this.userWallets.has(userId)) {
      this.userWallets.set(userId, new Set());
    }
    this.userWallets.get(userId).add(walletId);

    logger.info('Wallet created', {
      userId,
      walletId,
      walletName: wallet.walletName,
      walletType: wallet.walletType
    });

    return wallet;
  }

  /**
   * Get all wallets for a user
   */
  getUserWallets(userId) {
    const walletIds = this.userWallets.get(userId) || new Set();
    const wallets = [];
    
    for (const walletId of walletIds) {
      const wallet = this.wallets.get(walletId);
      if (wallet && wallet.isActive) {
        wallets.push(this.sanitizeWallet(wallet));
      }
    }

    // Sort by primary first, then by creation date
    return wallets.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /**
   * Get wallet by ID with permission check
   */
  getWallet(walletId, userId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet || wallet.userId !== userId || !wallet.isActive) {
      return null;
    }
    return this.sanitizeWallet(wallet);
  }

  /**
   * Update wallet information
   */
  async updateWallet(walletId, userId, updates) {
    const wallet = this.wallets.get(walletId);
    if (!wallet || wallet.userId !== userId) {
      throw new Error('Wallet not found or unauthorized');
    }

    // Allowed updates
    const allowedFields = ['walletName', 'walletType', 'permissions', 'metadata'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'permissions' || key === 'metadata') {
          wallet[key] = { ...wallet[key], ...value };
        } else {
          wallet[key] = value;
        }
      }
    }

    wallet.lastSyncAt = new Date();

    logger.info('Wallet updated', {
      userId,
      walletId,
      updates: Object.keys(updates)
    });

    return this.sanitizeWallet(wallet);
  }

  /**
   * Set primary wallet for user
   */
  async setPrimaryWallet(userId, walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet || wallet.userId !== userId) {
      throw new Error('Wallet not found or unauthorized');
    }

    // Remove primary status from all user wallets
    const userWallets = this.getUserWallets(userId);
    for (const userWallet of userWallets) {
      const w = this.wallets.get(userWallet.walletId);
      if (w) {
        w.isPrimary = false;
      }
    }

    // Set new primary wallet
    wallet.isPrimary = true;
    wallet.lastSyncAt = new Date();

    logger.info('Primary wallet changed', {
      userId,
      newPrimaryWalletId: walletId
    });

    return this.sanitizeWallet(wallet);
  }

  /**
   * Sync wallet across devices
   */
  async syncWallet(walletId, deviceId, syncData) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Add device to sync list
    wallet.syncDevices.add(deviceId);
    wallet.lastSyncAt = new Date();

    // Update sync status
    const syncKey = `${walletId}-${deviceId}`;
    this.walletSyncStatus.set(syncKey, {
      walletId,
      deviceId,
      lastSyncAt: new Date(),
      syncVersion: syncData.version || 1,
      status: 'synced'
    });

    // Detect sync conflicts
    const conflicts = await this.detectSyncConflicts(walletId, deviceId, syncData);

    logger.info('Wallet synced', {
      walletId,
      deviceId,
      conflicts: conflicts.length,
      syncDeviceCount: wallet.syncDevices.size
    });

    return {
      wallet: this.sanitizeWallet(wallet),
      conflicts,
      syncStatus: 'success'
    };
  }

  /**
   * Detect synchronization conflicts between devices
   */
  async detectSyncConflicts(walletId, deviceId, syncData) {
    const conflicts = [];
    const wallet = this.wallets.get(walletId);
    
    if (!wallet) {
      return conflicts;
    }

    // Check for concurrent modifications
    for (const otherDeviceId of wallet.syncDevices) {
      if (otherDeviceId === deviceId) continue;

      const otherSyncKey = `${walletId}-${otherDeviceId}`;
      const otherSyncStatus = this.walletSyncStatus.get(otherSyncKey);
      
      if (otherSyncStatus) {
        const timeDiff = Math.abs(new Date() - otherSyncStatus.lastSyncAt);
        const conflictWindow = 5 * 60 * 1000; // 5 minutes
        
        if (timeDiff < conflictWindow) {
          conflicts.push({
            type: 'concurrent_modification',
            deviceId: otherDeviceId,
            timestamp: otherSyncStatus.lastSyncAt,
            description: 'Wallet modified on multiple devices simultaneously'
          });
        }
      }
    }

    // Check for balance discrepancies
    if (syncData.balance && Math.abs(syncData.balance - wallet.balance) > 0.01) {
      conflicts.push({
        type: 'balance_mismatch',
        expectedBalance: wallet.balance,
        reportedBalance: syncData.balance,
        description: 'Balance mismatch detected between devices'
      });
    }

    return conflicts;
  }

  /**
   * Transfer funds between wallets
   */
  async transferBetweenWallets(userId, fromWalletId, toWalletId, amount, description = '') {
    const fromWallet = this.wallets.get(fromWalletId);
    const toWallet = this.wallets.get(toWalletId);

    if (!fromWallet || fromWallet.userId !== userId) {
      throw new Error('Source wallet not found or unauthorized');
    }

    if (!toWallet || toWallet.userId !== userId) {
      throw new Error('Destination wallet not found or unauthorized');
    }

    if (fromWallet.balance < amount) {
      throw new Error('Insufficient funds in source wallet');
    }

    if (!fromWallet.permissions.canSend) {
      throw new Error('Source wallet does not have send permissions');
    }

    if (!toWallet.permissions.canReceive) {
      throw new Error('Destination wallet does not have receive permissions');
    }

    // Perform transfer
    fromWallet.balance -= amount;
    toWallet.balance += amount;

    const transferId = crypto.randomUUID();
    const transferRecord = {
      transferId,
      userId,
      fromWalletId,
      toWalletId,
      amount,
      description,
      timestamp: new Date(),
      status: 'completed'
    };

    // Update sync timestamps
    fromWallet.lastSyncAt = new Date();
    toWallet.lastSyncAt = new Date();

    logger.info('Inter-wallet transfer completed', {
      userId,
      transferId,
      fromWalletId,
      toWalletId,
      amount
    });

    return {
      transfer: transferRecord,
      fromWallet: this.sanitizeWallet(fromWallet),
      toWallet: this.sanitizeWallet(toWallet)
    };
  }

  /**
   * Get wallet synchronization status
   */
  getWalletSyncStatus(walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return null;
    }

    const syncStatuses = [];
    for (const deviceId of wallet.syncDevices) {
      const syncKey = `${walletId}-${deviceId}`;
      const syncStatus = this.walletSyncStatus.get(syncKey);
      if (syncStatus) {
        syncStatuses.push(syncStatus);
      }
    }

    return {
      walletId,
      lastSyncAt: wallet.lastSyncAt,
      syncDeviceCount: wallet.syncDevices.size,
      deviceSyncStatuses: syncStatuses
    };
  }

  /**
   * Remove wallet (soft delete)
   */
  async removeWallet(userId, walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet || wallet.userId !== userId) {
      throw new Error('Wallet not found or unauthorized');
    }

    if (wallet.isPrimary) {
      throw new Error('Cannot remove primary wallet. Set another wallet as primary first.');
    }

    if (wallet.balance > 0) {
      throw new Error('Cannot remove wallet with remaining balance. Transfer funds first.');
    }

    wallet.isActive = false;
    wallet.removedAt = new Date();

    // Remove from user's wallet list
    if (this.userWallets.has(userId)) {
      this.userWallets.get(userId).delete(walletId);
    }

    logger.info('Wallet removed', {
      userId,
      walletId,
      walletName: wallet.walletName
    });

    return true;
  }

  /**
   * Sanitize wallet data for client response
   */
  sanitizeWallet(wallet) {
    return {
      walletId: wallet.walletId,
      walletName: wallet.walletName,
      walletType: wallet.walletType,
      currency: wallet.currency,
      balance: wallet.balance,
      isPrimary: wallet.isPrimary,
      createdAt: wallet.createdAt,
      lastSyncAt: wallet.lastSyncAt,
      syncDeviceCount: wallet.syncDevices.size,
      permissions: wallet.permissions,
      metadata: wallet.metadata
    };
  }

  /**
   * Get wallet statistics for user
   */
  getWalletStatistics(userId) {
    const wallets = this.getUserWallets(userId);
    
    const stats = {
      totalWallets: wallets.length,
      totalBalance: wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
      walletTypes: {},
      currencies: {},
      lastActivity: null
    };

    for (const wallet of wallets) {
      // Count wallet types
      stats.walletTypes[wallet.walletType] = (stats.walletTypes[wallet.walletType] || 0) + 1;
      
      // Count currencies
      stats.currencies[wallet.currency] = (stats.currencies[wallet.currency] || 0) + 1;
      
      // Find most recent activity
      if (!stats.lastActivity || wallet.lastSyncAt > stats.lastActivity) {
        stats.lastActivity = wallet.lastSyncAt;
      }
    }

    return stats;
  }
}

module.exports = MultiWalletManager;