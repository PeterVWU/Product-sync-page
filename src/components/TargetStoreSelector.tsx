import { useState, useEffect } from 'react';
import ValidatedBox from './ValidatedBox';

interface ShopifyStore {
    id: string;
    name: string;
    storeUrl: string;
    status?: "valid" | "error" | "warning";
}

interface TargetStoreSelectorProps {
    onSelectionChange: (selectedStores: string[]) => void;
    disabled?: boolean;
    importing?: boolean;
}

const TargetStoreSelector = ({
    onSelectionChange,
    disabled = false,
    importing = false
}: TargetStoreSelectorProps) => {
    const [stores, setStores] = useState<ShopifyStore[]>([]);
    const [selectedStores, setSelectedStores] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchStores();
    }, []);

    const fetchStores = async () => {
        try {
            const response = await fetch('/get-shopify-stores');
            if (!response.ok) {
                throw new Error('Failed to fetch store list');
            }
            const data = await response.json();
            setStores(data.stores);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAll = () => {
        const newSelection = selectedStores.length === stores.length ? [] : stores.map(store => store.id);
        setSelectedStores(newSelection);
        onSelectionChange(newSelection);
    };

    const handleStoreToggle = (storeId: string) => {
        const newSelection = selectedStores.includes(storeId)
            ? selectedStores.filter(id => id !== storeId)
            : [...selectedStores, storeId];

        setSelectedStores(newSelection);
        onSelectionChange(newSelection);
    };

    if (loading) {
        return <div className="text-sm text-gray-600">Loading available stores...</div>;
    }

    if (error) {
        return (
            <div className="text-sm text-red-600">
                Error loading stores: {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Target Stores</h3>
                <button
                    onClick={handleSelectAll}
                    disabled={disabled || importing}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                >
                    {selectedStores.length === stores.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {stores.map(store => (
                    <ValidatedBox
                        key={store.id}
                        validationState={store.status || 'valid'}
                    >
                        <label className="flex items-center justify-between p-2">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={selectedStores.includes(store.id)}
                                    onChange={() => handleStoreToggle(store.id)}
                                    disabled={disabled || importing}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-700">
                                    {store.name}
                                </span>
                                <span className="ml-2 text-sm text-gray-500">
                                    ({store.storeUrl})
                                </span>
                            </div>
                            {/* {store.status === 'checking' && (
                <span className="text-sm text-gray-500">Checking...</span>
              )} */}
                        </label>
                    </ValidatedBox>
                ))}
            </div>

            {stores.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                    No additional Shopify stores configured
                </div>
            )}
        </div>
    );
};

export default TargetStoreSelector;