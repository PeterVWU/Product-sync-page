import React, { useState, useEffect } from 'react';

const LogsViewer = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    const fetchLogs = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`/get-logs?date=${selectedDate}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            setLogs(data.logs);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [selectedDate]);

    return (
        <div className="p-4 bg-white rounded-lg shadow">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">System Logs</h2>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2 py-1 border rounded"
                    />
                    <button
                        onClick={fetchLogs}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {loading && (
                <div className="text-center py-4">Loading logs...</div>
            )}

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded mb-4">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {logs.map((batch: any) => (
                    <div key={batch.batchId} className="border rounded p-4">
                        <div className="mb-2 text-sm text-gray-500">
                            Batch ID: {batch.batchId}
                            <span className="mx-2">•</span>
                            {new Date(batch.startTime).toLocaleString()}
                        </div>
                        <div className="space-y-2">
                            {batch.entries.map((entry: any, index: any) => (
                                <div
                                    key={index}
                                    className={`p-2 rounded text-sm ${entry.level === 'error' ? 'bg-red-50 text-red-700' :
                                            entry.level === 'warn' ? 'bg-yellow-50 text-yellow-700' :
                                                'bg-gray-50 text-gray-700'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{entry.event}</span>
                                        <span className="text-xs">
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    {entry.details && (
                                        <pre className="mt-1 text-xs overflow-x-auto">
                                            {JSON.stringify(entry.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {!loading && logs.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                        No logs found for the selected date
                    </div>
                )}
            </div>
        </div>
    );
};

export default LogsViewer;