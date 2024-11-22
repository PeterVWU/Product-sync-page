// components/AttributeMapping/AttributeMapping.tsx
import React, { useState, useEffect } from 'react';
import { MagentoAttributeMetadata, ShopifyProduct, ShopifyVariant, CategoryOption } from '../../functions/backendTypes';
import { AttributeMappingType } from "../frontendTypes";
import CategorySelect from './CategorySelect';
import SearchableSelect from './SearchableSelect';
import ValidatedBox from "./ValidatedBox";

interface AttributeMappingProps {
    product: ShopifyProduct;
    variant: ShopifyVariant;
    attributes: MagentoAttributeMetadata[];
    categories: CategoryOption[];
    onSave: (mappings: AttributeMappingType) => void;
    onAttributesUpdate: (updatedAttributes: MagentoAttributeMetadata[]) => void;
    onCancel: () => void;
    hideButtons?: boolean;
    excludeAttributes?: string[];
}

interface ValidationResult {
    isValid: boolean;
    similarity: number;
}

function validateAttributeMapping(
    shopifyValue: string,
    mappedValue: string | string[],
    options?: Array<{ label: string; value: string }>
): ValidationResult {
    if (!mappedValue || (typeof mappedValue === 'string' && !mappedValue.trim())) {
        return { isValid: false, similarity: 0 };
    }

    if (Array.isArray(mappedValue)) {
        return { isValid: mappedValue.length > 0, similarity: 1 };
    }

    if (!options) {
        // For text inputs, exact match is valid
        return {
            isValid: true,
            similarity: shopifyValue.toLowerCase() === mappedValue.toLowerCase() ? 1 : 0.7
        };
    }

    // For select inputs, check against options
    const matchingOption = options.find(opt =>
        opt.value === mappedValue || opt.label.toLowerCase() === mappedValue.toLowerCase()
    );

    if (matchingOption) {
        const similarity = getStringSimilarity(shopifyValue.toLowerCase(), matchingOption.label.toLowerCase());
        return {
            isValid: true,
            similarity
        };
    }

    return { isValid: false, similarity: 0 };
}

function getValidationState(validation: ValidationResult): 'valid' | 'warning' | 'error' {
    if (!validation.isValid) return 'error';
    if (validation.similarity >= 0.8) return 'valid';
    return 'warning';
}

// Helper function to calculate string similarity using Levenshtein distance
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

// Function to find best matching option value from Magento's options
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

