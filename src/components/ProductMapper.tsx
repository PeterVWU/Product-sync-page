import React, { useState } from 'react';
import { ShopifyProduct } from '../../functions/backendTypes';

interface ProductMapperProps {
    shopifyProduct: ShopifyProduct;
    onSelectConfigurable: (sku: string) => void;
    onContinueWithNew: () => void;
}

interface MagentoSearchResult {
    sku: string;
    name: string;
    url_key?: string;
    type_id: string;
}

const ProductMapper: React.FC<ProductMapperProps> = ({
    shopifyProduct,
    onSelectConfigurable,
    onContinueWithNew
}) => {
    const [searchResults, setSearchResults] = useState<MagentoSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualSku, setManualSku] = useState('');
    const [searched, setSearched] = useState(false);

    const searchMagentoProducts = async () => {
        try {
            setLoading(true);
            setError(null);

            // Extract base product name from shopify product
            // Example: if title is "Adjust MyFlavor 40,000 Puffs - Strawberry"
            // We search for "adjust-myflavor"
            const searchBase = shopifyProduct.title
                .split(' ')
                .slice(0, 2) // Take first two words
                .join(' ')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-'); // Convert to URL-friendly format

            const response = await fetch(
                `/search-magento-products?searchBase=${encodeURIComponent(searchBase)}`
            );

            if (!response.ok) {
                throw new Error('Failed to search Magento products');
            }

            const data = await response.json();
            setSearchResults(data.products);
            setSearched(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
            <div className="space-y-2">
                <h3 className="text-lg font-medium">Configure Product Mapping</h3>
                <p className="text-sm text-gray-600">
                    Importing: <span className="font-medium">{shopifyProduct.title}</span>
                </p>
            </div>

            <div className="space-y-4">
                <button
                    onClick={searchMagentoProducts}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-blue-300"
                >
                    {loading ? 'Searching...' : 'Search Similar Products in Magento'}
                </button>

                {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded">
                        {error}
                    </div>
                )}

                {searched && (
                    <div className="space-y-4">
                        {searchResults.length > 0 ? (
                            <div className="border rounded divide-y">
                                {searchResults.map(product => (
                                    <div
                                        key={product.sku}
                                        className="p-4 hover:bg-gray-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="font-medium">{product.name}</div>
                                                <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                                                {product.url_key && (
                                                    <div className="text-sm text-gray-500">
                                                        URL: {product.url_key}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => onSelectConfigurable(product.sku)}
                                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                            >
                                                Select
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center p-4 bg-gray-50 rounded">
                                No matching products found in Magento
                            </div>
                        )}
                    </div>
                )}

                <div className="pt-4 border-t">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Or enter configurable product SKU manually:
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualSku}
                                    onChange={(e) => setManualSku(e.target.value)}
                                    className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Enter SKU"
                                />
                                <button
                                    onClick={() => onSelectConfigurable(manualSku)}
                                    disabled={!manualSku}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                                >
                                    Use This SKU
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t">
                    <button
                        onClick={onContinueWithNew}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Create New Configurable Product Instead
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProductMapper;