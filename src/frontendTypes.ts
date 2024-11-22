// types.ts or directly in your App.tsx

export interface MagentoAttributeOption {
    label: string;
    value: string;
}

export interface MagentoAttributeMetadata {
    attribute_code: string;
    attribute_id: number;
    default_frontend_label: string;
    frontend_input: string;
    is_required: boolean;
    options?: MagentoAttributeOption[];
}


export interface ShopifyVariantOption {
    name: string;
    value: string;
}

export interface ShopifyVariant {
    id: string;
    sku: string;
    title: string;
    price: string;
    selectedOptions: ShopifyVariantOption[];
    updatedAt: string;
    image: ShopifyImage | null;
    inventoryQuantity: number;
    inventoryCost: number;
}

export interface ShopifyImage {
    id: string;
    url: string;
    altText: string | null;
}
export interface ShopifyProduct {
    id: string;
    title: string;
    description: string;
    vendor: string;
    productType: string;
    variants: ShopifyVariant[];
    images: ShopifyImage[];
}

export interface AttributeMappingType {
    [key: string]: {
        value: string;
        mappedTo: string;
        mappedValue: string | string[];
    };
}

export interface VariantMapping {
    variant: ShopifyVariant;
    mappings: AttributeMappingType;
}