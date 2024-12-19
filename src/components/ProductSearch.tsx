import React, { useState } from 'react';
import { ShopifyProduct } from '../../functions/backendTypes';

interface ProductSearchProps {
    onImportAll: (product: ShopifyProduct) => void;
}

const ProductSearch: React.FC<ProductSearchProps> = ({
    onImportAll
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;

        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`/get-shopify-products?search=${encodeURIComponent(searchTerm)}`);
            const data: any = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (!data.product) {
                setError('No product found');
                return;
            }

            onImportAll(data.product);

        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6">
                <div className="max-w-2xl mx-auto">
                    <label htmlFor="product-search" className="block text-sm font-medium text-gray-700 mb-2">
                        Search for a Shopify Product
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="product-search"
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Enter product title, SKU, or handle"
                            className="flex-1 h-10 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={loading || !searchTerm.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:bg-blue-300"
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                    {error && (
                        <div className="mt-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductSearch;