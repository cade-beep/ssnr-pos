export interface AuditLogEntry {
  timestamp: string;
  user: string;
  action: 'LOGIN' | 'LOGOUT' | 'SALE' | 'REFUND' | 'INVENTORY_ADJUSTMENT' | 'BUSINESS_CLOSE' | 'AUTH_FAILURE' | 'NETWORK_FAILURE' | 'API_FAILURE' | 'UNEXPECTED_EXCEPTION' | 'SIGNUP';
  result: 'SUCCESS' | 'FAIL';
  duration?: number; // in ms
  context?: any;
}

export const auditLog = (entry: Omit<AuditLogEntry, 'timestamp' | 'user'>) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Attempt to extract current cashier email
    let user = 'UNKNOWN_USER';
    try {
      // Find supabase auth session in localstorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.user?.email) {
              user = parsed.user.email;
              break;
            }
          }
        }
      }
    } catch (_) {
      // ignore
    }

    const logEntry: AuditLogEntry = {
      timestamp,
      user,
      ...entry
    };

    console.log(`[AUDIT LOG] [${logEntry.timestamp}] [User: ${logEntry.user}] [Action: ${logEntry.action}] [Result: ${logEntry.result}]`, logEntry.context || '');

    // Save to localStorage list
    const existingLogsStr = localStorage.getItem('ssnr_pos_audit_logs') || '[]';
    let existingLogs: AuditLogEntry[] = [];
    try {
      existingLogs = JSON.parse(existingLogsStr);
      if (!Array.isArray(existingLogs)) {
        existingLogs = [];
      }
    } catch (_) {
      existingLogs = [];
    }

    existingLogs.push(logEntry);
    
    // Limit to last 1000 logs to prevent localStorage size issues
    if (existingLogs.length > 1000) {
      existingLogs = existingLogs.slice(-1000);
    }
    
    localStorage.setItem('ssnr_pos_audit_logs', JSON.stringify(existingLogs));
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};

export const getAuditLogs = (): AuditLogEntry[] => {
  try {
    const logs = localStorage.getItem('ssnr_pos_audit_logs');
    return logs ? JSON.parse(logs) : [];
  } catch (_) {
    return [];
  }
};

export const clearAuditLogs = () => {
  try {
    localStorage.removeItem('ssnr_pos_audit_logs');
  } catch (_) {
    // ignore
  }
};
