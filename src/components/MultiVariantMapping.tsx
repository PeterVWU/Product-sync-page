// components/MultiVariantMapping/MultiVariantMapping.tsx
import React, { useState, useEffect } from 'react';
import { MagentoAttributeMetadata, ShopifyProduct, CategoryOption } from '../../functions/backendTypes';
import { AttributeMappingType, VariantMapping } from "../frontendTypes";
import AttributeMapping from './AttributeMapping';
import CategorySelect from './CategorySelect';
import SearchableSelect from './SearchableSelect';
import ProductMapper from "./ProductMapper";


// Add new interface for validation state
interface ValidationState {
    productLevel: {
        manufacturer: boolean;
        brand: boolean;
        description: boolean;
        category_ids: boolean;
    };
    variants: { [key: string]: { [key: string]: boolean } };
}


// Helper functions

async function getExistingVariants(configurableSku: string): Promise<string[]> {
    try {
        const response = await fetch(`/get-configurable-variants?sku=${encodeURIComponent(configurableSku)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch existing variants');
        }
        const data = await response.json();
        return data.childSkus;
    } catch (error) {
        console.error('Error fetching existing variants:', error);
        return [];
    }
}

function getStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const track = Array(s2.length + 1).fill(null).map(() =>
        Array(s1.length + 1).fill(null));

    for (let i = 0; i <= s1.length; i += 1) {
        track[0][i] = i;
    }
    for (let j = 0; j <= s2.length; j += 1) {
        track[j][0] = j;
    }

    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }

    const maxLength = Math.max(s1.length, s2.length);
    return 1 - track[s2.length][s1.length] / maxLength;
}

function findBestMatchingOptionValue(
    shopifyValue: string,
    options: Array<{ label: string; value: string }> | undefined
): string {
    if (!options || !shopifyValue) return '';

    let bestMatch = '';
    let highestSimilarity = 0;

    options.forEach(option => {
        const similarity = getStringSimilarity(
            shopifyValue.toLowerCase(),
            option.label.toLowerCase()
        );

        if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestMatch = option.value;
        }
    });

    return highestSimilarity > 0.6 ? bestMatch : '';
}

function findBestMatchingAttribute(
    shopifyAttr: string,
    shopifyValue: string,
    attributes: MagentoAttributeMetadata[]
): { attributeCode: string; optionValue: string } {
    const directMappings: { [key: string]: string } = {
        'vendor': 'manufacturer',
        'vendorBrand': 'brand',
        'productType': 'product_type'
    };

    shopifyAttr.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (directMappings[shopifyAttr]) {
        const directMatch = attributes.find(attr => attr.attribute_code === directMappings[shopifyAttr]);
        if (directMatch) {
            const optionValue = findBestMatchingOptionValue(shopifyValue, directMatch.options);
            return {
                attributeCode: directMatch.attribute_code,
                optionValue: optionValue || shopifyValue
            };
        }
    }

    return { attributeCode: '', optionValue: '' };
}

function findBestMatchingCategory(productType: string, categories: CategoryOption[]): string[] {
    const productTypeParts = productType.toLowerCase().split(/[\s/]+/);
    const matches: Array<{ value: string; similarity: number }> = [];

    categories.forEach(category => {
        const categoryParts = category.label.toLowerCase().split(/[\s/]+/);
        let similarity = 0;

        productTypeParts.forEach(part => {
            if (categoryParts.some(catPart =>
                catPart.includes(part) || part.includes(catPart)
            )) {
                similarity += 1;
            }
        });

        if (similarity > 0) {
            matches.push({
                value: category.value,
                similarity: similarity / Math.max(productTypeParts.length, categoryParts.length)
            });
        }
    });

    return matches
        .sort((a, b) => b.similarity - a.similarity)
        .filter(match => match.similarity > 0.3)
        .map(match => match.value);
}


interface MultiVariantMappingProps {
    product: ShopifyProduct;
    variantMappings: VariantMapping[];
    attributes: MagentoAttributeMetadata[];
    categories: CategoryOption[];
    onUpdateMapping: (index: number, mappings: AttributeMappingType) => void;
    onAttributesUpdate: (updatedAttributes: MagentoAttributeMetadata[]) => void;
    onSave: (configurableSku: string, isNewConfigurable: boolean, existingVariantSkus: string[]) => void;
    onCancel: () => void;
    importing: boolean;
    importProgress: {
        current: number;
        total: number;
        status: string;
    } | null;
}

const MultiVariantMapping: React.FC<MultiVariantMappingProps> = ({
    product,
    variantMappings,
    attributes,
    categories,
    onUpdateMapping,
    onAttributesUpdate,
    onSave,
    onCancel,
    importing,
    importProgress
}) => {

    // Initialize product attributes with best matches
    const [productAttributes, setProductAttributes] = useState<AttributeMappingType>({});
    const [configurableSku, setConfigurableSku] = useState<string | null>(null);
    const [showMapper, setShowMapper] = useState(true);
    const [isNewConfigurable, setIsNewConfigurable] = useState(false);
    const [existingVariantSkus, setExistingVariantSkus] = useState<string[]>([]);
    const [filteredVariantMappings, setFilteredVariantMappings] = useState<VariantMapping[]>([]);
    const [validation, setValidation] = useState<ValidationState>({
        productLevel: {
            manufacturer: false,
            brand: false,
            description: false,
            category_ids: false
        },
        variants: {}
    });

    // Update validation state whenever mappings change
    useEffect(() => {
        const newValidation: ValidationState = {
            productLevel: {
                manufacturer: !!productAttributes.manufacturer?.mappedTo && !!productAttributes.manufacturer?.mappedValue,
                brand: !!productAttributes.brand?.mappedTo && !!productAttributes.brand?.mappedValue,
                description: !!productAttributes.description?.mappedTo && !!productAttributes.description?.mappedValue,
                category_ids: !!productAttributes.category_ids?.mappedTo &&
                    Array.isArray(productAttributes.category_ids?.mappedValue) &&
                    productAttributes.category_ids.mappedValue.length > 0
            },
            variants: {}
        };

        filteredVariantMappings.forEach((mapping, index) => {
            newValidation.variants[index] = {};
            Object.keys(mapping.mappings).forEach(key => {
                const attr = mapping.mappings[key];
                newValidation.variants[index][key] = !!attr?.mappedTo && !!attr.mappedValue;
            });
        });

        setValidation(newValidation);
    }, [productAttributes, filteredVariantMappings]);

    useEffect(() => {
        // When configurableSku changes and it's not a new configurable product,
        // fetch existing variants
        if (configurableSku && !isNewConfigurable) {
            getExistingVariants(configurableSku).then(skus => {
                setExistingVariantSkus(skus);
            });
        } else {
            setExistingVariantSkus([]);
        }
    }, [configurableSku, isNewConfigurable]);

    // Filter variant mappings whenever existingVariantSkus changes
    useEffect(() => {
        const newMappings = variantMappings.filter(mapping =>
            !existingVariantSkus.includes(mapping.variant.sku)
        );
        setFilteredVariantMappings(newMappings);

    }, [variantMappings, existingVariantSkus]);

    const updateAllVariants = (newProductAttributes: AttributeMappingType) => {
        console.log('Updating all variants with:', newProductAttributes); // Debug log
        for (let i = 0; i < variantMappings.length; i++) {
            const currentMapping = variantMappings[i].mappings;
            const updatedMapping = {
                ...currentMapping, // Keep existing variant-specific mappings
                manufacturer: {
                    ...newProductAttributes.manufacturer,
                    value: product.vendor // Ensure original value is kept
                },
                brand: {
                    ...newProductAttributes.brand,
                    value: product.vendor // Ensure original value is kept
                },
                description: {
                    ...newProductAttributes.description,
                    value: product.description
                },
                category_ids: {
                    ...newProductAttributes.category_ids,
                    value: product.productType // Ensure original value is kept
                }
            };
            onUpdateMapping(i, updatedMapping);
        }
    };

    useEffect(() => {
        const vendorMatch = findBestMatchingAttribute('vendor', product.vendor, attributes);
        const vendorBrandMatch = findBestMatchingAttribute('vendorBrand', product.vendor, attributes);
        const initialProductAttributes: AttributeMappingType = {
            manufacturer: {
                value: vendorMatch.attributeCode,
                mappedTo: 'manufacturer',
                mappedValue: vendorMatch.optionValue
            },
            brand: {
                value: vendorBrandMatch.attributeCode,
                mappedTo: 'brand',
                mappedValue: vendorBrandMatch.optionValue
            },
            description: {
                value: product.description,
                mappedTo: 'description',
                mappedValue: product.description
            },
            category_ids: {
                value: product.productType,
                mappedTo: 'category_ids',
                mappedValue: findBestMatchingCategory(product.productType, categories)
            }
        };

        setProductAttributes(initialProductAttributes);

        updateAllVariants(initialProductAttributes);
    }, [product, attributes, categories]);

    const handleProductAttributeChange = (attributeName: string, magentoAttr: string) => {
        // Keep the original value from the product
        const currentValue = attributeName === 'vendor' ? product.vendor :
            attributeName === 'description' ? product.description :
                attributeName === 'category_ids' ? product.productType :
                    productAttributes[attributeName]?.value || '';
        const newMapping = {
            value: currentValue,
            mappedTo: magentoAttr,
            mappedValue: currentValue
        };

        let newAttributes = {
            ...productAttributes,
            [attributeName]: newMapping
        };

        // Handle vendor/brand relationship
        if (attributeName === 'vendor') {
            newAttributes.brand = {
                value: product.vendor,
                mappedTo: 'brand',
                mappedValue: currentValue
            };
        }

        setProductAttributes(newAttributes);
        updateAllVariants(newAttributes);
    };

    const handleProductValueChange = (attributeName: string, newValue: string | string[], newLabelValue: string = "") => {
        const newMapping = {
            ...productAttributes[attributeName],
            mappedValue: newValue,
            value: newLabelValue
        };

        let newAttributes = {
            ...productAttributes,
            [attributeName]: newMapping
        };

        // Handle vendor/brand relationship
        if (attributeName === 'vendor') {
            newAttributes.brand = {
                ...productAttributes.brand,
                mappedValue: newValue,
                value: newLabelValue
            };
        }

        setProductAttributes(newAttributes);
        updateAllVariants(newAttributes);
    };

    // Update variant mapping but exclude product-level attributes
    const handleVariantMapping = (index: number, mappings: AttributeMappingType) => {
        // Keep variant-specific mappings but ensure latest product attributes are included
        const combinedMappings = {
            ...mappings, // Variant-specific mappings
            vendor: productAttributes.vendor,
            brand: productAttributes.brand,
            description: productAttributes.description,
            category_ids: productAttributes.category_ids
        };
        onUpdateMapping(index, combinedMappings);
    };

    // List of attributes that should not be configurable
    // const nonConfigurableAttributes = [
    //     'manufacturer',
    //     'brand',
    //     'description',
    //     'name',
    //     'url_key',
    //     'price',
    //     'status',
    //     'visibility',
    //     'category_ids',
    //     'tax_class_id',
    //     'meta_title',
    //     'meta_description'
    // ];

    const handleSave = async () => {
        if (!configurableSku) {
            setShowMapper(true);
            return;
        }
        onSave(configurableSku, isNewConfigurable, existingVariantSkus);

    };

    const getAttributeOptions = (attributeCode: string) => {
        const attribute = attributes.find(attr => attr.attribute_code === attributeCode);
        return attribute?.options || [];
    };

    const renderAttributeValueInput = (attributeName: string) => {
        const mappedTo = productAttributes[attributeName].mappedTo;
        const attribute = attributes.find(attr => attr.attribute_code === mappedTo);
        const isSelect = attribute?.frontend_input === 'select' ||
            attribute?.frontend_input === 'multiselect';

        if (!mappedTo) return null;

        if (attributeName === 'description') {
            return (
                <div className="space-y-2">
                    <div
                        className="prose max-w-none text-sm text-gray-600 mb-2 p-4 bg-gray-50 rounded"
                        dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                    <textarea
                        value={productAttributes[attributeName].mappedValue as string}
                        onChange={(e) => handleProductValueChange(attributeName, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 font-mono"
                        rows={6}
                    />
                </div>
            );
        }

        if (isSelect) {
            return (
                <SearchableSelect
                    options={getAttributeOptions(mappedTo).map(opt => ({
                        label: opt.label,
                        value: opt.value
                    }))}
                    value={productAttributes[attributeName].mappedValue as string}
                    onChange={(value, label) => handleProductValueChange(attributeName, value, label)}
                    placeholder="Select Value"
                    attributeCode={mappedTo}
                    allowCreate={true}
                />
            );
        }
        return (
            <input
                type="text"
                value={productAttributes[attributeName].mappedValue as string}
                onChange={(e) => handleProductValueChange(attributeName, e.target.value)}
                className="w-full h-9 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold px-6 py-4 border-b border-gray-200">
                Map Attributes for {product.title}
            </h3>
            {showMapper && !configurableSku && (
                <ProductMapper
                    shopifyProduct={product}
                    onSelectConfigurable={(sku) => {
                        setConfigurableSku(sku);
                        setIsNewConfigurable(false);
                        setShowMapper(false);
                    }}
                    onContinueWithNew={() => {
                        setConfigurableSku(product.handle.slice(0, 64));
                        setIsNewConfigurable(true);
                        setShowMapper(false);
                    }}
                />
            )}
            {configurableSku && (
                <>
                    {/* Product-level attributes section */}
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-md font-medium">Product Attributes</h4>
                            <div className="text-sm text-gray-600">
                                Configurable SKU: {configurableSku}
                                {isNewConfigurable && " (New)"}
                            </div>
                        </div>
                        <div className="space-y-4">
                            {/* Vendor/Manufacturer mapping */}
                            <div className={`flex flex-col space-y-2 ${!validation.productLevel.manufacturer ? 'border-2 border-red-300 p-2 rounded' : ''}`}>
                                <div className="flex items-center">
                                    <span className="font-medium text-sm w-48">Manufacturer:</span>
                                    <span className="text-sm text-gray-600">{product.vendor}</span>
                                </div>
                                <SearchableSelect
                                    options={attributes.map(attr => ({
                                        label: attr.default_frontend_label,
                                        value: attr.attribute_code
                                    }))}
                                    value={productAttributes.manufacturer?.mappedTo || ''}
                                    onChange={(value) => handleProductAttributeChange('manufacturer', value)}
                                    placeholder="Select Magento Attribute"
                                />
                                {productAttributes.manufacturer?.mappedTo && renderAttributeValueInput('manufacturer')}
                            </div>

                            {/* Brand mapping */}
                            <div className={`flex flex-col space-y-2 ${!validation.productLevel.brand ? 'border-2 border-red-300 p-2 rounded' : ''}`}>
                                <div className="flex items-center">
                                    <span className="font-medium text-sm w-48">Brand:</span>
                                    <span className="text-sm text-gray-600">{product.vendor}</span>
                                </div>
                                <SearchableSelect
                                    options={attributes.map(attr => ({
                                        label: attr.default_frontend_label,
                                        value: attr.attribute_code
                                    }))}
                                    value={productAttributes.brand?.mappedTo || ''}
                                    onChange={(value) => handleProductAttributeChange('brand', value)}
                                    placeholder="Select Magento Attribute"
                                />
                                {productAttributes.brand?.mappedTo && renderAttributeValueInput('brand')}
                            </div>

                            {/* Description mapping */}
                            <div className={`flex flex-col space-y-2 ${!validation.productLevel.description ? 'border-2 border-red-300 p-2 rounded' : ''}`}>
                                <div className="flex items-center">
                                    <span className="font-medium text-sm w-48">Description:</span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2">{product.description}</div>
                                <SearchableSelect
                                    options={attributes.map(attr => ({
                                        label: attr.default_frontend_label,
                                        value: attr.attribute_code
                                    }))}
                                    value={productAttributes.description?.mappedTo || ''}
                                    onChange={(value) => handleProductAttributeChange('description', value)}
                                    placeholder="Select Magento Attribute"
                                />
                                {productAttributes.description?.mappedTo && renderAttributeValueInput('description')}
                            </div>

                            {/* Categories mapping */}
                            <div className={`flex flex-col space-y-2 ${!validation.productLevel.category_ids ? 'border-2 border-red-300 p-2 rounded' : ''}`}>
                                <div className="flex items-center">
                                    <span className="font-medium text-sm w-48">Categories:</span>
                                    <span className="text-sm text-gray-500">
                                        Suggested from product type: {product.productType}
                                    </span>
                                </div>
                                <CategorySelect
                                    options={categories}
                                    value={Array.isArray(productAttributes.category_ids?.mappedValue)
                                        ? productAttributes.category_ids.mappedValue
                                        : []}
                                    onChange={(value) => handleProductValueChange('category_ids', value)}
                                    placeholder="Select product categories"
                                />
                            </div>
                        </div>
                    </div>

                    {filteredVariantMappings.length === 0 && variantMappings.length > 0 && (
                        <div className="p-6 text-center text-gray-600">
                            All variants are already imported to Magento.
                            <button
                                onClick={onCancel}
                                className="block mx-auto mt-4 px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
                            >
                                Go Back
                            </button>
                        </div>
                    )}

                    {/* Show only new variants */}
                    {filteredVariantMappings.length > 0 && (
                        <div className="p-6 space-y-8">
                            {filteredVariantMappings.map(({ variant }, index) => (
                                <div
                                    key={variant.id}
                                    className="border-t border-gray-200 pt-8 first:border-t-0 first:pt-0"
                                >
                                    <h4 className="text-md font-medium mb-4">
                                        New Variant: {variant.title} SKU:{variant.sku}
                                    </h4>
                                    <AttributeMapping
                                        product={product}
                                        variant={variant}
                                        attributes={attributes}
                                        categories={categories}
                                        onSave={(mappings) => handleVariantMapping(index, mappings)}
                                        onAttributesUpdate={onAttributesUpdate}
                                        onCancel={onCancel}
                                        hideButtons
                                        excludeAttributes={['vendor', 'brand', 'category_ids', "description"]}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {importProgress && (
                        <div className="px-6 py-4 border-t border-gray-200">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">{importProgress.status}</span>

                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-in-out"
                                        style={{
                                            width: `${(importProgress.current / importProgress.total) * 100}%`
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    {filteredVariantMappings.length > 0 && (
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-4">
                            <button
                                onClick={handleSave}
                                disabled={importing}
                                className="px-4 py-2 text-sm rounded transition-colors bg-blue-500 text-white hover:bg-blue-600"
                            >
                                {importing ? 'Importing...' : 'Import All Variants'}
                            </button>
                            <button
                                onClick={onCancel}
                                disabled={importing}
                                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MultiVariantMapping;