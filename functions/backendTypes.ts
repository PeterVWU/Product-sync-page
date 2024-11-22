export interface Env {
    SHOPIFY_STORE_URL: string;
    SHOPIFY_ACCESS_TOKEN: string;
    MAGENTO_BASE_URL: string;
    MAGENTO_ACCESS_TOKEN: string;
}

export interface ShopifyVariant {
    id: string;
    sku: string;
    price: string;
    title: string;
    selectedOptions: {
        name: string;
        value: string;
    }[];
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
    tags: string[];
    status: string;
    handle: string;
    variants: ShopifyVariant[];
    images: ShopifyImage[];
}

export interface MagentoAttributeMetadata {
    attribute_code: string;
    frontend_input: string;
    backend_type: string;
    is_required: boolean;
    default_frontend_label: string;
    options?: Array<{
        label: string;
        value: string;
    }>;
}

export interface MagentoProduct {
    sku: string;
    name: string;
    price: number;
    type_id: string;
    attribute_set_id: number;
    weight: number;
    status: number;
    visibility: number;
    custom_attributes: Array<{
        attribute_code: string;
        value: string;
    }>;
    media_gallery_entries?: Array<{
        media_type: string;
        label: string;
        position: number;
        disabled: boolean;
        types: string[];
        content: {
            base64_encoded_data: string;
            type: string;
            name: string;
        };
    }>;
    extension_attributes?: {
        stock_item: {
            manage_stock: boolean,
            is_in_stock: boolean,
            qty: number
        }
    }
}

export interface MagentoError {
    message: string;
    parameters: Record<string, string>;
}

export interface ShopifyGraphQLResponse {
    data: {
        products: {
            edges: Array<{
                node: {
                    id: string;
                    title: string;
                    descriptionHtml: string;
                    vendor: string;
                    productType: string;
                    tags: string[];
                    status: string;
                    handle: string;
                    images: {
                        edges: Array<{
                            node: {
                                id: string;
                                url: string;
                                altText: string;
                            };
                        }>;
                    };
                    variants: {
                        edges: Array<{
                            node: {
                                id: string;
                                sku: string;
                                price: string;
                                title: string;
                                inventoryItem: {
                                    unitCost: {
                                        amount: string
                                    }
                                };
                                inventoryQuantity: number;
                                selectedOptions: {
                                    name: string;
                                    value: string;
                                }[];
                                createdAt: string;
                                updatedAt: string;
                                image: ShopifyImage
                            };
                        }>;
                    };
                };
            }>;
        };
    };
}

export interface LogEntry {
    timestamp: string;
    event: string;
    details?: any;
    duration?: number;
}

export interface MagentoCategory {
    id: number;
    parent_id: number;
    name: string;
    is_active: boolean;
    level: number;
    children: string[]; // Array of category IDs
    path: string;
    include_in_menu?: boolean;
    position: number;
}

export interface CategoryOption {
    label: string;
    value: string;
    level: number;
    parentId: number;
    path: string[];
    fullPath: string;
}

export interface MagentoCategoryResponse {
    items: MagentoCategory[];
    total_count: number;
    search_criteria: any;
}

export interface AttributeMappingType {
    [key: string]: {
        value: string;
        mappedTo: string;
        mappedValue: string | string[];
    };
}