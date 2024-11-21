import { Env, LogEntry, MagentoError, ShopifyProduct } from "./backendTypes";

interface AttributeData {
    code: string;
    label: string;
    valueIds: string[]; // The actual Magento option IDs
    options: Array<{ label: string; value: string }>;
}

interface ProductAttributes {
    description?: string;
    manufacturer?: string;
    brand?: string;
    category_ids?: string[];
}

interface CreateConfigurableRequest {
    shopifyProduct: ShopifyProduct;
    configurableSku: string;
    attributes: AttributeData[];
    productAttributes: ProductAttributes;
}

class Logger {
    private logs: LogEntry[] = [];
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    log(event: string, details?: any) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            duration: Date.now() - this.startTime
        };
        this.logs.push(entry);
        console.log(JSON.stringify(entry));
    }

    getLogs() {
        return this.logs;
    }
}


async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
}

function getMimeType(url: string): string | null {
    const supportedExtensions: { [key: string]: string } = {
        'JPG': 'image/jpeg',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif'
    };

    const extension = url.split('?').shift().split('.').pop()?.toLowerCase() || '';
    return supportedExtensions[extension] || null;
}

async function fetchImageAsBase64(imageUrl: string, logger: Logger): Promise<{ base64Data: string; mimeType: string } | null> {
    try {
        const mimeType = getMimeType(imageUrl);
        if (!mimeType) {
            logger.log('Unsupported image type', { url: imageUrl });
            return null;
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            logger.log('Invalid content type', { url: imageUrl, contentType });
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Data = await arrayBufferToBase64(arrayBuffer);

        logger.log('Image processed', {
            url: imageUrl,
            size: arrayBuffer.byteLength,
            mimeType
        });

        return { base64Data, mimeType };
    } catch (error) {
        logger.log('Image fetch failed', {
            error: (error as Error).message,
            url: imageUrl
        });
        return null;
    }
}


function normalizeUrl(url: string): string {
    url = url.replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

// Get attribute ID and values by code
async function getAttributeDetails(attributeCode: string, env: Env, logger: Logger): Promise<{
    attribute_id: string;
    options: Array<{ label: string; value: string }>;
}> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

    logger.log('Getting attribute details', { attributeCode });

    const response = await fetch(
        `${baseUrl}/rest/V1/products/attributes/${attributeCode}`,
        {
            headers: {
                Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to get attribute details for ${attributeCode}`);
    }

    const attribute: any = await response.json();
    return {
        attribute_id: attribute.attribute_id,
        options: attribute.options || []
    };
}

// Process and prepare images for the configurable product
async function processProductImages(shopifyProduct: ShopifyProduct, logger: Logger): Promise<any[]> {
    const mediaGalleryEntries: any[] = [];
    const processedVariantImageIds = new Set();

    // Get all variant image IDs to exclude them from product-level images
    shopifyProduct.variants.forEach(variant => {
        if (variant.image) {
            processedVariantImageIds.add(variant.image.id);
        }
    });

    // Process product-level images (excluding variant-specific images)
    for (const [index, image] of shopifyProduct.images.entries()) {
        // Skip if this image is already assigned to a variant
        if (processedVariantImageIds.has(image.id)) {
            continue;
        }

        try {
            const imageResult = await fetchImageAsBase64(image.url, logger);
            if (imageResult) {
                const { base64Data, mimeType } = imageResult;
                const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];

                mediaGalleryEntries.push({
                    media_type: 'image',
                    label: image.altText || `${shopifyProduct.title} - ${index + 1}`,
                    position: index + 1,
                    disabled: false,
                    types: index === 0 ? ['image', 'small_image', 'thumbnail'] : ['image'],
                    content: {
                        base64_encoded_data: base64Data,
                        type: mimeType,
                        name: `${shopifyProduct.handle}-${index + 1}.${extension}`
                    }
                });

                logger.log('Processed product image', {
                    position: index + 1,
                    imageUrl: image.url
                });
            }
        } catch (error) {
            logger.log('Error processing product image', {
                error: (error as Error).message,
                imageUrl: image.url
            });
        }
    }

    return mediaGalleryEntries;
}


// Set up configurable attributes
async function setupConfigurableAttributes(
    sku: string,
    shopifyProduct: ShopifyProduct,
    attributeData: AttributeData[],
    env: Env,
    logger: Logger
): Promise<void> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

    logger.log('Setting up configurable attributes', {
        sku,
        attributes: attributeData.map(a => ({
            code: a.code,
            valueIds: a.valueIds
        }))
    });

    // Get attribute details and create options
    for (const attr of attributeData) {
        try {
            // Get attribute details for the ID
            const attributeDetails = await getAttributeDetails(attr.code, env, logger);

            // Create the configurable attribute option using the provided value IDs
            const option = {
                attribute_id: attributeDetails.attribute_id,
                label: attr.label,
                position: 0,
                is_use_default: true,
                values: attr.valueIds.map(value => ({
                    value_index: value
                }))
            };

            logger.log('Creating configurable attribute option', {
                attribute: attr.code,
                optionValues: attr.valueIds
            });

            const response = await fetch(
                `${baseUrl}/rest/V1/configurable-products/${encodeURIComponent(sku)}/options`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                    },
                    body: JSON.stringify({ option })
                }
            );

            if (!response.ok) {
                const error: any = await response.json();
                throw new Error(`Failed to set option for ${attr.code}: ${error.message}`);
            }

            logger.log('Successfully created configurable attribute option', {
                attribute: attr.code,
                values: attr.valueIds
            });

        } catch (error) {
            logger.log('Error processing attribute', {
                attribute: attr.code,
                error: (error as Error).message
            });
            throw error;
        }
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const request = context.request;
    const env = context.env;
    const logger = new Logger();
    logger.log('Worker started', { method: request.method });

    try {
        const { shopifyProduct, configurableSku, attributes, productAttributes } =
            await request.json() as CreateConfigurableRequest;

        logger.log('Received request', {
            sku: configurableSku,
            productTitle: shopifyProduct.title,
            attributeCodes: attributes.map(a => a.code),
            productAttributes
        });

        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

        // Create URL key from title
        const urlKey = shopifyProduct.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        const mediaGalleryEntries = await processProductImages(shopifyProduct, logger);

        // Build custom attributes array
        const customAttributes: any[] = [
            {
                attribute_code: "url_key",
                value: urlKey
            },
            {
                attribute_code: "tax_class_id",
                value: "2"
            },
            {
                attribute_code: "visibility",
                value: "4"
            }
        ];

        // Add product-level attributes
        if (productAttributes.description) {
            customAttributes.push({
                attribute_code: "description",
                value: productAttributes.description
            });
        }

        if (productAttributes.manufacturer) {
            customAttributes.push({
                attribute_code: "manufacturer",
                value: productAttributes.manufacturer
            });
        }

        if (productAttributes.brand) {
            customAttributes.push({
                attribute_code: "brand",
                value: productAttributes.brand
            });
        }

        if (productAttributes.category_ids && productAttributes.category_ids.length > 0) {
            customAttributes.push({
                attribute_code: "category_ids",
                value: productAttributes.category_ids
            });
        }
        const configurableProduct = {
            product: {
                sku: configurableSku,
                name: shopifyProduct.title,
                attribute_set_id: 4,
                type_id: 'configurable',
                price: 0,
                status: 1,
                visibility: 4,
                weight: 0,
                extension_attributes: {
                    stock_item: {
                        manage_stock: true,
                        is_in_stock: true,
                        qty: 0
                    },
                    website_ids: [1],
                    category_links: productAttributes.category_ids?.map(categoryId => ({
                        category_id: categoryId,
                        position: 0
                    })) || []
                },
                custom_attributes: customAttributes,
                media_gallery_entries: mediaGalleryEntries
            }
        };

        logger.log('Creating configurable product', {
            sku: configurableSku,
            payload: configurableProduct
        });

        const response = await fetch(
            `${baseUrl}/rest/V1/products`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                },
                body: JSON.stringify(configurableProduct),
            }
        );

        if (!response.ok) {
            const error: any = await response.json();
            logger.log('Failed to create configurable product', { error });
            return new Response(JSON.stringify({
                error: `Failed to create configurable product: ${error.message || 'Unknown error'}`
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Set up configurable attributes after product creation
        await setupConfigurableAttributes(configurableSku, shopifyProduct, attributes, env, logger);

        logger.log('Created configurable product successfully', {
            sku: configurableSku,
            attributes: attributes.map(a => a.code)
        });
        return new Response(JSON.stringify({
            success: true,
            message: 'Configurable product created successfully',
            data: {
                sku: configurableSku,
                attributes: attributes.map(a => a.code)
            }
        }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        logger.log('Error creating configurable product', {
            error: (err as Error).message
        });

        return new Response(JSON.stringify({
            error: (err as Error).message,
            details: {
                message: 'Failed to create configurable product or set up attributes',
                error: (err as Error).message
            }
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};