// components/ProductList.tsx
import React, { useState, useMemo } from 'react';
import { ShopifyProduct, ShopifyVariant } from '../../functions/backendTypes';

const ProductList = ({
    products,
    onSelectVariant,
    onImportAll
}: {
    products: ShopifyProduct[];
    onSelectVariant: (product: ShopifyProduct, variant: ShopifyVariant) => void;
    onImportAll: (product: ShopifyProduct) => void;
}) => {
    const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

    // Helper function to check if a date is within the last 24 hours
    const isRecent = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
        return diffInHours <= 24;
    };

    // Process variants for each product, keeping only recent ones
    const productsWithRecentVariants = useMemo(() => {
        return products.map(product => ({
            ...product,
            recentVariants: product.variants.filter(variant => isRecent(variant.updatedAt)),
            hasRecentUpdates: product.variants.some(variant => isRecent(variant.updatedAt))
        }));
    }, [products]);

    return (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Updates</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {productsWithRecentVariants.map(product => (
                            <React.Fragment key={product.id}>
                                <tr className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        {product.hasRecentUpdates && (
                                            <button
                                                onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                                                className="text-gray-500 hover:text-gray-700"
                                            >
                                                {expandedProduct === product.id ? '▼' : '▶'}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center">
                                            {product.images[0] && (
                                                <img
                                                    src={product.images[0].url}
                                                    alt={product.images[0].altText || product.title}
                                                    className="h-10 w-10 object-cover rounded"
                                                />
                                            )}
                                            <div className="ml-3">
                                                <div className="text-sm font-medium text-gray-900">{product.title}</div>
                                                <div className="text-sm text-gray-500 line-clamp-1">{product.description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{product.vendor}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{product.productType}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.status === 'ACTIVE'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {product.status.toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {product.recentVariants.length > 0 ? (
                                            <span className="text-blue-600">{product.recentVariants.length} recent</span>
                                        ) : (
                                            <span className="text-gray-400">No recent updates</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {product.hasRecentUpdates && (
                                            <button
                                                onClick={() => onImportAll(product)}
                                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                            >
                                                Import Updates
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                {expandedProduct === product.id && product.recentVariants.length > 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-3 bg-gray-50">
                                            <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {product.recentVariants.map(variant => (
                                                    <button
                                                        key={variant.id}
                                                        onClick={() => onSelectVariant(product, variant)}
                                                        className="flex items-center justify-between px-4 py-2 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex flex-col items-start">
                                                            <span className="font-medium">{variant.title}</span>
                                                            <span className="text-xs text-gray-500">
                                                                Updated {new Date(variant.updatedAt).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <span className="text-gray-600">${variant.price}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductList;