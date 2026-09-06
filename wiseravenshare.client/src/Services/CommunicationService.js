// wiseravenshare.client/src/Services/CommunicationService.js
import { apiService } from './api';

/**
 * Communication Service
 * Handles SMS, WhatsApp, and 2FA verification via Twilio
 */
export const communicationService = {
    /**
     * Check if Twilio communication is enabled
     */
    checkStatus: async () => {
        try {
            const response = await apiService.get('/communication/status');
            return response.data || { twilioEnabled: false };
        } catch (error) {
            console.error('Failed to check communication status:', error);
            return { twilioEnabled: false };
        }
    },

    /**
     * Send SMS notification
     */
    sendSms: async (message, phoneNumber = null, userId = null) => {
        try {
            const response = await apiService.post('/communication/sms/send', {
                message,
                phoneNumber,
                userId
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to send SMS:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Send WhatsApp message
     */
    sendWhatsApp: async (message, phoneNumber = null, userId = null) => {
        try {
            const response = await apiService.post('/communication/whatsapp/send', {
                message,
                phoneNumber,
                userId
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to send WhatsApp message:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Request verification code for 2FA
     */
    requestVerification: async (phoneNumber, channel = 'sms') => {
        try {
            const response = await apiService.post('/communication/verify/request', {
                phoneNumber,
                channel
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to request verification:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Confirm verification code for 2FA
     */
    confirmVerification: async (phoneNumber, code) => {
        try {
            const response = await apiService.post('/communication/verify/confirm', {
                phoneNumber,
                code
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to confirm verification:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get current user's communication preferences
     */
    getPreferences: async () => {
        try {
            const response = await apiService.get('/communication/preferences');
            return response.data || {
                enableSmsNotifications: true,
                enableWhatsAppNotifications: true,
                enableEngagementNotifications: true,
                preferredChannel: 'sms'
            };
        } catch (error) {
            console.error('Failed to get preferences:', error);
            return null;
        }
    },

    /**
     * Update communication preferences
     */
    updatePreferences: async (preferences) => {
        try {
            const response = await apiService.put('/communication/preferences', preferences);
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to update preferences:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Send bulk notification to multiple users
     */
    sendBulkNotification: async (userIds, message) => {
        try {
            const response = await apiService.post('/communication/bulk/send', {
                userIds,
                message
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to send bulk notification:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Notify user of engagement activity
     */
    notifyEngagement: async (userId, contentTitle, activityType) => {
        try {
            const response = await apiService.post('/communication/engagement/notify', {
                userId,
                contentTitle,
                activityType
            });
            return response.data || { success: false };
        } catch (error) {
            console.error('Failed to send engagement notification:', error);
            return { success: false, error: error.message };
        }
    }
};

/**
 * SMS/WhatsApp Notification Helper
 * Provides convenience functions for common notification patterns
 */
export const notificationHelper = {
    /**
     * Notify user of a like on their content
     */
    notifyLike: async (userId, contentTitle) => {
        return communicationService.notifyEngagement(userId, contentTitle, 'like');
    },

    /**
     * Notify user of a comment on their content
     */
    notifyComment: async (userId, contentTitle) => {
        return communicationService.notifyEngagement(userId, contentTitle, 'comment');
    },

    /**
     * Notify user of a share of their content
     */
    notifyShare: async (userId, contentTitle) => {
        return communicationService.notifyEngagement(userId, contentTitle, 'share');
    },

    /**
     * Notify user of a collaboration request
     */
    notifyCollaboration: async (userId, contentTitle) => {
        return communicationService.notifyEngagement(userId, contentTitle, 'collaborate');
    },

    /**
     * Notify user of a mention
     */
    notifyMention: async (userId, contentTitle) => {
        return communicationService.notifyEngagement(userId, contentTitle, 'mention');
    },

    /**
     * Send custom SMS to user
     */
    sendSms: async (message, phoneNumber = null) => {
        return communicationService.sendSms(message, phoneNumber);
    },

    /**
     * Send custom WhatsApp message to user
     */
    sendWhatsApp: async (message, phoneNumber = null) => {
        return communicationService.sendWhatsApp(message, phoneNumber);
    }
};

/**
 * 2FA/Verification Helper
 * Simplifies phone verification workflow
 */
export const verificationHelper = {
    /**
     * Start phone verification process
     */
    startVerification: async (phoneNumber) => {
        return communicationService.requestVerification(phoneNumber, 'sms');
    },

    /**
     * Complete phone verification with code
     */
    completeVerification: async (phoneNumber, code) => {
        return communicationService.confirmVerification(phoneNumber, code);
    },

    /**
     * Full verification flow with UI feedback
     */
    verifyPhoneNumber: async (phoneNumber, onCodeRequested = null) => {
        // Step 1: Request code
        const requestResult = await verificationHelper.startVerification(phoneNumber);
        
        if (!requestResult.success) {
            return {
                success: false,
                error: 'Failed to request verification code',
                stage: 'request'
            };
        }

        // Notify caller that code has been requested
        if (onCodeRequested) {
            onCodeRequested(requestResult.verificationSid);
        }

        // Return object that allows confirming code
        return {
            success: true,
            verificationSid: requestResult.verificationSid,
            confirmCode: async (code) => {
                return verificationHelper.completeVerification(phoneNumber, code);
            }
        };
    }
};

/**
 * Preference Management Helper
 */
export const preferenceHelper = {
    /**
     * Get user preferences
     */
    getPreferences: async () => {
        return communicationService.getPreferences();
    },

    /**
     * Enable SMS notifications
     */
    enableSms: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableSmsNotifications = true;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Disable SMS notifications
     */
    disableSms: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableSmsNotifications = false;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Enable WhatsApp notifications
     */
    enableWhatsApp: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableWhatsAppNotifications = true;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Disable WhatsApp notifications
     */
    disableWhatsApp: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableWhatsAppNotifications = false;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Enable engagement notifications
     */
    enableEngagement: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableEngagementNotifications = true;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Disable engagement notifications
     */
    disableEngagement: async () => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.enableEngagementNotifications = false;
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    },

    /**
     * Set preferred channel
     */
    setPreferredChannel: async (channel) => {
        const prefs = await preferenceHelper.getPreferences();
        if (prefs) {
            prefs.preferredChannel = channel; // 'sms' or 'whatsapp'
            return communicationService.updatePreferences(prefs);
        }
        return { success: false };
    }
};