// Function to find best matching Magento attribute
function findBestMatchingAttribute(
    shopifyAttr: string,
    shopifyValue: string,
    attributes: MagentoAttributeMetadata[]
): { attributeCode: string; optionValue: string } {
    const directMappings: { [key: string]: string } = {
        'title': 'name',
        'description': 'description',
        'vendor': 'manufacturer',
        'productType': 'product_type',
        'color': 'color',
        'size': 'size',
        'material': 'material',
        'weight': 'weight',
        'brand': 'brand',
        'sku': 'sku',
        'price': 'price',
        'Unit Per Pack': "unit_per_pack",
        'E-liquid flavor': 'flavor',
        'Flavor': 'flavor',
        'Resistance': 'resistance'
    };

    const normalizedAttr = shopifyAttr.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (directMappings[shopifyAttr]) {
        const directMatch = attributes.find(attr => attr.attribute_code === directMappings[shopifyAttr]);
        if (directMatch) {
            const optionValue = findBestMatchingOptionValue(shopifyValue, directMatch.options);
            return {
                attributeCode: directMatch.attribute_code,
                optionValue: optionValue || ''
            };
        }
    }

    let bestMatch = '';
    let bestMatchOptions: Array<{ label: string; value: string }> | undefined;
    let highestSimilarity = 0;

    attributes.forEach(attr => {
        const nameSimilarity = getStringSimilarity(
            normalizedAttr,
            attr.attribute_code.toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        const labelSimilarity = attr.default_frontend_label
            ? getStringSimilarity(
                normalizedAttr,
                attr.default_frontend_label.toLowerCase().replace(/[^a-z0-9]/g, '')
            )
            : 0;

        const similarity = Math.max(nameSimilarity, labelSimilarity);
        let optionBonus = 0;

        if (attr.options && shopifyValue) {
            const hasMatchingOption = attr.options.some(opt =>
                getStringSimilarity(opt.label.toLowerCase(), shopifyValue.toLowerCase()) > 0.8
            );
            if (hasMatchingOption) optionBonus = 0.3;
        }

        const totalSimilarity = similarity + optionBonus;

        if (totalSimilarity > highestSimilarity) {
            highestSimilarity = totalSimilarity;
            bestMatch = attr.attribute_code;
            bestMatchOptions = attr.options;
        }
    });

    if (highestSimilarity > 0.4) {
        const optionValue = findBestMatchingOptionValue(shopifyValue, bestMatchOptions);
        return {
            attributeCode: bestMatch,
            optionValue: optionValue || ''
        };
    }
    return { attributeCode: '', optionValue: '' };
}

const AttributeMapping: React.FC<AttributeMappingProps> = ({
    product,
    variant,
    attributes,
    categories,
    onSave,
    onCancel,
    onAttributesUpdate,
    hideButtons = false,
    excludeAttributes = []
}) => {
    const [mappings, setMappings] = useState<AttributeMappingType>({});
    const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

    // // Helper function to check if an attribute mapping is valid
    // const isAttributeMappingValid = (mapping: { mappedTo: string; mappedValue: string | string[] }) => {
    //     return !!mapping.mappedTo &&
    //         !!mapping.mappedValue &&
    //         (typeof mapping.mappedValue === 'string' ? mapping.mappedValue.trim() !== '' : mapping.mappedValue.length > 0);
    // };


    const findBestMatchingCategory = (productType: string): string[] => {
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
    };

    useEffect(() => {
        const initialMappings: AttributeMappingType = {};

        // Only add non-excluded attributes
        if (!excludeAttributes.includes('title')) {
            initialMappings.title = {
                value: product.title,
                mappedTo: 'name',
                mappedValue: product.title
            };
        }

        if (!excludeAttributes.includes('description')) {
            initialMappings.description = {
                value: product.description,
                mappedTo: 'description',
                mappedValue: product.description
            };
        }

        // Don't add vendor, brand, category_ids if they're excluded
        if (!excludeAttributes.includes('vendor')) {
            initialMappings.vendor = {
                value: product.vendor,
                mappedTo: 'manufacturer',
                mappedValue: product.vendor
            };
        }

        if (!excludeAttributes.includes('brand')) {
            initialMappings.brand = {
                value: product.vendor,
                mappedTo: 'brand',
                mappedValue: product.vendor
            };
        }

        if (!excludeAttributes.includes('category_ids')) {
            initialMappings.category_ids = {
                value: product.productType,
                mappedTo: 'category_ids',
                mappedValue: findBestMatchingCategory(product.productType)
            };
        }

        variant.selectedOptions.forEach(option => {
            const { attributeCode, optionValue } = findBestMatchingAttribute(option.name, option.value, attributes);
            initialMappings[option.name] = {
                value: option.value,
                mappedTo: attributeCode,
                mappedValue: optionValue
            };
        });

        setMappings(initialMappings);

        // Initialize touched state for all attributes
        const initialTouched: { [key: string]: boolean } = {};
        Object.keys(initialMappings).forEach(key => {
            initialTouched[key] = true; // Mark all as touched initially to show validation
        });
        setTouched(initialTouched);

        // Important: Send initial mappings to parent if in multi-variant mode
        if (hideButtons) {
            onSave(initialMappings);
        }
    }, [product, variant, attributes]);

    const handleAttributeChange = (shopifyAttr: string, magentoAttr: string,) => {
        const attribute = attributes.find(attr => attr.attribute_code === magentoAttr);
        let mappedValue = mappings[shopifyAttr].value;

        if (attribute?.options) {
            const bestMatchingValue = findBestMatchingOptionValue(mappings[shopifyAttr].value, attribute.options);
            if (bestMatchingValue) {
                mappedValue = bestMatchingValue;
            }
        }

        const newMapping = {
            value: mappings[shopifyAttr].value,
            mappedTo: magentoAttr,
            mappedValue: mappedValue
        };

        const newMappings = {
            ...mappings,
            [shopifyAttr]: newMapping
        };

        if (shopifyAttr === 'vendor' && magentoAttr === 'manufacturer') {
            newMappings.brand = {
                value: mappings[shopifyAttr].value,
                mappedTo: 'brand',
                mappedValue: mappedValue
            };
        }
        setMappings(newMappings);
        if (hideButtons) {
            // If we're in multi-variant mode, propagate changes immediately
            onSave(newMappings);
        }

    };

    const handleValueChange = (shopifyAttr: string, value: string | string[]) => {
        const newMapping = {
            ...mappings[shopifyAttr],
            mappedValue: value
        };

        const newMappings = {
            ...mappings,
            [shopifyAttr]: newMapping
        };

        if (shopifyAttr === 'vendor' && mappings[shopifyAttr].mappedTo === 'manufacturer') {
            newMappings.brand = {
                ...mappings.brand,
                mappedValue: value
            };
        }

        setMappings(newMappings);
        if (hideButtons) {
            // If we're in multi-variant mode, propagate changes immediately
            onSave(newMappings);
        }
    };

    const getAttributeOptions = (attributeCode: string) => {
        const attribute = attributes.find(attr => attr.attribute_code === attributeCode);
        return attribute?.options || [];
    };

    const handleOptionsUpdate = (attributeCode: string, newOptions: Array<{ label: string; value: string }>) => {
        // Find and update the attribute in the attributes array
        const updatedAttributes = attributes.map(attr => {
            if (attr.attribute_code === attributeCode) {
                return {
                    ...attr,
                    options: newOptions.map(opt => ({
                        label: opt.label,
                        value: opt.value
                    }))
                };
            }
            return attr;
        });

        // Update the attributes state in the parent component
        // You'll need to add this prop to the AttributeMapping component
        onAttributesUpdate(updatedAttributes);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 space-y-6">
                {mappings['category_ids'] &&
                    (<div className="flex flex-col space-y-2">
                        <div className="flex items-center">
                            <span className="font-medium text-sm w-48">Categories:</span>
                            {product.productType && (
                                <span className="text-sm text-gray-500">
                                    Suggested from product type: {product.productType}
                                </span>
                            )}
                        </div>
                        <CategorySelect
                            options={categories}
                            value={Array.isArray(mappings.category_ids?.mappedValue)
                                ? mappings.category_ids.mappedValue
                                : []}
                            onChange={(value) => handleValueChange('category_ids', value)}
                            placeholder="Select product categories"
                        />
                    </div>)
                }
                {Object.entries(mappings).map(([shopifyAttr, mapping]) => {
                    const selectedMagentoAttr = attributes.find(attr => attr.attribute_code === mapping.mappedTo);
                    const isSelect = selectedMagentoAttr?.frontend_input === 'select' ||
                        selectedMagentoAttr?.frontend_input === 'multiselect';

                    const validation = validateAttributeMapping(
                        mapping.value,
                        mapping.mappedValue,
                        isSelect ? getAttributeOptions(mapping.mappedTo) : undefined
                    );

                    const validationState = touched[shopifyAttr] ? getValidationState(validation) : 'valid';


                    return (
                        <ValidatedBox key={shopifyAttr} validationState={validationState}>
                            <div className="flex flex-col space-y-2">
                                <div className="flex items-center">
                                    <span className="font-medium text-sm w-48">
                                        {shopifyAttr}:
                                    </span>
                                    <span className="text-sm text-gray-600">
                                        {mapping.value}
                                    </span>
                                    {validationState === 'warning' && (
                                        <span className="ml-2 text-xs text-yellow-600">
                                            Approximate match
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <SearchableSelect
                                        options={attributes.map(attr => ({
                                            label: attr.default_frontend_label,
                                            value: attr.attribute_code
                                        }))}
                                        value={mapping.mappedTo}
                                        onChange={(value) => handleAttributeChange(shopifyAttr, value)}
                                        placeholder="Select Magento Attribute"
                                    />

                                    {mapping.mappedTo && (
                                        <div>
                                            {isSelect ? (
                                                <SearchableSelect
                                                    options={getAttributeOptions(mapping.mappedTo).map(opt => ({
                                                        label: opt.label,
                                                        value: opt.value
                                                    }))}
                                                    value={mapping.mappedValue as string}
                                                    onChange={(value: string) => handleValueChange(shopifyAttr, value)}
                                                    onOptionsChange={(newOptions) => handleOptionsUpdate(mapping.mappedTo, newOptions)}
                                                    placeholder="Select Value"
                                                    attributeCode={mapping.mappedTo}
                                                    allowCreate={true}
                                                />
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={mapping.mappedValue as string}
                                                    onChange={(e) => handleValueChange(shopifyAttr, e.target.value)}
                                                    placeholder="Enter value"
                                                    className="w-full h-9 px-3 py-2 text-sm border rounded focus:outline-none focus:border-blue-500 border-gray-300"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ValidatedBox>
                    );
                })}
            </div>

            {!hideButtons && (
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-4">
                    <button
                        onClick={() => onSave(mappings)}
                        className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Import to Magento
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

export default AttributeMapping;