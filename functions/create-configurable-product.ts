import { Env, ShopifyProduct } from "./backendTypes";
import Logger from './logger';

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
    meta_title?: string;
    meta_keyword?: string;
    meta_description?: string;
}

interface CreateConfigurableRequest {
    shopifyProduct: ShopifyProduct;
    configurableSku: string;
    attributes: AttributeData[];
    productAttributes: ProductAttributes;
}

interface EnvBind extends Env {
    PRODUCT_SYNC_LOGS: KVNamespace;
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
            logger.error('Unsupported image type', { url: imageUrl });
            await logger.flush();
            return null;
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            logger.error('Invalid content type', { url: imageUrl, contentType });
            await logger.flush();
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Data = await arrayBufferToBase64(arrayBuffer);

        logger.info('Image processed', {
            url: imageUrl,
            size: arrayBuffer.byteLength,
            mimeType
        });
        await logger.flush();

        return { base64Data, mimeType };
    } catch (error) {
        logger.error('Image fetch failed', {
            error: (error as Error).message,
            url: imageUrl
        });
        await logger.flush();
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

    logger.info('Getting attribute details', { attributeCode });
    await logger.flush();

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

                logger.info('Processed product image', {
                    position: index + 1,
                    imageUrl: image.url
                });
                await logger.flush();
            }
        } catch (error) {
            logger.error('Error processing product image', {
                error: (error as Error).message,
                imageUrl: image.url
            });
            await logger.flush();
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

    logger.info('Setting up configurable attributes', {
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

            logger.info('Creating configurable attribute option', {
                attribute: attr.code,
                optionValues: attr.valueIds
            });
            await logger.flush();

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

            logger.info('Successfully created configurable attribute option', {
                attribute: attr.code,
                values: attr.valueIds
            });
            await logger.flush();

        } catch (error) {
            logger.error('Error processing attribute', {
                attribute: attr.code,
                error: (error as Error).message
            });
            await logger.flush();
            throw error;
        }
    }
}

function transformDescription(shopifyHtml: string): string {
    // Clean up HTML entities
    let description = shopifyHtml
        .replace(/&amp;amp;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');

    // Add Magento's required wrapper structure
    const styleBlock = `<style>
        #html-body [data-pb-style=MAIN_CONTENT] {
            justify-content: flex-start;
            display: flex;
            flex-direction: column;
            background-position: left top;
            background-size: cover;
            background-repeat: no-repeat;
            background-attachment: scroll
        }
    </style>`;

    // Transform headings
    description = description.replace(/<p><strong>(.*?)<\/strong><\/p>/g, '<h2>$1</h2>');

    // Add color to regular paragraph text for better visibility
    description = description.replace(
        /<p>(?!<strong>)(.*?)(<\/p>)/g,
        '<p><span style="color: #41362f;">$1</span>$2'
    );

    // Enhance list items with better spacing and structure
    description = description.replace(
        /<li>\s*<strong>(.*?)<\/strong>\s*-\s*(.*?)<\/li>/g,
        '<li><div><div><strong>$1</strong>: $2</div></div></li>'
    );

    // Add Magento's page builder structure
    const wrappedContent = `
        <div data-content-type="row" data-appearance="contained" data-element="main">
            <div data-enable-parallax="0" 
                 data-parallax-speed="0.5" 
                 data-background-images="{}" 
                 data-background-type="image" 
                 data-video-loop="true" 
                 data-video-play-only-visible="true" 
                 data-video-lazy-load="true" 
                 data-video-fallback-src="" 
                 data-element="inner" 
                 data-pb-style="MAIN_CONTENT">
                <div data-content-type="text" data-appearance="default" data-element="main">
                    ${description}
                </div>
            </div>
        </div>
    `;

    return styleBlock + wrappedContent;
}

export const onRequestPost: PagesFunction<EnvBind> = async (context) => {
    const request = context.request;
    const env = context.env;
    const logger = new Logger({ kv: env.PRODUCT_SYNC_LOGS });
    logger.info('Starting create configreable product request', { method: request.method });

    try {
        const { shopifyProduct, configurableSku, attributes, productAttributes } =
            await request.json() as CreateConfigurableRequest;

        logger.info('Received request', {
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
            const transformedHtml = transformDescription(productAttributes.description)
            customAttributes.push({
                attribute_code: "description",
                value: transformedHtml
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

        // Add SEO attributes
        if (productAttributes.meta_title) {
            customAttributes.push({
                attribute_code: "meta_title",
                value: productAttributes.meta_title
            });
        }

        if (productAttributes.meta_keyword) {
            customAttributes.push({
                attribute_code: "meta_keyword",
                value: productAttributes.meta_keyword
            });
        }

        if (productAttributes.meta_description) {
            customAttributes.push({
                attribute_code: "meta_description",
                value: productAttributes.meta_description
            });
        }
        const WEBSITE_IDS = [1, 2];

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
                    website_ids: WEBSITE_IDS,
                    category_links: productAttributes.category_ids?.map(categoryId => ({
                        category_id: categoryId,
                        position: 0
                    })) || []
                },
                custom_attributes: customAttributes,
                media_gallery_entries: mediaGalleryEntries
            }
        };

        logger.info('Creating configurable product', {
            sku: configurableSku,
            payload: configurableProduct
        });
        await logger.flush();

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
            logger.error('Failed to create configurable product', { error });
            await logger.flush();
            return new Response(JSON.stringify({
                error: `Failed to create configurable product: ${error.message || 'Unknown error'}`
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Set up configurable attributes after product creation
        await setupConfigurableAttributes(configurableSku, shopifyProduct, attributes, env, logger);

        logger.info('Created configurable product successfully', {
            sku: configurableSku,
            attributes: attributes.map(a => a.code)
        });
        await logger.flush();
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
        logger.error('Error creating configurable product', {
            error: (err as Error).message
        });
        await logger.flush();

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