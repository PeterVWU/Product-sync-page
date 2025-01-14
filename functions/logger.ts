// logger.ts

interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    event: string;
    details?: any;
    duration?: number;
    workerId?: string;
    requestId?: string;
}

interface LogBatch {
    entries: LogEntry[];
    batchId: string;
    startTime: string;
    endTime?: string;
}

interface LoggerOptions {
    kv: KVNamespace;
}

class Logger {
    private logs: LogEntry[] = [];
    private startTime: number;
    private batchId: string;
    private workerId: string;
    private requestId: string;
    private kv: KVNamespace;

    constructor(options: LoggerOptions) {
        this.startTime = Date.now();
        this.batchId = crypto.randomUUID();
        this.workerId = crypto.randomUUID().slice(0, 8);
        this.requestId = crypto.randomUUID().slice(0, 8);
        this.kv = options.kv;
    }

    private async persistLogs(batch: LogBatch): Promise<void> {
        try {
            // Store in KV namespace
            await this.kv.put(`logs:${this.batchId}`, JSON.stringify(batch), {
                expirationTtl: 86400 * 7 // Keep logs for 7 days
            });

            // Maintain an index of log batches
            const indexKey = `logs:index:${new Date().toISOString().split('T')[0]}`;
            const existingIndex = await this.kv.get(indexKey);
            const batchIds = existingIndex ? JSON.parse(existingIndex) : [];
            batchIds.push(this.batchId);
            await this.kv.put(indexKey, JSON.stringify(batchIds));
        } catch (error) {
            // If KV storage fails, fall back to console.log
            console.error('Failed to persist logs:', error);
            console.log(JSON.stringify(batch, null, 2));
        }
    }

    log(level: LogEntry['level'], event: string, details?: any): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            details,
            duration: Date.now() - this.startTime,
            workerId: this.workerId,
            requestId: this.requestId
        };

        this.logs.push(entry);

        // Also log to console for immediate visibility
        console.log(JSON.stringify(entry));
    }

    info(event: string, details?: any): void {
        this.log('info', event, details);
    }

    warn(event: string, details?: any): void {
        this.log('warn', event, details);
    }

    error(event: string, details?: any): void {
        this.log('error', event, details);
    }

    async flush(): Promise<void> {
        if (this.logs.length === 0) return;

        const batch: LogBatch = {
            entries: this.logs,
            batchId: this.batchId,
            startTime: new Date(this.startTime).toISOString(),
            endTime: new Date().toISOString()
        };

        await this.persistLogs(batch);
        this.logs = []; // Clear logs after persisting
    }

    static async retrieveLogs(kv: KVNamespace, date?: string): Promise<LogBatch[]> {
        try {
            const indexKey = `logs:index:${date || new Date().toISOString().split('T')[0]}`;
            const batchIds = await kv.get(indexKey);

            if (!batchIds) return [];

            const batches = await Promise.all(
                JSON.parse(batchIds).map(async (batchId: string) => {
                    const batchData = await kv.get(`logs:${batchId}`);
                    return batchData ? JSON.parse(batchData) : null;
                })
            );

            return batches.filter(Boolean);
        } catch (error) {
            console.error('Failed to retrieve logs:', error);
            return [];
        }
    }
}

export default Logger;